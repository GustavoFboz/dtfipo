# Etapa 05 — projeção do ciclo financeiro Asaas

Status: código integrado e publicado para teste na branch Lovable
`saas/stage-03-asaas-checkout` pelo [PR 72](https://github.com/GustavoFboz/dtfipo/pull/72);
migrations desta etapa aplicadas ao banco vivo e asserção somente leitura
aprovada. [Build](https://github.com/GustavoFboz/dtfipo/actions/runs/36296012530)
e [restauração](https://github.com/GustavoFboz/dtfipo/actions/runs/36296012513)
passaram. A PR 69 rumo à `main` permanece rascunho.
O primeiro ciclo pago no Sandbox passou em 28/09/2026; renovação, atraso,
estorno e cancelamento ainda não foram comprovados no provedor. Consulte
`evidence/SANDBOX-FIRST-PAID-CYCLE-2026-09-28.md`.

## Contrato implementado

| Evento recebido | Consulta atual | Efeito interno |
| --- | --- | --- |
| PAYMENT_CONFIRMED / PAYMENT_RECEIVED | GET /v3/payments/{id} e status pago | Primeira cobrança delegada à RPC da Etapa 04; demais ciclos atualizam uma única linha do ledger e estendem o período somente se empresa, valor, ambiente e sequência mensal conferirem. |
| PAYMENT_OVERDUE | Cobrança OVERDUE | Somente ciclo vencido e ainda não pago entra em past_due; sete dias de carência a partir do vencimento. |
| Carência encerrada | Nova consulta da cobrança vencida | OVERDUE confirmado suspende; cobrança já paga cria evento interno auditável e segue pelo mesmo fluxo de pagamento. |
| Webhook ausente | GET /v3/subscriptions/{id} e GET /v3/payments com filtro de assinatura e vencimento | Uma candidata por execução é verificada; pagamentos conhecidos e inativação geram eventos de recuperação na inbox. O worker reconcilia novamente cada recurso antes de qualquer efeito. |
| PAYMENT_REFUNDED | Cobrança REFUNDED | Revoga o período correspondente e recalcula o último período pago. Histórico financeiro e dados operacionais permanecem. |
| SUBSCRIPTION_INACTIVATED / SUBSCRIPTION_UPDATED | GET /v3/subscriptions/{id} | Se INACTIVE, cancela novas renovações mantendo período pago; ACTIVE apenas observa, sem conceder acesso. |

Cada mutação usa uma RPC privada com lease da inbox, IDs, cliente, ambiente,
assinatura, plano, preço e período reconciliados. Eventos duplicados são
idempotentes; eventos antigos, preço divergente e assinaturas sem vínculo ficam
para revisão. O cancelamento não altera o Asaas: projeta apenas a inativação
observada e validada. Não existe troca de plano automática nesta etapa.

## Replay de uma falha investigada

`POST /api/billing/asaas-replay` recebe um `evt_*`, uma referência do operador e
uma justificativa. Exige `BILLING_REPLAY_TOKEN` (32 caracteres ou mais),
independente do token do webhook e do agendador, somente no backend. A RPC
restrita a `service_role` só aceita um evento `dead_letter` do ambiente
configurado; uma transação grava `billing_event_replays` e volta o evento a
`received`. O corpo financeiro e o ID original não são modificados. Repetir
o pedido, processar um evento já concluído ou usar outro ambiente não enfileira
nada. O worker terá de consultar novamente o Asaas e validar todos os vínculos.

Antes do replay, investigue o código de erro e o recurso no Asaas. Não use
replay para forçar um chargeback, status desconhecido ou preço divergente a
conceder acesso. A rota é uma ferramenta privada de operação; a futura tela
Master exigirá identidade, reautenticação e autorização próprias.

## Limites explícitos

- PAYMENT_CHARGEBACK_REQUESTED, recebimento em espécie desfeito, estorno
  parcial e SUBSCRIPTION_DELETED ainda exigem revisão. O Asaas pode responder
  404 para uma assinatura excluída; não inferimos cancelamento somente do
  webhook. Esses eventos ficam na inbox, sem ser ignorados.
- O backend do worker está publicado para teste e o agendador de cinco minutos
  foi integrado à branch padrão do GitHub pelo
  [PR 74](https://github.com/GustavoFboz/dtfipo/pull/74). A chamada é ignorada
  sem `BILLING_WORKER_TOKEN` no GitHub; o mesmo segredo ainda precisa ser
  conferido no backend. Sem execução autorizada do worker, não há expiração
  automática da carência.
- A varredura busca no máximo uma assinatura por execução, com intervalo
  mínimo de uma hora por assinatura, limitada a contas criadas ou com período
  pago nos últimos 120 dias e cobranças com vencimento nos últimos 90 dias.
  Paginação adicional, status desconhecido, identidade divergente e assinatura
  excluída exigem revisão manual (HTTP 503 do worker); nenhuma cobrança é
  criada e nenhum acesso é concedido pela varredura. Eventos recuperados usam
  IDs sintéticos distintos dos `evt_*` recebidos do Asaas e são deduplicados
  na inbox. Casos antigos e falhas contínuas precisam de operação assistida.
  A recuperação específica de um webhook perdido ainda não foi exercitada no
  Asaas Sandbox.
- Reativação após cancelamento depende de novo ciclo de contratação; o código
  somente reativa atraso e suspensão pela cobrança verificada.

## Verificação e reversão

npm run check:saas:stage-05, os testes do worker, npx tsc --noEmit,
npm run build e a CI de restauração exercitam contrato, concessão, carência,
reembolso e cancelamento em banco descartável. A asserção
sql/stage-05-restore-assertions.sql é somente leitura e pode ser executada
no banco vivo depois da aplicação.

Para interromper o processamento, desabilite o webhook Sandbox e o agendador.
Preserve inbox, ledger e IDs externos para replay auditado; não apague
pagamentos nem reduza o banco de dados do cliente. A PR 69 permanece rascunho
para a liberação na `main` até concluir as pendências de homologação.
