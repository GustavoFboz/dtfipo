import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";

interface Props {
  /** Quaternion-providing camera from the main scene. */
  getMainCamera: () => THREE_NS.PerspectiveCamera | null;
  /** Called when user clicks a face — passes the desired view direction (unit vector). */
  onFaceClick: (axis: { x: number; y: number; z: number }) => void;
  size?: number;
}

/**
 * Small orientation cube rendered in its own canvas. Mirrors the main camera's
 * orientation. Click a face to align the main camera to that axis.
 */
export function ViewCube3D({ getMainCamera, onFaceClick, size = 96 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const mount = mountRef.current;
      if (!mount || disposed) return;

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
      camera.position.set(0, 0, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      renderer.domElement.style.cursor = "pointer";
      mount.appendChild(renderer.domElement);

      // Cube com faces individuais (CanvasTexture com labels)
      const makeFace = (label: string, accent = false): THREE_NS.MeshBasicMaterial => {
        const c = document.createElement("canvas");
        c.width = 128; c.height = 128;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = accent ? "#1f6bff" : "#ffffff";
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = accent ? "#1f6bff" : "#d4dae6";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);
        ctx.fillStyle = accent ? "#ffffff" : "#475569";
        ctx.font = "600 28px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return new THREE.MeshBasicMaterial({ map: tex });
      };

      // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
      const mats = [
        makeFace("+X", true),
        makeFace("-X"),
        makeFace("+Y"),
        makeFace("-Y"),
        makeFace("+Z"),
        makeFace("-Z"),
      ];
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mats);
      scene.add(cube);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      // Drag-to-rotate: while dragging on the cube, rotate the MAIN camera freely.
      let dragging = false;
      let moved = false;
      let lastX = 0, lastY = 0;
      const rotateFn = () =>
        (window as unknown as { __model3d_rotateBy?: (dx: number, dy: number) => void }).__model3d_rotateBy;

      const onPointerDown = (ev: PointerEvent) => {
        dragging = true;
        moved = false;
        lastX = ev.clientX; lastY = ev.clientY;
        (ev.target as Element).setPointerCapture?.(ev.pointerId);
      };
      const onPointerMove = (ev: PointerEvent) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX; lastY = ev.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
        const fn = rotateFn();
        if (fn) fn(dx * 0.01, dy * 0.01);
      };
      const onPointerUp = (ev: PointerEvent) => {
        dragging = false;
        try { (ev.target as Element).releasePointerCapture?.(ev.pointerId); } catch { /* noop */ }
      };

      const onClick = (ev: MouseEvent) => {
        if (moved) { moved = false; return; } // ignore click after a drag
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(cube)[0];
        if (!hit) return;
        const n = hit.face!.normal.clone();
        onFaceClick({ x: n.x, y: n.y, z: n.z });
      };
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("click", onClick);

      const tmpQuat = new THREE.Quaternion();
      const animate = () => {
        if (disposed) return;
        const mainCam = getMainCamera();
        if (mainCam) {
          // O cubo deve mostrar o lado que aponta para o usuário na cena principal,
          // ou seja, sua orientação é a INVERSA da câmera principal.
          tmpQuat.copy(mainCam.quaternion).invert();
          cube.quaternion.copy(tmpQuat);
        }
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(rafId);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("click", onClick);
        cube.geometry.dispose();
        mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cleanup?.();
    };
  }, [getMainCamera, onFaceClick, size]);

  return (
    <div
      ref={mountRef}
      className="pointer-events-auto"
      style={{ width: size, height: size }}
      aria-label="Cubo de orientação 3D"
    />
  );
}
