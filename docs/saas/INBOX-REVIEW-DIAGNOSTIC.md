# Consulta pontual dos dead letters Sandbox

GET privado `/api/billing/asaas-worker?check=inbox-review`, protegido pelo token
do worker do ambiente atual e `X-Billing-Environment: sandbox`. A rota recusa
Produção, outros métodos, parâmetros de seleção e ambiente divergente antes
de ler a inbox ou chamar o provedor. Não é uma interface pública do aplicativo.

O servidor seleciona somente dead letters Asaas Sandbox, por ordem de chegada.
Lê no máximo três registros para detectar fila maior e consulta no máximo dois
recursos existentes pelo identificador armazenado. IDs inválidos não originam
requisições. O cliente Asaas executa somente GET de cobrança/assinatura, com
prazo de 2,5 segundos por chamada, sem repetição. A operação inteira tem prazo
de oito segundos; um resultado tardio não inicia outra consulta.

O contrato `dentalflow-inbox-review-v1` retorna UUID do evento, tipo, tentativas,
erro histórico sanitizado, ID do recurso, HTTP/estado atual e comparação dos
identificadores do snapshot. Não retorna cliente, documento, endereço, link de
cobrança, mensagem bruta ou credencial. Comparação com o snapshot da inbox não
é prova de titularidade, preço, período ou autorização para reaplicar pagamento.
Todos os registros conservam `requires_manual_review=true`.

A projeção informa valor em centavos e vencimento somente quando válidos, e
distingue assinatura vinculada, ausência explícita e campo omitido pelo
provedor. Campo omitido não comprova cobrança avulsa nem autoriza completar
o vínculo a partir de um cliente parecido. Não revela IDs de outros clientes
ou assinaturas. Estes campos permitem comparar com o ledger e contrato
durante a revisão individual, sem presumir correspondência pelo status RECEIVED.

HTTP 404 identifica recurso não encontrado/acessível nessa conta e ambiente.
Não distingue sozinho recurso apagado, ID incorreto ou conta diferente. HTTP
200 com recurso lido também não encerra o aceite financeiro. Os códigos e
desconhecidos continuam explícitos; não se presume exclusão/status ausentes.

A consulta não faz claim, replay, escrita no provedor, ledger ou entitlement.
Eventos antigos não serão reenviados por ela. O item 1.1 exige conferência
individual do contrato e decisão auditada antes de qualquer replay pelo Master
com MFA AAL2. Não oferece execução automática de solicitações da etapa 08.

## Operação pelo backend

Após registro do Sandbox, o operador pode usar pg_net para este GET fixo,
obtendo a credencial dentro do banco, diretamente da referência privada no
Vault. O resultado da instrução deve conter somente o ID da requisição.
Não imprimir o valor do segredo, headers ou fila de requisições. Verificar
`billing_database_scheduler_boundary()` antes do envio. Não criar bridge
SECURITY DEFINER acessível aos usuários para esse diagnóstico.

Preservar somente a projeção contratada da resposta HTTP. Uma versão antiga
que devolva o contrato de saúde não confirma a publicação desta consulta.
Não trocar esse GET por POST: POST pertence ao processador financeiro.
O mesmo mecanismo permite verificar o contrato privado de saúde sem depender
da pontualidade dos runners do GitHub; o cron permanece independente.

Validação: regressão de billing/licença Desktop, etapas 06/09, TypeScript e
build. Os testes incluem fronteiras de autorização/ambiente, ausência de
seleção pelo chamador, respostas divergentes, dados privados e consultas tardias.
Não substituem a conferência real do Asaas após publicação.

Fontes oficiais consultadas em 05/10/2026:

- https://docs.asaas.com/reference/recuperar-uma-unica-cobranca
- https://docs.asaas.com/reference/recuperar-uma-unica-assinatura
- https://supabase.com/docs/guides/database/extensions/pg_net
