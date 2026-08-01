import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Crop, Pencil, Type, RotateCw, Undo2, Loader2, Check, X, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "crop" | "draw" | "text";

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
type TextItem = { x: number; y: number; text: string; color: string; size: number };

export type ImageEditorMode = "avatar" | "free";

type Props = {
  open: boolean;
  file: File | null;
  /** avatar = recorte circular 1:1 obrigatório; free = recorte livre */
  mode?: ImageEditorMode;
  title?: string;
  /** lado do resultado (avatar) ou largura máxima (free) */
  outputSize?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

const COLORS = ["#ef4444", "#2D7FF9", "#22c55e", "#f59e0b", "#ffffff", "#111827"];

export function ImageEditorDialog({
  open,
  file,
  mode = "avatar",
  title,
  outputSize = 640,
  onCancel,
  onConfirm,
}: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("crop");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // resultado do recorte (base para anotações)
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [brush, setBrush] = useState(8);
  const [fontSize, setFontSize] = useState(44);

  const cropBoxRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);

  const viewport = mode === "avatar" ? { w: 320, h: 320 } : { w: 360, h: 360 };

  // carrega o arquivo
  useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // reset ao abrir/trocar arquivo
  useEffect(() => {
    if (!open) return;
    setTool("crop");
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setStrokes([]);
    setTexts([]);
    setBaseImg(null);
    setBaseUrl(null);
  }, [open, file]);

  const baseScale = useMemo(() => {
    if (!img) return 1;
    return Math.max(viewport.w / img.naturalWidth, viewport.h / img.naturalHeight);
  }, [img, viewport.w, viewport.h]);

  const renderCrop = useCallback(async (): Promise<{ url: string; el: HTMLImageElement } | null> => {
    if (!img) return null;
    const out = mode === "avatar" ? { w: outputSize, h: outputSize } : { w: outputSize, h: Math.round((outputSize * viewport.h) / viewport.w) };
    const k = out.w / viewport.w;
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.w, out.h);
    ctx.save();
    ctx.translate(out.w / 2 + offset.x * k, out.h / 2 + offset.y * k);
    ctx.rotate((rotation * Math.PI) / 180);
    const s = baseScale * zoom * k;
    ctx.scale(s, s);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const el = await new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = url;
    });
    return { url, el };
  }, [img, mode, outputSize, viewport.w, viewport.h, offset, rotation, baseScale, zoom]);

  async function goToAnnotate(next: Tool) {
    if (!baseImg) {
      const res = await renderCrop();
      if (!res) return;
      setBaseUrl(res.url);
      setBaseImg(res.el);
    }
    setTool(next);
  }

  // desenha base + anotações no canvas visível
  useEffect(() => {
    const canvas = annotCanvasRef.current;
    if (!canvas || !baseImg || tool === "crop") return;
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      s.points.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    for (const t of texts) {
      ctx.font = `700 ${t.size}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, t.size / 10);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
  }, [baseImg, strokes, texts, tool]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annotCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  async function confirm() {
    setBusy(true);
    try {
      let source: HTMLImageElement | null = baseImg;
      if (!source) {
        const res = await renderCrop();
        source = res?.el ?? null;
      }
      if (!source) return;
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        s.points.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
      for (const t of texts) {
        ctx.font = `700 ${t.size}px system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, t.size / 10);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (blob) onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? (mode === "avatar" ? "Ajustar foto de perfil" : "Editar imagem")}</DialogTitle>
          <DialogDescription className="text-xs">
            {tool === "crop"
              ? "Arraste para posicionar e use o zoom para enquadrar."
              : tool === "draw"
                ? "Desenhe sobre a imagem."
                : "Clique na imagem para inserir um texto."}
          </DialogDescription>
        </DialogHeader>

        {/* Abas de ferramentas */}
        <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit mx-auto">
          {([
            { id: "crop", label: "Recortar", icon: Crop },
            { id: "draw", label: "Desenhar", icon: Pencil },
            { id: "text", label: "Texto", icon: Type },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => (t.id === "crop" ? setTool("crop") : goToAnnotate(t.id))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition",
                tool === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Área de edição */}
        <div className="flex flex-col items-center gap-3">
          {tool === "crop" ? (
            <>
              <div
                ref={cropBoxRef}
                className="relative overflow-hidden bg-black touch-none select-none"
                style={{
                  width: viewport.w,
                  height: viewport.h,
                  borderRadius: mode === "avatar" ? "9999px" : "0.75rem",
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
                }}
                onPointerMove={(e) => {
                  if (!dragging.current) return;
                  setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
                }}
                onPointerUp={() => (dragging.current = null)}
                onPointerLeave={() => (dragging.current = null)}
              >
                {img && (
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="absolute left-1/2 top-1/2 origin-center will-change-transform"
                    style={{
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${baseScale * zoom})`,
                    }}
                  />
                )}
                {mode === "avatar" && (
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70" />
                )}
              </div>
              <div className="flex items-center gap-3 w-full max-w-[320px]">
                <span className="text-[11px] text-muted-foreground">Zoom</span>
                <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} className="flex-1" />
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setRotation((r) => (r + 90) % 360)}>
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <canvas
                ref={annotCanvasRef}
                className={cn("bg-black touch-none max-w-full", mode === "avatar" ? "rounded-full" : "rounded-xl")}
                style={{ width: viewport.w, height: mode === "avatar" ? viewport.w : viewport.h }}
                onPointerDown={(e) => {
                  if (tool !== "draw") return;
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  const p = canvasPoint(e);
                  drawing.current = { color, width: brush * 2, points: [p] };
                  setStrokes((s) => [...s, drawing.current!]);
                }}
                onPointerMove={(e) => {
                  if (tool !== "draw" || !drawing.current) return;
                  const p = canvasPoint(e);
                  drawing.current.points.push(p);
                  setStrokes((s) => [...s.slice(0, -1), { ...drawing.current!, points: [...drawing.current!.points] }]);
                }}
                onPointerUp={() => (drawing.current = null)}
                onClick={(e) => {
                  if (tool !== "text") return;
                  const p = canvasPoint(e);
                  const value = window.prompt("Texto:");
                  if (!value) return;
                  setTexts((t) => [...t, { x: p.x, y: p.y, text: value, color, size: fontSize }]);
                }}
              />
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full border transition",
                      color === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border",
                    )}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => (tool === "text" ? setTexts((t) => t.slice(0, -1)) : setStrokes((s) => s.slice(0, -1)))}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setStrokes([]);
                    setTexts([]);
                  }}
                >
                  <Eraser className="h-3.5 w-3.5" /> Limpar
                </Button>
              </div>
              <div className="flex items-center gap-3 w-full max-w-[320px]">
                <span className="text-[11px] text-muted-foreground w-16">{tool === "text" ? "Tamanho" : "Pincel"}</span>
                {tool === "text" ? (
                  <Slider value={[fontSize]} min={18} max={120} step={1} onValueChange={(v) => setFontSize(v[0])} className="flex-1" />
                ) : (
                  <Slider value={[brush]} min={2} max={30} step={1} onValueChange={(v) => setBrush(v[0])} className="flex-1" />
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} className="gap-1.5">
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button onClick={confirm} disabled={busy || !img} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Concluir
          </Button>
        </div>
        {baseUrl && <span className="hidden">{baseUrl}</span>}
      </DialogContent>
    </Dialog>
  );
}
