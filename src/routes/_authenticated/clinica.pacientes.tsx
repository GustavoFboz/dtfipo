import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchPatients } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/clinica/pacientes")({ component: ClinicPatientsPage });

function ClinicPatientsPage() { return <ClinicPageGuard permission="clinical.patients"><Patients /></ClinicPageGuard>; }

function Patients() {
  const [q, setQ] = useState("");
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const filtered = useMemo(() => (patients.data ?? []).filter((p: any) => p.name?.toLowerCase().includes(q.trim().toLowerCase())), [patients.data, q]);

  return <div className="mx-auto max-w-[1450px] px-6 py-10 md:px-12">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Clínica</div><h1 className="mt-2 text-4xl font-extralight tracking-tight text-slate-950 dark:text-white">Pacientes</h1><p className="mt-2 text-sm font-light text-slate-500">Cadastro compartilhado com o DentalFlow, apresentado no contexto clínico.</p></div><PatientFormDialog trigger={<Button className="h-11 rounded-full px-5"><Plus className="mr-2 h-4 w-4" /> Novo paciente</Button>} /></div>
    <div className="relative mt-8 max-w-xl"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente…" className="h-12 rounded-full pl-11" /></div>
    <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((p: any) => <Link key={p.id} to="/patients/$id" params={{ id: p.id }} className="group flex items-center gap-4 rounded-[22px] border border-slate-200/70 bg-white p-4 transition hover:border-primary/20 hover:shadow-sm dark:border-white/10 dark:bg-slate-950"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-slate-400 dark:bg-white/5">{p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}</div><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900 group-hover:text-primary dark:text-white">{p.name}</div><div className="mt-1 text-xs font-light text-slate-400">Abrir prontuário e histórico</div></div></Link>)}
    </div>
    {!patients.isLoading && filtered.length === 0 && <div className="py-16 text-center text-sm font-light text-slate-400">Nenhum paciente encontrado.</div>}
  </div>;
}
