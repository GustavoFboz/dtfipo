# Etapa 07 — administração Master

Status: implementação preparada; a ativação depende de migração e atribuição
explícita de um usuário verificado. Nenhum CEO, admin de empresa ou perfil IPO
ganha permissão de plataforma automaticamente.

## Entrega

- `platform_operators` é uma lista privada de usuários da plataforma, separada
  dos papéis de empresas. A migração não cadastra ninguém.
- `/master` mostra até 50 empresas por busca, situação de assinatura, pagamentos
  recentes e saúde da fila. A função SQL exige operador habilitado; não expõe
  payloads de webhook, documentos fiscais ou dados clínicos.
- Um replay exige segundo fator (`aal2`), justificativa de 16 a 300 caracteres
  e estado `dead_letter`. A ação grava `platform_operator_audit` e
  `billing_event_replays` na mesma transação e entrega o evento ao worker já
  existente. O replay não ativa a assinatura por si.
- Nenhuma alteração manual de entitlement, preço ou pagamento é oferecida.

## Implantação e prova

1. Na branch isolada, executar `npm run check:saas:stage-06`, `npm run build`,
   `./node_modules/.bin/tsc --noEmit` e a restauração limpa do CI com
   `docs/saas/sql/stage-07-master-rehearsal.sql`.
2. Aplicar a migration no banco ativo após CI, verificar as funções e grants.
3. Identificar o `auth.users.id` do operador real e seu segundo fator. Só então
   uma operação administrativa com `service_role` deve cadastrá-lo, registrando
   quem autorizou em `enrolled_by`; conferir acesso e negativa de outro usuário.
4. Repetir um replay real apenas depois de revisar o evento no Asaas Sandbox.

## Aceite, risco e reversão

Aceite técnico: restauração limpa, proibição de leitura para não operador,
negação de replay em `aal1`, replay auditado em `aal2`, build e tipos. Aceite
operacional: operador identificado, MFA ativo e painel conferido no aplicativo.
Monitorar eventos `dead_letter`, fila e o audit log. Revogar um operador com
`enabled=false`; em incidente, bloquear a rota e a concessão de execução das
duas funções. Não excluir linhas de auditoria nem reverter um pagamento.
