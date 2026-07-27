import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Workflow,
  Boxes,
  Bell,
  ShieldCheck,
  Smartphone,
  Layers,
  Zap,
  Users,
  Printer,
  LineChart,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/lp")({
  head: () => ({
    meta: [
      { title: "DentalFlow — O sistema que organiza seu laboratório odontológico" },
      {
        name: "description",
        content:
          "Gestão de casos, estoque, fluxo de etapas e equipe em um só lugar. Feito para laboratórios e consultórios odontológicos que querem produzir mais, com menos retrabalho.",
      },
      { property: "og:title", content: "DentalFlow — Sistema para laboratórios odontológicos" },
      {
        property: "og:description",
        content: "Fluxo de casos, estoque automático, notação FDI, notificações em tempo real e muito mais.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Brand />
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-light text-slate-500">
            <a href="#recursos" className="hover:text-slate-900 transition">Recursos</a>
            <a href="#fluxo" className="hover:text-slate-900 transition">Fluxo</a>
            <a href="#planos" className="hover:text-slate-900 transition">Planos</a>
            <a href="#faq" className="hover:text-slate-900 transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              search={{ invite: undefined, mode: undefined }}
              className="text-[12px] font-medium tracking-[0.15em] uppercase text-slate-500 hover:text-slate-900"
            >
              Entrar
            </Link>
            <Link to="/auth" search={{ invite: undefined, mode: "company" }} className="btn-brand h-10 text-[11px] px-5">
              Começar
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70 pointer-events-none"
          style={{
            background:
              "radial-gradient(1000px 500px at 80% -10%, rgba(45,127,249,0.18), transparent 60%), radial-gradient(700px 400px at -10% 30%, rgba(74,155,255,0.14), transparent 60%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 md:pt-28 pb-20 md:pb-28 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.28em] uppercase text-[#2D7FF9] bg-[rgba(45,127,249,0.08)] rounded-full px-3 py-1.5">
              Novo · DentalFlowPro
            </span>
            <h1 className="mt-6 text-[44px] md:text-[64px] leading-[1.02] tracking-[-0.035em] font-extralight text-slate-900">
              O sistema que organiza seu <span className="text-brand-gradient">laboratório odontológico</span>.
            </h1>
            <p className="mt-6 text-[16px] md:text-[17px] font-light text-slate-500 max-w-[520px] leading-relaxed">
              Casos, etapas, estoque, equipe e notificações em um único fluxo. Feito por quem vive o dia a dia
              da prótese — para eliminar retrabalho, esquecimento e planilhas.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/auth" search={{ invite: undefined, mode: "company" }} className="btn-brand">
                Criar minha empresa <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/auth" search={{ invite: undefined, mode: undefined }} className="btn-brand-outline">
                Já tenho conta
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-8 text-[11px] font-light tracking-[0.14em] uppercase text-slate-400">
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#2D7FF9]" /> Sem instalar</span>
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#2D7FF9]" /> PWA no celular</span>
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#2D7FF9]" /> Backup em nuvem</span>
            </div>
          </div>

          {/* Mock do produto */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-[36px] bg-gradient-to-br from-[#2D7FF9]/25 to-[#4a9bff]/10 blur-2xl" />
            <div className="relative rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(45,127,249,0.35)] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="ml-4 text-[10px] font-medium tracking-[0.22em] uppercase text-slate-400">
                  dentalflow · fluxo
                </span>
              </div>
              <div className="p-6 grid grid-cols-4 gap-3">
                {["Novo", "Desenho", "Impressão", "Entrega"].map((s, i) => (
                  <div key={s} className="rounded-xl border border-slate-100 p-3">
                    <div className="text-[9px] tracking-[0.22em] uppercase text-slate-400 font-medium">
                      {s}
                    </div>
                    <div className="mt-3 space-y-2">
                      {Array.from({ length: 3 - (i % 3) }).map((_, j) => (
                        <div
                          key={j}
                          className="rounded-lg bg-gradient-to-br from-white to-slate-50 border border-slate-100 px-2.5 py-2"
                        >
                          <div className="h-1.5 w-16 rounded-full bg-slate-200" />
                          <div className="mt-1.5 h-1.5 w-10 rounded-full bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-6 grid grid-cols-3 gap-3">
                <MockKpi label="Em fluxo" value="42" />
                <MockKpi label="Entregas hoje" value="7" />
                <MockKpi label="Estoque OK" value="98%" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="border-y border-slate-100 bg-slate-50/60">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-6">
          <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-slate-400">
            Feito para laboratórios que fazem
          </p>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 text-[12px] font-light text-slate-500">
            <span>Zircônia</span>
            <span>Dissilicato</span>
            <span>Provisórios</span>
            <span>Implantes</span>
            <span>Digital & analógico</span>
          </div>
        </div>
      </section>

      {/* PROBLEMAS → SOLUÇÃO */}
      <section className="max-w-6xl mx-auto px-6 py-24 md:py-28">
        <div className="max-w-2xl">
          <span className="chip">Por que existe</span>
          <h2 className="mt-4 text-[32px] md:text-[44px] tracking-[-0.03em] font-extralight leading-[1.05]">
            Chega de <span className="text-brand-gradient">planilha, WhatsApp e memória</span> gerenciando seus casos.
          </h2>
          <p className="mt-4 text-[15px] font-light text-slate-500 leading-relaxed">
            Cada caso perdido, cada retrabalho, cada esquecimento tem um custo real. O DentalFlow substitui todos
            os improvisos por um único fluxo, feito sob medida para a rotina do laboratório odontológico.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-4">
          <ProblemCard
            before="Caso parou e ninguém sabe."
            after="Cada etapa tem responsável. Notificação em tempo real quando o caso chega até você."
          />
          <ProblemCard
            before="Estoque na cabeça do técnico."
            after="Consumo automático por caso, por dente, por etapa. Alertas antes do zero."
          />
          <ProblemCard
            before="Dente errado, cor errada, retrabalho."
            after="Notação FDI, cor, sistema de implante e scanbody amarrados ao caso desde o início."
          />
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-28">
          <div className="max-w-2xl">
            <span className="chip">Recursos</span>
            <h2 className="mt-4 text-[32px] md:text-[44px] tracking-[-0.03em] font-extralight leading-[1.05]">
              Um sistema com <span className="text-brand-gradient">tudo o que o laboratório precisa</span>.
            </h2>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-4">
            <Feature icon={<Workflow className="h-4 w-4" />} title="Fluxo por etapas" desc="Kanban visual com fases, responsáveis, retorno com justificativa e histórico completo do caso." />
            <Feature icon={<Boxes className="h-4 w-4" />} title="Estoque inteligente" desc="Consumo automático por regra, por dente (FDI) ou manual. Categorias, movimentações e alertas." />
            <Feature icon={<Bell className="h-4 w-4" />} title="Notificações em tempo real" desc="Central com filtros, som, popup e sincronização instantânea entre celular e desktop." />
            <Feature icon={<Layers className="h-4 w-4" />} title="Cadastro rico do caso" desc="Cor, sistema de implante, scanbody, provisório, dentes, anexos, comentários e 3D." />
            <Feature icon={<Smartphone className="h-4 w-4" />} title="PWA de verdade" desc="Instala no celular, funciona como app nativo, com navegação, atalhos e câmera integrados." />
            <Feature icon={<Users className="h-4 w-4" />} title="Equipe organizada" desc="Papéis (CEO, DR, Protético, Cadista, Atendimento), permissões e convite por código." />
            <Feature icon={<Printer className="h-4 w-4" />} title="Impressão térmica" desc="Etiquetas e notas de trabalho enviadas direto para impressora Bluetooth." />
            <Feature icon={<LineChart className="h-4 w-4" />} title="Painel executivo" desc="Casos em fluxo, entregas do dia, atrasos e produtividade por técnico em um olhar." />
            <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Backup e segurança" desc="Backup completo em um arquivo, restauração guiada e políticas de acesso por papel." />
          </div>
        </div>
      </section>

      {/* FLUXO */}
      <section id="fluxo" className="max-w-6xl mx-auto px-6 py-24 md:py-28">
        <div className="max-w-2xl">
          <span className="chip">Como funciona</span>
          <h2 className="mt-4 text-[32px] md:text-[44px] tracking-[-0.03em] font-extralight leading-[1.05]">
            Do primeiro clique <span className="text-brand-gradient">à entrega</span>.
          </h2>
        </div>

        <ol className="mt-14 grid md:grid-cols-4 gap-4">
          <Step n={1} title="Cadastre o caso" desc="Paciente, dentista, dentes, materiais e anexos em segundos." />
          <Step n={2} title="Fluxo automático" desc="Etapa correta, responsável certo, consumo lançado sozinho." />
          <Step n={3} title="Comunique em contexto" desc="Comentários com menções, notificações e histórico do caso." />
          <Step n={4} title="Entregue e reveja" desc="Feche o caso, imprima a nota e acompanhe indicadores." />
        </ol>
      </section>

      {/* DIFERENCIAIS */}
      <section className="bg-gradient-to-br from-[#0b1e3a] to-[#0a1730] text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-28 grid md:grid-cols-2 gap-14">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.28em] uppercase text-white/60 bg-white/5 rounded-full px-3 py-1.5">
              Diferenciais
            </span>
            <h2 className="mt-6 text-[32px] md:text-[44px] tracking-[-0.03em] font-extralight leading-[1.05]">
              Rápido, íntimo do laboratório, <span className="text-brand-gradient">sem inchar</span>.
            </h2>
            <p className="mt-5 text-[15px] font-light text-white/70 max-w-[500px] leading-relaxed">
              Cada tela foi desenhada para caber na palma da mão do técnico e na mesa do gestor. Nada de menus
              intermináveis: só o que resolve.
            </p>
          </div>
          <div className="grid gap-3">
            <Bullet title="Notação FDI nativa" desc="Consumo por dente selecionado — não por chute." />
            <Bullet title="Regras de consumo por gatilho" desc="Abertura, etapa, cancelamento, finalização, situação." />
            <Bullet title="Mobile-first" desc="Interface leve, offline-tolerante e instalável como app." />
            <Bullet title="Segurança com RLS" desc="Cada empresa vê só o que é seu — isolado no banco." />
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="max-w-6xl mx-auto px-6 py-24 md:py-28">
        <div className="text-center max-w-2xl mx-auto">
          <span className="chip">Planos</span>
          <h2 className="mt-4 text-[32px] md:text-[44px] tracking-[-0.03em] font-extralight leading-[1.05]">
            Simples de começar. <span className="text-brand-gradient">Escala com você.</span>
          </h2>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-4">
          <Plan
            name="Starter"
            price="R$ 0"
            period="para começar"
            highlight={false}
            features={["Até 3 usuários", "Casos ilimitados no mês", "Estoque básico", "Suporte por e-mail"]}
            cta="Criar conta"
          />
          <Plan
            name="Profissional"
            price="R$ 149"
            period="/ mês"
            highlight
            features={[
              "Usuários ilimitados",
              "Consumo automático avançado",
              "Notação FDI + regras por dente",
              "Notificações e comentários",
              "Impressão térmica",
            ]}
            cta="Assinar plano"
          />
          <Plan
            name="Laboratório"
            price="Sob consulta"
            period="para grandes operações"
            highlight={false}
            features={[
              "Onboarding assistido",
              "Backup dedicado",
              "Integrações sob medida",
              "SLA e suporte prioritário",
            ]}
            cta="Falar com vendas"
          />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-[28px] border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-10 md:p-16 text-center shadow-[0_30px_80px_-40px_rgba(45,127,249,0.35)]">
          <Zap className="h-6 w-6 mx-auto text-[#2D7FF9]" strokeWidth={1.5} />
          <h2 className="mt-4 text-[30px] md:text-[42px] tracking-[-0.03em] font-extralight leading-[1.05]">
            Pronto para <span className="text-brand-gradient">acabar com o retrabalho</span>?
          </h2>
          <p className="mt-4 text-[15px] font-light text-slate-500 max-w-[520px] mx-auto">
            Crie sua empresa em menos de um minuto. Sem cartão, sem burocracia.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link to="/auth" search={{ invite: undefined, mode: "company" }} className="btn-brand">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" search={{ invite: undefined, mode: undefined }} className="btn-brand-outline">
              Ver demonstração
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-slate-100 bg-slate-50/60">
        <div className="max-w-3xl mx-auto px-6 py-24">
          <span className="chip">Dúvidas frequentes</span>
          <h2 className="mt-4 text-[28px] md:text-[36px] tracking-[-0.03em] font-extralight leading-[1.05]">
            Antes de começar.
          </h2>
          <div className="mt-10 divide-y divide-slate-200">
            <Faq q="Preciso instalar algo?" a="Não. O DentalFlow roda no navegador e pode ser instalado como PWA no celular, tablet ou desktop." />
            <Faq q="Serve para consultório e laboratório?" a="Sim. Você escolhe o tipo ao criar a empresa e o sistema adapta os fluxos e permissões." />
            <Faq q="E o meu estoque atual?" a="Você importa via cadastro rápido ou backup. Depois, o consumo automático assume." />
            <Faq q="Meus dados ficam seguros?" a="Isolamento por empresa via RLS no banco, backup completo em um clique e políticas por papel." />
            <Faq q="Consigo cancelar quando quiser?" a="Sim. Sem fidelidade. Você baixa seu backup e mantém tudo." />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <p className="text-[11px] font-light text-slate-400 tracking-[0.15em] uppercase">
            © {new Date().getFullYear()} DentalFlow. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/lp" className="flex items-center gap-2.5">
      <span
        className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2D7FF9] to-[#4a9bff] text-white grid place-items-center font-medium shadow-[0_8px_22px_-8px_rgba(45,127,249,0.55)]"
        style={{ fontFamily: '"Google Sans Display", Inter, sans-serif' }}
      >
        D
      </span>
      <span className="text-[13px] font-medium tracking-[0.22em] text-slate-700 uppercase">DentalFlow</span>
    </Link>
  );
}

function MockKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="text-[9px] tracking-[0.22em] uppercase text-slate-400 font-medium">{label}</div>
      <div className="mt-1 text-[22px] font-extralight text-slate-900">{value}</div>
    </div>
  );
}

function ProblemCard({ before, after }: { before: string; after: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6">
      <div className="text-[10px] tracking-[0.22em] uppercase text-slate-400 font-medium">Antes</div>
      <div className="mt-2 text-[15px] font-light text-slate-700 leading-relaxed">{before}</div>
      <div className="mt-6 text-[10px] tracking-[0.22em] uppercase text-[#2D7FF9] font-medium">Com DentalFlow</div>
      <div className="mt-2 text-[15px] font-light text-slate-900 leading-relaxed">{after}</div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 hover:border-[rgba(45,127,249,0.35)] hover:shadow-[0_20px_50px_-30px_rgba(45,127,249,0.35)] transition-all">
      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2D7FF9] to-[#4a9bff] text-white grid place-items-center">
        {icon}
      </div>
      <div className="mt-5 text-[15px] font-medium text-slate-900">{title}</div>
      <div className="mt-2 text-[13px] font-light text-slate-500 leading-relaxed">{desc}</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-6">
      <div className="text-[10px] tracking-[0.22em] uppercase text-slate-400 font-medium">Passo {n}</div>
      <div className="mt-3 text-[16px] font-medium text-slate-900">{title}</div>
      <div className="mt-2 text-[13px] font-light text-slate-500 leading-relaxed">{desc}</div>
    </li>
  );
}

function Bullet({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-[#2D7FF9] to-[#4a9bff] grid place-items-center">
          <Check className="h-3.5 w-3.5 text-white" />
        </span>
        <div className="text-[14px] font-medium">{title}</div>
      </div>
      <div className="mt-2 text-[13px] font-light text-white/60 leading-relaxed pl-8">{desc}</div>
    </div>
  );
}

function Plan({
  name,
  price,
  period,
  features,
  highlight,
  cta,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlight: boolean;
  cta: string;
}) {
  return (
    <div
      className={`rounded-2xl p-8 flex flex-col ${
        highlight
          ? "border-2 border-transparent bg-white shadow-[0_30px_80px_-30px_rgba(45,127,249,0.45)] relative before:absolute before:inset-0 before:rounded-2xl before:p-[2px] before:bg-gradient-to-br before:from-[#2D7FF9] before:to-[#4a9bff] before:-z-10"
          : "border border-slate-100 bg-white"
      }`}
    >
      {highlight && (
        <span className="self-start text-[10px] font-medium tracking-[0.22em] uppercase text-[#2D7FF9] bg-[rgba(45,127,249,0.08)] rounded-full px-3 py-1 mb-4">
          Mais escolhido
        </span>
      )}
      <div className="text-[13px] font-medium tracking-[0.08em] uppercase text-slate-500">{name}</div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-[36px] font-extralight tracking-[-0.03em] text-slate-900">{price}</span>
        <span className="text-[12px] font-light text-slate-400 pb-2">{period}</span>
      </div>
      <ul className="mt-6 space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] font-light text-slate-600">
            <Check className="h-4 w-4 text-[#2D7FF9] mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/auth"
        search={{ invite: undefined, mode: "company" }}
        className={`mt-8 ${highlight ? "btn-brand" : "btn-brand-outline"} justify-center`}
      >
        {cta}
      </Link>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group py-5">
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="text-[15px] font-light text-slate-900">{q}</span>
        <span className="h-6 w-6 rounded-full border border-slate-200 grid place-items-center text-slate-400 group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="mt-3 text-[13px] font-light text-slate-500 leading-relaxed">{a}</p>
    </details>
  );
}
