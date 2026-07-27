/**
 * Multi3DViewer
 * ------------------------------------------------------------
 * Visualiza VÁRIOS arquivos 3D (STL/PLY) simultaneamente numa mesma cena,
 * preservando as coordenadas nativas de cada arquivo — essencial para casos
 * odontológicos onde, por exemplo, "maxila" e "mandíbula" foram escaneadas
 * no mesmo sistema de coordenadas e naturalmente se ocluem ao serem
 * carregadas juntas.
 *
 * Painel lateral por arquivo:
 *  - Visibilidade (olho)
 *  - Solo (isolar)
 *  - Opacidade (slider 0–100%)
 *  - Cor identificadora (chip)
 *
 * Câmera: TrackballControls (rotação 360° livre) + luz-chave que segue a câmera.
 * A câmera é enquadrada ao bounding-box combinado de TODOS os modelos visíveis.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type * as THREE_NS from "three";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Focus, Loader2, RotateCcw } from "lucide-react";
import { getCaseAttachmentUrl } from "@/lib/api";

export type Multi3DFile = {
  id: string;
  storagePath: string;
  fileName: string;
};

type LoadedEntry = {
  id: string;
  name: string;
  mesh: THREE_NS.Mesh;
  material: THREE_NS.MeshPhysicalMaterial;
  color: string;
  visible: boolean;
  opacity: number; // 0..1
};

// Paleta consistente para identificar cada modelo no painel lateral.
const PALETTE = [
  "#3aa0ff", "#ff8a3a", "#8affb0", "#c58aff",
  "#ffd23a", "#ff6b8a", "#3affe0", "#ffffff",
];

export function Multi3DViewer({
  open, onOpenChange, files,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: Multi3DFile[];
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const THREERef = useRef<typeof THREE_NS | null>(null);
  const rendererRef = useRef<THREE_NS.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE_NS.PerspectiveCamera | null>(null);
  const controlsRef = useRef<{ target: THREE_NS.Vector3; update: () => void; dispose: () => void; enabled: boolean } | null>(null);
  const sceneRef = useRef<THREE_NS.Scene | null>(null);
  const entriesRef = useRef<Map<string, LoadedEntry>>(new Map());

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [entries, setEntries] = useState<LoadedEntry[]>([]);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chave estável para reagir a mudanças na lista de arquivos.
  const filesKey = useMemo(() => files.map((f) => f.id).join("|"), [files]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let rafId = 0;
    let cleanup: (() => void) | null = null;

    setLoading(true);
    setError(null);
    setEntries([]);
    setSoloId(null);
    setProgress({ done: 0, total: files.length });

    (async () => {
      // Aguarda o ref existir E o container ter tamanho (Dialog animando).
      const mountEl = await new Promise<HTMLDivElement | null>((res) => {
        const start = performance.now();
        const tick = () => {
          if (disposed) return res(null);
          const el = mountRef.current;
          if (el && el.clientWidth > 0 && el.clientHeight > 0) return res(el);
          if (performance.now() - start > 8000) return res(null);
          requestAnimationFrame(tick);
        };
        tick();
      });
      if (!mountEl || disposed) {
        if (!disposed) { setError("Container 3D não inicializou"); setLoading(false); }
        return;
      }


      const THREE = await import("three");
      THREERef.current = THREE;
      const { TrackballControls } = await import("three/addons/controls/TrackballControls.js");
      const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
      const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");

      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
      camera.position.set(0, 0, 200);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      mountEl.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const ambient = new THREE.AmbientLight(0xffffff, 0.35);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(-1, 0.6, 1);
      scene.add(ambient, keyLight);

      const controls = new TrackballControls(camera, renderer.domElement);
      controls.rotateSpeed = 3.0;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.8;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.15;
      controlsRef.current = controls as unknown as typeof controlsRef.current;

      // Carrega cada arquivo em paralelo mas preserva coordenadas nativas.
      const loaded: LoadedEntry[] = [];
      await Promise.all(files.map(async (f, idx) => {
        try {
          const url = await getCaseAttachmentUrl(f.storagePath);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const ext = f.fileName.split(".").pop()?.toLowerCase();
          let geometry: THREE_NS.BufferGeometry;
          let hasVertexColors = false;
          if (ext === "stl") {
            geometry = new STLLoader().parse(buffer);
          } else if (ext === "ply") {
            geometry = new PLYLoader().parse(buffer);
            hasVertexColors = !!geometry.getAttribute("color");
          } else {
            throw new Error(`Formato .${ext} não suportado`);
          }
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();

          const color = PALETTE[idx % PALETTE.length];
          const material = new THREE.MeshPhysicalMaterial({
            color: hasVertexColors ? 0xffffff : color,
            vertexColors: hasVertexColors,
            metalness: 0.0,
            roughness: 0.35,
            clearcoat: 0.5,
            clearcoatRoughness: 0.25,
            transparent: true,
            opacity: 1,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = f.id;
          scene.add(mesh);
          loaded.push({
            id: f.id, name: f.fileName, mesh, material,
            color, visible: true, opacity: 1,
          });
        } catch (e) {
          console.warn("[Multi3DViewer] load failed", f.fileName, e);
        } finally {
          if (!disposed) setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }));

      if (disposed) return;

      // Enquadra a câmera pelo bounding-box combinado de TODOS os modelos
      // — sem re-centralizar cada mesh, para preservar oclusão nativa.
      const box = new THREE.Box3();
      for (const e of loaded) {
        if (!e.mesh.geometry.boundingBox) e.mesh.geometry.computeBoundingBox();
        box.expandByObject(e.mesh);
      }
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        const radius = Math.max(size * 0.5, 1);
        camera.position.copy(center).add(new THREE.Vector3(0, 0, radius * 2.5));
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
      }

      entriesRef.current = new Map(loaded.map((e) => [e.id, e]));
      setEntries(loaded);
      setLoading(false);
      if (loaded.length === 0) setError("Nenhum arquivo pôde ser carregado.");

      // Loop de animação — luz-chave segue a câmera.
      const animate = () => {
        if (disposed) return;
        rafId = requestAnimationFrame(animate);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const right = new THREE.Vector3().crossVectors(camera.up, camDir).normalize();
        const up = new THREE.Vector3().copy(camera.up).normalize();
        keyLight.position.copy(camera.position)
          .add(right.multiplyScalar(-1))
          .add(up.multiplyScalar(0.6))
          .add(camDir.clone().multiplyScalar(-1));
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        const rw = mountEl.clientWidth;
        const rh = mountEl.clientHeight;
        renderer.setSize(rw, rh);
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
        (controls as unknown as { handleResize?: () => void }).handleResize?.();
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(mountEl);

      cleanup = () => {
        ro.disconnect();
        cancelAnimationFrame(rafId);
        controls.dispose();
        for (const e of loaded) {
          scene.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.material.dispose();
        }
        renderer.dispose();
        if (renderer.domElement.parentElement === mountEl) mountEl.removeChild(renderer.domElement);
      };
    })().catch((e) => {
      if (!disposed) { setError((e as Error).message); setLoading(false); }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cleanup?.();
      entriesRef.current.clear();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filesKey]);

  // Aplica visibilidade/opacidade nos meshes (efeito derivado do estado).
  useEffect(() => {
    for (const e of entries) {
      const cur = entriesRef.current.get(e.id);
      if (!cur) continue;
      const effectiveVisible = soloId ? soloId === e.id : e.visible;
      cur.mesh.visible = effectiveVisible;
      cur.material.opacity = e.opacity;
      cur.material.transparent = e.opacity < 1;
      cur.material.depthWrite = e.opacity >= 0.99;
      cur.material.needsUpdate = true;
    }
  }, [entries, soloId]);

  const updateEntry = (id: string, patch: Partial<Pick<LoadedEntry, "visible" | "opacity">>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const resetView = () => {
    const THREE = THREERef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const scene = sceneRef.current;
    if (!THREE || !camera || !controls || !scene) return;
    const box = new THREE.Box3();
    for (const e of entriesRef.current.values()) {
      if (e.mesh.visible) box.expandByObject(e.mesh);
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, radius * 2.5));
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-2.5 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">
            Visualização em oclusão · {files.length} arquivo(s)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Cena 3D */}
          <div className="flex-1 min-w-0 relative bg-[#0b0d12]">
            <div ref={mountRef} className="absolute inset-0" />
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2 pointer-events-none">
                <Loader2 className="h-6 w-6 animate-spin" />
                <div className="text-xs">
                  Carregando modelos… {progress.done}/{progress.total}
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">{error}</div>
            )}
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={resetView} className="gap-1.5">
                <Focus className="h-3.5 w-3.5" /> Reenquadrar
              </Button>
            </div>
          </div>

          {/* Painel lateral por arquivo */}
          <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Camadas</span>
              {soloId && (
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                  onClick={() => setSoloId(null)}>
                  <RotateCcw className="h-3 w-3" /> Sair do solo
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {entries.length === 0 && !loading && (
                <div className="text-xs text-muted-foreground p-2">Nenhum modelo carregado.</div>
              )}
              {entries.map((e) => {
                const isSolo = soloId === e.id;
                const dimmed = soloId && !isSolo;
                return (
                  <div key={e.id}
                    className={`rounded-md border border-border p-2 space-y-2 ${dimmed ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm shrink-0 border border-white/20"
                        style={{ backgroundColor: e.color }}
                      />
                      <div className="text-xs font-medium truncate flex-1" title={e.name}>{e.name}</div>
                      <button
                        type="button"
                        title={e.visible ? "Ocultar" : "Mostrar"}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => updateEntry(e.id, { visible: !e.visible })}
                      >
                        {e.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-14">Opacidade</span>
                      <Slider
                        min={0} max={100} step={1}
                        value={[Math.round(e.opacity * 100)]}
                        onValueChange={(v) => updateEntry(e.id, { opacity: (v[0] ?? 100) / 100 })}
                        className="flex-1"
                      />
                      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                        {Math.round(e.opacity * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant={isSolo ? "default" : "ghost"}
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setSoloId(isSolo ? null : e.id)}
                      >
                        {isSolo ? "Isolado" : "Isolar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground leading-snug">
              As coordenadas nativas de cada arquivo são preservadas — modelos escaneados
              no mesmo referencial (ex.: maxila e mandíbula) exibem oclusão automaticamente.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
