import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, FileText, Calendar, Info } from "lucide-react";
import type { CaseRow } from "@/lib/types";

export function CadistaCaseCard({ caseRow }: { caseRow: CaseRow }) {
  return (
    <Card className="group border-white/5 bg-slate-900/40 backdrop-blur-xl transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:border-indigo-500/30 rounded-[2rem] overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-light tracking-tight text-white group-hover:text-indigo-400 transition-colors flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em] mb-1">Caso</span>
            {caseRow.case_label || "Sem etiqueta"}
          </CardTitle>
          <Badge variant="outline" className="font-bold text-[9px] uppercase tracking-[0.08em] bg-indigo-500/5 text-indigo-400 border-indigo-500/10 px-2.5 py-0.5 rounded-full">
            {caseRow.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-black/20 border border-white/5 group-hover:bg-black/30 transition-colors">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/10">
            <User className="h-5 w-5 text-indigo-400 stroke-[1.2px]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em]">Paciente</p>
            <p className="text-sm font-light text-slate-200 truncate">{caseRow.patient?.name || "Paciente Identificado"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-light">
            <Calendar className="h-3.5 w-3.5 stroke-[1.2px]" />
            <span>Entrega: {new Date(caseRow.delivery_date).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 font-light">
            <FileText className="h-3.5 w-3.5 stroke-[1.2px]" />
            <span>{caseRow.elements_count} elementos</span>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-slate-600 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 font-light italic line-clamp-2">
              {caseRow.notes || "Sem observações adicionais."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
