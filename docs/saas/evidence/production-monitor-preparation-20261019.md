# Monitor de Produção: falso positivo corrigido e ensaio preparado

## Diagnóstico real

Na leitura de 19/10/2026, 05h47 UTC, cron de Produção ativo, HTTP 200 sem
timeout e worker `ok`, sem falhas/revisões. Há um pagamento real de Produção
e nenhum evento financeiro falho/dead letter. Os fingerprints do ledger e
dos contratos foram preservados no [recibo sanitizado](production-monitor-preparation-20261019.json).

O [run 39170969003](https://github.com/GustavoFboz/dtfipo/actions/runs/39170969003),
job 117803740956, passou na leitura de credenciais/conta e falhou somente na
exigência de webhook correto **e desativado**. Esse era o contrato legado de
preparação, incompatível com o webhook já ativo. O log confirma a causa; não
foi falha de autenticação, de cobrança nem de heartbeat.

A notificação já existente desse run foi recebida às 22h09m39s UTC de 18/10
na caixa conectada do operador: INBOX, fora de SPAM, remetente GitHub e DKIM
aprovado. O corpo aponta para a mesma execução. A conferência só leu essa
mensagem; não enviou novo e-mail nem alterou preferências ou destinatários.

## Correção

O workflow confere ambiente/habilitação do backend contra as variáveis GitHub
antes da leitura do webhook. Em Produção ativa, exige webhook ativo; durante
a preparação Sandbox, exige webhook desativado. Unicidade, lista completa,
API v3, sequência, eventos corretos e recusa de token divergente continuam
obrigatórios. Token oculto não é tratado como erro nem como autenticação
confirmada por esse GET.

A resposta v2 do backend fica intacta. O workflow preserva seus campos
legados e acrescenta apenas `expected_webhook_enabled` e
`webhook_runtime_configuration_valid` na projeção sanitizada. Não altera
conta Asaas, webhook, secrets, cron ou qualquer registro financeiro.
O run da revisão integrada deve guardar a confirmação real no artefato
`saas-production-preflight-<run_id>`; a validação local não é apresentada como
prova dessa execução publicada.

## Ensaio e aceite

O [ensaio revisável](../PRODUCTION-ALERT-DRILL.md) foi preparado no workflow de
inspeção existente. Só é elegível num disparo manual da branch exclusiva.
Seu job baixa um snapshot dessa mesma execução, exige Produção saudável e
altera somente a idade do heartbeat na cópia. Não recebe credenciais nem
faz requisições externas; a falha intencional do job exercitará a notificação
normal do GitHub após autorização do titular.

O ensaio **não foi disparado** e nenhuma notificação nova foi enviada por ele.
O falso positivo antigo não vale como prova de falha do monitor. O item 7.2
permanece parcial e o total continua **6/23 (26,09%), 0/7 etapas encerradas**.

Validação: testes Bash/HTTP fictício para preparação/ativação e incompatibilidade
de ambientes; ensaio Bash com snapshots isolados e o mesmo predicado do
monitor normal; rejeição de dados Sandbox, ausentes e já não saudáveis;
356 testes de cobrança/desktop em 17 arquivos; etapas 06/09 e bundle de
176 migrações. Não foram modificados código financeiro nem migrações.
