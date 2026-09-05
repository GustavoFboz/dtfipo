// @ts-nocheck
import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

type SignupMode = "company" | "employee" | "user";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
    mode: (s.mode === "company" || s.mode === "employee" || s.mode === "user" ? s.mode : undefined) as
      | SignupMode
      | undefined,
    returnTo: typeof s.returnTo === "string" && s.returnTo.startsWith("/") && !s.returnTo.startsWith("//")
      ? s.returnTo
      : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      if (search.returnTo) throw redirect({ href: search.returnTo });
      throw redirect({ to: "/" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [tab, setTab] = useState<"login" | "signup">(search.invite || search.mode ? "signup" : "login");
  const [signupMode, setSignupMode] = useState<SignupMode>(
    search.mode ?? (search.invite ? "employee" : "company"),
  );

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyKind, setCompanyKind] = useState<"consultorio" | "laboratorio">("consultorio");
  const [inviteCode, setInviteCode] = useState(search.invite ?? "");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        if (search.returnTo) window.location.replace(search.returnTo);
        else navigate({ to: "/", replace: true });
      }
    });
  }, [navigate, search.returnTo]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoadingLogin(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setLoadingLogin(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
    if (search.returnTo) window.location.replace(search.returnTo);
    else navigate({ to: "/", replace: true });
  }

  async function signUpAndSignIn(): Promise<boolean> {
    const email = signupEmail.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password: signupPassword,
      options: {
        data: { full_name: signupName.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      const { error: siErr } = await supabase.auth.signInWithPassword({ email, password: signupPassword });
      if (siErr) {
        toast.success("Conta criada! Verifique seu e-mail para confirmar antes de continuar.");
        return false;
      }
    }
    return true;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoadingSignup(true);
    try {
      const ok = await signUpAndSignIn();
      if (!ok) return;

      if (signupMode === "company") {
        if (companyName.trim().length < 2) {
          toast.error("Informe o nome do consultório ou laboratório");
          return;
        }
        const { data, error } = await supabase.rpc("create_company_account", {
          p_name: companyName.trim(),
          p_kind: companyKind,
          p_full_name: signupName.trim(),
        });
        if (error) return toast.error(error.message);
        const res = data as { success: boolean; error?: string };
        if (!res?.success) return toast.error(res?.error ?? "Erro ao criar conta");
        toast.success("Conta criada com sucesso!");
        navigate({ to: "/", replace: true });
      } else if (signupMode === "employee") {
        if (!inviteCode.trim()) {
          toast.error("Informe o código de convite");
          return;
        }
        const { data, error } = await supabase.rpc("join_company_with_code", {
          p_invite_code: inviteCode.trim(),
          p_role: "USER",
        });
        if (error) return toast.error(error.message);
        const res = data as { success: boolean; error?: string; clinic_name?: string };
        if (!res?.success) return toast.error(res?.error ?? "Código inválido");
        toast.success(`Bem-vindo a ${res.clinic_name ?? "sua conta"}!`);
        navigate({ to: "/", replace: true });
      } else {
        toast.success("Conta criada! Escolha um consultório para solicitar entrada.");
        navigate({ to: "/join-clinic", replace: true });
      }
    } finally {
      setLoadingSignup(false);
    }
  }

  const isLogin = tab === "login";

  return (
    <div className="min-h-[100dvh] bg-[#f6f9f8] text-slate-950 lg:grid lg:grid-cols-[1.08fr_.92fr]">
      <BrandPanel />

      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-white px-5 py-8 sm:px-8 lg:px-12 xl:px-16">
        <div className="absolute right-8 top-7 hidden items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-300 xl:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-[#1e8f87]" />
          Ambiente seguro
        </div>

        <div className="w-full max-w-[470px] py-5 lg:py-12">
          <div className="mb-9 flex items-center justify-between lg:hidden">
            <DentalFlowBrand dark={false} />
            <div className="rounded-full bg-[#1e8f87]/8 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">BR</div>
          </div>

          <div className="mb-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">
              {isLogin ? "Acesso ao DentalFlow" : "Comece no DentalFlow"}
            </div>
            <h1 className="mt-3 text-[34px] font-light leading-[1.06] tracking-[-0.045em] text-slate-950 sm:text-[42px]">
              {isLogin ? "Bem-vindo de volta." : "Sua operação começa aqui."}
            </h1>
            <p className="mt-3 max-w-md text-[13px] font-light leading-relaxed text-slate-500">
              {isLogin
                ? "Entre para continuar sua rotina clínica e laboratorial exatamente de onde parou."
                : "Crie sua conta e conecte consultório, equipe e laboratório em um fluxo único."}
            </p>
          </div>

          <div className="mb-7 grid grid-cols-2 rounded-2xl bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`h-10 rounded-xl text-[12px] font-medium transition-all ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`h-10 rounded-xl text-[12px] font-medium transition-all ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Criar conta
            </button>
          </div>

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <FieldBox type="email" label="E-mail" value={loginEmail} onChange={setLoginEmail} placeholder="seu@email.com" autoComplete="email" required />
              <PasswordField
                label="Senha"
                value={loginPassword}
                onChange={setLoginPassword}
                visible={showLoginPassword}
                onToggle={() => setShowLoginPassword((value) => !value)}
                autoComplete="current-password"
                required
              />

              <div className="flex items-center justify-end">
                <Link
                  to="/auth/forgot"
                  search={{ invite: undefined, mode: undefined }}
                  className="text-[12px] font-normal text-slate-400 transition hover:text-[#1e8f87]"
                >
                  Esqueci minha senha
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loadingLogin}
                className="group h-12 w-full rounded-xl bg-[#1e8f87] text-[13px] font-medium text-white shadow-[0_12px_30px_-14px_rgba(30,143,135,.7)] transition hover:bg-[#177a73]"
              >
                {loadingLogin ? "Entrando…" : "Entrar no DentalFlow"}
                {!loadingLogin && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>

              <p className="pt-1 text-center text-[12px] font-light text-slate-400">
                Ainda não usa o DentalFlow?{" "}
                <button type="button" onClick={() => setTab("signup")} className="font-medium text-[#1e8f87] hover:underline">
                  Crie sua conta
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <div className="mb-2 text-[11px] font-medium text-slate-500">Como você vai usar o DentalFlow?</div>
                <RadioGroup
                  value={signupMode}
                  onValueChange={(v) => setSignupMode(v as SignupMode)}
                  className="grid grid-cols-3 gap-2"
                >
                  <ModeCard value="company" label="Empresa" icon={<Building2 className="h-4 w-4" strokeWidth={1.6} />} />
                  <ModeCard value="employee" label="Equipe" icon={<UserPlus className="h-4 w-4" strokeWidth={1.6} />} />
                  <ModeCard value="user" label="Usuário" icon={<User className="h-4 w-4" strokeWidth={1.6} />} />
                </RadioGroup>
              </div>

              {signupMode === "company" && (
                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/65 p-4">
                  <FieldBox label="Nome do consultório / laboratório" value={companyName} onChange={setCompanyName} placeholder="Nome da sua operação" required />
                  <div className="grid grid-cols-2 gap-2">
                    <KindCard active={companyKind === "consultorio"} onClick={() => setCompanyKind("consultorio")} label="Consultório" icon={<Stethoscope className="h-4 w-4" />} />
                    <KindCard active={companyKind === "laboratorio"} onClick={() => setCompanyKind("laboratorio")} label="Laboratório" icon={<FlaskConical className="h-4 w-4" />} />
                  </div>
                </div>
              )}

              {signupMode === "employee" && (
                <FieldBox label="Código de convite" value={inviteCode} onChange={(v) => setInviteCode(v.toUpperCase())} placeholder="Ex.: DF-7K2P" required />
              )}

              <FieldBox label="Nome completo" value={signupName} onChange={setSignupName} placeholder="Como devemos chamar você?" autoComplete="name" required />
              <FieldBox type="email" label="E-mail" value={signupEmail} onChange={setSignupEmail} placeholder="seu@email.com" autoComplete="email" required />
              <PasswordField
                label="Senha"
                value={signupPassword}
                onChange={setSignupPassword}
                visible={showSignupPassword}
                onToggle={() => setShowSignupPassword((value) => !value)}
                autoComplete="new-password"
                minLength={8}
                required
              />

              <Button
                type="submit"
                disabled={loadingSignup}
                className="group h-12 w-full rounded-xl bg-[#1e8f87] text-[13px] font-medium text-white shadow-[0_12px_30px_-14px_rgba(30,143,135,.7)] transition hover:bg-[#177a73]"
              >
                {loadingSignup ? "Criando…" : "Criar minha conta"}
                {!loadingSignup && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>

              <p className="text-center text-[11px] font-light leading-relaxed text-slate-400">
                Ao continuar, você cria um acesso protegido para sua operação no DentalFlow.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#126f6a] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(96,219,207,.42),transparent_30%),radial-gradient(circle_at_88%_72%,rgba(59,130,246,.25),transparent_32%),linear-gradient(145deg,#0c6c67_0%,#168d85_54%,#126f6a_100%)]" />
      <div className="absolute -left-24 top-[18%] h-80 w-80 rounded-full border-[54px] border-white/[0.055]" />
      <div className="absolute right-[-9rem] top-[-7rem] h-[27rem] w-[27rem] rounded-full border-[78px] border-white/[0.05]" />
      <div className="absolute bottom-[12%] right-[8%] h-36 w-64 rotate-[-18deg] rounded-[38px] border border-white/10 bg-white/[0.045] backdrop-blur" />
      <div className="absolute left-[46%] top-[30%] h-32 w-32 rotate-45 rounded-[30px] border border-white/10 bg-white/[0.055]" />

      <div className="relative z-10">
        <DentalFlowBrand dark />
      </div>

      <div className="relative z-10 max-w-[640px] pb-8 xl:pb-14">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.075] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/75 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[#a7f3e8]" />
          Operação conectada
        </div>
        <h2 className="max-w-[570px] text-[48px] font-light leading-[1.02] tracking-[-0.05em] text-white xl:text-[62px]">
          Da agenda ao laboratório, tudo no mesmo fluxo.
        </h2>
        <p className="mt-6 max-w-[520px] text-[15px] font-light leading-7 text-white/65">
          Clínica, pacientes, produção e gestão trabalhando juntos — com menos ruído entre quem atende e quem entrega.
        </p>

        <div className="mt-9 grid max-w-[560px] grid-cols-3 gap-2.5">
          <BrandFeature icon={<Stethoscope className="h-4 w-4" />} title="Clínica" subtitle="Agenda e pacientes" />
          <BrandFeature icon={<FlaskConical className="h-4 w-4" />} title="Laboratório" subtitle="Casos e produção" />
          <BrandFeature icon={<CheckCircle2 className="h-4 w-4" />} title="Um fluxo" subtitle="Dados conectados" />
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-[10px] font-light uppercase tracking-[0.14em] text-white/45">
        <span>DentalFlow BR</span>
        <span>Clareza para decidir. Fluxo para produzir.</span>
      </div>
    </aside>
  );
}

function DentalFlowBrand({ dark }: { dark: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-10 w-10 place-items-center rounded-[14px] border ${dark ? "border-white/15 bg-white/10 text-white" : "border-[#1e8f87]/15 bg-[#1e8f87]/8 text-[#1e8f87]"}`}>
        <span className="relative block h-5 w-5 rounded-[6px] border-[1.5px] border-current">
          <span className="absolute left-1/2 top-[3px] h-[11px] w-px -translate-x-1/2 bg-current" />
          <span className="absolute left-[3px] top-1/2 h-px w-[11px] -translate-y-1/2 bg-current" />
        </span>
      </div>
      <div>
        <div className={`text-[14px] font-semibold tracking-[0.03em] ${dark ? "text-white" : "text-slate-800"}`}>DENTALFLOW <span className={dark ? "text-white/45" : "text-slate-300"}>BR</span></div>
        <div className={`mt-0.5 text-[9px] font-medium uppercase tracking-[0.23em] ${dark ? "text-[#b7eee8]" : "text-[#1e8f87]"}`}>Clínica + Laboratório</div>
      </div>
    </div>
  );
}

function BrandFeature({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3.5 backdrop-blur-sm">
      <div className="text-[#b6eee7]">{icon}</div>
      <div className="mt-3 text-[12px] font-medium text-white/90">{title}</div>
      <div className="mt-0.5 text-[9px] font-light text-white/45">{subtitle}</div>
    </div>
  );
}

function FieldBox({
  type = "text",
  label,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
}: {
  type?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-medium text-slate-600">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="h-12 rounded-xl border-slate-200 bg-slate-50/55 px-4 text-[14px] font-normal text-slate-900 shadow-none placeholder:text-slate-300 focus-visible:border-[#1e8f87]/40 focus-visible:ring-4 focus-visible:ring-[#1e8f87]/8"
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  required,
  minLength,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-medium text-slate-600">{label}</span>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="h-12 rounded-xl border-slate-200 bg-slate-50/55 px-4 pr-11 text-[14px] font-normal text-slate-900 shadow-none focus-visible:border-[#1e8f87]/40 focus-visible:ring-4 focus-visible:ring-[#1e8f87]/8"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-300 transition hover:bg-white hover:text-slate-500"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function ModeCard({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <label className="flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-400 transition-all hover:border-[#1e8f87]/25 hover:text-slate-600 has-[[data-state=checked]]:border-[#1e8f87]/35 has-[[data-state=checked]]:bg-[#1e8f87]/[0.045] has-[[data-state=checked]]:text-[#1e8f87]">
      <RadioGroupItem value={value} className="sr-only" />
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-[0.09em]">{label}</span>
    </label>
  );
}

function KindCard({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-[11px] font-medium transition ${active ? "border-[#1e8f87]/30 bg-white text-[#1e8f87] shadow-sm" : "border-transparent bg-transparent text-slate-400 hover:bg-white"}`}
    >
      {icon}
      {label}
    </button>
  );
}