# Agendador no backend — preparação de 05/10/2026

O heartbeat Sandbox confirmado às 15h33 de Manaus ainda era de
2026-10-05T18:33:30.124305Z (14h33). A consulta funcionou; a execução estava
antiga. Nenhum heartbeat de Produção foi encontrado. Esta preparação visa
reduzir a dependência da pontualidade do cron do GitHub.

## Código e revisão

PR https://github.com/GustavoFboz/dtfipo/pull/136 prepara pg_cron/pg_net, Vault,
registro privado pelo token do operador, status sanitizado e bootstrap Sandbox.
A configuração só copia o token do backend após HTTP 406/PGRST106 comprovar
que o schema net não é exposto pela Data API. A fronteira SQL exige contas
do aplicativo sem login SQL e ausência de bridges net executáveis por elas.
Permissões gerenciadas do pg_net não são confundidas com acesso pela API.

A migração não cria jobs ou segredos. Configurações futuras usam o ambiente
ativo do backend; o bootstrap exige Sandbox. Jobs contêm somente o ambiente,
e mudança/interrupção usa cron.unschedule para jobs de nome/owner correspondentes.
O restore final reaplica os grants privados e inclui o hotfix RLS já existente.

PRs https://github.com/GustavoFboz/dtfipo/pull/137 e
https://github.com/GustavoFboz/dtfipo/pull/138 preparam o GitHub como apoio.
O POST só é dispensado com contrato privado correto, job ativo, HTTP 200 e
heartbeat saudável recentes no mesmo ambiente. Falhas/dados antigos mantêm
o processamento e as guardas anteriores. A ponte main altera só dois arquivos.

## Ensaio real em banco isolado

Candidato ce843acb5b5fdbf0dcca21c6962e80d2a1984623.
Execução https://github.com/GustavoFboz/dtfipo/actions/runs/37363816004,
job 111944275530, concluído com sucesso em 2026-10-05T19:31:31Z.
Artefato 11366879087, saas-stage-01-clean-restore-37363816004,
SHA-256 do ZIP ed033208c7dd09fd2b85e2615a95e7ff985ec9b17c2736420acb20fd2ac2d339.

restore-database-scheduler.log registrou:

```
BEGIN
anon_can_configure=false
user_can_configure=false
service_can_enqueue=false
managed_boundary_safe=true
user_can_read_config=false
DO
ROLLBACK
```

O DO validou rejeição de segredo curto, detecção de grant inseguro, registro
repetido, rotação no Vault, comando sem credencial, enfileiramento com URL
fixa, projeção de status, mudança de ambiente e interrupção. Nada foi
commitado; pg_net não iniciou a requisição HTTP desse ensaio.

Validação local: 230 testes em 13 arquivos, TypeScript, build de produção,
etapas 06/09, bootstrap Desktop e contratos Bash com HTTP fictício passaram.
A verificação de CI do apoio passou em 37363580564 (SaaS) e 37363586725 (main).
As demais execuções continuam sujeitas à sua conclusão antes da integração.

## Limites e próximo aceite

Até esta evidência, o novo agendador não foi instalado ou registrado no
backend publicado. O ensaio comprova restauração e contratos, não cadência
real, alerta entregue, autenticidade do webhook ou recebimento.
Depois da integração e publicação, preservar a confirmação do isolamento
da API, registro Sandbox e múltiplas execuções com HTTP/heartbeat. Instalação
isolada não encerra 6.1 ou 7.2. Aceites finais permanecem 1/23 (4,35%).

Fontes oficiais:
https://supabase.com/docs/guides/database/extensions/pg_net
https://supabase.com/docs/guides/functions/schedule-functions
https://github.com/citusdata/pg_cron

## Integração e instalação — 15h46 de Manaus

Apoio main integrado pelo PR 138: 4d07498581263b3e60ef5cf689d211ae5741fb1c.
Apoio SaaS integrado pelo PR 137: 5a4f0e7ff5e914bd130d97e02c42cfa5a32bc1eb.
PR 136 integrado: ce660d7939d58a6f0fd33a5365e6139c04bc09cf.
CI da revisão final f4309f1c041df19147dbd4a44b7bb04b242b1e3b passou em
37365075999, job 111948163492. A comparação desde ce843ac confirmou nenhuma
alteração nas migrações, restore consolidado, SQL do ensaio ou workflow de
restauração. A prova do restore é a execução verde preservada acima; checks
duplicados em fila não foram apresentados como concluídos.

Somente a migração 20261005190000 foi aplicada ao backend, numa transação.
SHA Git do arquivo: 525364519b95509d3dc262341bd6d5c484a926de.
Em 2026-10-05T19:46:19.855578Z, a consulta original sanitizada
[database-scheduler-installation-20261005.json](database-scheduler-installation-20261005.json)
confirmou pg_cron/pg_net/Vault instalados, managed_boundary_safe=true,
anon_can_configure=false, user_can_configure=false, service_can_enqueue=false,
service_can_configure=true, user_can_read_config=false, scheduler_rows=0 e
scheduler_jobs=0. Instalação não significa registro ou execução do processador.

Publicação solicitada após conferir o commit sincronizado no projeto.
Deployment 0209ff82-8340-4e95-a5a7-8c933029454c retornou pending; o novo
contrato publicado ainda precisa ser confirmado pelo GET privado.
Bootstrap https://github.com/GustavoFboz/dtfipo/actions/runs/37365444013,
job 111949323780, permanece em fila. O workflow contém a confirmação do
contrato antes do POST fixo e pode registrar Sandbox quando for executado;
não permite escolher token/URL ou configurar Produção por essa automação.
Se executar antes da publicação, recusará o contrato e exigirá nova tentativa
após a publicação. Não declarar API-isolation ou cadência como comprovadas
até preservar o resultado real dessa execução e dos disparos posteriores.

O GitHub Status registrou degradação de Actions desde 19h11 UTC em 05/10.
É compatível com o atraso observado; a causa individual destes jobs não foi
confirmada. A tentativa de reiniciar um job em fila retornou HTTP 403,
"The workflow run containing this job is already running". Não foi rejeição
de aprovação automática nem evidência de credencial inválida.
Fonte consultada: https://www.githubstatus.com/

Nenhuma configuração de Produção, cobrança real, estorno ou replay foi
executada para esta instalação. Recebimento e autenticação do webhook
continuam pendentes. Aceites finais: 1/23 (4,35%); 22 em aberto/parciais.
