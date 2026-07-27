// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { Moon, Sun, Settings as SettingsIcon, GitBranch, Printer, Boxes, ChevronRight, Building2, Copy, RefreshCw, Shield, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import { useArcadaStyle } from "@/hooks/use-arcada-style";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { UserAvatarUpload } from "@/components/UserAvatarUpload";
import { fetchProfile } from "@/lib/api";
import { fetchWorkflowSettings, updateWorkflowSettings } from "@/lib/workflow";

const ALLOWED_EMAIL = "gustavovitorfa@gmail.com";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { theme, toggleTheme } = useTheme();
  const { style: arcadaStyle, setStyle: setArcadaStyle } = useArcadaStyle();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email?.toLowerCase() ?? null);
      if (data.user) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        setRole(p?.role ?? null);
      }
      setChecking(false);
    });
  }, []);

  const isAdmin = email === ALLOWED_EMAIL || role === "CEO" || role === "DR";

  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

  const wf = useQuery({
    queryKey: ["workflow_settings"],
    queryFn: fetchWorkflowSettings,
    enabled: isAdmin,
  });

  const company = useQuery({
    queryKey: ["my_company"],
    queryFn: async () => {
      const { data: prof } = await supabase.auth.getUser();
      if (!prof.user) return null;
      const { data: p } = await supabase.from("profiles").select("clinic_id").eq("id", prof.user.id).maybeSingle();
      if (!p?.clinic_id) return null;
      const { data: c } = await supabase.from("clinics").select("id,name,kind,invite_code,owner_id").eq("id", p.clinic_id).maybeSingle();
      return { ...c, is_owner: c?.owner_id === prof.user.id };
    },
  });

  async function regenerateCode() {
    const { data, error } = await supabase.rpc("regenerate_company_invite_code");
    if (error) return toast.error(error.message);
    const res = data as { success: boolean; error?: string };
    if (!res?.success) return toast.error(res?.error ?? "Erro");
    toast.success("Novo código gerado");
    qc.invalidateQueries({ queryKey: ["my_company"] });
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function copyInviteLink(code: string) {
    const url = `${window.location.origin}/auth?mode=employee&invite=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de convite copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function toggle(field: "phases_enabled" | "stages_enabled" | "auto_advance_enabled" | "progress_bar_enabled", value: boolean) {
    try {
      await updateWorkflowSettings({ [field]: value } as any);
      await qc.invalidateQueries({ queryKey: ["workflow_settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (checking) return <div className="p-12 text-sm text-muted-foreground">Carregando…</div>;

  const s = wf.data;

  return (
    <div className="max-w-[1600px] mx-auto w-full px-6 md:px-16 py-8 md:py-10 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-11 w-11 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary stroke-[1.2px]" />
        </div>
        <div>
          <h1 className="text-2xl font-light tracking-tight">Configurações</h1>
          <p className="text-xs text-muted-foreground">Preferências do sistema</p>
        </div>
      </div>

      {/* Perfil */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70">Perfil</h2>
        <UserAvatarUpload
          avatarUrl={profile.data?.avatar_url ?? null}
          fullName={profile.data?.full_name}
          email={profile.data?.email ?? email ?? undefined}
        />
        <div className="text-xs text-muted-foreground">
          {profile.data?.full_name ?? "—"} · {profile.data?.email ?? email}
        </div>
      </div>

      {/* Aparência */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70 mb-4">Aparência</h2>
        <Row
          icon={theme === "dark" ? <Moon className="h-4.5 w-4.5 text-primary stroke-[1.4px]" /> : <Sun className="h-4.5 w-4.5 text-amber-500 stroke-[1.4px]" />}
          title="Tema escuro"
          desc="Alterna entre tema claro e escuro em todo o sistema."
          control={mounted ? <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Alternar tema escuro" /> : null}
        />
        {mounted && theme === "dark" && (
          <div className="pt-4 mt-2 border-t border-border">
            <div className="text-sm font-normal mb-1">Estilo da arcada</div>
            <div className="text-xs text-muted-foreground mb-3">Define a paleta de cores da arcada dentária no tema escuro.</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "padrao", label: "Padrão", swatch: ["#1A1A1A", "#4D4D4D", "#BDBDBD"] },
                { id: "azul", label: "Azul (personalizada)", swatch: ["#0C84FA", "#A5D2FF", "#63B1FF"] },
              ] as const).map((opt) => {
                const active = arcadaStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setArcadaStyle(opt.id)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {opt.swatch.map((c) => (
                        <span key={c} className="h-4 w-4 rounded-full border border-border" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="text-xs font-medium">{opt.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-xs text-muted-foreground">
          Configurações avançadas do sistema são exclusivas do administrador.
        </div>
      )}
      {isAdmin && <>


      {/* Consultório / Laboratório */}
      {company.data && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70">Consultório / Laboratório</h2>
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-primary/5 grid place-items-center border border-primary/10">
              <Building2 className="h-5 w-5 text-primary stroke-[1.4px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{company.data.name}</div>
              <div className="text-[11px] text-muted-foreground capitalize">
                {company.data.kind === "laboratorio" ? "Laboratório" : "Consultório"}
              </div>
            </div>
          </div>

          {company.data.invite_code && (
            <div className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
              <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">Código de convite</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-lg tracking-[0.08em] bg-muted px-3 py-1.5 rounded-lg select-all">
                  {company.data.invite_code}
                </code>
                <Button variant="outline" size="sm" onClick={() => copyCode(company.data!.invite_code!)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Código
                </Button>
                <Button variant="outline" size="sm" onClick={() => copyInviteLink(company.data!.invite_code!)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Link
                </Button>
                {company.data.is_owner && (
                  <Button variant="ghost" size="sm" onClick={regenerateCode}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Gerar novo
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Compartilhe este código (ou o link) com funcionários para que entrem direto no consultório/laboratório.
              </p>
            </div>
          )}
        </div>
      )}



      {/* Gestão de Fluxo */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-1">
        <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70 mb-2">Gestão de Fluxo</h2>
        <Row
          icon={<GitBranch className="h-4.5 w-4.5 text-primary stroke-[1.4px]" />}
          title="Ativar gestão de fluxo"
          desc="Habilita a sequência linear de etapas para os casos."
          control={<Switch checked={!!s?.phases_enabled} onCheckedChange={(v) => toggle("phases_enabled", v)} disabled={!s} />}
        />
        <Row
          icon={<GitBranch className="h-4.5 w-4.5 text-primary stroke-[1.4px]" />}
          title="Barra de progresso no caso"
          desc="Exibe a barra de etapas e os botões Anterior / Próxima no detalhe do caso."
          control={<Switch checked={!!s?.progress_bar_enabled} onCheckedChange={(v) => toggle("progress_bar_enabled", v)} disabled={!s?.phases_enabled} />}
        />
      </div>

      {/* Atalhos */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70 mb-4">Mais configurações</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NavCard to="/fluxo" icon={<GitBranch className="h-4.5 w-4.5" />} title="Gestão de Fluxo" desc="Etapas e justificativas de retorno" />
          <NavCard to="/consumo-automatico" icon={<Boxes className="h-4.5 w-4.5" />} title="Consumo automático" desc="Vincular estoque a etapas" />
          <NavCard to="/configuracoes/nota" icon={<Printer className="h-4.5 w-4.5" />} title="Nota impressa" desc="Layout, checklist e impressora" />
          <NavCard to="/configuracoes/implantes" icon={<Wrench className="h-4.5 w-4.5" />} title="Implantes" desc="Sistemas, componentes e estoque dedicado" />
          <NavCard to="/admin/backup" icon={<Shield className="h-4.5 w-4.5" />} title="Backup e restauração" desc="Salve todos os dados e configurações" />
        </div>
      </div>
      </>}
    </div>
  );
}

function NavCard({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-border bg-background/40 hover:bg-accent/40 transition-colors px-4 py-3"
    >
      <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/5 grid place-items-center border border-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-normal truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </Link>
  );
}

function Row({ icon, title, desc, control }: { icon: React.ReactNode; title: string; desc: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-muted grid place-items-center border border-border">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-normal">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
        </div>
      </div>
      {control}
    </div>
  );
}
