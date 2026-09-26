# Etapa 05 — projeção do ciclo financeiro Asaas

Status: código isolado na branch saas/stage-05-lifecycle. Migration ainda não
aplicada ao banco vivo; sem homologação de cobranças reais Sandbox.

## Contrato implementado

| Evento recebido | Consulta atual | Efeito interno |
| --- | --- | --- |
| PAYMENT_CONFIRMED / PAYMENT_RECEIVED | GET /v3/payments/{id} e status pago | Primeira cobrança delegada à RPC da Etapa 04; demais ciclos atualizam uma única linha do ledger e estendem o período somente se empresa, valor, ambiente e sequência mensal conferirem. |
| PAYMENT_OVERDUE | Cobrança OVERDUE | Somente ciclo vencido e ainda não pago entra em past_due; sete dias de carência a partir do vencimento. |
| Carência encerrada | Nova consulta da cobrança vencida | OVERDUE confirmado suspende; cobrança já paga cria evento interno auditável e segue pelo mesmo fluxo de pagamento. |
| PAYMENT_REFUNDED | Cobrança REFUNDED | Revoga o período correspondente e recalcula o último período pago. Histórico financeiro e dados operacionais permanecem. |
| SUBSCRIPTION_INACTIVATED / SUBSCRIPTION_UPDATED | GET /v3/subscriptions/{id} | Se INACTIVE, cancela novas renovações mantendo período pago; ACTIVE apenas observa, sem conceder acesso. |

Cada mutação usa uma RPC privada com lease da inbox, IDs, cliente, ambiente,
assinatura, plano, preço e período reconciliados. Eventos duplicados são
idempotentes; eventos antigos, preço divergente e assinaturas sem vínculo ficam
para revisão. O cancelamento não altera o Asaas: projeta apenas a inativação
observada e validada. Não existe troca de plano automática nesta etapa.

## Limites explícitos

- PAYMENT_CHARGEBACK_REQUESTED, recebimento em espécie desfeito, estorno
  parcial e SUBSCRIPTION_DELETED ainda exigem revisão. O Asaas pode responder
  404 para uma assinatura excluída; não inferimos cancelamento somente do
  webhook. Esses eventos ficam na inbox, sem ser ignorados.
- O agendador de cinco minutos existe no repositório, mas depende do merge,
  deploy do backend e configuração do segredo BILLING_WORKER_TOKEN nos dois
  destinos. Sem o agendador, não há expiração automática da carência.
- A varredura atual reconcilia o pagamento que entrou em carência. Uma
  varredura mais ampla para webhooks totalmente perdidos e replay administrativo
  ainda é necessária antes do Beta. Não há evidência real no Asaas Sandbox.
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
pagamentos nem reduza o banco de dados do cliente. A Etapa 05 permanece PR
rascunho até concluir as pendências de homologação.
