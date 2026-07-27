import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download, FileText, Database, Copy, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/restauracao")({
  component: RestauracaoPage,
});

const LOVABLE_PROMPT = `Preciso restaurar TODO o back-end deste sistema em um novo projeto Lovable.
O front-end já está completo neste projeto. Faça o seguinte, em ordem:

1. Ative o Lovable Cloud (Supabase gerenciado).
2. Baixe o arquivo público /restore/backend-restore.sql (consolidado de TODAS as migrations)
   ou os arquivos individuais listados em /restore/migrations.json (pasta /restore/migrations/).
3. Execute a migration consolidada como UMA ÚNICA migration no Lovable Cloud
   (ou execute cada arquivo individual em ordem alfabética — o nome já é cronológico).
4. IMPORTANTE: o ÚLTIMO arquivo (\`20260718000000_zzz_post_restore_hardening.sql\`)
   é uma migration de "endurecimento" idempotente que corrige lacunas conhecidas
   do restore (GRANTs em tabelas/sequences public, EXECUTE em todas as funções
   public, colunas que ficaram para trás — stages.requires_implant_components,
   cases.gum_info / implant_system_ids / tooth_implant_systems,
   profiles.print_note_template, clinics.kind/owner_id/invite_code —,
   valores do enum stock_movement_type — implant_usage, tooth_usage,
   auto_rule e reversos — e buckets de Storage case-files / patient-files /
   patient-photos com políticas para authenticated). NÃO PULE este arquivo,
   mesmo que o schema pareça completo, senão o app quebra em runtime com
   "permission denied" e "bucket not found".
5. Configure Auth: providers Email + Google. Não habilite signup anônimo.
   Não force confirmação de e-mail sem eu pedir.
6. Rode a linter do Supabase e corrija warnings relacionados às migrations.
7. Após a criação, insira os seed rows essenciais:
   - beta_testers: gustavovitorfa@gmail.com (active = true)
   - stage_return_reasons: 'Ajuste'
   - phases/stages padrão via SELECT public.seed_default_workflow()
     (execute depois de criar o primeiro usuário CEO).
8. NÃO recrie triggers ou schemas auth/storage/realtime — são gerenciados pelo Supabase.
9. Ao finalizar, faça um smoke test COMPLETO:
   - Signup + login (Email e Google).
   - Criar empresa via RPC create_company_account (CEO recebe invite_code).
   - Aplicar fluxo padrão em Fluxo (seed_default_workflow) e conferir que as
     9 etapas aparecem na UI (se aparecer vazio → falta GRANT EXECUTE em is_staff).
   - Criar paciente, criar caso (com gum_info preenchido), anexar arquivo
     (bucket case-files precisa existir), avançar workflow.
   - Cadastrar um sistema de implante e usar em um dente (testa enum
     stock_movement_type=implant_usage).

Se algo falhar, mostre o erro exato e proponha correção antes de prosseguir.

Erros comuns e como corrigir (todos já cobertos pelo hardening final, mas
úteis para diagnóstico manual):
  - "permission denied for table X" → faltou GRANT ... TO authenticated.
  - Etapas do fluxo não aparecem após seed → faltou GRANT EXECUTE em is_staff.
  - "Could not find the 'gum_info' column" → coluna não aplicada em cases.
  - "Bucket not found" ao anexar arquivo → buckets case-files/patient-files
    ausentes ou sem policies.
  - "invalid input value for enum stock_movement_type" → falta valor no enum.`;

