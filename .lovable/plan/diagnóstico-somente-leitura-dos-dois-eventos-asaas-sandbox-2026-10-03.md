# Diagnóstico somente leitura dos dois eventos Asaas Sandbox

## Escopo confirmado
- Foram localizados exatamente dois eventos `dead_letter` em 30/09/2026: `PAYMENT_OVERDUE` e `PAYMENT_RECEIVED`, ambos referentes à mesma cobrança Sandbox e ambos com `PROVIDER_RECONCILIATION_FAILED` após seis tentativas.
- As credenciais necessárias já estão configuradas e disponíveis no ambiente do backend; seus valores não serão lidos em saída, registrados ou revelados.
- Nenhuma alteração será feita em código, banco, segredos, filas, configuração ou publicação.

## Execução
1. Fazer um único `GET` autenticado da cobrança correspondente diretamente no endpoint permitido do Asaas Sandbox, usando a configuração existente do backend.
2. Se a resposta indicar uma assinatura vinculada, fazer somente o `GET` dessa assinatura no Sandbox.
3. Comparar os campos financeiros mínimos retornados com o contrato local existente, por consultas SQL somente leitura: ambiente, assinatura, valor, moeda, vencimento/período e ciclo.
4. Interromper sem qualquer ação adicional em caso de erro, resposta inesperada ou indicação de ambiente Production.

## Resultado entregue
Retornar apenas:
- HTTP ou código seguro de erro;
- assinatura existente ou cobrança avulsa;
- correspondência ou divergência com o contrato local;
- status atual;
- valor, moeda e vencimento;
- compatibilidade com o ciclo contratual.

Nenhum corpo bruto, dado pessoal, identificador desnecessário ou segredo será exibido. Não serão executados replay, worker, webhook, pagamento, atualização ou requisição de escrita. A isenção IPO, os planos de R$ 1 e o contrato Sandbox existente de R$ 249 permanecerão intocados.

## Limite do modo de planejamento
A consulta externa autenticada ainda não foi executada porque este modo exige aprovação do plano antes da ação. Após a aprovação, o diagnóstico acima poderá ser realizado diretamente, sem criar endpoint nem alterar o projeto.
