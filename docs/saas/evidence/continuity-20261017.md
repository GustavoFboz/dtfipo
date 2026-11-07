# Retomada SaaS e correção dos testes de checkout — 17/10/2026

Horários UTC. Base conectada consultada: `c6f139072371a2b02e6dd539c6cc8c7eb5ab56f8`.
Roteiro oficial preservado: **2/23 aceites integrais, 21 parciais/em aberto,
0/7 etapas encerradas**. A retomada e os testes abaixo não atribuem um aceite
financeiro integral. [Recibos sem credenciais](continuity-20261017.json).

## Ambiente e execução real

- O banco voltou a responder às consultas desta sessão. Isto comprova o acesso
  observado em 17/10, sem atribuir uma causa ou solução ao incidente de 08/10.
- O agendador Sandbox teve 288 execuções `succeeded` nas últimas 24 horas
  consultadas, de 16/10 17:46 até 17/10 17:41. O último retorno HTTP era 200,
  sem timeout, e a telemetria do processador estava saudável. A fronteira
  privada do agendador foi conferida. Alertas de Produção não foram testados.
- O job de identidade `e1d4bb74-8c88-4cac-a43d-6279be108024`, requisição
  3184, foi reivindicado e finalizado com HTTP 200 às 17:46:50. Passaram 15
  de 16 verificações reais: sessões das duas fixtures, isolamento, cadastro,
  confirmação, tokens de uso único, recuperação, recusa da credencial antiga,
  novo login, logout/revogação e remoção da identidade descartável.
- O Auth ainda aceitou sete caracteres. `short_credential_denied=false` é uma
  falha real; o mínimo global de oito caracteres permanece pendente de ajuste
  no painel Auth e de nova prova. Não houve envio de e-mail ou alteração das
  senhas das duas fixtures mantidas. O item 4.1 continua parcial.
- O job de cobrança `fb0ab48d-5d3f-4809-b66d-236247dc2045`, requisição
  3185, finalizou às 17:47:30. O endpoint de checkout respondeu HTTP 200, mas
  o teste exigia o envelope do transporte de server function. A rota HTTPS
  retorna diretamente `AsaasCheckoutResult`, causando falso negativo no job.
- A leitura posterior confirmou um checkout de fixture `provider_created`,
  no Sandbox, por 44.900 centavos, com cliente, assinatura e cobrança vinculados.
  A assinatura permanecia `pending_checkout`. Não se concluiu o pagamento,
  histórico ou documento por causa do falso negativo. O digest dos contratos
  e ledger de outras empresas ficou inalterado.

## Correção implementada

1. Conferir o formato real da resposta HTTPS, a tentativa exata, o ambiente
   Sandbox, o valor, moeda, IDs e URL do provedor. `paymentConfirmed` continua
   obrigatoriamente `false`. Um HTTP 200 sozinho não é prova suficiente.
2. Conferir com o JWT real que a empresa sem pagamento permanece com acesso
   somente à cobrança; depois da confirmação, conferir acesso integral pela
   mesma RPC consumida pela interface.
3. Na entrega repetida, exigir uma única linha paga e o mesmo início/fim de
   período. Uma prorrogação indevida falha mesmo que o ID permaneça igual.
4. Reconhecer o encerramento seguro de um aviso antigo: `processed` ou
   `ignored/SUPERSEDED_PROVIDER_STATUS`, sempre com ledger pago e período
   preservados. `ignored` genérico ou revisão manual externa não conta.
5. Resolver a dependência de criação RPC somente no uso, preservando os erros
   de indisponibilidade e a proibição de fallback não idempotente. A regressão
   de armazenamento encontrada na base reproduzia a mesma causa tratada na
   PR156. Nenhuma migration de criação foi aplicada por esta entrega.
6. Acionar a CI em PRs com base `saas/**`, além de manter os gatilhos existentes.

Os testes automatizados cobrem sucesso HTTPS plano, envelope indevido,
ambiente/tentativa/preço/URL incorretos, checkout promovido indevidamente a
pago, período estendido, duplicidade e resultados de acesso da outra empresa.
As regressões de cobrança, cota e autorização Desktop continuam obrigatórias.

## Verificações locais da correção

- 360 testes direcionados de cobrança, jobs QA e entitlement passaram.
- A regressão adicional de API/armazenamento passou após resolver a RPC no
  momento do uso; a rodada conjunta com webhook e fixture passou 108 testes.
- Tipagem TypeScript, checks das etapas 06/09 e bootstrap Desktop passaram.
- Todos os passos executáveis de `.github/workflows/ci.yml` passaram localmente,
  incluindo gates SaaS/08, regressões Web/Windows/Android e build de produção.
  A instalação foi reutilizada; instalação limpa e CI remoto ainda precisam
  ser conferidos depois do envio da branch.
- O envio da branch não foi concluído e nenhuma PR desta correção foi aberta.
  A aplicação publicada ainda precisa receber e validar esta correção.

## Pendências de publicação e execução

Publicar a correção somente após as verificações e repetir o job com uma
capacidade nova. O primeiro contrato Sandbox já foi criado; preservar seus
IDs e usar a retomada existente, sem criar outra assinatura às cegas. Não
atribuir aceite de duplicatas, eventos fora de ordem, perda de webhook,
histórico ou documento até observar seus resultados reais.

A revisão dos dois testes externos de R$5 permanece exclusiva da sessão
humana Master/AAL2. Nenhuma auditoria foi forjada e os eventos continuam em
dead letter. O teste real de R$1 e a liberação para vendas continuam reservados
ao gate de Produção e ao responsável.
