import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { TeethSelector } from "../TeethSelector";
import { sortTeeth } from "@/lib/teeth";
import type { CaseRow } from "@/lib/types";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function statusLabel(s: string) {
  switch (s) {
    case "active": return "Em andamento";
    case "finished": return "Finalizado";
    case "cancelled":
    case "canceled": return "Cancelado";
    default: return s;
  }
}

function ToothChip({ n, color = "#0C84FA" }: { n: number; color?: string }) {
  return (
    <span
      className="inline-grid place-items-center h-7 min-w-7 px-1.5 rounded-full text-[11px] font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {n}
    </span>
  );
}

type Props = {
  caseRow: CaseRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ToothCaseDialog({ caseRow, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto p-0">
        {caseRow && <ToothCaseDialogBody c={caseRow} />}
      </SheetContent>
    </Sheet>
  );
}

function ToothCaseDialogBody({ c }: { c: CaseRow }) {
  const teeth = sortTeeth(c.teeth_numbers ?? []);
  const zir = sortTeeth(c.teeth_zirconia ?? []);
  const dis = sortTeeth(c.teeth_dissilicato ?? []);
  const implantTeeth = sortTeeth(c.implant_teeth ?? []);

  return (
    <div className="flex flex-col">
      <SheetHeader className="px-8 pt-8 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium">
          <span>Caso</span>
          {c.case_number != null && <span className="text-slate-300">#{c.case_number}</span>}
          <Badge
            variant="outline"
            className="ml-auto rounded-full font-light text-[10px] border-slate-200"
          >
            {statusLabel(c.status)}
          </Badge>
        </div>
        <SheetTitle className="text-3xl font-extralight tracking-tight text-slate-900">
          {c.patient?.name ?? "Paciente"}
        </SheetTitle>
        <div className="text-sm text-slate-500 font-light">
          {c.case_type?.name ?? "—"} · {teeth.length} {teeth.length === 1 ? "dente" : "dentes"}
        </div>
      </SheetHeader>

      <section className="px-4 pt-6 pb-4">
        <div className="mx-auto max-w-[420px]">
          <TeethSelector
            value={teeth}
            onChange={() => {}}
            highlight={{ zirconia: zir, dissilicato: dis }}
            implantTeeth={implantTeeth}
            showImplantLayer={implantTeeth.length > 0}
            assignedTeeth={teeth}
            mode="work"
            disabled
          />
        </div>
      </section>

      <section className="px-8 py-5 border-t border-slate-100 space-y-4">
        {zir.length > 0 && (
          <Row label="Zircônia">
            <div className="flex flex-wrap gap-1.5">
              {zir.map((n) => <ToothChip key={n} n={n} color="#0C84FA" />)}
            </div>
          </Row>
        )}
        {dis.length > 0 && (
          <Row label="Dissilicato">
            <div className="flex flex-wrap gap-1.5">
              {dis.map((n) => <ToothChip key={n} n={n} color="#FF8300" />)}
            </div>
          </Row>
        )}
        {implantTeeth.length > 0 && (
          <Row label="Implante">
            <div className="flex flex-wrap gap-1.5">
              {implantTeeth.map((n) => <ToothChip key={n} n={n} color="#111827" />)}
            </div>
          </Row>
        )}
      </section>

      <section className="px-8 py-5 border-t border-slate-100 grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
        <Info label="Doutor" value={c.doctor?.name ?? "—"} />
        <Info
          label="Cadista"
          value={
            c.cadista ? (
              <Link
                to="/cadistas/$cadistaId"
                params={{ cadistaId: c.cadista.id }}
                className="text-[#0C84FA] hover:underline underline-offset-4"
              >
                {c.cadista.name}
              </Link>
            ) : "—"
          }
        />
        <Info label="Fase" value={c.current_stage?.name ?? "—"} />
        <Info label="Cor" value={c.tooth_color?.code ?? "—"} />
        <Info label="Entrada" value={fmt(c.entry_date)} />
        <Info label="Entrega" value={fmt(c.delivery_date)} />
        {c.finished_at && <Info label="Finalizado em" value={fmt(c.finished_at)} />}
        {c.reopened_count > 0 && <Info label="Reaberto" value={`${c.reopened_count}×`} />}
      </section>

      {c.case_components && c.case_components.length > 0 && (
        <section className="px-8 py-5 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium mb-3">
            Componentes
          </div>
          <ul className="space-y-1.5 text-sm text-slate-700 font-light">
            {c.case_components.map((cc) => (
              <li key={cc.id} className="flex justify-between">
                <span>{cc.component?.name ?? "—"}</span>
                <span className="text-slate-400">×{cc.qty}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.notes && (
        <section className="px-8 py-5 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium mb-2">
            Observações
          </div>
          <p className="text-sm text-slate-700 font-light whitespace-pre-wrap">{c.notes}</p>
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium mb-2">{label}</div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium mb-1">{label}</div>
      <div className="text-sm text-slate-800 font-light">{value}</div>
    </div>
  );
}