function RestauracaoPage() {
  const [busy, setBusy] = useState(false);
  const [migs, setMigs] = useState<string[]>([]);

  useEffect(() => {
    fetch("/restore/migrations.json")
      .then((r) => r.json())
      .then(setMigs)
      .catch(() => toast.error("Não foi possível carregar índice de migrations"));
  }, []);

  async function downloadConsolidatedSQL() {
    setBusy(true);
    try {
      const parts: string[] = [
        `-- ============================================================\n`,
        `-- BACK-END RESTORE — SQL CONSOLIDADO\n`,
        `-- Gerado em: ${new Date().toISOString()}\n`,
        `-- Total de migrations: ${migs.length}\n`,
        `-- Ordem: cronológica (nome do arquivo)\n`,
        `-- Execute inteiro em UMA migration no Lovable Cloud.\n`,
        `-- ============================================================\n\n`,
      ];
      for (const name of migs) {
        const sql = await fetch(`/restore/migrations/${name}`).then((r) => r.text());
        parts.push(`\n\n-- >>>>> ${name} >>>>>\n\n${sql}\n-- <<<<< ${name} <<<<<\n`);
      }
      const blob = new Blob(parts, { type: "text/plain;charset=utf-8" });
      triggerDownload(blob, "backend-restore.sql");
      toast.success("SQL consolidado baixado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar SQL");
    } finally {
      setBusy(false);
    }
  }

  function downloadPlanMD() {
    const md = buildPlanMarkdown(migs);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    triggerDownload(blob, "PLANO-RESTAURACAO-BACKEND.md");
  }

  function copyPrompt() {
    navigator.clipboard.writeText(LOVABLE_PROMPT);
    toast.success("Prompt copiado — cole no chat do novo projeto Lovable");
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-xs uppercase tracking-wider font-medium">Recuperação de desastre</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">Documento de Restauração do Back-end</h1>
        <p className="text-sm text-muted-foreground">
          Plano oficial para recriar 100% do back-end em um projeto Lovable novo,
          quando apenas o front-end estiver disponível.
        </p>
      </header>

      <Card className="p-4 md:p-6 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Como usar</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
          <li>Baixe o <strong>SQL consolidado</strong> e o <strong>plano em Markdown</strong> abaixo — guarde fora do sistema (Drive, e-mail, GitHub privado).</li>
          <li>Em caso de perda total, crie um projeto Lovable novo com este mesmo front-end.</li>
          <li>Ative o Lovable Cloud no projeto novo.</li>
          <li>Cole o <strong>prompt de restauração</strong> no chat do Lovable — ele executará todo o plano.</li>
          <li>Faça o smoke test no final (login → criar clínica → criar caso).</li>
        </ol>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Button size="lg" onClick={downloadConsolidatedSQL} disabled={busy || migs.length === 0}>
          <Database className="h-4 w-4 mr-2" />
          {busy ? "Gerando..." : `SQL consolidado (${migs.length})`}
        </Button>
        <Button size="lg" variant="secondary" onClick={downloadPlanMD} disabled={migs.length === 0}>
          <FileText className="h-4 w-4 mr-2" />
          Plano de restauração (.md)
        </Button>
        <Button size="lg" variant="outline" onClick={copyPrompt}>
          <Copy className="h-4 w-4 mr-2" />
          Copiar prompt Lovable
        </Button>
      </div>

      <Card className="p-4 md:p-6 space-y-3">
        <h2 className="font-semibold">Prompt para o novo projeto Lovable</h2>
        <p className="text-xs text-muted-foreground">
          Cole isto no chat do Lovable do <em>novo</em> projeto (após subir o front-end e ativar o Cloud).
        </p>
        <Textarea readOnly value={LOVABLE_PROMPT} className="min-h-[280px] font-mono text-xs" />
        <Button onClick={copyPrompt} variant="outline" size="sm"><Copy className="h-4 w-4 mr-2" /> Copiar</Button>
      </Card>

      <Card className="p-4 md:p-6 space-y-3">
        <h2 className="font-semibold">Escopo do back-end</h2>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li><strong>{migs.length} migrations</strong> cronológicas em <code>/restore/migrations/</code>.</li>
          <li>~60 tabelas no schema <code>public</code> (casos, pacientes, financeiro, estoque, workflow, permissões).</li>
          <li>Funções SECURITY DEFINER (workflow, financeiro, estoque, permissões, beta testers).</li>
          <li>Triggers de <code>updated_at</code>, sync de perfil→equipe, movimentações de estoque/carteira.</li>
          <li>RLS + GRANTs em todas as tabelas <code>public</code>.</li>
          <li>Programa Beta Tester (email <code>gustavovitorfa@gmail.com</code>).</li>
        </ul>
      </Card>

      <Card className="p-4 md:p-6 space-y-2">
        <h2 className="font-semibold">O que NÃO é restaurado por este plano</h2>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li><strong>Dados operacionais</strong> (pacientes, casos, movimentações). Para isso use o <em>Admin › Backup</em>.</li>
          <li>Arquivos em Storage (anexos, modelos 3D) — export/import manual.</li>
          <li>Contas de usuário em <code>auth.users</code> — precisam ser recadastradas ou importadas.</li>
          <li>Secrets do projeto — reconfigurar via painel de secrets.</li>
        </ul>
      </Card>

      <p className="text-xs text-muted-foreground">
        Atualize este documento sempre que criar novas migrations. O SQL consolidado é
        gerado em tempo real a partir dos arquivos servidos em <code>/restore/</code>.
      </p>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildPlanMarkdown(migs: string[]) {
  return `# Plano de Restauração do Back-end

Data de geração: ${new Date().toISOString()}
Total de migrations: **${migs.length}**

## Cenário
Perda total do back-end (Lovable Cloud / Supabase gerenciado). O front-end deste
projeto continua disponível em código-fonte / GitHub.

## Passo a passo

1. **Criar novo projeto Lovable** com o mesmo repositório de front-end.
2. **Ativar Lovable Cloud** (Cloud → Enable).
3. Abrir esta página no projeto antigo (se ainda disponível) OU usar os arquivos
   \`backend-restore.sql\` e \`migrations/\` guardados no backup externo.
4. No chat do Lovable do novo projeto, colar o **prompt de restauração**
   (\`Admin › Restauração › Copiar prompt Lovable\`).
5. Aguardar o agente executar a migration consolidada. Aprovar a migration quando solicitado.
6. Após o schema estar criado:
   - Configurar Auth (Email + Google).
   - Cadastrar o primeiro usuário CEO via signup normal.
   - Rodar \`SELECT public.create_company_account('Minha Empresa','laboratorio','Nome CEO');\`
   - Rodar \`SELECT public.seed_default_workflow();\`
   - Inserir seed do beta tester (\`gustavovitorfa@gmail.com\`).
7. Restaurar dados operacionais via **Admin › Backup › Importar** (arquivo JSON).
8. Reenviar arquivos de Storage manualmente.
9. Reconfigurar Secrets do projeto (Stripe, etc, se aplicável).

## Ordem cronológica das migrations

${migs.map((m, i) => `${i + 1}. \`${m}\``).join("\n")}

## Prompt para o Lovable

\`\`\`
${LOVABLE_PROMPT}
\`\`\`

## Verificação pós-restauração

- [ ] Login funciona (Email + Google).
- [ ] \`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'\` retorna ~60.
- [ ] RLS ativa em todas as tabelas: \`SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;\` deve retornar vazio.
- [ ] Criar caso e avançar workflow sem erros.
- [ ] Beta tester tem acesso ao módulo Financeiro.
`;
}
