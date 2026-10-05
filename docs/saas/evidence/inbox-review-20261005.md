# Revisão pontual dos eventos Asaas — 05/10/2026

Leitura autenticada de Sandbox, sem replay ou escrita financeira.
[PR 140](https://github.com/GustavoFboz/dtfipo/pull/140) introduziu o diagnóstico
privado, limitado a dois eventos antigos e dois recursos do provedor.
[PR 141](https://github.com/GustavoFboz/dtfipo/pull/141) acrescentou projeções
validadas de valor, vencimento e vínculo, distinguindo ausência explícita de
campo omitido. Omissão não é prova de cobrança avulsa.

## Validação e publicação

PR 140: CI 37370568825 e restore 37370568993 concluídos com sucesso;
merge bde682e2cfe1b431c239a34f836ba73e0c013e1e.
PR 141: CI 37378984427, restores 37378984384/37378988180 concluídos com sucesso;
merge 178041cf91b5420c236235ff4b9d82fbc01a8290.
Validação local da revisão final: 267 testes em 14 arquivos, TypeScript,
build, etapas 06/09 e bootstrap Desktop passaram.

A publicação foi solicitada somente após confirmar o commit sincronizado.
Deployment 87c37860-ba16-4252-9703-2e994c670e4e retornou pending; o GET real
privado posterior, request 29, confirmou a projeção atual em
2026-10-05T22:16:51.597Z (18h16 de Manaus), HTTP 200, sem timeout.
Isso comprova a revisão servida, independentemente do recibo inicial pending.

## Resultado por evento

| Evento local | Tipo | Cobrança no provedor | Estado atual | Valor/vencimento |
| --- | --- | --- | --- | --- |
| 9ad8482e-eb0f-48fd-9ea5-aee5c4b776c2 | PAYMENT_OVERDUE | pay_w9733yh2mprx2169 | RECEIVED | 500 centavos; 2026-09-29 |
| ea41bc68-e051-4e52-b547-af2ac70e50a4 | PAYMENT_RECEIVED | pay_w9733yh2mprx2169 | RECEIVED | 500 centavos; 2026-09-29 |

Os dois GETs responderam HTTP 200 e `deleted=false`. Cada evento conserva
seis tentativas e o erro histórico `PROVIDER_RECONCILIATION_FAILED`.
O sucesso atual não determina a causa de transporte daquela falha histórica.
O evento OVERDUE é um estado anterior, não comprova inadimplência atual.

O provedor omitiu o campo de assinatura: `provider_subscription_link=not_reported`.
Os snapshots locais não têm customerId, subscriptionId ou externalReference,
e nenhuma linha do ledger local corresponde a essa cobrança. Os comparadores
de snapshot são null, não true. Não está comprovado contrato, titularidade,
valor contratado ou período. Os R$5 Sandbox não são o recebimento real de R$1
previsto para a liberação de Produção.

## Decisão e próximo aceite

Manter os dois eventos em revisão individual; `requires_manual_review=true`.
Não atribuir a cobrança a uma empresa por semelhança nem creditar acesso.
Identificar o contexto original da cobrança e conferir a associação ao
contrato antes de qualquer decisão. Replay, se aplicável, exige seu fluxo
Master/AAL2, justificativa e auditoria; não foi executado nesta revisão.
**Item 1.1 permanece parcial.** A consulta do provedor foi comprovada; a
reconciliação individual e a decisão final ainda não foram comprovadas.

[Projeções sanitizadas](inbox-review-20261005.json) preservam a resposta real
e a conferência do ledger/snapshots, sem dados fiscais, cliente, URLs ou secrets.
