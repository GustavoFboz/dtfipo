import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Building2, Check, Database, FlaskConical, Layers3, RadioTower, ShieldCheck, Stethoscope, Users } from "lucide-react";

export const Route = createFileRoute("/lp")({
  head: () => ({
    meta: [
      { title: "DentalFlow — Hub empresarial para Odontologia Digital" },
      { name: "description", content: "Conecte laboratório protético, clínica odontológica e radiologia em um único hub empresarial, com planos por sessão, equipe e capacidade." },
      { property: "og:title", content: "DentalFlow — Laboratório, Clínica e Radiologia em um único hub" },
      { property: "og:description", content: "Planos empresariais com sessões independentes ou integradas, equipe vinculada e cobrança recorrente." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

const COMPANY_PLANS = [
  {
    code: "company_initial",
    name: "Empresa Inicial",
    price: "R$ 249",
    sessions: "1 sessão empresarial",
    members: "Até 8 membros",
    storage: "25 GB incluídos",
    description: "Para iniciar com uma operação completa: Laboratório, Clínica ou Radiologia.",
  },
  {
    code: "company_growth",
    name: "Empresa Crescimento",
    price: "R$ 449",
    sessions: "Até 2 sessões",
    members: "Até 20 membros",
    storage: "100 GB incluídos",
    description: "Duas áreas conectadas, mais equipe e compartilhamento de informações entre sessões.",
  },
  {
    code: "company_advanced",
    name: "Empresa Avançado",
    price: "R$ 749",
    sessions: "3 sessões completas",
    members: "Até 50 membros",
    storage: "500 GB incluídos",
    description: "O hub completo com Laboratório, Clínica e Radiologia integrados na mesma empresa.",
    highlight: true,
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-8 text-[12px] font-light text-slate-500 md:flex">
            <a href="#hub" className="transition hover:text-slate-900">Hub</a>
            <a href="#sessoes" className="transition hover:text-slate-900">Sessões</a>
            <a href="#planos" className="transition hover:text-slate-900">Planos</a>
            <a href="#seguranca" className="transition hover:text-slate-900">Segurança</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/auth" className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Entrar</a>
            <a href="/auth?mode=company" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#15988f] px-4 text-[11px] font-medium text-white shadow-[0_12px_28px_-16px_rgba(21,152,143,.75)] transition hover:bg-[#12877f]">Criar empresa <ArrowRight className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      </header>

      <main>
        <section id="hub" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_5%,rgba(21,152,143,.12),transparent_32%),radial-gradient(circle_at_84%_15%,rgba(45,127,249,.1),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-20 sm:px-8 md:pb-28 md:pt-28 lg:grid-cols-[1.03fr_.97fr] lg:items-center">
            <div>
              <span className="inline-flex items-center rounded-full bg-[#15988f]/8 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#15988f]">DentalFlow 0.3.2 · Hub empresarial</span>
              <h1 className="mt-6 max-w-3xl text-[48px] font-extralight leading-[.98] tracking-[-0.052em] sm:text-[64px] lg:text-[76px]">Uma empresa.<br />Até <span className="text-[#15988f]">três operações</span> conectadas.</h1>
              <p className="mt-7 max-w-2xl text-[15px] font-light leading-7 text-slate-500 sm:text-[17px]">Laboratório protético, Clínica odontológica e Radiologia funcionam como sessões independentes — ou compartilham pacientes, casos e informações quando o plano permite.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/auth?mode=company" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#15988f] px-6 text-[12px] font-medium text-white transition hover:bg-[#12877f]">Criar conta de empresa <ArrowRight className="h-4 w-4" /></a>
                <a href="/auth?mode=professional" className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-[12px] font-medium text-slate-600 transition hover:border-slate-300">Recebi um código da empresa</a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3 text-[10px] font-medium uppercase tracking-[0.13em] text-slate-400">
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#15988f]" /> Web + Windows</span>
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#15988f]" /> Equipe por vagas</span>
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#15988f]" /> Cobrança recorrente</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-7 rounded-[40px] bg-gradient-to-br from-[#15988f]/15 via-[#2d7ff9]/8 to-[#7668d9]/12 blur-3xl" />
              <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[#f6f9fa] p-4 shadow-[0_36px_100px_-56px_rgba(15,23,42,.42)] sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-4"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Ambiente de trabalho</div><div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /><span className="h-2 w-2 rounded-full bg-slate-300" /><span className="h-2 w-2 rounded-full bg-slate-300" /></div></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <SessionPreview icon={<FlaskConical className="h-5 w-5" />} name="Laboratório" tone="blue" text="Casos, produção, estoque e equipe." />
                  <SessionPreview icon={<Stethoscope className="h-5 w-5" />} name="Clínica" tone="teal" text="Pacientes, agenda e tratamentos." />
                  <SessionPreview icon={<RadioTower className="h-5 w-5" />} name="Radiologia" tone="violet" text="DICOM, exames e diagnóstico." />
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white p-4"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-500">IPO</span><div><div className="text-[12px] font-medium">Conta empresarial</div><div className="mt-0.5 text-[9px] font-light text-slate-400">Plano Avançado · 3 sessões ativas</div></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Ativo</span></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="sessoes" className="border-y border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-28">
            <div className="max-w-3xl"><span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#15988f]">Sessões empresariais</span><h2 className="mt-4 text-[38px] font-extralight leading-[1.04] tracking-[-0.045em] sm:text-[52px]">Cada área é completa sozinha. Juntas, formam o hub.</h2></div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              <AreaCard icon={<FlaskConical className="h-5 w-5" />} title="Laboratório" description="Produção protética, casos, etapas, CAD, impressão, estoque, entregas, equipe e comunicação." bullets={["Fluxos por necessidade", "Arquivos 3D e anexos", "Equipe técnica e estoque"]} />
              <AreaCard icon={<Stethoscope className="h-5 w-5" />} title="Clínica" description="Pacientes, agenda, evoluções, tratamentos, financeiro e integração com os casos laboratoriais." bullets={["Prontuário e agenda", "Pacientes compartilháveis", "Integração com laboratório"]} />
              <AreaCard icon={<RadioTower className="h-5 w-5" />} title="Radiologia" description="Estrutura dedicada para exames e imagens DICOM, vinculada a pacientes e às demais sessões." bullets={["Estudos e séries DICOM", "Armazenamento privado", "Integração futura PACS/DICOMweb"]} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#15988f]">Profissionais da equipe</span>
              <h2 className="mt-4 text-[38px] font-extralight leading-[1.04] tracking-[-0.045em] sm:text-[50px]">O profissional entra pela empresa — sem uma assinatura separada.</h2>
              <p className="mt-5 max-w-xl text-[14px] font-light leading-7 text-slate-500">Dentistas, CADISTAs, protéticos, atendimento e radiologistas criam a própria credencial somente com um código empresarial válido. Cada profissional ocupa uma vaga do plano e, ao entrar, acessa diretamente a empresa à qual pertence.</p>
              <a href="/auth?mode=professional" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-5 text-[12px] font-medium text-slate-600">Cadastrar com código da empresa <ArrowRight className="h-4 w-4" /></a>
            </div>
            <div className="rounded-[28px] border border-slate-200/70 bg-slate-50/70 p-7">
              <div className="flex items-start justify-between gap-5"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#15988f]/10 text-[#15988f]"><Users className="h-5 w-5" /></div><div className="rounded-full bg-[#15988f]/8 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#15988f]">Incluído no plano</div></div>
              <div className="mt-7 space-y-3 text-[12px] font-light text-slate-500"><Line text="1 empresa por conta profissional" /><Line text="Login individual e senha própria" /><Line text="Perfil e permissões de equipe" /><Line text="Sem cobrança individual" /></div>
            </div>
          </div>
        </section>

        <section id="planos" className="border-y border-slate-100 bg-[#0b1619] text-white">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-28">
            <div className="max-w-3xl"><span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#69cfc7]">Planos empresariais</span><h2 className="mt-4 text-[38px] font-extralight leading-[1.04] tracking-[-0.045em] sm:text-[52px]">O preço cresce com a operação, não com recursos escondidos.</h2><p className="mt-5 max-w-2xl text-[13px] font-light leading-6 text-white/48">Cada sessão contratada recebe os recursos completos daquela área. O que muda é quantidade de sessões, vagas de equipe, armazenamento e integração entre operações.</p></div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">{COMPANY_PLANS.map((plan) => <PlanCard key={plan.code} {...plan} />)}</div>
            <p className="mt-7 text-[10px] font-light leading-5 text-white/35">Cobrança mensal por empresa. O acesso operacional depende do período pago; em caso de suspensão, os dados permanecem preservados.</p>
          </div>
        </section>

        <section id="seguranca" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div><span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#15988f]">Arquitetura de assinatura</span><h2 className="mt-4 text-[38px] font-extralight leading-[1.04] tracking-[-0.045em] sm:text-[50px]">Pagamento controla acesso. Nunca controla a existência dos seus dados.</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SecurityCard icon={<ShieldCheck className="h-4 w-4" />} title="Status no servidor" text="Plano, período pago, atraso, carência, suspensão e cancelamento são estados autoritativos do backend." />
              <SecurityCard icon={<Database className="h-4 w-4" />} title="Dados preservados" text="Suspensão bloqueia operação, mas não apaga pacientes, casos, exames ou arquivos." />
              <SecurityCard icon={<Layers3 className="h-4 w-4" />} title="Limites do plano" text="Sessões, membros e armazenamento derivam do plano efetivamente pago." />
              <SecurityCard icon={<Bell className="h-4 w-4" />} title="Webhook-ready" text="A confirmação de pagamento será recebida pelo servidor com idempotência e assinatura do provedor." />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8"><div className="rounded-[30px] bg-gradient-to-br from-[#15988f] to-[#0b6f69] p-8 text-white sm:p-12 md:p-16"><div className="max-w-3xl"><div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/55">Comece pela sua realidade</div><h2 className="mt-4 text-[36px] font-extralight leading-[1.03] tracking-[-0.045em] sm:text-[50px]">Uma sessão hoje. Três quando sua empresa precisar.</h2><p className="mt-5 text-[13px] font-light leading-6 text-white/65">Crie a empresa, escolha o plano e os ambientes. O DentalFlow prepara a assinatura e leva você ao checkout.</p><a href="/auth?mode=company" className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[12px] font-medium text-[#0d6e68]">Criar minha empresa <ArrowRight className="h-4 w-4" /></a></div></div></section>
      </main>

      <footer className="border-t border-slate-100"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-10 sm:px-8"><Brand /><div className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-400">© {new Date().getFullYear()} DentalFlow · Hub empresarial odontológico</div></div></footer>
    </div>
  );
}

function Brand() { return <Link to="/lp" className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-[13px] font-semibold text-white">D</span><span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-700">DentalFlow</span></Link>; }
function Line({ text }: { text: string }) { return <div className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" />{text}</div>; }
function SessionPreview({ icon, name, text, tone }: { icon: React.ReactNode; name: string; text: string; tone: "blue" | "teal" | "violet" }) { const cls = tone === "blue" ? "bg-blue-50 text-blue-600" : tone === "teal" ? "bg-teal-50 text-teal-600" : "bg-violet-50 text-violet-600"; return <div className="rounded-2xl border border-slate-200/70 bg-white p-4"><div className={`grid h-9 w-9 place-items-center rounded-xl ${cls}`}>{icon}</div><div className="mt-4 text-[12px] font-medium">{name}</div><div className="mt-1 text-[9px] font-light leading-4 text-slate-400">{text}</div></div>; }
function AreaCard({ icon, title, description, bullets }: { icon: React.ReactNode; title: string; description: string; bullets: string[] }) { return <div className="rounded-[24px] border border-slate-200/75 bg-white p-6"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#15988f]/8 text-[#15988f]">{icon}</div><h3 className="mt-5 text-[18px] font-medium">{title}</h3><p className="mt-3 text-[12px] font-light leading-6 text-slate-500">{description}</p><div className="mt-5 space-y-2">{bullets.map((b) => <Line key={b} text={b} />)}</div></div>; }
function PlanCard({ code, name, price, sessions, members, storage, description, highlight }: (typeof COMPANY_PLANS)[number]) { return <div className={`relative rounded-[26px] border p-7 ${highlight ? "border-[#69cfc7]/45 bg-white/[0.07] shadow-[0_30px_80px_-50px_rgba(105,207,199,.45)]" : "border-white/10 bg-white/[0.035]"}`}>{highlight ? <span className="absolute right-5 top-5 rounded-full bg-[#69cfc7]/12 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#69cfc7]">Completo</span> : null}<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{name}</div><div className="mt-5 text-[36px] font-extralight tracking-[-0.04em]">{price}<span className="ml-1 text-[10px] font-light tracking-normal text-white/35">/mês</span></div><p className="mt-4 min-h-12 text-[11px] font-light leading-5 text-white/45">{description}</p><div className="mt-6 space-y-3 text-[11px] font-light text-white/65"><div className="flex gap-2"><Check className="h-4 w-4 text-[#69cfc7]" />{sessions}</div><div className="flex gap-2"><Users className="h-4 w-4 text-[#69cfc7]" />{members}</div><div className="flex gap-2"><Database className="h-4 w-4 text-[#69cfc7]" />{storage}</div></div><a href={`/auth?mode=company&plan=${code}`} className={`mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl text-[11px] font-medium ${highlight ? "bg-[#69cfc7] text-[#0b1619]" : "border border-white/15 text-white/75"}`}>Escolher plano</a></div>; }
function SecurityCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-slate-200/75 bg-white p-5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#15988f]/8 text-[#15988f]">{icon}</div><div className="mt-4 text-[13px] font-medium">{title}</div><div className="mt-2 text-[11px] font-light leading-5 text-slate-500">{text}</div></div>; }
