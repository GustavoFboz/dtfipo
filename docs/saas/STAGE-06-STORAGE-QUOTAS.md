# Etapa 06 — cota do plano e adicionais (parte 1)

Status: correção preparada em branch separada; exige restauração em CI e
aplicação controlada no banco antes de considerá-la ativa.

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

Preparada em `saas/stage-06-upload-guards`, ainda depende do ensaio de
restauração em CI e de implantação controlada. Uma política restritiva exige
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
resíduos sem empresa identificável, o tamanho real por empresa e o fluxo real
de upload DICOM. A aprovação do ensaio de concorrência no CI e o teste de
ponta a ponta pela Storage API ainda são portas para declarar prontidão de
produção.
