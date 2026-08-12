import { useMemo, useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger, PopoverAnchor,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import type { Patient } from "@/lib/types";
import { normalizeText } from "@/lib/utils";

type Props = {
  patients: Patient[];
  selectedId: string;
  newName: string;
  onSelectExisting: (id: string) => void;
  onTypeNew: (name: string) => void;
};

export function PatientCombobox({ patients, selectedId, newName, onSelectExisting, onTypeNew }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = patients.find((p) => p.id === selectedId);
  const display = selected?.name ?? newName ?? "";

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return patients.slice(0, 50);
    return patients.filter((p) => normalizeText(p.name).includes(q)).slice(0, 50);
  }, [patients, query]);

  const exactMatch = patients.some((p) => normalizeText(p.name) === normalizeText(query));

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-accent/40"
        >
          <span className={display ? "" : "text-muted-foreground"}>
            {display || "Selecione ou digite o nome do paciente"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[1100]" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            placeholder="Buscar ou digitar novo nome…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelectExisting(p.id); setOpen(false); setQuery(""); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent"
            >
              <Check className={`h-3.5 w-3.5 ${selectedId === p.id ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum paciente encontrado.</div>
          )}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => { onTypeNew(query.trim()); setOpen(false); setQuery(""); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent border-t border-border bg-muted/30"
            >
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              <span>Cadastrar novo paciente: <b>{query.trim()}</b></span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
