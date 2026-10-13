# Retomada SaaS/Asaas — etapa 05/09

## Leitura do ambiente ativo

Consulta somente leitura em 03/10/2026, às 10:38 UTC:

| Item | Resultado |
| --- | --- |
| Empresa Inicial, novas contratações | 100 centavos/mês |
| Contrato Sandbox já existente | 24.900 centavos/mês, preservado |
| Assinatura Sandbox | Ativa até 29/11/2026 |
| Ledger pago | Dois pagamentos |
| Fila financeira | Cinco eventos processados e dois dead letters |
| Master | Zero operadores cadastrados |

Uma segunda consulta confirmou que os dois dead letters são da mesma
cobrança, ausente do ledger local. Seus payloads salvos contêm somente o
identificador da cobrança, sem vínculo de assinatura. Esse formato também
aparece em eventos pagos já processados; a ausência do vínculo no payload
salvo **não comprova** que a cobrança seja avulsa. Somente a consulta
autoritativa do recurso no Asaas pode esclarecer isso.

Os eventos são `PAYMENT_OVERDUE` e `PAYMENT_RECEIVED`, com seis tentativas
e `PROVIDER_RECONCILIATION_FAILED`. Esse código foi gravado antes da melhoria
de diagnóstico da PR #107. Nenhum desses eventos foi reprocessado nesta
retomada, e nenhum estado financeiro foi alterado pela consulta.

## Correção implementada

- Um aviso antigo de atraso, quando o Asaas já mostra pagamento, cria ou
  reutiliza o evento de recuperação do pagamento atual antes de encerrar
  o aviso antigo. Uma confirmação antiga, quando o Asaas já mostra estorno
  completo, segue o mesmo fluxo para o estorno.
- O evento recuperado passa novamente pelo GET Asaas e pela RPC existente,
  incluindo empresa, ambiente, valor contratado, período e idempotência.
- Cobrança avulsa, excluída, status de risco ou estorno que inesperadamente
  aparece pago continua em revisão. Não há concessão por aproximação.
- Falha na gravação da recuperação conserva o evento original como falha
  recuperável. Perda de lease em um evento e falha de consulta de carência
  em uma empresa permitem continuar os outros itens do lote.
- Contadores `workerReview` e `graceReview` expõem falhas parciais com HTTP
  503, preservando os contadores das operações concluídas. Os logs usam
  apenas códigos fixos, sem mensagens externas ou dados pessoais.

O modelo de persistir antes de confirmar e deduplicar os IDs segue a
[documentação oficial do Asaas](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook).
O arquivo de teste cobre entregas fora de ordem, estorno, persistência
indisponível, duplicatas, status de risco e continuidade do lote.

## Verificação local

- 38 testes do worker passaram.
- 78 testes de cobrança, armazenamento e entitlement Desktop passaram.
- Checks 06/09, TypeScript e build Web passaram.
- O pacote de restauração permanece com 164 migrations; esta correção
  não exige alteração de schema ou migração no banco ativo.
- Build Desktop passou com `vite build --configLoader runner --config
  vite.desktop.config.ts`; os checks de entitlement Desktop, IPO e contrato
  Android passaram.
