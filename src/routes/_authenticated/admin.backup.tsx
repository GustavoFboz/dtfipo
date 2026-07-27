import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { confirm } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Upload, Save, Shield, User, ShieldAlert, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/backup")({ component: BackupPage });

// Todas as tabelas relevantes do sistema (dados da empresa/clínica)
const COMPANY_TABLES = [
  // Cadastros
  "patients", "doctors", "cadistas",
  // Casos e anexos
  "cases", "case_stages", "case_components", "case_types_link",
  "case_activity", "case_attachments", "case_stock_consumptions", "case_tooth_stock_usage",
  // Fluxo
  "phases", "stages", "stage_assignments", "phase_assignments", "stage_return_reasons",
  "workflow_settings",
  // Estoque
  "stock_items", "stock_movements", "stock_consumption_rules", "stock_item_custom_fields",
  "component_categories", "components", "user_stock_access",
  // Ferramentas
  "holders", "burrs", "burr_usages",
  // Catálogos
  "case_types", "tooth_colors", "implant_systems", "scan_jigs",
  // Equipe / clínica
  "profiles", "clinic_members", "clinics",
  // Modelos 3D
  "model_annotations",
] as const;

// Somente configurações pessoais do próprio usuário
const PERSONAL_FIELDS = [
  "id", "full_name", "email", "phone", "notification_preferences", "print_note_template",
] as const;

function BackupPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [personalFile, setPersonalFile] = useState<File | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        setRole(p?.role ?? null);
      }
    });
  }, []);

  const isAdmin = role === "CEO" || role === "DR";

  const { data: backups = [] } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backups").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  async function generateCompanyBackup() {
    setBusy(true);
    try {
      const payload: Record<string, unknown[]> = {};
      const failed: string[] = [];
      for (const t of COMPANY_TABLES) {
        const { data, error } = await supabase.from(t as any).select("*");
        if (error) { failed.push(`${t}: ${error.message}`); continue; }
        payload[t] = data ?? [];
      }
      const meta = {
        kind: "company",
        generated_at: new Date().toISOString(),
        version: 2,
        notes: notes || null,
      };
      const blob = new Blob([JSON.stringify({ meta, tables: payload }, null, 2)], { type: "application/json" });
      const fileName = `backup-empresa-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      triggerDownload(blob, fileName);

      await supabase.from("backups").insert({
        file_name: fileName, file_size_bytes: blob.size, notes: notes || null,
        created_by: userId,
      });
      qc.invalidateQueries({ queryKey: ["backups"] });
      if (failed.length) toast.warning(`Backup gerado com avisos: ${failed.length} tabela(s) sem acesso.`);
      else toast.success("Backup completo gerado.");
      setNotes("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreCompanyBackup() {
    if (!importFile) return;
    if (!(await confirm({ title: "Restaurar backup", description: "Confirma restaurar este backup? Registros existentes com mesmo ID serão atualizados. Esta ação é irreversível.", confirmText: "Restaurar", destructive: true }))) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await importFile.text());
      const tables = (parsed.tables ?? {}) as Record<string, Array<Record<string, unknown>>>;
      let total = 0;
      const errors: string[] = [];
      for (const t of COMPANY_TABLES) {
        const rows = tables[t];
        if (!rows || rows.length === 0) continue;
        const { error } = await (supabase.from(t as any) as any).upsert(rows, { onConflict: "id" });
        if (error) errors.push(`${t}: ${error.message}`);
        else total += rows.length;
      }
      if (errors.length) toast.warning(`Restaurado com avisos (${total} registros). ${errors.length} tabela(s) falharam.`);
      else toast.success(`Restauração concluída. ${total} registros processados.`);
      qc.invalidateQueries();
      setImportFile(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generatePersonalBackup() {
    if (!userId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("profiles").select(PERSONAL_FIELDS.join(",")).eq("id", userId).maybeSingle();
      if (error) throw error;
      const meta = { kind: "personal", generated_at: new Date().toISOString(), version: 2 };
      const blob = new Blob([JSON.stringify({ meta, profile: data }, null, 2)], { type: "application/json" });
      triggerDownload(blob, `backup-pessoal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
      toast.success("Backup pessoal gerado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restorePersonalBackup() {
    if (!personalFile || !userId) return;
    if (!(await confirm({ title: "Restaurar configurações", description: "Restaurar suas configurações pessoais deste arquivo?", confirmText: "Restaurar" }))) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await personalFile.text());
      const p = parsed.profile ?? {};
      const patch: Record<string, unknown> = {};
      for (const f of PERSONAL_FIELDS) {
        if (f === "id" || f === "email") continue;
        if (p[f] !== undefined) patch[f] = p[f];
      }
      const { error } = await (supabase.from("profiles") as any).update(patch).eq("id", userId);
      if (error) throw error;
      toast.success("Configurações pessoais restauradas.");
      setPersonalFile(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-light">Backup e restauração</h1>
        <p className="text-sm text-muted-foreground">
          Exporte um arquivo único com todos os dados e configurações para segurança e para restauração futura.
        </p>
      </header>

      <Link
        to="/admin/restauracao"
        className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 hover:bg-primary/10 transition"
      >
        <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Documento de Restauração do Back-end</div>
          <div className="text-xs text-muted-foreground">
            Plano + SQL consolidado para recriar todo o back-end em um projeto Lovable novo.
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Link>


      {/* Backup pessoal */}
      <section className="rounded-2xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Meu backup pessoal</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Salva suas configurações pessoais (preferências, modelo de nota impressa, notificações).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={generatePersonalBackup} disabled={busy}>
            <Download className="h-4 w-4 mr-2" /> Baixar meu backup
          </Button>
          <Input type="file" accept="application/json" className="max-w-xs"
            onChange={(e) => setPersonalFile(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" onClick={restorePersonalBackup} disabled={busy || !personalFile}>
            <Upload className="h-4 w-4 mr-2" /> Restaurar
          </Button>
        </div>
      </section>

      {isAdmin ? (
        <>
          {/* Backup do consultório / laboratório */}
          <section className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Backup completo</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Inclui pacientes, casos, anexos, fluxo, estoque, equipe, catálogos e configurações. Recomendado antes de atualizações grandes.
            </p>
            <div>
              <Label htmlFor="notes">Observação (opcional)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: antes de atualização" />
            </div>
            <Button onClick={generateCompanyBackup} disabled={busy}>
              <Save className="h-4 w-4 mr-2" />
              {busy ? "Gerando..." : "Gerar e baixar backup completo"}
            </Button>
          </section>

          <section className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Restaurar a partir de arquivo</h2>
            </div>
            <Input type="file" accept="application/json"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <Button onClick={restoreCompanyBackup} disabled={busy || !importFile} variant="secondary">
              {busy ? "Restaurando..." : "Restaurar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Registros com o mesmo ID são atualizados; novos são inseridos. Registros existentes não presentes no backup permanecem.
            </p>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-medium mb-3">Histórico de backups</h2>
            <div className="divide-y text-sm">
              {backups.length === 0 && <div className="text-muted-foreground">Nenhum backup registrado ainda.</div>}
              {backups.map((b) => (
                <div key={b.id} className="py-2 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate">{b.file_name}</div>
                    {b.notes && <div className="text-xs text-muted-foreground truncate">{b.notes}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(b.created_at).toLocaleString("pt-BR")}
                    {b.file_size_bytes ? ` · ${(b.file_size_bytes / 1024).toFixed(1)} KB` : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border bg-muted/30 p-5 text-sm text-muted-foreground">
          O backup completo está disponível apenas para administradores (CEO/DR).
        </div>
      )}
    </div>
  );
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
