# Contrato de eventos e estados Asaas

Status: congelado para implementação nas Etapas 02–05

Versão: 1 — 2026-09-19

## Princípios vinculantes

- Todo evento é persistido antes da resposta `HTTP 2xx` e deduplicado por
  `(provider, provider_environment, provider_event_id)`.
- O header `asaas-access-token` autentica a entrega, mas não prova que aquela
  cobrança pertence a uma assinatura DentalFlow. Cliente, assinatura,
  ambiente, valor, moeda e período ainda precisam ser correlacionados.
- Redirect, abertura de fatura, criação de cliente e criação de assinatura não
  liberam acesso.
- Evento desconhecido é armazenado sem derrubar a fila e segue para revisão;
  ele nunca concede acesso por padrão.
- Eventos antigos ou fora de ordem não podem regredir um estado já conciliado.
  Em caso de ambiguidade, o processador consulta o recurso atual no Asaas.

O Asaas separa o ciclo da assinatura do ciclo financeiro de cada cobrança. A
criação da assinatura gera cobranças ao longo do tempo e não comprova
recebimento: <https://docs.asaas.com/docs/assinaturas>.

## Eventos de cobrança

| Efeito DentalFlow | Eventos Asaas | Regra |
| --- | --- | --- |
| `pending` | `PAYMENT_CREATED`, `PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`, `PAYMENT_AUTHORIZED`, `PAYMENT_UPDATED`, `PAYMENT_RESTORED` | Atualiza o ledger; não concede acesso. |
| `paid` | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_ANTICIPATED` | Após correlação, marca a cobrança paga e ativa o período contratado. `CONFIRMED` vale como pagamento concluído; esperar `RECEIVED` bloquearia cartão durante a liquidação. |
| `past_due` | `PAYMENT_OVERDUE` | Coloca a assinatura corrente em atraso/carência somente se a cobrança corresponder ao ciclo devido e não houver substituta paga. |
| `failed` | `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_DELETED`, `PAYMENT_BANK_SLIP_CANCELLED` | Registra falha/cancelamento da cobrança; não apaga assinatura nem dados. |
| `reversed` | `PAYMENT_REFUNDED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`, `PAYMENT_CHARGEBACK_REQUESTED` | Revoga a autoridade do pagamento e inicia suspensão/reconciliação conforme o período afetado. Chargeback é risco imediato. |
| revisão manual | reembolso em andamento/parcial/negado, disputa ou reversão de chargeback e divergências de split | Preserva o último estado confirmado até consulta da API e decisão auditada. |
| informativo | visualização, negativação e demais eventos sem mudança financeira | Persiste para auditoria; não altera entitlement. |

A lista oficial e os fluxos por boleto, Pix e cartão estão em
<https://docs.asaas.com/docs/payment-events>. Em especial, cartão pode passar
por `PAYMENT_CONFIRMED` muito antes de `PAYMENT_RECEIVED`; por isso ambos são
efeitos pagos, sempre com idempotência e correlação.

## Eventos de assinatura

| Evento Asaas | Efeito interno |
| --- | --- |
| `SUBSCRIPTION_CREATED` | Vincular ID e observar; nunca ativar por criação. |
| `SUBSCRIPTION_UPDATED` | Reconciliar ciclo, valor e forma de pagamento. |
| `SUBSCRIPTION_INACTIVATED` | Projetar cancelamento, preservando o período já pago. |
| `SUBSCRIPTION_DELETED` | Projetar cancelamento e bloquear novas renovações. |
| eventos de split | Revisão/reconciliação; sem concessão automática de acesso. |

Referência oficial: <https://docs.asaas.com/docs/subscription-events>.

## Projeção de acesso

1. `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` válido cria/atualiza
   `billing_payments=paid` e leva a assinatura a `active` até
   `current_period_end`.
2. PAYMENT_OVERDUE do ciclo corrente leva a past_due e define grace_until
   como sete dias após o vencimento; durante a carência o acesso continua
   completo. A suspensão exige nova consulta ao Asaas.
3. Fim da carência sem regularização leva a `suspended`; a área de cobrança
   permanece disponível.
4. Cancelamento mantém acesso somente até o fim do período já pago.
5. Reembolso integral ou chargeback invalida o pagamento correspondente e
   exige recalcular o período; dados nunca são excluídos.
6. Pagamento posterior ao atraso reativa de forma idempotente e invalida os
   snapshots locais da Web, Windows e Android.

O objeto de cobrança de assinatura possui o campo `subscription`; esse vínculo,
somado ao cliente e ao ambiente, é obrigatório para aceitar o evento.
