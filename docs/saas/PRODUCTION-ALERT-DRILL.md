# Ensaio controlado da notificação operacional de Produção

Estado em 19/10/2026: **preparado e testado localmente com dados fictícios;
não disparado no GitHub**. A primeira assinatura paga e o cron continuam ativos.
A autorização para trabalhar no monitor não é tratada como autorização para
enviar uma nova notificação externa. O titular deve aprovar o disparo abaixo.

## Execução concreta preparada

Workflow existente: `SaaS readonly publication probe`.
Branch exclusiva: `saas/production-alert-drill-20261019`.
Job: `CONTROLLED TEST - Production monitoring alert delivery`.

O job só é elegível em `workflow_dispatch` dessa branch exata. Push, schedule
e execuções manuais de outras branches não o executam. A rotina normal de
inspeção precisa terminar com sucesso primeiro, em Produção, e salvar um
snapshot saudável do backend. O ensaio baixa somente o artefato dessa mesma
execução; seu job não recebe secrets nem faz chamadas à aplicação, ao Asaas
ou ao banco.

Uma cópia local do JSON recebe `healthy_age_seconds=901`. O mesmo predicado
da rotina normal deve recusar esse heartbeat. O job então termina
intencionalmente em falha com `CONTROLLED TEST` na mensagem, para exercitar
a notificação já configurada no GitHub. Não escolhe novos destinatários,
não envia e-mail personalizado e não altera preferências da conta.

Dados do sistema, heartbeat verdadeiro, pg_cron, ledger, cobrança, período
pago e acesso permanecem intactos. A cópia registra `live_data_modified=false`,
`live_processing_paused=false` e a idade saudável original. Se a leitura real
já estiver indisponível, fora de Produção ou não estiver saudável, o ensaio
é recusado para não confundir um incidente real com a simulação.

## Conferência após autorização

1. Disparar uma vez o workflow na branch exclusiva, pela sessão GitHub
   autorizada. Não usar o workflow de processamento financeiro.
2. Conferir a falha esperada, o marcador de teste e o artefato sanitizado.
3. Ler a notificação correspondente na caixa já conectada do operador;
   correlacionar o link da execução, data, INBOX/SPAM e autenticação.
4. Conferir uma inspeção normal posterior saudável. Não há estado do banco
   para restaurar; a falha existiu somente no arquivo baixado pelo job.
5. Comparar os fingerprints financeiros antes/depois. Registrar prova e
   revisão antes de decidir o aceite integral do item 7.2.

O teste local executa o Bash real do workflow com arquivos temporários e
compara o predicado do ensaio ao da inspeção normal. Recusa snapshots Sandbox,
contrato desconhecido, worker ausente/falho e heartbeat realmente antigo.
Um teste local não comprova entrega de e-mail; o aceite ainda está pendente.

O alerta antigo do diagnóstico de credenciais usava a regra de webhook
desativado após a ativação. A entrega daquela notificação foi observada,
mas esse falso positivo não substitui o ensaio de falha do monitor saudável.
