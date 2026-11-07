# Alerta operacional de Produção aceito em 19/10/2026

O item **7.2 — secrets, webhook e agendamento de Produção** está concluído.
O titular autorizou o alerta preparado às 02h19m48s de Manaus. Uma execução
controlada confirmou a recusa de heartbeat antigo, a entrega real da
notificação GitHub e a inspeção normal saudável posterior. O total passa de
6 para **7/23 (30,43%)**, com 16 critérios em aberto e **0/7 etapas encerradas**.

## Prova observada

- [Ensaio #96](https://github.com/GustavoFboz/dtfipo/actions/runs/39209443430),
  uma única execução manual da branch `saas/production-alert-drill-20261019`,
  revisão `19ee74e95eb47ae8d3628cfb205015b451f3e8e4`.
- A inspeção real passou primeiro: Produção, worker `ok`, heartbeat de
  **34 segundos**, leitura de 06h21m36s UTC (02h21m36s Manaus).
- O job isolado mudou somente a idade na cópia para **901 segundos**.
  O mesmo predicado do monitor recusou a cópia e terminou com o marcador
  `CONTROLLED TEST` e código 1 às 06h21m43s UTC. Essa falha era esperada.
  Os artefatos original/simulado tiveram os digests SHA-256 conferidos.
- A notificação correspondente chegou às **06h22m08s UTC / 02h22m08s Manaus**:
  INBOX, fora de SPAM, remetente GitHub, DKIM aprovado, corpo com o link exato
  da execução e assunto com a branch exclusiva. Foi lida pela conexão
  existente; nenhum e-mail personalizado foi enviado nem preferência alterada.
- [Inspeção normal #97](https://github.com/GustavoFboz/dtfipo/actions/runs/39209667659),
  na branch publicada, passou depois da entrega: Produção, worker `ok`,
  heartbeat de **177 segundos**, leitura de 06h24m00s UTC. O job de simulação
  ficou `skipped`. Artefato e digest conferidos.

O [recibo sanitizado](production-alert-20261019.json) contém snapshots,
identificação dos jobs/artefatos, autorização e fingerprints antes/depois.
Não contém mensagem integral, endereço de e-mail, token ou dado clínico.

## Preservação e revisão do aceite

As leituras de 06h20m53s e 06h24m40s UTC conservaram os mesmos fingerprints do
ledger e dos contratos de Produção: um pagamento real e zero eventos
falhos/dead letters. Cron job 2 permaneceu ativo, resposta HTTP 200 sem timeout,
worker saudável e contadores sem falhas/revisões. Não houve pausa de cron,
alteração do heartbeat real, cobrança, cancelamento, estorno ou replay.

A configuração ativa já havia passado no
[diagnóstico corrigido](https://github.com/GustavoFboz/dtfipo/actions/runs/39207818032).
A entrega autenticada do webhook financeiro continua apoiada no
[primeiro pagamento real](first-production-payment-20261019.md), recebido pelo
fluxo normal e processado uma vez sem erro. O GET de configuração sozinho
não comprova o token que o Asaas oculta.

Com configuração, entrega autenticada, cron/telemetria e ensaio de alerta
com notificação real e inspeção posterior, os requisitos do item 7.2 estão
cobertos. O falso alerta antigo não foi utilizado como substituto do ensaio.

## Limites

O atraso foi simulado no arquivo baixado de uma Produção saudável. Não houve
indisponibilidade real nem restauração do processamento. Esta prova não
conclui o item 6.2 de backup/restauração operacional e rollback, os demais
estados financeiros, os testes físicos Windows/Android ou a liberação para
vendas. O prazo observado do e-mail não é garantia de entrega futura.
Nenhum código financeiro, migration ou segredo foi modificado nesta rodada.
