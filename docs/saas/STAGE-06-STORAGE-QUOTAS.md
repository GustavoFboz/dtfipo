# Etapa 06 — cota do plano e adicionais (parte 1)

Contador de conclusão em 04/10: **3/7**, conforme RELEASE-PLAN.md. Correções de
falha na exclusão de paciente/cancelamento de reserva e ensaio de uploads de
paciente e isolamento dos dados/objetos privados entre empresas estão em
evidence/READINESS-PASSWORD-STORAGE-2026-10-04.md.
Os aceites reais dos módulos disponíveis continuam em aberto.

Status: cotas e reservas obrigatórias implantadas na base ativa em 29/09/2026.
Restauração, uploads autenticados e concorrência passaram em CI; a asserção
somente leitura do banco ativo retornou `passed`. Upload e exclusão de anexo de
caso foram comprovados pela conta publicada. Restam outros uploads dos módulos
disponíveis e a revisão dos resíduos históricos. Por decisão do responsável em
03/10, a homologação DICOM fica para a ativação da Radiologia e não bloqueia
a conclusão do SaaS atual.

Revalidação de 03/10/2026: ambas as asserções somente leitura retornaram
`passed`; AS Lab conserva 25 GiB, IPO 500 GiB e isenção, e o checkout pendente
conserva 1 GiB. Foram identificadas nove reservas antigas sem objeto nem anexo
e cinco objetos históricos sem origem identificável. Esses registros não foram
alterados. Resultados, limites da prova e próximos testes estão em
`evidence/STAGE-06-LIVE-AUDIT-2026-10-03.md`.

O primeiro novo anexo pela conta publicada foi confirmado em 03/10: objeto,
registro de anexo e catálogo `ready` existem e contabilizam 26.088.984 bytes.
A exclusão pela interface encontrou uma confirmação escondida atrás do detalhe
do caso. A correção das camadas, da fila de confirmações e da formatação do uso
está em `evidence/STAGE-06-DELETE-CONFIRMATION-2026-10-03.md`. Em seguida, o
responsável confirmou a exclusão funcionando corretamente. A verificação
somente leitura comprovou remoção do objeto, anexo e catálogo, com liberação
exata dos 26.088.984 bytes e preservação das nove reservas antigas.

Recuperação manual de 03/10: a área de armazenamento passa a mostrar os envios
pendentes da empresa. Só um administrador pode liberar uma reserva de pelo
menos 24 horas, sem objeto e sem origem vinculada. O INSERT de Storage e a
liberação agora disputam o bloqueio da mesma reserva. Nenhum dos nove registros
históricos foi liberado automaticamente. Contrato, testes e limites em
`evidence/STAGE-06-RESERVATION-RECOVERY-2026-10-03.md`.

## Problema comprovado em 28/09/2026

A AS Lab pagou o plano `company_initial` e recebeu 25 GiB em
`clinics.storage_limit_bytes`. Ela ainda não tem linhas em
`clinic_storage_entitlements`. A rotina antiga `recalculate_clinic_storage_limit`
considera somente essas linhas e voltaria a cota a 1 GiB quando um adicional
fosse alterado. A IPO mantém 500 GiB e duas linhas históricas de base e cortesia.

## Contrato desta correção

- O plano comercial estabelecido fornece a cota incluída. Um checkout pendente
  não concede a cota prometida; suspensão mantém a cota exibida e os arquivos.
- A soma das cotas legadas `base`/`courtesy` pode elevar o piso, mas não duplicar
  os 25 GiB ou os 500 GiB já previstos no plano.
- Adicionais `purchase`/`manual` somam acima desse piso. Cancelar um adicional
  conserva a cota do plano, mesmo que o uso atual ultrapasse o novo limite;
  não apaga arquivos.
- A IPO permanece com pelo menos 500 GiB e isenção de cobrança.
- Só a função privada de entitlement ou `service_role` recalcula o valor.

O teste de restauração cria empresas descartáveis pagante e pendente, adiciona
e cancela 10 GiB, verifica os limites e desfaz todas as alterações. No banco vivo,
usar apenas `stage-06-quota-assertions.sql` após aplicar a migration. Não
executar o ensaio de escrita no banco vivo.

## Parte 2 — reservas obrigatórias para uploads

Integrada via PR #88 ao ramo conectado ao Lovable após ensaio de restauração em
CI e implantação controlada. Uma política restritiva exige
uma reserva da mesma empresa, usuário, caminho e tamanho para todas as cinco
buckets (`avatars`, `patient-photos`, `patient-files`, `case-files`,
`dicom-files`). O código DICOM também reserva e conclui cada instância.
No bucket de casos, somente o autor da reserva pode ler o objeto no curto
intervalo entre o upload e o cadastro do anexo.

Clientes não podem alterar diretamente o catálogo, o limite, a isenção de
cobrança nem sua associação à empresa. Sobrescrever um objeto gerenciado é
bloqueado; remoção só libera o lançamento depois de a Storage API confirmar a
ausência do objeto. As políticas DICOM deixam de comparar o identificador da
empresa com o nome da própria empresa. Pacientes novos recebem a empresa no
cadastro, permitindo enviar foto antes de abrir o primeiro caso.

O ensaio `stage-06-upload-rehearsal.sql` roda somente em banco descartável e
simula usuário autenticado, objeto sem reserva, tamanho divergente, cota cheia,
tentativa de apagar o catálogo e alteração direta da cota. O ensaio
`stage-06-concurrency-rehearsal.sh` usa duas conexões e verifica que somente a
primeira reserva passa quando a soma ultrapassaria o limite. No banco em uso,
executar somente `stage-06-upload-assertions.sql` após a migração.

Auditoria prévia do banco: 30 objetos de `case-files` e 2 de `patient-photos`
não tinham lançamento; 8 lançamentos de `case-files` apontavam para objetos
ausentes. A migração contabiliza objetos históricos de casos identificáveis,
mas preserva os demais e não apaga nenhum arquivo. Após aplicar, conferir
resíduos sem empresa identificável e o tamanho real por empresa. A concorrência
e uploads autenticados foram ensaiados na base descartável do CI. O teste real
de caso passou; os demais uploads disponíveis ainda precisam de homologação.
O fluxo DICOM será validado antes de disponibilizar a Radiologia e não integra
o bloqueio atual do SaaS. As políticas e reservas desse bucket são preservadas.
