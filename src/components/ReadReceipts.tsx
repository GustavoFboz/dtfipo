import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Reader = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  readAt?: string | null;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function readTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${hm}`;
}

function Avatar({ r, className }: { r: Reader; className?: string }) {
  return r.avatarUrl ? (
    <img
      src={r.avatarUrl}
      alt={r.name}
      className={cn("rounded-full object-cover border border-background", className)}
    />
  ) : (
    <span
      className={cn(
        "rounded-full border border-background bg-muted text-muted-foreground grid place-items-center font-semibold",
        className,
      )}
    >
      {initials(r.name)}
    </span>
  );
}

/**
 * "Visualizado por" com círculos das fotos dos visualizadores (máx. 3 + [+x]).
 * Ao clicar, abre um dropdown com foto, nome e o horário da visualização.
 */
export function ReadReceipts({ readers }: { readers: Reader[] }) {
  if (readers.length === 0) return null;
  const shown = readers.slice(0, 3);
  const extra = readers.length - shown.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 hover:bg-muted/60 transition-colors"
          title="Ver quem visualizou"
        >
          <span>· Visualizado por</span>
          <span className="flex -space-x-1.5 items-center">
            {shown.map((r) => (
              <Avatar key={r.id} r={r} className="h-4 w-4 text-[8px]" />
            ))}
            {extra > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full border border-background bg-primary/15 text-primary text-[8px] font-bold grid place-items-center">
                +{extra}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-60 p-2 rounded-xl">
        <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Visualizado por
        </p>
        <ul className="max-h-56 overflow-auto">
          {readers.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
              <Avatar r={r} className="h-7 w-7 text-[10px] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate text-foreground">{r.name}</div>
                {r.readAt && (
                  <div className="text-[9px] text-muted-foreground text-right leading-none mt-0.5">
                    {readTime(r.readAt)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
