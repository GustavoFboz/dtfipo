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

Não houve teste em dispositivos Windows/Android, nova sessão real Master nem evidência financeira real neste incremento. Ensaios isolados e builds não substituem esses aceites.

## Banco e agendamento

Antes da migration, leitura do banco ativo: 3 assinaturas, 2 pagamentos, 4 planos, 7 eventos e 0 solicitações. A tabela de telemetria ainda não existia. Fingerprints completos por linha foram guardados para comparação após DDL: assinaturas `2fff13839ce3e18fbfb5aa22fcfc553c`, pagamentos `d55c78a72d5186254aff4e0323637628`, planos `4e79ad5e6c26781942919ca554a74422`, eventos `745b22384cc8bab8dc20edb559228d54`.

A branch padrão do GitHub é `main`, atualmente `5ee9e89f89b2fdf5f496565505fb0a70a418230d`. Ela contém a versão anterior do agendador (blob `fc6be2ec67e1962695dde38d272cafbb45bf9e4b`). A branch conectada Lovable é `saas/stage-03-asaas-checkout`; implantar nela não atualiza o cron em `main`. Este trabalho não troca a branch padrão, credenciais, flag ou ambiente. A configuração e a execução do agendamento atualizado permanecem pendências explícitas.

## Aceites pendentes

Publicação efetiva desta revisão, agendamento atualizado na branch padrão, observação de heartbeat real, entrega de alertas externos, sessões/replay reais, conciliação Asaas↔ledger e provas financeiras das etapas 04/05/08. Produção continua bloqueada até os gates da etapa 09 e a compra real controlada pelo responsável. Nenhuma solicitação pendente será executada automaticamente com o retorno dos créditos.
