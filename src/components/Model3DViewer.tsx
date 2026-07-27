import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertCircle, Maximize2, Minimize2, RotateCw, ChevronRight, X } from "lucide-react";
import type * as THREE_NS from "three";
import { getCaseAttachmentUrl, fetchCaseAttachments, type CaseAttachment } from "@/lib/api";
import { parseModelFileName, normalizeBaseName } from "@/lib/model-viewer/parse-filename";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ViewCube3D } from "./ViewCube3D";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AnnotationToolbar } from "./model-viewer/AnnotationToolbar";
import type { Annotation, ToolId } from "./model-viewer/annotation-types";
import {
  fetchModelAnnotations,
  saveModelAnnotation,
  deleteModelAnnotation,
  subscribeModelAnnotations,
  serializeAnnotation,
  deserializeAnnotation,
  type CameraState,
  type ModelAnnotationRow,
} from "@/lib/model-annotations";
import { supabase } from "@/integrations/supabase/client";
import { notifyCaseStakeholders, fetchMentionableProfiles } from "@/lib/case-activity";


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storagePath: string;
  fileName: string;
  caseId?: string;
  attachmentId?: string;
  uploadedAt?: string;
}

function formatLastUpdate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Hoje, às ${time}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ontem, às ${time}`;
  return `${d.toLocaleDateString("pt-BR")} às ${time}`;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function Model3DViewer({
  open, onOpenChange, storagePath, fileName, caseId, attachmentId, uploadedAt,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE_NS.PerspectiveCamera | null>(null);
  const controlsRef = useRef<{ target: THREE_NS.Vector3; update: () => void; enabled: boolean } | null>(null);
  const meshRef = useRef<THREE_NS.Mesh | null>(null);
  const rendererRef = useRef<THREE_NS.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE_NS.Raycaster | null>(null);
  const THREERef = useRef<typeof THREE_NS | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // estado de "versão atual sendo exibida"
  const [currentPath, setCurrentPath] = useState(storagePath);
  const [currentName, setCurrentName] = useState(fileName);
  const [currentUploadedAt, setCurrentUploadedAt] = useState<string | undefined>(uploadedAt);
  const [reloadKey, setReloadKey] = useState(0);

  const [newerVersion, setNewerVersion] = useState<CaseAttachment | null>(null);

  // ===== Anotações =====
  const [tool, setTool] = useState<ToolId>("none");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  const toolRef = useRef<ToolId>("none");
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // estado de desenho em andamento
  const drawingRef = useRef<{ kind: "stroke" | "shape"; data: Annotation } | null>(null);
  const [, forceRender] = useState(0);
  const [commentDraft, setCommentDraft] = useState<{ id: string; anchor: THREE_NS.Vector3; text: string } | null>(null);

  // Mapa anotação → autor (para permissão de delete) e set de IDs locais (para evitar echo do realtime)
  const authorMapRef = useRef<Map<string, string>>(new Map());
  const localIdsRef = useRef<Set<string>>(new Set());
  const dbIdByLocalRef = useRef<Map<string, string>>(new Map());
  const localByDbIdRef = useRef<Map<string, string>>(new Map());
  const cameraByLocalRef = useRef<Map<string, CameraState>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserNameRef = useRef<string>("");
  const normalizedName = useMemo(() => normalizeBaseName(currentName), [currentName]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      currentUserIdRef.current = data.user?.id ?? null;
      if (data.user?.id) {
        const { data: p } = await supabase.from("profiles").select("full_name,email").eq("id", data.user.id).maybeSingle();
        currentUserNameRef.current = (p?.full_name as string) || (p?.email as string) || "";
      }
    });
  }, []);

  useEffect(() => {
    if (open) {
      setCurrentPath(storagePath);
      setCurrentName(fileName);
      setCurrentUploadedAt(uploadedAt);
      setNewerVersion(null);
      setAnnotations([]);
      authorMapRef.current.clear();
      localIdsRef.current.clear();
      dbIdByLocalRef.current.clear();
      localByDbIdRef.current.clear();
      cameraByLocalRef.current.clear();
      setTool("none");
      setCommentDraft(null);
      setReloadKey((k) => k + 1);
    }
  }, [open, storagePath, fileName, uploadedAt]);

  // habilita/desabilita orbit controls conforme ferramenta
  useEffect(() => {
    const c = controlsRef.current;
    if (c) c.enabled = tool === "none";
  }, [tool, reloadKey]);


  useEffect(() => {
    if (!open || !caseId) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchCaseAttachments(caseId);
        const norm = normalizeBaseName(currentName);
        const ext = currentName.split(".").pop()?.toLowerCase();
        const candidates = all.filter((a) =>
          !a.expired_at &&
          a.storage_path !== currentPath &&
          a.file_name.split(".").pop()?.toLowerCase() === ext &&
          normalizeBaseName(a.file_name) === norm
        );
        const baseAt = currentUploadedAt ? new Date(currentUploadedAt).getTime() : 0;
        const newer = candidates
          .filter((a) => new Date(a.uploaded_at).getTime() > baseAt)
          .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0];
        if (!cancelled) setNewerVersion(newer ?? null);
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [open, caseId, currentPath, currentName, currentUploadedAt]);

  const parsed = useMemo(() => parseModelFileName(currentName), [currentName]);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);

  const handleRefresh = useCallback(() => {
    if (newerVersion) {
      setCurrentPath(newerVersion.storage_path);
      setCurrentName(newerVersion.file_name);
      setCurrentUploadedAt(newerVersion.uploaded_at);
      setNewerVersion(null);
    }
    setReloadKey((k) => k + 1);
  }, [newerVersion]);

  // captura snapshot da câmera atual (para deep-link)
  const captureCamera = useCallback((): CameraState | null => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return null;
    return {
      pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      target: { x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z },
    };
  }, []);

  // aplica um camera state (usado em deep-link futuro)
  const applyCamera = useCallback((c: CameraState | null | undefined) => {
    if (!c) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    cam.position.set(c.pos.x, c.pos.y, c.pos.z);
    ctrl.target.set(c.target.x, c.target.y, c.target.z);
    cam.updateProjectionMatrix();
    ctrl.update();
  }, []);

  // tenta absorver uma anotação vinda do realtime / fetch inicial
  const ingestRow = useCallback((row: ModelAnnotationRow) => {
    const THREE = THREERef.current;
    if (!THREE) return;
    if (localIdsRef.current.has(row.payload.id)) {
      // echo da nossa própria inserção — só registra mapeamento DB↔local
      dbIdByLocalRef.current.set(row.payload.id, row.id);
      localByDbIdRef.current.set(row.id, row.payload.id);
      return;
    }
    setAnnotations((prev) => {
      if (prev.some((a) => a.id === row.payload.id)) return prev;
      authorMapRef.current.set(row.payload.id, row.author_id);
      dbIdByLocalRef.current.set(row.payload.id, row.id);
      localByDbIdRef.current.set(row.id, row.payload.id);
      if (row.camera) cameraByLocalRef.current.set(row.payload.id, row.camera);
      return [...prev, deserializeAnnotation(THREE, row.payload)];
    });
  }, []);

  // Carregar anotações existentes (após THREE estar pronto)
  useEffect(() => {
    if (!open || !caseId || loading) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchModelAnnotations(caseId, normalizedName);
        if (cancelled) return;
        for (const r of rows) ingestRow(r);
      } catch (e) {
        console.warn("[Model3DViewer] fetch annotations", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, caseId, normalizedName, loading, reloadKey, ingestRow]);

  // Realtime
  useEffect(() => {
    if (!open || !caseId) return;
    const unsub = subscribeModelAnnotations(caseId, {
      onInsert: (row) => {
        if (row.normalized_name !== normalizedName) return;
        ingestRow(row);
      },
      onDelete: (dbId) => {
        const localId = localByDbIdRef.current.get(dbId);
        if (!localId) return;
        setAnnotations((prev) => prev.filter((a) => a.id !== localId));
        authorMapRef.current.delete(localId);
        dbIdByLocalRef.current.delete(localId);
        localByDbIdRef.current.delete(dbId);
      },
    });
    return () => { unsub(); };
  }, [open, caseId, normalizedName, ingestRow]);





  // ===== Three.js scene =====
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);

    let disposed = false;
    let rafId = 0;
    let cleanup: (() => void) | null = null;

    const waitForMount = () =>
      new Promise<HTMLDivElement>((resolve, reject) => {
        const start = performance.now();
        const tick = () => {
          if (disposed) return reject(new Error("disposed"));
          const el = mountRef.current;
          if (el && el.clientWidth > 0 && el.clientHeight > 0) return resolve(el);
          if (performance.now() - start > 5000) return reject(new Error("Container 3D não inicializou"));
          requestAnimationFrame(tick);
        };
        tick();
      });

    (async () => {
      try {
        const mountEl = await waitForMount();
        if (disposed) return;

        const THREE = await import("three");
        THREERef.current = THREE;
        const { TrackballControls } = await import("three/addons/controls/TrackballControls.js");
        const ext = currentName.split(".").pop()?.toLowerCase();

        const width0 = mountEl.clientWidth;
        const height0 = mountEl.clientHeight;

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(45, width0 / height0, 0.1, 5000);
        camera.position.set(0, 0, 150);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true, // necessário para captura JPEG
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width0, height0);
        renderer.setClearColor(0x000000, 0);
        mountEl.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // External scene lighting: a single key directional light positioned 45° to
        // the LEFT of the user's view (camera-relative), as if a studio light were
        // illuminating the model from the upper-left. A subtle ambient term keeps
        // shadowed faces readable without flattening the form.
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(-1, 0.6, 1); // updated per-frame to follow camera
        scene.add(ambient, keyLight);
        // Marker so the animate loop can reposition it relative to the camera.
        (keyLight as unknown as { __followCamera?: boolean }).__followCamera = true;

        // TrackballControls allows fully unconstrained 360° rotation on every axis
        // (no polar/azimuth clamping, no gimbal lock at the poles).
        const controls = new TrackballControls(camera, renderer.domElement);
        controls.rotateSpeed = 3.0;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 0.8;
        controls.noRotate = false;
        controls.noZoom = false;
        controls.noPan = false;
        controls.staticMoving = false;
        controls.dynamicDampingFactor = 0.15;
        controls.enabled = toolRef.current === "none";
        controlsRef.current = controls;

        const url = await getCaseAttachmentUrl(currentPath);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Falha ao baixar arquivo");
        const buffer = await res.arrayBuffer();
        if (disposed) return;

        let geometry: THREE_NS.BufferGeometry;
        let withColors = false;

        if (ext === "stl") {
          const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
          geometry = new STLLoader().parse(buffer);
        } else if (ext === "ply") {
          const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
          geometry = new PLYLoader().parse(buffer);
          withColors = !!geometry.getAttribute("color");
        } else {
          throw new Error(`Formato não suportado: .${ext}`);
        }

        geometry.computeVertexNormals();
        geometry.center();
        geometry.computeBoundingSphere();

        // Glossy plastic look matching reference: saturated mid-blue with crisp highlights.
        const material = new THREE.MeshPhysicalMaterial({
          color: withColors ? 0xffffff : 0x3aa0ff,
          vertexColors: withColors,
          metalness: 0.0,
          roughness: 0.35,
          clearcoat: 0.55,
          clearcoatRoughness: 0.22,
          sheen: 0.0,
          flatShading: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        meshRef.current = mesh;
        raycasterRef.current = new THREE.Raycaster();

        const radius = geometry.boundingSphere?.radius ?? 50;
        camera.position.set(0, 0, radius * 2.5);
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        setLoading(false);

        let animatingTo: { pos: THREE_NS.Vector3; target: THREE_NS.Vector3; start: number; from: THREE_NS.Vector3 } | null = null;
        (window as unknown as { __model3d_focusAxis?: (a: { x: number; y: number; z: number }) => void }).__model3d_focusAxis = (axis) => {
          const dist = camera.position.distanceTo(controls.target);
          const dir = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
          const newPos = controls.target.clone().add(dir.multiplyScalar(dist));
          animatingTo = {
            pos: newPos,
            target: controls.target.clone(),
            start: performance.now(),
            from: camera.position.clone(),
          };
        };

        // Free-orbit rotation hook used by the ViewCube drag handler.
        // True infinite tumble: rotate the camera offset with quaternions around
        // the camera's own up + right axes (and carry camera.up along), so the
        // view never flips or locks at the poles.
        const _offset = new THREE.Vector3();
        const _right = new THREE.Vector3();
        const _up = new THREE.Vector3();
        const _qYaw = new THREE.Quaternion();
        const _qPitch = new THREE.Quaternion();
        (window as unknown as { __model3d_rotateBy?: (dx: number, dy: number) => void }).__model3d_rotateBy = (dx, dy) => {
          _offset.copy(camera.position).sub(controls.target);
          _up.copy(camera.up).normalize();
          _right.crossVectors(_up, _offset).normalize();
          _qYaw.setFromAxisAngle(_up, -dx);
          _qPitch.setFromAxisAngle(_right, -dy);
          const q = _qYaw.multiply(_qPitch);
          _offset.applyQuaternion(q);
          camera.up.applyQuaternion(q);
          camera.position.copy(controls.target).add(_offset);
          camera.lookAt(controls.target);
          controls.update();
        };


        // ===== Overlay 2D =====
        const project = (p: THREE_NS.Vector3, w: number, h: number) => {
          const v = p.clone().project(camera);
          return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z };
        };

        const drawOverlay = () => {
          const ov = overlayRef.current;
          if (!ov) return;
          const dpr = Math.min(window.devicePixelRatio, 2);
          const cssW = mountEl.clientWidth;
          const cssH = mountEl.clientHeight;
          if (ov.width !== cssW * dpr || ov.height !== cssH * dpr) {
            ov.width = cssW * dpr;
            ov.height = cssH * dpr;
            ov.style.width = `${cssW}px`;
            ov.style.height = `${cssH}px`;
          }
          const ctx = ov.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);

          const drawOne = (a: Annotation) => {
            ctx.strokeStyle = a.type === "comment" ? "#ffffff" : a.color;
            ctx.fillStyle = a.color;
            ctx.lineWidth = a.type === "comment" ? 2 : (a as { width: number }).width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (a.type === "stroke") {
              if (a.points.length < 2) return;
              ctx.beginPath();
              const p0 = project(a.points[0], cssW, cssH);
              ctx.moveTo(p0.x, p0.y);
              for (let i = 1; i < a.points.length; i++) {
                const p = project(a.points[i], cssW, cssH);
                ctx.lineTo(p.x, p.y);
              }
              ctx.stroke();
            } else if (a.type === "rect") {
              const pa = project(a.a, cssW, cssH);
              const pb = project(a.b, cssW, cssH);
              ctx.strokeRect(Math.min(pa.x, pb.x), Math.min(pa.y, pb.y), Math.abs(pb.x - pa.x), Math.abs(pb.y - pa.y));
            } else if (a.type === "circle") {
              const pa = project(a.a, cssW, cssH);
              const pb = project(a.b, cssW, cssH);
              const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2;
              const rx = Math.abs(pb.x - pa.x) / 2, ry = Math.abs(pb.y - pa.y) / 2;
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else if (a.type === "arrow") {
              const pa = project(a.a, cssW, cssH);
              const pb = project(a.b, cssW, cssH);
              ctx.beginPath();
              ctx.moveTo(pa.x, pa.y);
              ctx.lineTo(pb.x, pb.y);
              ctx.stroke();
              const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
              const ah = 10 + a.width * 1.2;
              ctx.beginPath();
              ctx.moveTo(pb.x, pb.y);
              ctx.lineTo(pb.x - ah * Math.cos(angle - Math.PI / 7), pb.y - ah * Math.sin(angle - Math.PI / 7));
              ctx.lineTo(pb.x - ah * Math.cos(angle + Math.PI / 7), pb.y - ah * Math.sin(angle + Math.PI / 7));
              ctx.closePath();
              ctx.fill();
            } else if (a.type === "comment") {
              const p = project(a.anchor, cssW, cssH);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
              ctx.fillStyle = a.color;
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = "#ffffff";
              ctx.stroke();
            }
          };

          for (const a of annotationsRef.current) drawOne(a);
          if (drawingRef.current) drawOne(drawingRef.current.data);
        };

        const _lightDir = new THREE.Vector3();
        const _camRight = new THREE.Vector3();
        const _camUp = new THREE.Vector3(0, 1, 0);
        const _rotL = new THREE.Matrix4();
        const animate = () => {
          if (disposed) return;
          if (animatingTo) {
            const t = Math.min(1, (performance.now() - animatingTo.start) / 350);
            const ease = 1 - Math.pow(1 - t, 3);
            camera.position.lerpVectors(animatingTo.from, animatingTo.pos, ease);
            if (t >= 1) animatingTo = null;
          }
          controls.update();

          // Reposition key light 45° to the LEFT of the user's view, slightly above.
          // Take the camera's forward, rotate it 45° around world up, then offset.
          camera.getWorldDirection(_lightDir); // forward (toward target)
          _rotL.makeRotationAxis(_camUp, Math.PI / 4); // +45° around Y = to the left of viewer
          _lightDir.applyMatrix4(_rotL).normalize();
          _camRight.copy(_lightDir).cross(_camUp).normalize();
          // Place the light far away along the rotated direction, lifted upward.
          const dist = camera.position.distanceTo(controls.target) * 2;
          keyLight.position
            .copy(controls.target)
            .addScaledVector(_lightDir, -dist) // light shines FROM that side toward model
            .addScaledVector(_camUp, dist * 0.35);
          keyLight.target.position.copy(controls.target);
          keyLight.target.updateMatrixWorld();

          renderer.render(scene, camera);
          drawOverlay();
          rafId = requestAnimationFrame(animate);
        };
        animate();

        const onResize = () => {
          const el = mountRef.current;
          if (!el) return;
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w === 0 || h === 0) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          (controls as unknown as { handleResize?: () => void }).handleResize?.();
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(mountEl);

        cleanup = () => {
          ro.disconnect();
          cancelAnimationFrame(rafId);
          controls.dispose();
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          scene.clear();
          cameraRef.current = null;
          controlsRef.current = null;
          meshRef.current = null;
          rendererRef.current = null;
          delete (window as unknown as { __model3d_focusAxis?: unknown }).__model3d_focusAxis;
          delete (window as unknown as { __model3d_rotateBy?: unknown }).__model3d_rotateBy;
        };
      } catch (e) {
        if (!disposed) {
          console.error("[Model3DViewer]", e);
          setError((e as Error).message || "Erro ao carregar modelo");
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cleanup?.();
    };
  }, [open, currentPath, currentName, reloadKey]);

  const getMainCamera = useCallback(() => cameraRef.current, []);
  const onCubeFaceClick = useCallback((axis: { x: number; y: number; z: number }) => {
    const fn = (window as unknown as { __model3d_focusAxis?: (a: typeof axis) => void }).__model3d_focusAxis;
    fn?.(axis);
  }, []);

  // ===== Pointer handlers no overlay =====
  const hitMesh = useCallback((clientX: number, clientY: number): THREE_NS.Vector3 | null => {
    const ov = overlayRef.current;
    const mesh = meshRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const THREE = THREERef.current;
    if (!ov || !mesh || !camera || !raycaster || !THREE) return null;
    const rect = ov.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (hits.length > 0) return hits[0].point.clone();
    // fallback: plano no centro do modelo perpendicular à câmera
    const plane = new THREE.Plane();
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    plane.setFromNormalAndCoplanarPoint(normal, mesh.position);
    const ray = raycaster.ray;
    const out = new THREE.Vector3();
    return ray.intersectPlane(plane, out) ? out.clone() : null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (toolRef.current === "none") return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const t = toolRef.current;
    const pt = hitMesh(e.clientX, e.clientY);
    if (!pt) return;

    if (t === "comment") {
      setCommentDraft({ id: uid(), anchor: pt, text: "" });
      return;
    }
    if (t === "eraser") {
      // remove a anotação cuja projeção esteja mais próxima
      const ov = overlayRef.current;
      const camera = cameraRef.current;
      if (!ov || !camera) return;
      const rect = ov.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const project2d = (p: THREE_NS.Vector3) => {
        const v = p.clone().project(camera);
        return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
      };
      let bestId: string | null = null;
      let bestD = 16; // tolerância
      for (const a of annotationsRef.current) {
        const pts =
          a.type === "stroke" ? a.points :
          a.type === "comment" ? [a.anchor] : [a.a, a.b];
        for (const p of pts) {
          const q = project2d(p);
          const d = Math.hypot(q.x - x, q.y - y);
          if (d < bestD) { bestD = d; bestId = a.id; }
        }
      }
      if (bestId) {
        const myId = currentUserIdRef.current;
        const author = authorMapRef.current.get(bestId);
        // Só permite apagar as próprias (RLS também bloquearia)
        if (author && myId && author !== myId) return;
        const id = bestId;
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
        authorMapRef.current.delete(id);
        const dbId = dbIdByLocalRef.current.get(id);
        if (dbId) {
          dbIdByLocalRef.current.delete(id);
          localByDbIdRef.current.delete(dbId);
          deleteModelAnnotation(dbId);
        }
      }
      return;
    }

    if (t === "pen") {
      drawingRef.current = {
        kind: "stroke",
        data: { id: uid(), type: "stroke", color, width, points: [pt] },
      };
      forceRender((n) => n + 1);
      return;
    }
    if (t === "rect" || t === "circle" || t === "arrow") {
      drawingRef.current = {
        kind: "shape",
        data: { id: uid(), type: t, color, width, a: pt, b: pt.clone() },
      };
      forceRender((n) => n + 1);
      return;
    }
  }, [color, width, hitMesh]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const cur = drawingRef.current;
    if (!cur) return;
    const pt = hitMesh(e.clientX, e.clientY);
    if (!pt) return;
    if (cur.kind === "stroke" && cur.data.type === "stroke") {
      cur.data.points.push(pt);
    } else if (cur.kind === "shape" && (cur.data.type === "rect" || cur.data.type === "circle" || cur.data.type === "arrow")) {
      cur.data.b = pt;
    }
  }, [hitMesh]);

  // Persiste uma anotação local no backend
  const persistLocal = useCallback(async (
    ann: Annotation,
    opts?: { notify?: { title: string; content: string }; mentions?: string[] },
  ) => {
    if (!caseId) return;
    localIdsRef.current.add(ann.id);
    authorMapRef.current.set(ann.id, currentUserIdRef.current ?? "");
    const cam = captureCamera();
    if (cam) cameraByLocalRef.current.set(ann.id, cam);
    try {
      const row = await saveModelAnnotation({
        caseId,
        attachmentId,
        normalizedName,
        payload: serializeAnnotation(ann),
        camera: cam,
        mentions: opts?.mentions ?? [],
      });
      if (row) {
        dbIdByLocalRef.current.set(ann.id, row.id);
        localByDbIdRef.current.set(row.id, ann.id);
      }
    } catch (e) {
      console.warn("persistLocal", e);
    }
    if (opts?.notify) {
      notifyCaseStakeholders({
        caseId,
        title: opts.notify.title,
        content: opts.notify.content,
        type: "model_comment",
        extraRecipientIds: opts.mentions ?? [],
      }).catch(() => {});
    }
  }, [caseId, attachmentId, normalizedName, captureCamera]);

  const onPointerUp = useCallback(() => {
    const cur = drawingRef.current;
    if (!cur) return;
    const data = cur.data;
    drawingRef.current = null;
    if (data.type === "stroke" && data.points.length < 2) return;
    setAnnotations((prev) => [...prev, data]);
    persistLocal(data);
  }, [persistLocal]);

  const handleCapture = useCallback(() => {
    const renderer = rendererRef.current;
    const ov = overlayRef.current;
    if (!renderer || !ov) return;
    const gl = renderer.domElement;
    const padTop = 56;
    const padBot = 44;
    const out = document.createElement("canvas");
    out.width = gl.width;
    out.height = gl.height + padTop + padBot;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // fundo
    ctx.fillStyle = "#f6f8fb";
    ctx.fillRect(0, 0, out.width, out.height);
    // imagem 3D + overlay
    ctx.drawImage(gl, 0, padTop, gl.width, gl.height);
    ctx.drawImage(ov, 0, padTop, gl.width, gl.height);

    // Header
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, out.width, padTop);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 20px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(currentName, 18, padTop / 2);
    if (parsed.teeth.length > 0) {
      const teethStr = `Elementos: ${parsed.teeth.join(", ")}`;
      ctx.font = "400 13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillStyle = "#cbd5e1";
      const w = ctx.measureText(teethStr).width;
      ctx.fillText(teethStr, out.width - w - 18, padTop / 2);
    }

    // Footer
    const fy = padTop + gl.height;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, fy, out.width, padBot);
    ctx.fillStyle = "#0f172a";
    ctx.font = "500 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    const author = currentUserNameRef.current || "—";
    ctx.fillText(`Capturado por ${author}`, 18, fy + padBot / 2);
    const dateStr = new Date().toLocaleString("pt-BR");
    const dw = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, out.width - dw - 18, fy + padBot / 2);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentName.replace(/\.[^.]+$/, "")}-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/jpeg", 0.92);
  }, [currentName, parsed.teeth]);

  const handleClear = useCallback(() => {
    const myId = currentUserIdRef.current;
    const owned = annotationsRef.current.filter((a) => {
      const author = authorMapRef.current.get(a.id);
      return author && myId && author === myId;
    });
    for (const a of owned) {
      const dbId = dbIdByLocalRef.current.get(a.id);
      if (dbId) {
        dbIdByLocalRef.current.delete(a.id);
        localByDbIdRef.current.delete(dbId);
        deleteModelAnnotation(dbId);
      }
      authorMapRef.current.delete(a.id);
      cameraByLocalRef.current.delete(a.id);
    }
    const keepIds = new Set(annotationsRef.current.map((a) => a.id).filter((id) => !owned.some((o) => o.id === id)));
    setAnnotations((prev) => prev.filter((a) => keepIds.has(a.id)));
    setCommentDraft(null);
  }, []);

  // ===== @menção autocomplete =====
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const draftMentionsRef = useRef<Map<string, string>>(new Map()); // handle -> userId

  const handleCommentTextChange = useCallback(async (newText: string) => {
    if (!commentDraft) return;
    setCommentDraft({ ...commentDraft, text: newText });
    const m = newText.match(/@([\p{L}\p{N}._-]*)$/u);
    if (m) {
      try {
        const list = await fetchMentionableProfiles(m[1]);
        setMentionSuggestions(list.slice(0, 6));
      } catch { setMentionSuggestions([]); }
    } else {
      setMentionSuggestions([]);
    }
  }, [commentDraft]);

  const pickMention = useCallback((p: { id: string; full_name: string | null; email: string | null }) => {
    if (!commentDraft) return;
    const handle = (p.full_name || p.email || "user").split(/\s+/)[0];
    const replaced = commentDraft.text.replace(/@([\p{L}\p{N}._-]*)$/u, `@${handle} `);
    draftMentionsRef.current.set(handle, p.id);
    setCommentDraft({ ...commentDraft, text: replaced });
    setMentionSuggestions([]);
  }, [commentDraft]);

  const confirmCommentDraft = useCallback(() => {
    if (!commentDraft) return;
    const text = commentDraft.text.trim();
    if (text) {
      // extrai userIds mencionados que ainda aparecem no texto
      const mentions: string[] = [];
      for (const [handle, uid] of draftMentionsRef.current.entries()) {
        if (text.includes(`@${handle}`)) mentions.push(uid);
      }
      const ann: Annotation = {
        id: commentDraft.id, type: "comment", color, text, anchor: commentDraft.anchor,
      };
      setAnnotations((prev) => [...prev, ann]);
      persistLocal(ann, {
        notify: {
          title: "Novo comentário no modelo 3D",
          content: `${text.slice(0, 120)}${text.length > 120 ? "…" : ""} — em ${currentName}`,
        },
        mentions,
      });
    }
    draftMentionsRef.current.clear();
    setMentionSuggestions([]);
    setCommentDraft(null);
  }, [commentDraft, color, currentName, persistLocal]);

  // ===== Deep-link: clicar num comentário existente volta a câmera salva =====
  const flyToComment = useCallback((id: string) => {
    const cam = cameraByLocalRef.current.get(id);
    if (cam) applyCamera(cam);
  }, [applyCamera]);

  // ===== Atalhos de teclado =====
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); handleCapture(); return;
      }
      const map: Record<string, ToolId> = {
        v: "none", p: "pen", r: "rect", c: "circle", a: "arrow", m: "comment", e: "eraser",
      };
      const k = e.key.toLowerCase();
      if (map[k]) { e.preventDefault(); setTool(map[k]); return; }
      if (k === "escape") {
        if (commentDraft) setCommentDraft(null);
        else setTool("none");
      }
      if (k === "f") { e.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleCapture, toggleFullscreen, commentDraft]);




  // posição do comment draft em pixels (recalculada via render por causa do raf, simplificamos: usar projeção atual sob demanda)
  const projectAnchorToScreen = (p: THREE_NS.Vector3 | null) => {
    if (!p) return null;
    const camera = cameraRef.current;
    const ov = overlayRef.current;
    if (!camera || !ov) return null;
    const rect = ov.getBoundingClientRect();
    const v = p.clone().project(camera);
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 overflow-hidden flex flex-col bg-card border-border">
        <DialogTitle className="sr-only">Visualizador 3D — {currentName}</DialogTitle>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-primary tracking-wide mb-1">
                {parsed.extension}
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-2xl md:text-3xl font-semibold text-foreground leading-tight">
                  {parsed.accent && parsed.title.includes(parsed.accent) ? (
                    <>
                      {parsed.title.split(parsed.accent)[0]}
                      <span className="text-primary">{parsed.accent}</span>
                      {parsed.title.split(parsed.accent)[1]}
                    </>
                  ) : (
                    parsed.title
                  )}
                </h2>
                {parsed.teeth.length > 0 && (
                  <Popover>
                    <PopoverTrigger className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition">
                      ver elementos <ChevronRight className="h-3.5 w-3.5" />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-3 text-sm">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Elementos (FDI)
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {parsed.teeth.map((t) => (
                          <span key={t} className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-primary/10 text-primary text-xs font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">{currentName}</div>
              {currentUploadedAt && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Última atualização:{" "}
                  <span className="text-primary">{formatLastUpdate(currentUploadedAt)}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="relative shrink-0 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 transition"
            >
              <RotateCw className="h-4 w-4" />
              Atualizar
              {newerVersion && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-card"
                  title="Nova versão disponível"
                />
              )}
            </button>
          </div>
        </div>

        {/* Área 3D */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden viewer-surface"
        >
          <div ref={mountRef} className="absolute inset-0" />

          {/* Overlay de anotações */}
          <canvas
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-0"
            style={{
              pointerEvents: tool === "none" ? "none" : "auto",
              cursor: tool === "none" ? "default" : tool === "eraser" ? "not-allowed" : "crosshair",
              touchAction: "none",
            }}
          />

          {/* Toolbar */}
          {!loading && !error && (
            <AnnotationToolbar
              tool={tool}
              onToolChange={setTool}
              color={color}
              onColorChange={setColor}
              width={width}
              onWidthChange={setWidth}
              onCapture={handleCapture}
              onClear={handleClear}
              hasAnnotations={annotations.length > 0}
            />
          )}

          {/* Indicador de modo congelado */}
          {tool !== "none" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-primary/95 text-primary-foreground text-xs font-medium shadow-md">
              Modo de anotação ativo — rotação congelada
            </div>
          )}

          {/* Comment draft input */}
          {commentDraft && (() => {
            const pos = projectAnchorToScreen(commentDraft.anchor);
            if (!pos) return null;
            return (
              <div
                className="absolute z-30 bg-background border border-border rounded-lg shadow-lg p-1.5"
                style={{ left: pos.x + 14, top: pos.y - 14 }}
              >
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={commentDraft.text}
                    onChange={(e) => handleCommentTextChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && mentionSuggestions.length === 0) confirmCommentDraft();
                      if (e.key === "Escape") { setCommentDraft(null); setMentionSuggestions([]); }
                    }}
                    placeholder="Comentário… (use @ para mencionar)"
                    className="h-8 w-64 px-2 text-sm bg-transparent outline-none"
                  />
                  <button onClick={confirmCommentDraft} className="h-8 px-2 text-xs font-medium rounded-md bg-primary text-primary-foreground">
                    OK
                  </button>
                  <button onClick={() => { setCommentDraft(null); setMentionSuggestions([]); }} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {mentionSuggestions.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover">
                    {mentionSuggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickMention(p)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{p.full_name || p.email}</span>
                        {p.email && <span className="text-muted-foreground truncate">{p.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Comentários existentes — clique para voltar à câmera salva */}
          {annotations.filter((a): a is Extract<Annotation, { type: "comment" }> => a.type === "comment").map((c) => {
            const pos = projectAnchorToScreen(c.anchor);
            if (!pos) return null;
            const hasCamera = cameraByLocalRef.current.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => flyToComment(c.id)}
                disabled={!hasCamera}
                title={hasCamera ? "Voltar à vista deste comentário" : c.text}
                className="absolute z-10 max-w-xs px-2 py-1 rounded-md bg-background border border-border shadow-sm text-xs text-foreground text-left hover:bg-muted transition disabled:hover:bg-background disabled:cursor-default"
                style={{ left: pos.x + 14, top: pos.y - 10 }}
              >
                {c.text}
              </button>
            );
          })}


          {/* Botão fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute top-4 right-4 z-20 h-9 w-9 rounded-md bg-background/80 backdrop-blur border border-border/60 hover:bg-background flex items-center justify-center text-foreground/70 hover:text-foreground transition shadow-sm"
            aria-label={isFullscreen ? "Sair de tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* ViewCube */}
          {!loading && !error && (
            <div className="absolute bottom-4 right-4 z-20 rounded-md p-1 bg-background/60 backdrop-blur-sm shadow-sm">
              <ViewCube3D getMainCamera={getMainCamera} onFaceClick={onCubeFaceClick} />
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando modelo…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive gap-2 text-sm bg-background/80">
              <AlertCircle className="h-5 w-5" /> {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
