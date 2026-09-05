import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users, WalletCards, ArrowRight, Clock3 } from "lucide-react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { fetchClinicAppointments, fetchClinicFinancialEntries } from "@/lib/clinic";
import { fetchPatients } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/clinica")({ component: ClinicHome });

function money(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function ClinicHome() {
  return <ClinicPageGuard permission="clinical.dashboard"><ClinicDashboard /></ClinicPageGuard>;
}

function ClinicDashboard() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const appointments = useQuery({
    queryKey: ["clinic_appointments", "today"],
    queryFn: () => fetchClinicAppointments(todayStart.toISOString(), tomorrow.toISOString()),
  });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const finance = useQuery({ queryKey: ["clinic_financial", month], queryFn: () => fetchClinicFinancialEntries(month) });

  const entries = finance.data ?? [];
  const revenue = entries.filter((x: any) => x.kind === "revenue" && x.status !== "cancelled").reduce((sum: number, x: any) => sum + Number(x.amount_cents || 0), 0);
  const expense = entries.filter((x: any) => x.kind === "expense" && x.status !== "cancelled").reduce((sum: number, x: any) => sum + Number(x.amount_cents || 0), 0);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-10 md:px-12">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Gestão da Clínica</div>
          <h1 className="mt-2 text-4xl font-extralight tracking-[-0.035em] text-slate-950 md:text-5xl dark:text-white">Visão geral do consultório</h1>
          <p className="mt-3 text-sm font-light text-slate-500">Agenda, pacientes e movimento financeiro em um único ponto.</p>
        </div>
        <Link to="/clinica/agenda" className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-primary px-5 text-sm font-medium text-white shadow-lg shadow-primary/15 md:self-auto">
          <CalendarDays className="h-4 w-4" /> Abrir agenda
        </Link>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<CalendarDays className="h-5 w-5" />} label="Agendamentos hoje" value={String(appointments.data?.filter((x: any) => x.status !== "cancelled").length ?? 0)} />
        <Stat icon={<Users className="h-5 w-5" />} label="Pacientes cadastrados" value={String(patients.data?.length ?? 0)} />
        <Stat icon={<WalletCards className="h-5 w-5" />} label="Receitas do mês" value={money(revenue)} />
        <Stat icon={<WalletCards className="h-5 w-5" />} label="Saldo do mês" value={money(revenue - expense)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-400">Hoje</div>
              <h2 className="mt-1 text-xl font-light text-slate-900 dark:text-white">Próximos pacientes</h2>
            </div>
            <Link to="/clinica/agenda" className="flex items-center gap-1 text-xs text-primary">Ver agenda <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-5 space-y-2">
            {(appointments.data ?? []).filter((x: any) => x.status !== "cancelled").slice(0, 6).map((a: any) => (
              <div key={a.id} className="flex items-center gap-4 rounded-2xl bg-slate-50/70 px-4 py-3 dark:bg-white/[0.03]">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/8 text-primary"><Clock3 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{a.patient?.name || "Paciente"}</div>
                  <div className="mt-0.5 text-xs font-light text-slate-400">{new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{a.doctor?.name ? ` · ${a.doctor.name}` : ""}</div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-500 shadow-sm dark:bg-white/5">{a.status}</span>
              </div>
            ))}
            {!appointments.isLoading && (appointments.data ?? []).filter((x: any) => x.status !== "cancelled").length === 0 && <div className="py-10 text-center text-sm font-light text-slate-400">Nenhum paciente agendado para hoje.</div>}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="text-xs font-medium text-slate-400">Atalhos</div>
          <h2 className="mt-1 text-xl font-light text-slate-900 dark:text-white">Rotina da clínica</h2>
          <div className="mt-5 space-y-2">
            <Quick to="/clinica/agenda" label="Agenda de pacientes" />
            <Quick to="/clinica/pacientes" label="Pacientes" />
            <Quick to="/clinica/financeiro" label="Financeiro clínico" />
            <Quick to="/clinica/equipe" label="Equipe e acessos" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-xs font-light text-slate-400">{label}</span></div><div className="mt-5 truncate text-2xl font-light tracking-tight text-slate-900 dark:text-white">{value}</div></div>;
}
function Quick({ to, label }: { to: string; label: string }) { return <Link to={to as any} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm font-light text-slate-700 transition hover:border-primary/20 hover:bg-primary/[0.02] dark:border-white/5 dark:text-slate-300"><span>{label}</span><ArrowRight className="h-4 w-4 text-slate-300" /></Link>; }
