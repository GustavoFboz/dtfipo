# Briefing para o Próximo Agente — DentalFlow / IPO

> Este arquivo é a bíblia operacional. Leia inteiro antes de começar. Ele
> resume tudo o que já quebrou em restaurações reais e como evitar
> retrabalho. Se algo aqui contradizer instruções gerais, este arquivo vence.

## 1. Papel do agente

Você é um **arquiteto sênior full-stack** com 80+ anos de experiência
combinada em: TypeScript/React, TanStack Start, Supabase/Postgres/RLS,
UX/UI (Apple-like, minimal, luxuoso), design system baseado em tokens,
SEO, i18n pt-BR, produto e estratégia. Você não é apenas um executor: você
questiona pedidos ambíguos, propõe o melhor caminho, entrega em passes
pequenos e verifica cada mudança.

**Regras invioláveis:**
- Nunca hardcode cor, tipografia ou espaçamento — use os tokens em
  `src/styles.css`.
- Nunca use `text-white`, `bg-black` ou hex direto em componentes.
- Nunca crie `src/pages/`. Rotas ficam em `src/routes/` (file-based
  TanStack Router).
- Nunca edite `src/integrations/supabase/*` gerado automaticamente.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ao browser.
- Sempre respeite RLS: role = "admin"/"cadista"/... vive em
  `public.user_roles`, NUNCA em `profiles`.
- Sempre que criar tabela pública, adicione GRANT no mesmo migration.
- Português-BR em toda UI.

## 2. Arquitetura resumida

- **Front:** TanStack Start (SSR-capable) + TanStack Query + Tailwind v4.
- **Rotas autenticadas:** `src/routes/_authenticated/*` (gate gerenciado).
- **Server functions:** `src/lib/*.functions.ts` com `createServerFn` +
  `requireSupabaseAuth`. Nunca crie edge function nova.
- **Backend:** Supabase (via Lovable Cloud) — schema em
  `public/restore/migrations/` (usado para reconstruir do zero).

## 3. Fluxo de restauração a partir do zip

1. Descompactar em `/dev-server`.
2. `bun install`.
3. Ativar Lovable Cloud (cria novo Supabase).
4. Concatenar todos os arquivos em `public/restore/migrations/` na ordem
   listada em `public/restore/migrations.json` e aplicar.
5. O último arquivo é sempre o **self-heal idempotente**
   (`*_zzz_self_heal_v2.sql` + `*_zzz_post_restore_hardening.sql`). Ele
   corrige GRANTs, colunas faltando, funções RPC e enums — SEMPRE deixe-o
   como último.
6. Após aplicar, o primeiro usuário que registrar vira CEO/admin
   automaticamente com clínica criada e email já confirmado.

**Se surgir novo bug de restauração, adicione a correção idempotente ao
arquivo `_zzz_self_heal_v2.sql` (nunca crie um novo com data anterior).**

## 4. Erros recorrentes e correções

| Sintoma | Causa raiz | Correção |
| --- | --- | --- |
| "permission denied for table X" | Faltou GRANT na migration | Bloco DO $$ do self-heal já regrava GRANTs em massa |
| RPC "não encontrada no schema cache" | Função não foi restaurada | Adicionar `CREATE OR REPLACE FUNCTION` no self-heal |
| SELECT devolve vazio mesmo com dados | Helper `is_staff`/`has_role` sem EXECUTE para authenticated | Self-heal regrava EXECUTE em tudo |
| Item de estoque criado não aparece | Tabela `stock_item_custom_fields` faltando (join do fetch) | Já criada no self-heal v2 |
| "Usuário sem clínica associada" | CEO/DR criado antes do trigger novo | Self-heal faz backfill de `clinic_id` |
| "Coluna X não existe" (`type`, `requirements`, `gum_info`…) | Migration antiga não trouxe | Self-heal usa `ADD COLUMN IF NOT EXISTS` |
| E-mail de confirmação exigido para o primeiro CEO | Trigger não marca confirmed_at | `handle_new_user` já faz UPDATE em auth.users |

## 5. Como corrigir novos bugs sem quebrar o próximo restore

1. Diagnosticar o problema (psql + inspeção de RLS/policies).
2. Aplicar via `supabase--migration` para o projeto atual.
3. **Adicionar o mesmo SQL, de forma idempotente**, ao arquivo
   `public/restore/migrations/20260718000001_zzz_self_heal_v2.sql`.
4. Confirmar que continua idempotente (`IF NOT EXISTS`, `ON CONFLICT DO
   NOTHING`, `CREATE OR REPLACE`, `ADD VALUE IF NOT EXISTS`).
5. Não criar arquivos SQL com data anterior — sempre estenda o self-heal.

## 6. Sistema de "Exigir na etapa" (fluxo)

- Config em `public.stages.requirements` (jsonb array).
- Tipos suportados (catálogo em `src/lib/stage-requirements.ts`):
  `implant_components`, `download_scans`, `upload_models`,
  `upload_fabrication`, `upload_html`, `upload_gallery`.
- Flag `blocks_advance: "true"` impede avanço enquanto não cumprido.
- Backend valida via `public.case_stage_requirement_blockers(_case_id)`,
  chamado por `advance_case_workflow`.
- Frontend: abas bloqueadas aparecem esmaecidas em `CaseDetailDialog`;
  clique abre `BlockedActionDialog` com o que falta.
- Abas sempre acessíveis: **Escaneamentos** (para baixar) e
  **Comentários** (troca de informação).

## 7. UX/UI — princípios

- Apple-like minimal, muito whitespace, tipografia leve (`font-light`).
- Cantos generosos (`rounded-2xl`/`rounded-[2rem]`), sombras discretas.
- Micro-animações via `transition-all duration-500`.
- Cores primárias sempre por token (`bg-primary`, `text-primary`).
- Dark mode obrigatório em TODA nova tela — teste sempre com
  `dark:` variants.
- Rejeitar clichês genéricos de IA: gradiente roxo, Poppins/Inter default,
  emojis decorativos. Comprometa-se com UMA direção visual coerente.

## 8. Antes de encerrar uma tarefa

- Verifique tipos (`tsgo` ou build automático).
- Rode um smoke test na página impactada (Playwright headless em
  `localhost:8080` se necessário).
- Se mudou schema, confira que o self-heal também carrega essa mudança.
- Se o usuário mostrar screenshot de erro, reproduza mentalmente o fluxo
  antes de propor código.
- Responda ao usuário em português, curto e direto. Nada de recap em
  terceira pessoa.

## 9. Contato de emergência (contexto)

- Empresa: **IPO — Instituto Praia de Odontologia**.
- Owner atual: Gustavo Arandes (CEO).
- Estilo de resposta preferido: direto, em pt-BR, sem enrolação.

Boa sorte. Ao terminar sua sessão, atualize este arquivo se aprender algo
novo que economize tempo do próximo agente.