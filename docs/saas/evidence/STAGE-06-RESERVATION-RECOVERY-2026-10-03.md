# Etapa 06 — recuperação manual de envios pendentes

Status: implementação validada localmente e no CI; migration aplicada ao banco
ativo em 03/10/2026, com três asserções somente leitura aprovadas. Asaas em standby.
A exclusão publicada corrigida no PR anterior ainda aguarda repetição pelo
responsável. Nenhum arquivo de usuário ou reserva histórica foi removido aqui.

## Problema confirmado

A auditoria somente leitura encontrou nove reservas antigas sem objeto, todas
de casos da IPO, somando 1.112.944.862 bytes (cerca de 1,04 GiB). O catálogo
contabiliza `reserved` e `ready`; a tela administrativa mostrava apenas `ready`.
Uma nova consulta agregada confirmou 500 entradas `ready` e as mesmas nove
reservas. O novo anexo de homologação continua com objeto; sua exclusão real
ainda não foi comprovada.

## Comportamento

A área de armazenamento mostra até 200 envios pendentes da empresa, mais
antigos primeiro. Reservas com menos de 24 horas ficam indisponíveis para
liberação. O administrador confirma individualmente que um envio foi
abandonado; a idade, sozinha, não constitui autorização para limpeza automática.

`release_storage_upload_reservation(uuid,uuid)` exige identidade autenticada,
Admin/CEO da empresa indicada, estado `reserved`, pelo menos 24 horas, ausência
do objeto e ausência de uma origem vinculada. IDs de outra empresa não revelam
nem alteram seus registros. Um pedido repetido após a liberação devolve zero
bytes e não desconta a cota duas vezes. A função só elimina a reserva do catálogo;
não chama Storage nem remove anexo, paciente, caso ou instância DICOM.

A cota e a lista são atualizadas somente após resposta válida do servidor.
Erro, indisponibilidade, resposta vazia/incoerente ou atraso preservam a
apresentação anterior até uma nova consulta. As consultas são isoladas por
conta/empresa; uma confirmação antiga não é enviada após troca de conta.

## Concorrência e compatibilidade

O novo helper `storage_upload_has_reservation_for_insert(text,text,jsonb)`
executa `FOR SHARE` na reserva até terminar a transação de INSERT do Storage.
A liberação executa `FOR UPDATE` na mesma linha. Se o upload ganhar o bloqueio,
a liberação espera e recusa porque o objeto existe. Se a liberação ganhar,
o INSERT espera e perde a autorização após a exclusão da reserva.

O helper `STABLE` antigo permanece para leituras e URLs assinadas. O INSERT
continua aceitando metadados sem tamanho, conforme o hotfix de 29/09; quando
o tamanho é fornecido, deve coincidir. A finalização continua exigindo o tamanho
real persistido. Caminhos novos e reservas obrigatórias permanecem necessários.

Web, Desktop e Android usam o mesmo contrato público de `@/lib/storage` e seus
adapters de identidade. A última medição da cota continua disponível pelo cache
local existente. A recuperação exige validação online e não entra na outbox:
uma decisão baseada em objeto/origem precisa ser reavaliada no servidor no
momento da ação. As consultas/ações novas têm prazo finito de 12 segundos para
evitar espera indefinida em uma conexão indisponível. Nenhum dado clínico local
é removido ou bloqueado por indisponibilidade desse recurso administrativo.

## Verificação

154 testes locais passaram em 14 arquivos: reservas, respostas ambíguas,
idempotência, prazo de conexão, preservação da cota em recusas, confirmação,
troca de empresa e respostas atrasadas, além das regressões de Asaas, Master,
confirmação global e entitlement Desktop. TypeScript e os contratos de
Desktop/Android também passaram, assim como os builds de produção Web, Desktop
e Android executados em sequência. Nenhum instalador nativo foi gerado; os testes
React usam happy-dom e não equivalem à homologação em dispositivos instalados.
O pacote de restauração contém 165 migrations;
o self-heal conserva as revogações a `PUBLIC` e `anon` das funções novas.

O CI executa asserção somente leitura, ensaio com usuários sintéticos
em `ROLLBACK` e dois testes com conexões concorrentes numa base Supabase
descartável. Esses ensaios não podem ser executados no banco ativo. Só a
asserção em `stage-06-reservation-recovery-assertions.sql` é somente leitura.

A árvore do código validado (`48c7a6aa05dad886b11c04caa1573456bc47bef8`) é
idêntica à enviada no commit `95350c9e15a5e786de95a918e3d55b3c2e47d1c4`.
[CI do aplicativo](https://github.com/GustavoFboz/dtfipo/actions/runs/37159227496)
e [restauração/concorrência](https://github.com/GustavoFboz/dtfipo/actions/runs/37159231595)
terminaram com `success`. Ambos os sentidos da corrida upload/liberação
passaram; os ensaios anteriores de quota, uploads, Master e faturamento também.

Após esse CI, somente o DDL da migration nova foi executado em uma transação
no banco ativo. As asserções de quota, uploads e recuperação retornaram
`passed`. A consulta posterior confirmou a IPO com 500 entradas `ready`, nove
reservas, 7.534.408.222 bytes contabilizados e os mesmos 1.112.944.862 bytes
reservados. O anexo de homologação continua com objeto. Não houve liberação de
reserva histórica nem remoção de objeto durante a implantação.

## Homologação que permanece aberta

Após aplicar a migration e publicar a versão, abrir Armazenamento como Admin
ou CEO e conferir os envios pendentes. Revisar apenas um envio conhecido e
abandonado; verificar que ele sai da lista e que a medição cai pelo valor
confirmado. Para reenviar, iniciar um novo upload. Erros de arquivo existente,
registro vinculado ou envio recente devem manter a cota.

Os nove registros históricos dependem dessa revisão individual. Os cinco
objetos antigos sem origem identificável continuam preservados. O novo teste
de exclusão e os demais uploads, especialmente DICOM, ainda são necessários
para encerrar a etapa 06. O protocolo continua com pendências nas etapas 04–09.
