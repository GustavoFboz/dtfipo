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
  const [loaded, setLoaded] = useState<{ file: File; image: HTMLImageElement } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("crop");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Resultado do recorte (base para anotações). O loader possui a URL do
  // arquivo selecionado; esta URL derivada pertence somente a este efeito.
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
  const loadVersion = useRef(0);

  // Nunca reutiliza a imagem ou as anotações do arquivo anterior, nem mesmo
  // durante o frame anterior ao efeito de carregamento do novo arquivo.
  const img = open && file && loaded?.file === file ? loaded.image : null;
  const readyBaseImg = img ? baseImg : null;
  const viewport = mode === "avatar" ? { w: 320, h: 320 } : { w: 360, h: 360 };

  // Carrega, decodifica e limpa cada arquivo selecionado. A versão invalida
  // loads e canvas antigos ao trocar o arquivo, fechar ou desmontar o dialog.
  useEffect(() => {
    const version = ++loadVersion.current;
    dragging.current = null;
    drawing.current = null;
    setLoaded(null);
    setLoadError(null);
    setError(null);
    setBusy(false);
    setTool("crop");
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setStrokes([]);
    setTexts([]);
    setBaseImg(null);
    setBaseUrl(null);

    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (version !== loadVersion.current) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setLoadError("Não foi possível abrir esta imagem. Selecione outro arquivo.");
        return;
      }
      setLoaded({ file, image });
    };
    image.onerror = () => {
      if (version !== loadVersion.current) return;
      setLoaded(null);
      setLoadError("Não foi possível abrir esta imagem. Selecione outro arquivo.");
    };
    image.src = url;

    return () => {
      image.onload = null;
      image.onerror = null;
      if (loadVersion.current === version) loadVersion.current++;
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  useEffect(() => {
    return () => {
      if (baseUrl) URL.revokeObjectURL(baseUrl);
    };
  }, [baseUrl]);

  const baseScale = useMemo(() => {
    if (!img) return 1;
    return Math.max(viewport.w / img.naturalWidth, viewport.h / img.naturalHeight);
  }, [img, viewport.w, viewport.h]);

  const renderCrop = useCallback(async (): Promise<{ url: string; el: HTMLImageElement } | null> => {
    if (!img || !file) return null;
    const version = loadVersion.current;
    try {
      const out = mode === "avatar" ? { w: outputSize, h: outputSize } : { w: outputSize, h: Math.round((outputSize * viewport.h) / viewport.w) };
      const k = out.w / viewport.w;
      const canvas = document.createElement("canvas");
      canvas.width = out.w;
      canvas.height = out.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas não suportado");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, out.w, out.h);
      ctx.save();
      ctx.translate(out.w / 2 + offset.x * k, out.h / 2 + offset.y * k);
      ctx.rotate((rotation * Math.PI) / 180);
      const s = baseScale * zoom * k;
      ctx.scale(s, s);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (version !== loadVersion.current) return null;
      if (!blob) throw new Error("Falha ao gerar o recorte");

      const url = URL.createObjectURL(blob);
      try {
        const el = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Falha ao abrir o recorte"));
          image.src = url;
        });
        if (version !== loadVersion.current) {
          URL.revokeObjectURL(url);
          return null;
        }
        return { url, el };
      } catch (decodeError) {
        URL.revokeObjectURL(url);
        throw decodeError;
      }
    } catch {
      if (version === loadVersion.current) setError("Não foi possível processar a imagem. Tente novamente.");
      return null;
    }
  }, [img, file, mode, outputSize, viewport.w, viewport.h, offset, rotation, baseScale, zoom]);

  async function goToAnnotate(next: Tool) {
    if (!img || busy) return;
    const version = loadVersion.current;
    setBusy(true);
    setError(null);
    try {
      if (!readyBaseImg) {
        const res = await renderCrop();
        if (!res || version !== loadVersion.current) return;
        setBaseUrl(res.url);
        setBaseImg(res.el);
      }
      if (version === loadVersion.current) setTool(next);
    } finally {
      if (version === loadVersion.current) setBusy(false);
    }
  }

  // Desenha base + anotações no canvas visível.
  useEffect(() => {
    const canvas = annotCanvasRef.current;
    if (!canvas || !readyBaseImg || tool === "crop") return;
    canvas.width = readyBaseImg.naturalWidth;
    canvas.height = readyBaseImg.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(readyBaseImg, 0, 0);
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
  }, [readyBaseImg, strokes, texts, tool]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annotCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  async function confirm() {
    if (!img || busy) return;
    const version = loadVersion.current;
    setBusy(true);
    setError(null);
    let temporaryCropUrl: string | null = null;
    try {
      let source: HTMLImageElement | null = readyBaseImg;
      if (!source) {
        const res = await renderCrop();
        if (version !== loadVersion.current) return;
        source = res?.el ?? null;
        temporaryCropUrl = res?.url ?? null;
      }
      if (!source || version !== loadVersion.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas não suportado");
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
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (blob && version === loadVersion.current) onConfirm(blob);
      if (!blob && version === loadVersion.current) setError("Não foi possível concluir a edição. Tente novamente.");
    } catch {
      if (version === loadVersion.current) setError("Não foi possível concluir a edição. Tente novamente.");
    } finally {
      if (temporaryCropUrl) URL.revokeObjectURL(temporaryCropUrl);
      if (version === loadVersion.current) setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onCancel()}>
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

        <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit mx-auto">
          {([
            { id: "crop", label: "Recortar", icon: Crop },
            { id: "draw", label: "Desenhar", icon: Pencil },
            { id: "text", label: "Texto", icon: Type },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!img || busy}
              onClick={() => (item.id === "crop" ? setTool("crop") : goToAnnotate(item.id))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50",
                tool === item.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
        </div>

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
                onPointerDown={(event) => {
                  if (!img || busy) return;
                  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
                  dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
                }}
                onPointerMove={(event) => {
                  if (!img || !dragging.current) return;
                  setOffset({ x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y });
                }}
                onPointerUp={() => (dragging.current = null)}
                onPointerCancel={() => (dragging.current = null)}
                onPointerLeave={() => (dragging.current = null)}
              >
                {img && (
                  <img
                    src={img.src}
                    alt={file ? `Prévia de ${file.name}` : "Prévia da imagem"}
                    draggable={false}
                    className="absolute left-1/2 top-1/2 origin-center will-change-transform"
                    style={{
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${baseScale * zoom})`,
                    }}
                  />
                )}
                {!img && open && file && (
                  <div
                    role={loadError ? "alert" : "status"}
                    className="absolute inset-0 grid place-items-center px-8 text-center text-xs text-white/80"
                  >
                    {loadError ? loadError : <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando imagem…</span>}
                  </div>
                )}
                {mode === "avatar" && (
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70" />
                )}
              </div>
              <div className="flex items-center gap-3 w-full max-w-[320px]">
                <span className="text-[11px] text-muted-foreground">Zoom</span>
                <Slider disabled={!img || busy} value={[zoom]} min={1} max={4} step={0.01} onValueChange={(value) => setZoom(value[0])} className="flex-1" />
                <Button type="button" size="icon" variant="outline" disabled={!img || busy} className="h-8 w-8" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Girar imagem">
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
                onPointerDown={(event) => {
                  if (tool !== "draw" || !readyBaseImg || busy) return;
                  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
                  const point = canvasPoint(event);
                  drawing.current = { color, width: brush * 2, points: [point] };
                  setStrokes((current) => [...current, drawing.current!]);
                }}
                onPointerMove={(event) => {
                  if (tool !== "draw" || !drawing.current || busy) return;
                  const point = canvasPoint(event);
                  drawing.current.points.push(point);
                  setStrokes((current) => [...current.slice(0, -1), { ...drawing.current!, points: [...drawing.current!.points] }]);
                }}
                onPointerUp={() => (drawing.current = null)}
                onPointerCancel={() => (drawing.current = null)}
                onClick={(event) => {
                  if (tool !== "text" || !readyBaseImg || busy) return;
                  const point = canvasPoint(event);
                  const value = window.prompt("Texto:");
                  if (!value) return;
                  setTexts((current) => [...current, { x: point.x, y: point.y, text: value, color, size: fontSize }]);
                }}
              />
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!readyBaseImg || busy}
                    onClick={() => setColor(value)}
                    className={cn(
                      "h-6 w-6 rounded-full border transition disabled:opacity-50",
                      color === value ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border",
                    )}
                    style={{ background: value }}
                    aria-label={`Cor ${value}`}
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!readyBaseImg || busy}
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => (tool === "text" ? setTexts((current) => current.slice(0, -1)) : setStrokes((current) => current.slice(0, -1)))}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!readyBaseImg || busy}
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
                  <Slider disabled={!readyBaseImg || busy} value={[fontSize]} min={18} max={120} step={1} onValueChange={(value) => setFontSize(value[0])} className="flex-1" />
                ) : (
                  <Slider disabled={!readyBaseImg || busy} value={[brush]} min={2} max={30} step={1} onValueChange={(value) => setBrush(value[0])} className="flex-1" />
                )}
              </div>
            </>
          )}
          {error && <p role="alert" className="max-w-[320px] text-center text-xs text-destructive">{error}</p>}
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
