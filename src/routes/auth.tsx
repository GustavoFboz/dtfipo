// @ts-nocheck
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Building2, UserPlus, User, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { HeroWave } from "@/components/HeroWave";
import authHero from "@/assets/auth-hero.jpg";

type SignupMode = "company" | "employee" | "user";

import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
    mode: (s.mode === "company" || s.mode === "employee" || s.mode === "user" ? s.mode : undefined) as
      | SignupMode
      | undefined,
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      throw redirect({ to: "/" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"login" | "signup">(search.invite || search.mode ? "signup" : "login");
  const [signupMode, setSignupMode] = useState<SignupMode>(
    search.mode ?? (search.invite ? "employee" : "company"),
  );
  const [stage, setStage] = useState<"welcome" | "form">(search.invite || search.mode ? "form" : "welcome");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Common signup
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [loadingSignup, setLoadingSignup] = useState(false);

  // Company fields
  const [companyName, setCompanyName] = useState("");
  const [companyKind, setCompanyKind] = useState<"consultorio" | "laboratorio">("consultorio");

  // Employee field
  const [inviteCode, setInviteCode] = useState(search.invite ?? "");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

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
    navigate({ to: "/", replace: true });
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

  if (stage === "welcome") {
    return (
      <div className="relative min-h-[100dvh] flex flex-col bg-white dark:bg-black overflow-hidden select-none">
        <div className="relative flex-1 overflow-hidden min-h-[42vh]">
          <img
            src={authHero}
            alt=""
            className="absolute inset-0 h-full w-full object-cover animate-[heroDrift_18s_ease-in-out_infinite] dark:opacity-40"
          />
          {/* Camada de brilho animado por cima da imagem */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/20 dark:from-black/40 dark:to-black/60 mix-blend-overlay animate-[heroPulse_9s_ease-in-out_infinite]" />
          <HeroWave className="absolute left-0 right-0 -bottom-[1px] text-white dark:text-black" fill="currentColor" height={90} />
        </div>

        <div className="bg-white dark:bg-black px-8 pt-8 pb-[calc(2.75rem+env(safe-area-inset-bottom))] space-y-8 md:max-w-md md:mx-auto md:w-full">
          <div className="text-center space-y-3">
            <h2 className="text-[32px] font-semibold tracking-tight text-slate-800 dark:text-white">
              BEM-VINDO
            </h2>
            <p className="text-[14px] font-light text-slate-400 dark:text-slate-500 leading-relaxed">
              Faça login ou crie sua conta<br />e acesse o sistema.
            </p>
          </div>
          <div className="space-y-3.5">
            <Button
              onClick={() => { setTab("login"); setStage("form"); }}
              className="w-full h-14 rounded-full bg-[#4a9bff] hover:bg-[#3a8bef] text-white text-[16px] font-normal tracking-tight shadow-[0_8px_22px_-8px_rgba(74,155,255,0.55)]"
            >
              Entrar
            </Button>
            <Button
              onClick={() => { setTab("signup"); setStage("form"); }}
              variant="outline"
              className="w-full h-14 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06] text-[16px] font-normal tracking-tight"
            >
              Criar conta
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isLogin = tab === "login";

  return (
    <div className="relative min-h-[100dvh] bg-white select-none flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <button
          onClick={() => setStage("welcome")}
          className="h-9 w-9 -ml-2 grid place-items-center rounded-full text-slate-400 hover:text-slate-700 active:scale-90 transition"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 grid place-items-center rounded-md bg-gradient-to-br from-[#4a9bff] to-[#2D7FF9] text-white text-[11px] font-semibold tracking-tight shadow-[0_4px_12px_-4px_rgba(45,127,249,0.55)]">
            D
          </span>
          <span className="text-[11px] font-medium tracking-[0.28em] text-slate-500 uppercase">
            DentalFlowPro
          </span>
        </div>
        <span className="w-9" />
      </header>

      <main className="flex-1 flex items-start md:items-center justify-center px-6 md:px-10 pt-12 md:pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-[380px]">
          <h1 className="text-[34px] md:text-[38px] font-extralight tracking-[-0.03em] text-slate-900 leading-[1.05]">
            {isLogin ? (
              <>Bem-vindo<br />de <span className="bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff] bg-clip-text text-transparent">volta.</span></>
            ) : (
              <>Crie sua<br /><span className="bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff] bg-clip-text text-transparent">conta.</span></>
            )}
          </h1>
          <p className="mt-3 text-[13px] font-light text-slate-400 tracking-tight">
            {isLogin
              ? "Acesse com suas credenciais."
              : "Poucos passos para começar."}
          </p>

          {/* Toggle sutil */}
          <div className="mt-10 flex items-center gap-6 text-[12px] font-medium uppercase tracking-[0.18em]">
            <button
              onClick={() => setTab("login")}
              className={`relative pb-2 transition-colors ${isLogin ? "text-slate-900" : "text-slate-300 hover:text-slate-500"}`}
            >
              Entrar
              {isLogin && <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff]" />}
            </button>
            <button
              onClick={() => setTab("signup")}
              className={`relative pb-2 transition-colors ${!isLogin ? "text-slate-900" : "text-slate-300 hover:text-slate-500"}`}
            >
              Criar conta
              {!isLogin && <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff]" />}
            </button>
            <span className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="mt-8">
            {isLogin ? (
              <form onSubmit={handleLogin} className="space-y-7">
                <FieldLine type="email" label="E-mail" value={loginEmail} onChange={setLoginEmail} required />
                <FieldLine type="password" label="Senha" value={loginPassword} onChange={setLoginPassword} required />
                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={loadingLogin}
                    className="w-full h-12 rounded-full bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff] hover:brightness-105 text-white text-[13px] font-medium tracking-[0.15em] uppercase shadow-[0_10px_28px_-10px_rgba(45,127,249,0.6)]"
                  >
                    {loadingLogin ? "Entrando…" : "Entrar"}
                  </Button>
                </div>
                <Link
                  to="/auth/forgot"
                  search={{ invite: undefined, mode: undefined }}
                  className="block text-center text-[12px] font-light text-slate-400 hover:text-slate-700 tracking-tight"
                >
                  Esqueci minha senha
                </Link>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-7">
                <RadioGroup
                  value={signupMode}
                  onValueChange={(v) => setSignupMode(v as SignupMode)}
                  className="grid grid-cols-3 gap-2"
                >
                  <ModeMini value="company" label="Empresa" icon={<Building2 className="h-[14px] w-[14px]" strokeWidth={1.5} />} />
                  <ModeMini value="employee" label="Funcionário" icon={<UserPlus className="h-[14px] w-[14px]" strokeWidth={1.5} />} />
                  <ModeMini value="user" label="Usuário" icon={<User className="h-[14px] w-[14px]" strokeWidth={1.5} />} />
                </RadioGroup>

                {signupMode === "company" && (
                  <>
                    <FieldLine label="Nome do consultório / laboratório" value={companyName} onChange={setCompanyName} required />
                    <div className="flex gap-6 pt-1">
                      <KindRadio active={companyKind === "consultorio"} onClick={() => setCompanyKind("consultorio")} label="Consultório" />
                      <KindRadio active={companyKind === "laboratorio"} onClick={() => setCompanyKind("laboratorio")} label="Laboratório" />
                    </div>
                  </>
                )}
                {signupMode === "employee" && (
                  <FieldLine label="Código de convite" value={inviteCode} onChange={(v) => setInviteCode(v.toUpperCase())} required />
                )}

                <FieldLine label="Nome completo" value={signupName} onChange={setSignupName} required />
                <FieldLine type="email" label="E-mail" value={signupEmail} onChange={setSignupEmail} required />
                <FieldLine type="password" label="Senha" value={signupPassword} onChange={setSignupPassword} minLength={8} required />

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={loadingSignup}
                    className="w-full h-12 rounded-full bg-gradient-to-r from-[#2D7FF9] to-[#4a9bff] hover:brightness-105 text-white text-[13px] font-medium tracking-[0.15em] uppercase shadow-[0_10px_28px_-10px_rgba(45,127,249,0.6)]"
                  >
                    {loadingSignup ? "Criando…" : "Criar conta"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
        <p className="text-[10px] font-light text-slate-300 tracking-[0.08em] uppercase">
          Plataforma segura
        </p>
      </footer>
    </div>
  );
}

function FieldLine({
  type = "text",
  label,
  value,
  onChange,
  required,
  minLength,
}: {
  type?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block group">
      <span className="block text-[10px] font-medium tracking-[0.22em] uppercase text-slate-400 group-focus-within:text-slate-900 transition-colors">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="mt-2 w-full h-9 bg-transparent border-0 border-b border-slate-200 focus:border-slate-900 outline-none text-[15px] font-light text-slate-900 placeholder:text-slate-300 transition-colors"
      />
    </label>
  );
}

function ModeMini({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <label className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-200 cursor-pointer text-slate-400 transition-all has-[[data-state=checked]]:border-slate-900 has-[[data-state=checked]]:text-slate-900">
      <RadioGroupItem value={value} className="sr-only" />
      {icon}
      <span className="text-[10px] font-medium tracking-[0.14em] uppercase">{label}</span>
    </label>
  );
}

function KindRadio({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-[13px] font-light tracking-tight"
    >
      <span className={`h-3.5 w-3.5 rounded-full border transition-all ${active ? "border-slate-900 bg-slate-900 ring-2 ring-white ring-offset-2 ring-offset-white shadow-[0_0_0_1px_theme(colors.slate.900)]" : "border-slate-300"}`} />
      <span className={active ? "text-slate-900" : "text-slate-400"}>{label}</span>
    </button>
  );
}

