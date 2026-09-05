import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Search, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchPatients } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/clinica/pacientes")({ component: ClinicPatientsPage });

function ClinicPatientsPage() {
  return <ClinicPageGuard permission="clinical.patients"><Patients /></ClinicPageGuard>;
}

function Patients() {
  const [q, setQ] = useState("");
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, staleTime: 60_000 });
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return patients.data ?? [];
    return (patients.data ?? []).filter((p: any) => [p.name, p.phone, p.email, p.cpf].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [patients.data, q]);

  const recentlyAdded = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60_000;
    return (patients.data ?? []).filter((p: any) => p.created_at && new Date(p.created_at).getTime() >= since).length;
  }, [patients.data]);

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 lg:px-12">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Cadastro central</div>
          <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Pacientes</h1>
          <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">Uma pessoa, um cadastro. A Clínica usa os dados centrais do DentalFlow sem duplicar o paciente do Laboratório.</p>
        </div>
        <PatientFormDialog trigger={<Button className="h-11 self-start rounded-full bg-[#1e8f87] px-5 text-white hover:bg-[#177a73] lg:self-auto"><Plus className="mr-2 h-4 w-4" /> Novo paciente</Button>} />
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2.3fr]">
        <Metric icon={Users} label="Pacientes cadastrados" value={String(patients.data?.length ?? 0)} />
        <Metric icon={UserRound} label="Novos em 30 dias" value={String(recentlyAdded)} />
        <div className="flex items-center rounded-[22px] border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-slate-950">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone, e-mail ou CPF" className="h-11 rounded-xl border-0 bg-slate-50/70 pl-10 shadow-none focus-visible:ring-[#1e8f87]/15 dark:bg-white/[0.035]" />
          </div>
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="hidden grid-cols-[minmax(260px,1.6fr)_180px_minmax(220px,1fr)_130px_34px] gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 md:grid dark:border-white/5 dark:bg-white/[0.02]">
          <span>Paciente</span><span>Telefone</span><span>E-mail</span><span>Cadastro</span><span />
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {filtered.map((p: any) => (
            <Link
              key={p.id}
              to={"/clinica/pacientes/$patientId" as any}
              params={{ patientId: p.id } as any}
              className="group grid gap-3 px-5 py-4 transition hover:bg-[#1e8f87]/[0.018] md:grid-cols-[minmax(260px,1.6fr)_180px_minmax(220px,1fr)_130px_34px] md:items-center md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#1e8f87]/8 text-[#1e8f87]">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 stroke-[1.5]" />}
                </div>
                <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900 transition group-hover:text-[#1e8f87] dark:text-white">{p.name}</div><div className="mt-0.5 text-[11px] font-light text-slate-400">{p.birth_date ? `Nascimento ${new Date(`${p.birth_date}T00:00:00`).toLocaleDateString("pt-BR")}` : "Dados clínicos disponíveis"}</div></div>
              </div>
              <div className="text-xs font-light text-slate-500">{p.phone || "—"}</div>
              <div className="truncate text-xs font-light text-slate-500">{p.email || "—"}</div>
              <div className="text-xs font-light text-slate-400">{p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "—"}</div>
              <ArrowUpRight className="hidden h-4 w-4 text-slate-300 transition group-hover:text-[#1e8f87] md:block" />
            </Link>
          ))}
        </div>

        {patients.isLoading && <div className="py-16 text-center text-sm font-light text-slate-400">Carregando pacientes…</div>}
        {!patients.isLoading && filtered.length === 0 && <div className="py-16 text-center text-sm font-light text-slate-400">Nenhum paciente encontrado.</div>}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-[22px] border border-slate-200/70 bg-white p-4 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-[11px] font-light text-slate-400"><Icon className="h-4 w-4 text-[#1e8f87]" />{label}</div><div className="mt-3 text-2xl font-light tracking-tight text-slate-900 dark:text-white">{value}</div></div>;
}
