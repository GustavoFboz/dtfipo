import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageSearch,
  Stethoscope,
  TrendingUp,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import {
  fetchClinicActiveTreatments,
  fetchClinicAppointments,
  fetchClinicFinancialEntries,
  fetchClinicLowStockItems,
} from "@/lib/clinic";
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

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

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
    refetchInterval: 60_000,
  });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, staleTime: 60_000 });
  const finance = useQuery({ queryKey: ["clinic_financial", month], queryFn: () => fetchClinicFinancialEntries(month) });
  const lowStock = useQuery({
    queryKey: ["clinic_dashboard", "low_stock"],
    queryFn: () => fetchClinicLowStockItems(6),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const treatments = useQuery({
    queryKey: ["clinic_dashboard", "active_treatments"],
    queryFn: fetchClinicActiveTreatments,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const today = (appointments.data ?? []).filter((item: any) => item.status !== "cancelled");
  const confirmed = today.filter((item: any) => item.status === "confirmed").length;
  const completed = today.filter((item: any) => item.status === "completed").length;
  const upcoming = today
    .filter((item: any) => item.status !== "completed" && new Date(item.starts_at).getTime() >= now.getTime() - 15 * 60_000)
    .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const agendaRows = upcoming.length > 0 ? upcoming : today;

  const entries = finance.data ?? [];
  const revenue = entries
    .filter((item: any) => item.kind === "revenue" && item.status !== "cancelled")
    .reduce((sum: number, item: any) => sum + Number(item.amount_cents || 0), 0);
  const expense = entries
    .filter((item: any) => item.kind === "expense" && item.status !== "cancelled")
    .reduce((sum: number, item: any) => sum + Number(item.amount_cents || 0), 0);
  const balance = revenue - expense;

  const treatmentRows = treatments.data ?? [];
  const activePatientCount = new Set(treatmentRows.map((item) => item.patient_id).filter(Boolean)).size;
  const surgeryCount = treatmentRows.filter((item) => {
    const name = item.case_type?.name ?? "";
    return /implante|cirurg/i.test(name) || (item.implant_teeth?.length ?? 0) > 0;
  }).length;
  const prosthesisCount = treatmentRows.filter((item) => {
    const name = item.case_type?.name ?? "";
    return !(/implante|cirurg/i.test(name) || (item.implant_teeth?.length ?? 0) > 0) && /prótese|protese|coroa|faceta/i.test(name);
  }).length;
  const otherTreatmentCount = Math.max(0, treatmentRows.length - surgeryCount - prosthesisCount);
  const surgeryPct = pct(surgeryCount, treatmentRows.length);
  const prosthesisPct = pct(prosthesisCount, treatmentRows.length);
  const completedPct = pct(completed, today.length);
  const confirmedPct = pct(confirmed, today.length);
  const expenseRatio = revenue > 0 ? Math.min(100, Math.round((expense / revenue) * 100)) : expense > 0 ? 100 : 0;
  const nextAppointment = upcoming[0];

  const treatmentGradient = treatmentRows.length > 0
    ? `conic-gradient(#1e8f87 0 ${surgeryPct}%, #73b8b2 ${surgeryPct}% ${surgeryPct + prosthesisPct}%, #dbe8e7 ${surgeryPct + prosthesisPct}% 100%)`
    : "conic-gradient(#e8efef 0 100%)";

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-7 md:px-9 lg:px-12 lg:py-9">
      <section className="relative overflow-hidden rounded-[32px] border border-[#1e8f87]/10 bg-[radial-gradient(circle_at_82%_10%,rgba(30,143,135,0.12),transparent_31%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,251,250,0.92))] px-6 py-7 md:px-8 md:py-8 dark:border-[#1e8f87]/20 dark:bg-[radial-gradient(circle_at_82%_10%,rgba(30,143,135,0.12),transparent_32%),linear-gradient(135deg,rgba(12,17,22,0.98),rgba(8,13,17,0.98))]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#1e8f87]/10" />
        <div className="pointer-events-none absolute -right-3 -top-6 h-40 w-40 rounded-full border border-[#1e8f87]/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1e8f87]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.09)]" /> Clínica em atividade
            </div>
            <h1 className="mt-4 text-[34px] font-extralight leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-[42px] dark:text-white">
              O que precisa da sua atenção, agora.
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-light leading-6 text-slate-500 dark:text-slate-400">
              Agenda, tratamentos, estoque e financeiro reunidos em sinais rápidos para a operação do consultório.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {nextAppointment && (
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Próximo atendimento</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-light text-slate-900 dark:text-white">{new Date(nextAppointment.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="max-w-[180px] truncate text-xs text-slate-500">{nextAppointment.patient?.name || "Paciente"}</span>
                </div>
              </div>
            )}
            <Link to="/clinica/agenda" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1e8f87] px-5 text-sm font-medium text-white shadow-[0_12px_28px_-16px_rgba(30,143,135,0.8)] transition hover:bg-[#177a73]">
              <CalendarDays className="h-4 w-4" /> Abrir agenda
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={CalendarDays}
          label="Agendamentos hoje"
          value={String(today.length)}
          note={`${confirmed} confirmados · ${completed} concluídos`}
          pulse={today.length > 0}
        />
        <Stat
          icon={UserRoundCheck}
          label="Pacientes em tratamento"
          value={String(activePatientCount)}
          note={`${patients.data?.length ?? 0} pacientes cadastrados`}
          pulse={activePatientCount > 0}
        />
        <Stat
          icon={TrendingUp}
          label="Receitas do mês"
          value={money(revenue)}
          note={expense > 0 ? `${money(expense)} em despesas` : "Sem despesas lançadas"}
        />
        <Stat
          icon={CircleDollarSign}
          label="Saldo do mês"
          value={money(balance)}
          note={balance >= 0 ? "Resultado acumulado positivo" : "Despesas acima das receitas"}
          warning={balance < 0}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.42fr_0.78fr]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-5 dark:border-white/5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Agenda em movimento</div>
              <h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Próximos pacientes</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden min-w-[170px] sm:block">
                <div className="flex justify-between text-[9px] uppercase tracking-[0.08em] text-slate-400"><span>Dia concluído</span><span>{completedPct}%</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#1e8f87] transition-[width]" style={{ width: `${completedPct}%` }} /></div>
              </div>
              <Link to="/clinica/agenda" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-100 text-slate-300 transition hover:border-[#1e8f87]/20 hover:text-[#1e8f87] dark:border-white/10"><ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="grid gap-2">
              {agendaRows.slice(0, 6).map((appointment: any, index: number) => {
                const start = new Date(appointment.starts_at);
                const isDone = appointment.status === "completed";
                const isConfirmed = appointment.status === "confirmed";
                return (
                  <Link key={appointment.id} to="/clinica/agenda" className="group grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition hover:border-[#1e8f87]/12 hover:bg-[#1e8f87]/[0.025]">
                    <div className="text-center">
                      <div className="text-[15px] font-medium tabular-nums text-slate-800 dark:text-slate-100">{start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-slate-300">{index === 0 && upcoming.length > 0 ? "a seguir" : "horário"}</div>
                    </div>
                    <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-white/5">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{appointment.patient?.name || "Paciente"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-light text-slate-400">
                        <span>{appointment.title || "Atendimento clínico"}</span>
                        {appointment.doctor?.name && <><span className="h-1 w-1 rounded-full bg-slate-200" /><span>{appointment.doctor.name}</span></>}
                      </div>
                    </div>
                    <div className={`grid h-9 w-9 place-items-center rounded-full ${isDone ? "bg-sky-50 text-sky-500 dark:bg-sky-950/20" : isConfirmed ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20" : "bg-[#1e8f87]/7 text-[#1e8f87]"}`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                    </div>
                  </Link>
                );
              })}
              {!appointments.isLoading && today.length === 0 && (
                <div className="py-14 text-center">
                  <CalendarDays className="mx-auto h-6 w-6 text-slate-200" />
                  <div className="mt-3 text-sm font-light text-slate-400">Nenhum paciente agendado para hoje.</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500">Atenção operacional</div>
              <h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Estoque baixo</h2>
            </div>
            <div className={`grid h-10 w-10 place-items-center rounded-2xl ${lowStock.data?.length ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"}`}>
              {lowStock.data?.length ? <AlertTriangle className="h-5 w-5 stroke-[1.5]" /> : <Boxes className="h-5 w-5 stroke-[1.5]" />}
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {(lowStock.data ?? []).map((item) => {
              const exhausted = item.qty_on_hand <= 0;
              return (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-[12px] font-medium text-slate-700 dark:text-slate-200">{item.name}</div>
                      <div className="mt-1 text-[9.5px] font-light uppercase tracking-[0.07em] text-slate-400">{item.brand || item.type || "Componente clínico"}</div>
                    </div>
                    <div className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${exhausted ? "bg-rose-50 text-rose-600 dark:bg-rose-950/20" : "bg-amber-50 text-amber-700 dark:bg-amber-950/20"}`}>
                      {item.qty_on_hand} {item.unit || "un"}
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[9.5px] text-slate-400">
                    <span>{exhausted ? "Reposição prioritária" : "Abaixo do mínimo"}</span>
                    <span>mín. {item.min_qty}</span>
                  </div>
                </div>
              );
            })}

            {!lowStock.isLoading && !lowStock.isError && (lowStock.data?.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-8 text-center dark:border-emerald-900/20 dark:bg-emerald-950/10">
                <PackageSearch className="mx-auto h-6 w-6 text-emerald-500" />
                <div className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">Estoque em nível seguro</div>
                <div className="mt-1 text-[10px] font-light text-emerald-600/70">Nenhum item abaixo do mínimo.</div>
              </div>
            )}
            {lowStock.isError && <div className="py-8 text-center text-xs font-light text-slate-400">O estoque não está disponível para este perfil.</div>}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Tratamentos em andamento</div>
              <h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Perfil clínico dos casos ativos</h2>
            </div>
            <div className="rounded-full bg-[#1e8f87]/8 px-3 py-1.5 text-[10px] font-medium text-[#1e8f87]">{activePatientCount} pacientes ativos</div>
          </div>

          <div className="mt-6 grid items-center gap-7 md:grid-cols-[190px_1fr]">
            <div className="relative mx-auto h-[168px] w-[168px] rounded-full" style={{ background: treatmentGradient }}>
              <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center shadow-[0_8px_26px_-22px_rgba(15,23,42,0.7)] dark:bg-slate-950">
                <div>
                  <div className="text-[32px] font-extralight leading-none tracking-tight text-slate-900 dark:text-white">{treatmentRows.length}</div>
                  <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">tratamentos</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <TreatmentBar label="Cirurgias / implantes" value={surgeryCount} total={treatmentRows.length} tone="strong" />
              <TreatmentBar label="Próteses" value={prosthesisCount} total={treatmentRows.length} tone="medium" />
              <TreatmentBar label="Outros acompanhamentos" value={otherTreatmentCount} total={treatmentRows.length} tone="light" />
              {!treatments.isLoading && treatments.isError && <div className="text-[10px] font-light text-slate-400">Dados de tratamentos indisponíveis para este perfil.</div>}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Pulso da operação</div>
              <h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Hoje e este mês</h2>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#1e8f87]/8 text-[#1e8f87]"><Activity className="h-5 w-5 stroke-[1.5]" /></div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <PulseCard icon={Stethoscope} label="Agenda confirmada" value={`${confirmedPct}%`} helper={`${confirmed} de ${today.length || 0} atendimentos`} progress={confirmedPct} />
            <PulseCard icon={CheckCircle2} label="Agenda concluída" value={`${completedPct}%`} helper={`${completed} finalizados hoje`} progress={completedPct} />
          </div>

          <div className="mt-4 rounded-[22px] border border-slate-100 bg-slate-50/45 p-4 dark:border-white/5 dark:bg-white/[0.02]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Relação despesas / receitas</div>
                <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{expenseRatio}% comprometido</div>
              </div>
              <WalletCards className="h-5 w-5 text-[#1e8f87] stroke-[1.5]" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
              <div className={`h-full rounded-full transition-[width] ${expenseRatio > 85 ? "bg-rose-400" : expenseRatio > 60 ? "bg-amber-400" : "bg-[#1e8f87]"}`} style={{ width: `${expenseRatio}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[9.5px] font-light text-slate-400"><span>Despesas {money(expense)}</span><span>Receitas {money(revenue)}</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  pulse = false,
  warning = false,
}: {
  icon: any;
  label: string;
  value: string;
  note: string;
  pulse?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[23px] border border-slate-200/70 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#1e8f87]/15 hover:shadow-[0_16px_40px_-34px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-slate-950">
      <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#1e8f87]/[0.035] transition-transform group-hover:scale-125" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10.5px] font-light text-slate-400"><Icon className={`h-4 w-4 ${warning ? "text-rose-500" : "text-[#1e8f87]"}`} />{label}</div>
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.09)]" />}
      </div>
      <div className={`relative mt-4 truncate text-[25px] font-light tracking-[-0.025em] ${warning ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>{value}</div>
      <div className="relative mt-2 truncate text-[9.5px] font-light text-slate-400">{note}</div>
    </div>
  );
}

function TreatmentBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: "strong" | "medium" | "light" }) {
  const percent = pct(value, total);
  const fill = tone === "strong" ? "bg-[#1e8f87]" : tone === "medium" ? "bg-[#73b8b2]" : "bg-[#dbe8e7] dark:bg-slate-600";
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-light text-slate-500 dark:text-slate-400">{label}</span><span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{value} <span className="font-light text-slate-300">· {percent}%</span></span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className={`h-full rounded-full transition-[width] ${fill}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function PulseCard({ icon: Icon, label, value, helper, progress }: { icon: any; label: string; value: string; helper: string; progress: number }) {
  return (
    <div className="rounded-[22px] border border-slate-100 px-4 py-4 dark:border-white/5">
      <div className="flex items-center justify-between"><div className="text-[10px] font-light text-slate-400">{label}</div><Icon className="h-4 w-4 text-[#1e8f87] stroke-[1.5]" /></div>
      <div className="mt-3 text-2xl font-light tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#1e8f87] transition-[width]" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 text-[9.5px] font-light text-slate-400">{helper}</div>
    </div>
  );
}
