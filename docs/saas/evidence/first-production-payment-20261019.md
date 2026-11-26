# Primeiro pagamento real confirmado — aceite 7.3

## Resultado em 19/10/2026, 01h33 Manaus

O titular informou às 01h32 que pagou, que a conta está ativa e que o plano
corresponde à seleção. A consulta restrita das 05h33m45s UTC confirmou:

| Conferência | Resultado |
| --- | --- |
| Ambiente | Produção; empresa comum, sem isenção interna IPO |
| Plano e contrato | `company_initial`, BRL 500 centavos/mês |
| Pagamento | Uma linha `paid`, de 500 centavos, vinculada ao checkout e à assinatura corretos |
| Checkout | `paid`; valor e identificador de pagamento iguais aos do ledger |
| Webhook | `PAYMENT_RECEIVED` recebido às 05h07m20s UTC; processado às 05h11m02s, uma tentativa, sem erro |
| Origem do evento | Fluxo normal; não é evento gerado pela reconciliação |
| Assinatura | `active`, vínculos externos de cliente/assinatura presentes |
| Ambiente escolhido | Laboratório ativo, uma sessão; cota corresponde ao plano |
| Acesso observado | Titular confirmou conta ativa e plano correto; estado do servidor consistente |
| Cron e worker | Último disparo 05h31 UTC, HTTP 200, sem timeout; worker `ok`, sem falha/revisão |

O evento `SUBSCRIPTION_CREATED` também foi recebido e processado uma vez, sem
erro. O horário `paid_at` é o registro da confirmação no ledger pelo worker,
não uma consulta independente do horário bancário do pagador. A vigência
armazenada usa o vencimento da cobrança: 20/10/2026 00h UTC a 20/11/2026 00h UTC.
O pagamento antecipado já deixou a assinatura ativa; não foi alterado o período.

## Por que a prova encerra o item

O endpoint publicado exige o token de Produção antes de persistir eventos.
Base conferida: [worker e entrada de webhook publicados](https://github.com/GustavoFboz/dtfipo/blob/e83824a6ae5c5da5c651b196a822f2bd767ac6c5/src/lib/billing/asaas-webhook.server.ts).
O worker faz GET da cobrança no Asaas e valida status pago, cliente, assinatura,
valor e vínculo antes da aplicação atômica no ledger e no acesso. A entrega
normal `PAYMENT_RECEIVED`, processada sem erro e correlacionada ao mesmo
pagamento, comprova esse percurso junto do estado persistido e do relato do
titular. Não se presume pagamento apenas pela abertura de uma página.

Esta conferência foi somente de leitura. Não consultou o token, não fez nova
consulta direta ao Asaas, não disparou cobrança, replay, pagamento, estorno ou
cancelamento. A confirmação do provedor é a realizada pelo worker durante o
processamento, conforme o código publicado. O [recibo JSON](first-production-payment-20261019.json)
contém somente a projeção necessária, sem identificação pessoal ou URLs pagáveis.

Revisão: uma empresa, uma assinatura ativa, um pagamento de Produção de R$5,
checkout pago e um evento financeiro normal correspondente. Todos os vínculos
conferem. Relato do titular e estado observado atendem recebimento, ledger e
acesso real da primeira compra. **Item 7.3 concluído em 19/10/2026.**

## Contador e limites

O total passa de **5/23 (21,74%) para 6/23 (26,09%; painel 26,1%)**.
Restam 17 critérios parciais/em aberto e **0/7 etapas inteiras encerradas**.
O item 7.2 ganha prova da entrega autenticada; o alerta operacional real em
Produção ainda impede seu aceite integral. O item 7.4 e a decisão de vendas
continuam pendentes. Renovação, atraso, cancelamento, recuperação e uso físico
nas plataformas conservam seus próprios critérios; não são inferidos deste teste.
