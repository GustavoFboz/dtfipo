# DentalFlow beta 6/8 — servidor: convites e bloqueio parcial de checkouts

**11/11/2026 — apenas PR para revisão; não ativado e não publicado.**

Esta migração prepara dois controles no próprio PostgreSQL, evitando a falsa segurança de esconder o botão no React:

1. `company_invites_required=false` por padrão. Quando habilitado em **staging isolado após revisão**, INSERT em `public.clinics` só é aceito para usuário realmente autenticado, e-mail confirmado em `auth.users`, e entrada de convite de uso único previamente inserida pelo serviço confiável em `beta_company_invites` usando hash SHA-256 do e-mail normalizado. Convites expirados, reutilizados, desconhecidos, e-mail não confirmado ou owner_id divergente são recusados. Não se aceitam convites informados pelo navegador.
2. `new_checkout_intents_paused=false` por padrão. Quando habilitado, bloqueia **somente NOVOS INSERTs de checkout_intents**. Atualizações de pagamentos e assinaturas existentes não são bloqueadas. **Não é o interruptor comercial completo**: links de pagamento e intenções já emitidas poderão continuar no Asaas; para a etapa 6/8, ainda é necessário travar o handoff do provedor e testar cancelamento, reembolso e cobranças já criadas.

## Operação segura

- A PR não faz deploy, roda apenas PostgreSQL sintético em CI, não envia arquivos clínicos nem usa chaves.
- Nenhum flag deve ser ativado sem rollback e ensaio integrado em staging real. O trigger está inerte por padrão e não muda o comportamento atual quando as flags estão falsas.
- Convites devem ser emitidos por um canal administrativo seguro com autorização registrada e origem confirmada, **nunca por RPC pública**, e expirar em prazo curto. A tabela não expõe e-mails em claro, mas hashes de e-mail continuam dados pessoais pseudonimizados quando reidentificáveis; exigir proteção de acesso e retenção adequada.
- Ao ativar convites em staging, prever como emitir convite para um representante **antes de concluir o cadastro da empresa**; confirmação de e-mail no Auth deve ocorrer primeiro.
- Validar acesso de clínica já existente, profissional da mesma clínica, cadastro após confirmação de email, múltiplos cliques simultâneos, execução por service_role, casos órfãos, staging e restauração. O teste sintético cobre somente triggers e controles negativos. Não corresponde a E2E no Supabase real.
- Para parar todas as vendas, bloquear *também* a criação do checkout externo no servidor, inclusive para intenções já existentes, de maneira independente de uma flag de UI.
- Não publicar textos jurídicos em minuta nem pedir CPF/chaves pelo GitHub ou chat. Manter etapa 6 `pending`, 4/8 e oito P0 bloqueados até QA, revisão jurídica, aprovação de negócio e implantação autorizada.

## Arquivos
- `supabase/migrations/20261111063000_beta_invite_sales_guard.sql` — revisão obrigatória antes de aplicar.
- `tests/beta6-invite-gate/fixture.sql` e `verify.sql` — SQL fictício, transacional.
- `.github/workflows/saas-beta6-invite-guard.yml` — PostgreSQL 17 em contêiner descartável.
