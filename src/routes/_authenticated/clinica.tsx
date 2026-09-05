import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, HardDrive, Users, WalletCards } from "lucide-react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { fetchClinicAppointments, fetchClinicFinancialEntries } from "@/lib/clinic";
import { fetchPatients } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/clinica")({ component: ClinicRoute });

function ClinicRoute() {
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  // `clinica.tsx` is the parent route for every `clinica.*.tsx` file.
  // The parent dashboard must yield to the nested route, otherwise the URL,
  // header and sidebar change while the dashboard remains rendered underneath.
  if (normalizedPath !== "/clinica") return <Outlet />;

  return <ClinicHome />;
}

function money(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function ClinicHome() {
  return <ClinicPageGuard permission="clinical.dashboard"><ClinicDashboard /></ClinicPageGuard>;
}

function ClinicDashboard() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const appointments = useQuery({ queryKey: ["clinic_appointments", "today"], queryFn: () => fetchClinicAppointments(todayStart.toISOString(), tomorrow.toISOString()) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, staleTime: 60_000 });
  const finance = useQuery({ queryKey: ["clinic_financial", month], queryFn: () => fetchClinicFinancialEntries(month) });

  const today = (appointments.data ?? []).filter((x: any) => x.status !== "cancelled");
  const confirmed = today.filter((x: any) => x.status === "confirmed").length;
  const completed = today.filter((x: any) => x.status === "completed").length;
  const entries = finance.data ?? [];
  const revenue = entries.filter((x: any) => x.kind === "revenue" && x.status !== "cancelled").reduce((sum: number, x: any) => sum + Number(x.amount_cents || 0), 0);
  const expense = entries.filter((x: any) => x.kind === "expense" && x.status !== "cancelled").reduce((sum: number, x: any) => sum + Number(x.amount_cents || 0), 0);

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 lg:px-12">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Hoje na Clínica</div>
          <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Visão geral</h1>
          <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">O essencial do consultório em uma tela: agenda, pacientes e movimento financeiro.</p>
        </div>
        <Link to="/clinica/agenda" className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-[#1e8f87] px-5 text-sm font-medium text-white transition hover:bg-[#177a73] lg:self-auto"><CalendarDays className="h-4 w-4" /> Abrir agenda</Link>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarDays} label="Agendamentos hoje" value={String(today.length)} />
        <Stat icon={Users} label="Pacientes cadastrados" value={String(patients.data?.length ?? 0)} />
        <Stat icon={WalletCards} label="Receitas do mês" value={money(revenue)} />
        <Stat icon={WalletCards} label="Saldo do mês" value={money(revenue - expense)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Agenda de hoje</div><h2 className="mt-1 text-lg font-light text-slate-900 dark:text-white">Próximos pacientes</h2></div>
            <div className="flex gap-2 text-[10px]"><span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">{confirmed} confirmados</span><span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 dark:bg-sky-950/20 dark:text-sky-300">{completed} concluídos</span></div>
          </div>

          <div className="mt-5 space-y-2">
            {today.slice(0, 7).map((a: any) => (
              <Link key={a.id} to="/clinica/agenda" className="group flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3 transition hover:border-[#1e8f87]/20 hover:bg-[#1e8f87]/[0.015] dark:border-white/5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1e8f87]/7 text-[#1e8f87]"><Clock3 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-900 dark:text-white">{a.patient?.name || "Paciente"}</div><div className="mt-0.5 text-[11px] font-light text-slate-400">{new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{a.title ? ` · ${a.title}` : ""}{a.doctor?.name ? ` · ${a.doctor.name}` : ""}</div></div>
                {a.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-sky-500" /> : <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-[#1e8f87]" />}
              </Link>
            ))}
            {!appointments.isLoading && today.length === 0 && <div className="py-12 text-center text-sm font-light text-slate-400">Nenhum paciente agendado para hoje.</div>}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Acesso rápido</div>
          <h2 className="mt-1 text-lg font-light text-slate-900 dark:text-white">Rotina da Clínica</h2>
          <div className="mt-5 space-y-2">
            <Quick to="/clinica/agenda" label="Agenda" description="Organizar o dia" />
            <Quick to="/clinica/pacientes" label="Pacientes" description="Cadastro e histórico" />
            <Quick to="/clinica/financeiro" label="Financeiro" description="Entradas, saídas e pendências" />
            <Quick to="/clinica/equipe" label="Equipe" description="Membros e acessos" />
            <Quick to="/clinica/armazenamento" label="Armazenamento" description="Arquivos e cota" icon={HardDrive} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-[22px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-[11px] font-light text-slate-400"><Icon className="h-4 w-4 text-[#1e8f87]" />{label}</div><div className="mt-4 truncate text-2xl font-light tracking-tight text-slate-900 dark:text-white">{value}</div></div>;
}

function Quick({ to, label, description, icon: Icon }: { to: string; label: string; description: string; icon?: any }) {
  return <Link to={to as any} className="group flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 transition hover:border-[#1e8f87]/20 hover:bg-[#1e8f87]/[0.015] dark:border-white/5"><div className="flex items-center gap-3">{Icon && <Icon className="h-4 w-4 text-[#1e8f87]" />}<div><div className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div><div className="mt-0.5 text-[10px] font-light text-slate-400">{description}</div></div></div><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-[#1e8f87]" /></Link>;
}
