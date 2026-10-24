# Etapa 09 — preparação operacional em 04/10/2026

Incremento: acompanhamento privado no Master e roteiro de incidentes, sem executar testes financeiros externos. A pausa financeira e o adiamento DICOM permanecem.

## Implementação

- RPC Master somente para operador habilitado, com contagens isoladas por ambiente; não devolve payloads, identificadores financeiros, dados fiscais ou segredos.
- Telemetria privada limitada a duas linhas, uma por ambiente; início/fim por UUID de execução, conclusão idempotente, recusa de conclusão antiga, preservação do último término sem erros. Somente RPC de backend escreve.
- Fila atrasada/dead letter, checkout incerto, tentativa de reconciliação atrasada, carência vencida, período ativo sem ledger local e reservas antigas; nenhuma correção financeira ou exclusão automática.
- Fachada pública compartilhada Web/Windows/Android, identidade Cloud validada, JWT capturado, cache por conta/sessão/geração, prazo de 12 segundos, cancelamento e descarte de resposta após troca de sessão. Administração operacional é online e não entra na outbox clínica.
- Worker limita a telemetria e continua processando eventos verificados se ela falhar. Agendador exige resumo numérico, confirmação de monitoramento e ambiente Sandbox; logs imprimem somente contadores conhecidos.
- Migration e pacote determinístico de restauração com 167 entradas; self-heal final reafirma tabelas/RPCs privados. Ensaios SQL isolados para permissões, ambientes, idempotência, término antigo, payload proibido e domínio financeiro preservado.

## Validação local

197 testes em 17 arquivos passaram: billing/worker, Master/MFA/sessões, solicitações, armazenamento, confirmação de exclusão e entitlement Desktop. TypeScript e checks 06/08/09, restauração, bootstrap Desktop e contrato Android passaram. Builds Web, Desktop e Android passaram, executados sequencialmente. A restauração limpa do CI é registrada antes da integração final.

CI do código validado `13f1d986cb4134beaeddaaa4f057cb1c531d4c95`: [build e regressões](https://github.com/GustavoFboz/dtfipo/actions/runs/37165987733) e [restauração limpa](https://github.com/GustavoFboz/dtfipo/actions/runs/37165990562) aprovados. As assertions e o ensaio SQL da etapa 09 também passaram no job `111328600138` do primeiro ensaio. O CI foi alinhado ao Vitest, runner declarado pelos testes, para verificar o relógio simulado assíncrono; nenhum teste foi removido.

Não houve teste em dispositivos Windows/Android, nova sessão real Master nem evidência financeira real neste incremento. Ensaios isolados e builds não substituem esses aceites.

## Banco e agendamento

Antes da migration, leitura do banco ativo: 3 assinaturas, 2 pagamentos, 4 planos, 7 eventos e 0 solicitações. A tabela de telemetria ainda não existia. Fingerprints completos por linha foram guardados para comparação após DDL: assinaturas `2fff13839ce3e18fbfb5aa22fcfc553c`, pagamentos `d55c78a72d5186254aff4e0323637628`, planos `4e79ad5e6c26781942919ca554a74422`, eventos `745b22384cc8bab8dc20edb559228d54`.

A branch padrão do GitHub é `main`, atualmente `5ee9e89f89b2fdf5f496565505fb0a70a418230d`. Ela contém a versão anterior do agendador (blob `fc6be2ec67e1962695dde38d272cafbb45bf9e4b`). A branch conectada Lovable é `saas/stage-03-asaas-checkout`; implantar nela não atualiza o cron em `main`. Este trabalho não troca a branch padrão, credenciais, flag ou ambiente. A configuração e a execução do agendamento atualizado permanecem pendências explícitas.

Leitura dos registros da execução existente [37165788890](https://github.com/GustavoFboz/dtfipo/actions/runs/37165788890), job `111328275782`: schedule em `main` concluído com sucesso às 00:43 UTC. A resposta normal informou 1 assinatura examinada, 0 eventos aplicados/recuperados e 0 revisões. Não foi invocada uma nova execução manual; esse resultado não comprova o workflow atualizado nem conciliação financeira completa.

Migration aplicada no banco ativo em transação com snapshot repetível, após CI aprovado. A comparação de linhas imediatamente antes/depois da DDL foi idêntica: 3 assinaturas (hash `82f7f85c5eef193a18614b74cd77f624`), 2 pagamentos, 4 planos e 7 eventos; hashes de pagamentos/planos/eventos permaneceram os mesmos da leitura inicial. Nenhuma linha de telemetria foi criada como prova artificial. Assertions de grants/RLS/RPC passaram no banco ativo.

RPC de leitura validado no banco ativo com claims SQL do operador habilitado AAL1; identidade sem autorização Master, mesmo AAL2, foi recusada. Essa simulação de claims não substitui teste com login real. A fotografia de 00:50 UTC apresentou Sandbox com 2 dead letters, 1 assinatura vinculada, 0 checkout incerto e 0 inconsistência local de período/ledger; Produção sem recursos vinculados/eventos; 9 reservas antigas somando 1.112.944.862 bytes. `worker=null` nos dois ambientes, porque ainda não havia execução da nova revisão publicada. O cron e seus recursos anteriores foram preservados.

## Aceites pendentes

Publicação efetiva desta revisão, agendamento atualizado na branch padrão, observação de heartbeat real, entrega de alertas externos, sessões/replay reais, conciliação Asaas↔ledger e provas financeiras das etapas 04/05/08. Produção continua bloqueada até os gates da etapa 09 e a compra real controlada pelo responsável. Nenhuma solicitação pendente será executada automaticamente com o retorno dos créditos.

Integração acompanhada na [PR 119](https://github.com/GustavoFboz/dtfipo/pull/119); revisão final, recibo de publicação e eventuais observações posteriores são registrados nessa PR.