- [Dental Flow CI](https://github.com/GustavoFboz/dtfipo/actions/runs/37117895638)
  e [restauração limpa](https://github.com/GustavoFboz/dtfipo/actions/runs/37117895628)
  passaram no candidato `d4757a6`. O ensaio disparado pela
  [PR](https://github.com/GustavoFboz/dtfipo/actions/runs/37117926695) também passou.
- A [PR #108](https://github.com/GustavoFboz/dtfipo/pull/108) foi integrada na
  branch conectada pelo merge `43c2ff9`. A árvore do merge corresponde à
  árvore validada `81bfd2f99df5c6580911b3cf7352924b14f986a6`, e o conector Lovable
  confirmou sincronização desse merge. A publicação do código foi solicitada;
  a chamada retornou `pending`, ainda sem confirmação final de hospedagem.

## Pendências para fechar o protocolo

| Etapa | Prova/implementação restante |
| --- | --- |
| 04 | Dead letters consultados: cobrança avulsa permanece em revisão. Provas de recuperação de webhook e idempotência no Sandbox publicado ainda pendentes. |
| 05 — atual | Atraso da assinatura correta, carência, suspensão, estorno, cancelamento e reativação. |
| 06 | Upload comum, fotos e DICOM na conta publicada; limite e liberação de cota verificados. |
| 07 | Identidade do operador Master autorizada e MFA AAL2 comprovada. |
| 08 | Cancelamento e troca de plano iniciados pelo cliente, com vigência e cobranças pendentes tratadas no Asaas. |
| 09 | Homologação final nas plataformas, observabilidade, configuração separada de Produção e teste controlado de R$1 pelo operador. |

O preço de R$1 para novos contratos e a isenção IPO permanecem preservados.
A assinatura Sandbox existente de R$249 não representa o preço de uma
nova contratação, e uma cobrança de R$5 não comprova seu ciclo contratual.

## Consulta autorizada concluída e próximo teste

Em 03/10, o proprietário autorizou explicitamente a leitura dos registros e
uso da credencial backend pelo agente Lovable. A revisão automática aceitou
a delegação; o proprietário aprovou também o plano no Lovable.

O agente executou GET Sandbox e informou HTTP 200: a cobrança dos dois
eventos é avulsa, sem assinatura vinculada, RECEIVED, R$5/BRL, vencimento
29/09/2026. SELECT independente confirmou ausência no ledger e dois eventos
em dead_letter. Não reprocessar para tentar vincular essa cobrança ao SaaS.
Isso explica a incompatibilidade contratual; não comprova qual erro HTTP
ocorreu nas seis tentativas antigas, registradas com código genérico.

SELECT em 03/10 confirmou assinatura local ativa, MONTHLY, contrato R$249,
dois ciclos pagos, período atual 29/10–29/11 e grace_until nulo. O catálogo
company_initial continua em 100 centavos. O código de src, supabase e scripts
permaneceu idêntico ao merge MFA PR109; o agente acrescentou apenas o plano.

A próxima leitura externa da assinatura/lista de cobranças não ocorreu:
o agente montou SELECT com colunas inexistentes. O schema vivo foi conferido
pelo Codex e a consulta corrigida foi preparada, mas o Lovable recusou a nova
mensagem por falta de créditos. Não se trata de divergência de schema nem de
nova rejeição de autorização. Não houve criação de cobrança ou teste de atraso.

Consulta correta, somente leitura, para resolver internamente o vínculo:

```sql
select s.id, s.external_subscription_id, s.external_customer_id, s.status,
       s.current_period_start, s.current_period_end, s.billing_cycle,
       s.grace_until,
       public.billing_subscription_contract_amount(s.id) as contract_cents
from public.account_subscriptions s
where s.provider_environment = 'sandbox'
  and s.external_subscription_id is not null;

select bp.provider_payment_id, bp.status, bp.amount_cents, bp.currency,
       bp.period_start, bp.period_end
from public.billing_payments bp
join public.account_subscriptions s on s.id = bp.subscription_id
where s.provider_environment = 'sandbox'
  and s.external_subscription_id is not null;
```

Não publicar IDs ou segredos. Usar o vínculo encontrado em getSubscription
 e listSubscriptionPayments, ambos GETs Sandbox, para conferir status, preço,
próximo vencimento e existência de ciclo realmente vencido não pago. Não usar
paymentBook como leitura: esse GET gera cobranças. Os ciclos já pagos não
podem ser adulterados para simular inadimplência. Se não houver ciclo apto,
preparar uma assinatura Sandbox de teste separada e documentar seu vínculo
com uma empresa descartável antes de qualquer teste externo de escrita.
A homologação externa de atraso, carência, suspensão, estorno, cancelamento
 e reativação permanece pendente; não declarar a etapa05 concluída.

## Reversão

Reverter somente esta correção do worker, mantendo inbox, ledger, dados
clínicos, planos e migrations. Preservar eventos recuperados para auditoria
e investigação, mesmo após eventual reversão do código.