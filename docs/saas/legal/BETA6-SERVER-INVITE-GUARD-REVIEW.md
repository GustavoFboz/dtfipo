# DentalFlow beta 6/8 — servidor: convites, parada de novas compras e aceite jurídico por versão

**11/11/2026 — apenas PR para revisão; não ativado e não publicado.**

Esta migração prepara três controles no próprio PostgreSQL, evitando a falsa segurança de esconder o botão no React:

1. `company_invites_required=false` por padrão. Quando habilitado em **staging isolado após revisão**, INSERT em `public.clinics` só é aceito para usuário realmente autenticado, e-mail confirmado em `auth.users`, e entrada de convite de uso único previamente inserida pelo serviço confiável em `beta_company_invites` usando hash SHA-256 do e-mail normalizado. Convites expirados, reutilizados, desconhecidos, e-mail não confirmado ou owner_id divergente são recusados. Não se aceitam convites informados pelo navegador.
2. `new_checkout_intents_paused=false` por padrão. Quando habilitado, bloqueia **NOVOS INSERTs de checkout_intents** e, via RPC restrita `beta_assert_new_checkout_handoff_allowed()` e checagem na fronteira comum do servidor, também impede **novos handoffs ao Asaas com intents antigos**. Falha de banco/ausência da migração fecha o checkout (503). Atualizações de pagamentos e assinaturas existentes não são bloqueadas. **Não cancela cobranças já emitidas no Asaas**: URLs enviadas continuam potencialmente pagáveis e webhooks/renovações continuam processados.

3. `legal_acceptance_required=false` por padrão. Quando habilitado **após aprovação dos documentos e da implantação em QA**, o servidor exige, para o responsável autenticado da mesma empresa/checkout, recibos persistidos via RPC `record_saas_legal_acceptance` dos **Termos SaaS e DPA vigentes e publicados**. A verificação é feita por RPC só de `service_role` `beta_assert_checkout_legal_accepted` antes de entregar qualquer checkout novo ao Asaas. Minutas, documentos substituídos, recibos de outra empresa, ausência de tabelas/migrações ou erro na consulta são **negação**, nunca aceite automático. A versão de Privacidade serve para transparência, não substitui manifestação separada de ciência/consentimento e o aceite do DPA empresarial. **Não há geração ou aceite de documento em nome de cliente.**

## Operação segura

- A PR não faz deploy, roda PostgreSQL sintético e Vitest em CI, não envia arquivos clínicos nem usa chaves. A ordem correta de futuro deploy é migração de banco primeiro, depois servidor; se a RPC ainda estiver ausente, o checkout falha fechado.
- Nenhum flag deve ser ativado sem rollback e ensaio integrado em staging real. O trigger está inerte por padrão e não muda o comportamento atual quando as flags estão falsas.
- Convites devem ser emitidos por um canal administrativo seguro com autorização registrada e origem confirmada, **nunca por RPC pública**, e expirar em prazo curto. A tabela não expõe e-mails em claro, mas hashes de e-mail continuam dados pessoais pseudonimizados quando reidentificáveis; exigir proteção de acesso e retenção adequada.
- Ao ativar convites em staging, prever como emitir convite para um representante **antes de concluir o cadastro da empresa**; confirmação de e-mail no Auth deve ocorrer primeiro.
- Validar acesso de clínica já existente, profissional da mesma clínica, cadastro após confirmação de email, múltiplos cliques simultâneos, execução por service_role, casos órfãos, staging e restauração. O teste sintético cobre somente triggers e controles negativos. Não corresponde a E2E no Supabase real.
- O guard no servidor barra o novo handoff externo por ambos os transportes, inclusive de intenções antigas, quando o banco está pausado. **Não revoga links já emitidos pelo provedor** nem impede processamento de renovações existentes; essas ações exigem procedimento financeiro separado no Asaas. Revalidar durante atendimento, porque chamadas iniciadas antes do acionamento podem terminar em corrida.
- Não publicar textos jurídicos em minuta nem pedir CPF/chaves pelo GitHub ou chat. Manter etapa 6 `pending`, 4/8 e oito P0 bloqueados até QA, revisão jurídica, aprovação de negócio e implantação autorizada.

## Arquivos
- `supabase/migrations/20261111063000_beta_invite_sales_guard.sql` — revisão obrigatória antes de aplicar.
- `tests/beta6-invite-gate/fixture.sql` e `verify.sql` — SQL fictício, transacional, com controle da RPC e handoff de intents antigos.\n- `src/lib/billing/asaas-checkout.server.ts` — guarda antes de qualquer handoff em ambos os transportes.\n- `src/lib/billing/asaas-beta-sales-guard.server.test.ts` — testes sem Asaas, inclusive indisponibilidade de DB.
- `.github/workflows/saas-beta6-invite-guard.yml` — PostgreSQL 17 em contêiner descartável.

## Limites do aceite jurídico

O contrato proposto de tabelas de versões e recibos **ainda não está migrado na hospedagem**, e os documentos estão em minuta. O novo controle NÃO significa que os Termos foram exibidos antes do cadastro, nem comprova capacidade de representação, aviso de privacidade público, suporte efetivo ou revisão jurídica. Para liberar o beta, é indispensável: aprovar e publicar versões SHA-256, mostrar condições reais de preço/cancelamento e documentos antes da cobrança, obter aceites voluntários por representante, aplicar o esquema jurídico antes de ligar a flag, conferir caminhos de frontend/Web/Android/Windows, comprovar isolamento de duas empresas e ensaiar reversão. O servidor que contém a nova RPC deve ser implantado **somente depois das migrações**, caso contrário o checkout falhará fechado (503), preservando segurança mas bloqueando adesões.
