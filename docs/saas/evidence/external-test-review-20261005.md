# Implantação da revisão auditada — 05/10/2026

[PR 143](https://github.com/GustavoFboz/dtfipo/pull/143), candidato
8d3bb8f640942d0bd0c6a88cb9a579c5684e92d5, integrado por merge normal
b90d72312432e2ce023287b2ac27217035b02369. Escopo conferido: 21 arquivos,
sem inclusão de alterações locais alheias.

CI [37385062205](https://github.com/GustavoFboz/dtfipo/actions/runs/37385062205)
e restaurações [37385062195](https://github.com/GustavoFboz/dtfipo/actions/runs/37385062195)/
[37385066488](https://github.com/GustavoFboz/dtfipo/actions/runs/37385066488)
passaram. O artefato 11378310399 contém restore-stage-07-external-test.log,
resultado passed seguido de ROLLBACK. SHA-256 do ZIP:
c76960d3f7bc14061ea558518ee3674a696433f52dae99b10bf123c39f1a7d15.
São ensaios em banco isolado, não decisões executadas nos eventos reais.

A migração 20261005223500 foi instalada sozinha numa transação às
2026-10-05T22:54:09.648886Z (18h54 de Manaus). Função registrada;
anon_can_review=false, service_can_review=false, authenticated pode invocar
a RPC sujeita a operador habilitado/AAL2 e às demais guardas. Nenhuma auditoria
de encerramento existia após a instalação, e os dois eventos mantiveram
dead_letter e seis tentativas. Hashes de contratos pagos e ledger iguais aos
da consulta anterior; zero pagamentos de Produção.

O projeto sincronizou o merge antes da publicação. O deployment
a34d0ef5-94b9-49a9-8e39-9366623582c0 retornou pending. A requisição real 37 a
/master respondeu HTTP 200 e informou o asset /assets/master-LeE-kibw.js.
A requisição 39 desse asset respondeu HTTP 200 e confirmou no código servido
a entrada Revisar teste externo, o envio Concluir revisão do teste, a RPC
protegida e a confirmação explícita. Isso comprova a revisão publicada;
não substitui o teste da ação numa sessão real.

Projeções originais sanitizadas:
[external-test-review-release-20261005.json](external-test-review-release-20261005.json).
A coluna de criação da resposta pg_net não é apresentada como término HTTP.

## Próximo aceite real

Em [Master](https://dtfipo.lovable.app/master), revisar individualmente os
eventos PAYMENT_OVERDUE e PAYMENT_RECEIVED da cobrança manual Sandbox de R$5.
Escolher Revisar teste externo, confirmar o contexto, informar a justificativa
e concluir com o autenticador da sessão Master. Uma justificativa possível,
após a conferência: "Cobrança manual de teste Sandbox de R$5, conferida no Asaas,
sem vínculo com contrato ou checkout do DentalFlow."

A conexão técnica não recebe privilégio de executar essa decisão no lugar da
sessão Master/AAL2. Não forjar claims de autenticação no banco publicado nem
alterar o evento diretamente para contornar a auditoria. Após a decisão real,
conferir duas auditorias individuais, estados/contagens da inbox e hashes
financeiros antes de encerrar 1.1. Não houve replay para dar acesso aos R$5.

Aceites permanecem **2/23 (8,70%), 21 parciais/em aberto, 0/7 etapas completas**.
Produção permanece desativada e o recebimento real de R$1 não foi comprovado.
