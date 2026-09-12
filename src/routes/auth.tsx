// @ts-nocheck
import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  FlaskConical,
  RadioTower,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchBillingPlans,
  finalizePendingOnboarding,
  validateCompanyInviteCode,
  type CompanySessionType,
} from "@/lib/subscriptions";

type SignupMode = "company" | "professional";
const PROFESSIONS = ["DENTISTA", "CADISTA", "PROTETICO", "ATENDIMENTO", "RADIOLOGISTA", "OUTRO"] as const;
type Profession = (typeof PROFESSIONS)[number];

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
    mode: (s.mode === "professional" || s.mode === "employee" || s.mode === "user" ? "professional" : s.mode === "company" ? "company" : undefined) as SignupMode | undefined,
    plan: typeof s.plan === "string" ? s.plan : undefined,
    profession: PROFESSIONS.includes(String(s.profession || "").toUpperCase() as Profession)
      ? (String(s.profession).toUpperCase() as Profession)
      : undefined,
    returnTo: typeof s.returnTo === "string" && s.returnTo.startsWith("/") && !s.returnTo.startsWith("//") ? s.returnTo : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      // Handles users who had to confirm their e-mail before the account/company
      // linkage could be finalized. The RPC is idempotent.
      await finalizePendingOnboarding().catch(() => undefined);
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
  const [signupMode, setSignupMode] = useState<SignupMode>(search.mode ?? (search.invite ? "professional" : "company"));
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
  const [companyPlan, setCompanyPlan] = useState(search.plan?.startsWith("company_") ? search.plan : "company_initial");
  const [companySessions, setCompanySessions] = useState<CompanySessionType[]>(["laboratory"]);
  const [inviteCode, setInviteCode] = useState((search.invite ?? "").toUpperCase());
  const [profession, setProfession] = useState<Profession>(search.profession ?? "CADISTA");
  const [validatedCompany, setValidatedCompany] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ["billing_plans", "company"],
    queryFn: fetchBillingPlans,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const selectedPlan = useMemo(() => plans.data?.find((p) => p.code === companyPlan), [plans.data, companyPlan]);
  const maxSessions = selectedPlan?.max_sessions ?? (companyPlan === "company_advanced" ? 3 : companyPlan === "company_growth" ? 2 : 1);

  useEffect(() => {
    setCompanySessions((current) => {
      const next = current.slice(0, Math.max(1, maxSessions));
      return next.length ? next : ["laboratory"];
    });
  }, [maxSessions]);

  useEffect(() => setValidatedCompany(null), [inviteCode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoadingLogin(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
      if (error) return toast.error(error.message);
      await finalizePendingOnboarding().catch(() => undefined);
      toast.success("Bem-vindo!");
      if (search.returnTo) window.location.replace(search.returnTo);
      else navigate({ to: "/", replace: true });
    } finally {
      setLoadingLogin(false);
    }
  }

  async function validateProfessionalInvite() {
    const code = inviteCode.trim();
    if (code.length < 4) throw new Error("Informe o código da empresa.");
    const validation = await validateCompanyInviteCode(code);
    if (!validation.valid) {
      if (validation.reason === "company_inactive") throw new Error("A assinatura desta empresa não está ativa.");
      if (validation.reason === "seat_limit") throw new Error("Esta empresa atingiu o limite de membros do plano.");
      throw new Error("Código de empresa inválido.");
    }
    setValidatedCompany(validation.clinic_name ?? "Empresa DentalFlow");
    return validation;
  }

  async function signUpAndSignIn(metadata: Record<string, unknown>) {
    const email = signupEmail.trim();
    const { data: signupData, error } = await supabase.auth.signUp({
      email,
      password: signupPassword,
      options: {
        data: { full_name: signupName.trim(), ...metadata },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) throw error;
    if (signupData.session?.user) return true;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) return true;

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: signupPassword });
    if (!signInError) return true;

    toast.success("Conta criada. Confirme seu e-mail; o vínculo será concluído automaticamente no primeiro acesso.");
    return false;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (signupName.trim().length < 2) return toast.error("Informe seu nome completo.");
    if (signupPassword.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");

    setLoadingSignup(true);
    try {
      if (signupMode === "professional") {
        await validateProfessionalInvite();
        const ok = await signUpAndSignIn({
          pending_account_mode: "professional",
          pending_invite_code: inviteCode.trim().toUpperCase(),
          pending_profession_type: profession,
        });
        if (!ok) return;
        const finalized = await finalizePendingOnboarding();
        if ((finalized as any)?.success === false) throw new Error((finalized as any)?.error ?? "Não foi possível concluir o vínculo.");
        toast.success(`Conta criada e vinculada a ${validatedCompany ?? "sua empresa"}.`);
        navigate({ to: "/", replace: true });
        return;
      }

      if (companyName.trim().length < 2) throw new Error("Informe o nome da empresa.");
      if (!companySessions.length || companySessions.length > maxSessions) throw new Error("Selecione os ambientes compatíveis com o plano.");

      const ok = await signUpAndSignIn({
        pending_account_mode: "company",
        pending_company_name: companyName.trim(),
        pending_company_plan: companyPlan,
        pending_company_sessions: companySessions,
      });
      if (!ok) return;
      const finalized = await finalizePendingOnboarding();
      if ((finalized as any)?.success === false) throw new Error((finalized as any)?.error ?? "Não foi possível criar a empresa.");
      toast.success("Empresa criada. Conclua o pagamento para liberar a operação.");
      navigate({ to: "/", replace: true });
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível concluir o cadastro.");
    } finally {
      setLoadingSignup(false);
    }
  }

  const toggleSession = (session: CompanySessionType) => {
    setCompanySessions((current) => {
      if (current.includes(session)) return current.length === 1 ? current : current.filter((item) => item !== session);
      if (current.length >= maxSessions) return [...current.slice(1), session];
      return [...current, session];
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] text-slate-950 lg:grid lg:grid-cols-[.92fr_1.08fr]">
      <aside className="relative hidden overflow-hidden bg-[#0b5bd3] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(112,236,220,.32),transparent_27%),radial-gradient(circle_at_90%_75%,rgba(83,122,255,.22),transparent_32%),linear-gradient(145deg,#0b4fb8,#2D7FF9_58%,#174aa1)]" />
        <div className="relative z-10 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.2em]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/12">D</span> DentalFlow</div>
        <div className="relative z-10 max-w-xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Hub empresarial odontológico</div>
          <h1 className="mt-5 text-[48px] font-light leading-[1.02] tracking-[-0.045em]">Uma empresa. Até três operações conectadas.</h1>
          <p className="mt-6 max-w-lg text-[14px] font-light leading-7 text-white/68">Laboratório, Clínica e Radiologia funcionam conforme o plano empresarial. Profissionais entram pela empresa, sem assinatura individual.</p>
          <div className="mt-8 grid gap-3 text-[12px] font-light text-white/72">
            <Benefit text="Planos e limites pertencem à empresa" />
            <Benefit text="Profissionais só são criados com código válido" />
            <Benefit text="Pagamento mensal controla o acesso operacional" />
          </div>
        </div>
        <div className="relative z-10 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">DentalFlow 0.3.2</div>
      </aside>

      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-white px-5 py-8 sm:px-8 lg:px-12 dark:bg-[#080b10] dark:text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_50%_-10%,rgba(45,127,249,.18),transparent_65%)] lg:hidden" />
        <div className="relative w-full max-w-[620px] py-6">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#2D7FF9] text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(45,127,249,.65)]">D</span>
              <div>
                <div className="text-[13px] tracking-[-0.01em] text-slate-800 dark:text-white"><span className="font-light">DENTAL</span><span className="font-bold">FLOW</span></div>
                <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-400">Acesso seguro</div>
              </div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full border border-slate-200/80 bg-white/80 text-[#2D7FF9] shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[.04]"><ShieldCheck className="h-4 w-4" /></span>
          </div>
          <div className="mb-8"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2D7FF9]">{tab === "login" ? "Acesso" : "Cadastro"}</div><h2 className="mt-3 text-[32px] font-light leading-[1.06] tracking-[-0.045em] sm:text-[46px]">{tab === "login" ? "Bem-vindo de volta." : "Como você participa do DentalFlow?"}</h2></div>

          <div className="mb-7 grid grid-cols-2 rounded-[18px] border border-slate-200/70 bg-slate-100/80 p-1.5 shadow-[0_12px_35px_-28px_rgba(15,23,42,.55)] dark:border-white/[0.06] dark:bg-white/[0.05]">
            <button type="button" onClick={() => setTab("login")} className={`h-10 rounded-xl text-[12px] font-medium ${tab === "login" ? "bg-white shadow-sm dark:bg-white/10" : "text-slate-400"}`}>Entrar</button>
            <button type="button" onClick={() => setTab("signup")} className={`h-10 rounded-xl text-[12px] font-medium ${tab === "signup" ? "bg-white shadow-sm dark:bg-white/10" : "text-slate-400"}`}>Criar conta</button>
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <Field label="E-mail"><Input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="email" required /></Field>
              <PasswordField label="Senha" value={loginPassword} onChange={setLoginPassword} visible={showLoginPassword} onToggle={() => setShowLoginPassword((v) => !v)} autoComplete="current-password" />
              <div className="flex justify-end"><Link to="/auth/forgot" search={{ invite: undefined, mode: undefined }} className="text-[12px] text-slate-400 hover:text-[#2D7FF9]">Esqueci minha senha</Link></div>
              <Button disabled={loadingLogin} className="h-13 w-full rounded-2xl bg-[#2D7FF9] text-white shadow-[0_14px_28px_-14px_rgba(45,127,249,.62)] hover:bg-[#226fe1]">{loadingLogin ? "Entrando…" : "Entrar"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-5">
              <div><div className="mb-2 text-[11px] font-medium text-slate-500">Tipo de conta</div><RadioGroup value={signupMode} onValueChange={(v) => setSignupMode(v as SignupMode)} className="grid grid-cols-2 gap-2"><ModeCard value="company" label="Empresa" icon={<Building2 className="h-4 w-4" />} /><ModeCard value="professional" label="Profissional" icon={<UserRound className="h-4 w-4" />} /></RadioGroup></div>

              {signupMode === "company" ? (
                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.025]">
                  <Field label="Nome da empresa"><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nome da operação" required /></Field>
                  <div><div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Plano</div><div className="grid gap-2 sm:grid-cols-3">{[
                    { code: "company_initial", name: "Inicial", price: 249, sessions: 1 },
                    { code: "company_growth", name: "Crescimento", price: 449, sessions: 2 },
                    { code: "company_advanced", name: "Avançado", price: 749, sessions: 3 },
                  ].map((plan) => <button key={plan.code} type="button" onClick={() => setCompanyPlan(plan.code)} className={`rounded-xl border p-3 text-left ${companyPlan === plan.code ? "border-[#2D7FF9]/50 bg-[#2D7FF9]/[0.05]" : "border-slate-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"}`}><div className="text-[11px] font-semibold">{plan.name}</div><div className="mt-1 text-[10px] text-slate-400">R$ {plan.price}/mês · {plan.sessions} sessão{plan.sessions > 1 ? "ões" : ""}</div></button>)}</div></div>
                  <div><div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Ambientes ({companySessions.length}/{maxSessions})</div><div className="grid grid-cols-3 gap-2"><SessionCard active={companySessions.includes("laboratory")} onClick={() => toggleSession("laboratory")} icon={<FlaskConical className="h-4 w-4" />} label="Laboratório" /><SessionCard active={companySessions.includes("clinic")} onClick={() => toggleSession("clinic")} icon={<Stethoscope className="h-4 w-4" />} label="Clínica" /><SessionCard active={companySessions.includes("radiology")} onClick={() => toggleSession("radiology")} icon={<RadioTower className="h-4 w-4" />} label="Radiologia" /></div></div>
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.025]">
                  <div><div className="text-[11px] font-medium">Conta profissional vinculada</div><p className="mt-1 text-[10px] font-light leading-5 text-slate-400">Não existe plano individual. Seu login será uma vaga da empresa e sempre abrirá no contexto dela.</p></div>
                  <Field label="Código da empresa"><Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="Ex.: 1267A2F0" required /></Field>
                  {validatedCompany ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700">Código validado · {validatedCompany}</div> : null}
                  <div><div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Seu perfil</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PROFESSIONS.map((item) => <button key={item} type="button" onClick={() => setProfession(item)} className={`rounded-xl border px-3 py-2 text-[10px] font-medium ${profession === item ? "border-[#2D7FF9]/50 bg-[#2D7FF9]/[0.05] text-[#2D7FF9]" : "border-slate-200 bg-white text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02]"}`}>{labelProfession(item)}</button>)}</div></div>
                </div>
              )}

              <Field label="Nome completo"><Input value={signupName} onChange={(e) => setSignupName(e.target.value)} autoComplete="name" required /></Field>
              <Field label="E-mail"><Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} autoComplete="email" required /></Field>
              <PasswordField label="Senha" value={signupPassword} onChange={setSignupPassword} visible={showSignupPassword} onToggle={() => setShowSignupPassword((v) => !v)} autoComplete="new-password" />

              <Button disabled={loadingSignup} className="h-13 w-full rounded-2xl bg-[#2D7FF9] text-white shadow-[0_14px_28px_-14px_rgba(45,127,249,.62)] hover:bg-[#226fe1]">{loadingSignup ? "Criando…" : signupMode === "professional" ? "Criar conta na empresa" : "Criar empresa e continuar"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
              <p className="text-center text-[10px] font-light leading-5 text-slate-400">Somente contas de empresa possuem assinatura. O pagamento nunca é confirmado pelo navegador; a ativação depende do backend.</p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function labelProfession(value: Profession) {
  if (value === "PROTETICO") return "PROTÉTICO";
  if (value === "ATENDIMENTO") return "ATENDIMENTO";
  if (value === "RADIOLOGISTA") return "RADIOLOGISTA";
  if (value === "DENTISTA") return "DENTISTA";
  if (value === "CADISTA") return "CADISTA";
  return "OUTRO";
}

function Benefit({ text }: { text: string }) { return <div className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Check className="h-3.5 w-3.5" /></span>{text}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium text-slate-500">{label}</span>{children}</label>; }
function ModeCard({ value, label, icon }: { value: SignupMode; label: string; icon: React.ReactNode }) { return <label className="cursor-pointer"><RadioGroupItem value={value} className="peer sr-only" /><span className="flex h-16 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[10px] font-medium text-slate-500 transition peer-data-[state=checked]:border-[#2D7FF9]/50 peer-data-[state=checked]:bg-[#2D7FF9]/[0.05] peer-data-[state=checked]:text-[#2D7FF9] dark:border-white/[0.07] dark:bg-white/[0.025]">{icon}{label}</span></label>; }
function SessionCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`flex h-16 flex-col items-center justify-center gap-2 rounded-xl border text-[10px] font-medium transition ${active ? "border-[#2D7FF9]/50 bg-[#2D7FF9]/[0.05] text-[#2D7FF9]" : "border-slate-200 bg-white text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.02]"}`}>{icon}{label}</button>; }
function PasswordField({ label, value, onChange, visible, onToggle, autoComplete }: { label: string; value: string; onChange: (v: string) => void; visible: boolean; onToggle: () => void; autoComplete: string }) { return <Field label={label}><div className="relative"><Input type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} minLength={8} required className="pr-11" /><button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>; }
