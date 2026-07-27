import { useEffect, useRef, useState } from "react";

const PRESETS = [
  "#0a4dbd", "#1e88e5", "#00acc1", "#26a69a", "#43a047",
  "#7cb342", "#fdd835", "#fb8c00", "#f4511e", "#e53935",
  "#d81b60", "#8e24aa", "#5e35b1", "#3949ab", "#546e7a",
  "#6d4c41", "#000000", "#9e9e9e", "#ffffff",
];

type Props = {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
};

export function ColorPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="h-10 w-10 rounded-md border border-border shadow-sm shrink-0"
          style={{ background: value || "#3b82f6" }}
          title="Escolher cor"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3b82f6"
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono"
        />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 rounded-md border border-border cursor-pointer p-0.5 bg-card"
          title="Seletor avançado"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-2 p-3 bg-popover border border-border rounded-xl shadow-lg w-64">
          <div className="text-xs text-muted-foreground mb-2">Cores predefinidas</div>
          <div className="grid grid-cols-7 gap-1.5">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className="h-7 w-7 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
