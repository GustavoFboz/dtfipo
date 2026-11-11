# Etapa 09 — diagnóstico e agendamento

Retomada em 03/10/2026, 21h em Manaus; registros do backend/CI em 04/10 UTC.
A pausa financeira e o adiamento DICOM permanecem.

## Observação inicial

Leitura do banco às 01:30:43 UTC: nenhuma linha de heartbeat, 5 eventos
processados e 2 dead letters Sandbox, 0 solicitações. Última tentativa de
reconciliação às 00:43:00 UTC. Último job identificado do worker: `37165788890`.
O Lovable informa commit `04ba3effdbcd1c69d2bdd7d7d4d9ec7ca8e9f893` e site publicado,
mas esses campos não confirmam a revisão servida. O pedido de publicação
`b6656605-69cf-42ef-87c4-9aaed22e594a` não expõe consulta de status nas ferramentas.
Ausência de heartbeat sozinha não permite concluir se o bloqueio é na
publicação, agendamento, configuração ou execução; não foi inventada uma causa.

A `main` em `5ee9e89f89b2fdf5f496565505fb0a70a418230d` usa a versão anterior do
agendador. A branch conectada ao Lovable é `saas/stage-03-asaas-checkout`.
Essa diferença de código foi comprovada por leitura das duas branches.

## Incremento

- GET privado no endpoint do worker, com token próprio do agendador,
  validação de configuração/ambiente, projeção estrita e prazo de 3 segundos.
  Lê apenas `billing_worker_health`; não consulta Asaas nem chama RPC financeiro.
- Contrato de leitura separado da avaliação de execução recente. Ausência de
  heartbeat não se transforma em sucesso do worker, nem em falha fictícia de publicação.
- Workflow com GET, resumo sanitizado e artefato com retenção de 30 dias;
  agendamento de 15 minutos e execução após alterações na branch conectada.
- Worker com ambiente Sandbox fixado e validação de monitoramento; cron
  nominal de 5 minutos deslocado do início da hora. Nenhum secret/flag/preço muda.
- Verificador executa o Bash/jq reais com HTTP fictício: autenticação/ambiente,
  contrato ausente, heartbeat vazio/antigo/revisão, resumo inválido e remoção de
  texto privado de erros. Integração isolada na main altera apenas workflows,
  verificador e sua chamada no CI; não mescla o código do aplicativo nessa branch.

## Limites e validação

209 regressões em 18 arquivos passaram, incluindo os 12 testes novos.
TypeScript, checks 06/08/09, restauração determinística (167 migrations),
bootstrap Desktop, contrato Android e builds Web/Desktop/Android passaram.
O verificador dos workflows passou com HTTP fictício; isso não comprova o
endpoint publicado nem uma execução real. CI e recibos das duas integrações
são registrados antes do aceite final. Nenhuma nova migration ou alteração de
registros do domínio financeiro/armazenamento é necessária neste incremento.

Provas financeiras, sessões reais, entrega de alerta ao responsável e revisão
das reservas antigas continuam pendentes. A execução normal do agendador
existente permanece um serviço operacional; este trabalho não dispara POST
manualmente como homologação nem libera Produção.

A alteração isolada na `main` está na [PR 120](https://github.com/GustavoFboz/dtfipo/pull/120).
O aceite exige publicação do GET e observação dos jobs, sem fabricar heartbeat.
