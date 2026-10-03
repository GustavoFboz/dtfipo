# Etapa 06 — auditoria ativa e próximos testes em 03/10/2026

Status: parcial. A etapa financeira 05 continua em espera até o retorno dos
créditos Lovable, conforme orientação do responsável. O avanço independente
atual é a etapa 06; nenhuma chamada ao Asaas foi feita nesta auditoria.

## Provas obtidas

O backend conectado foi consultado em transações `READ ONLY`, finalizadas com
`ROLLBACK`. As duas asserções versionadas passaram:

- `sql/stage-06-quota-assertions.sql`: `stage_06_quota_contract = passed`.
- `sql/stage-06-upload-assertions.sql`: `stage_06_upload_contract = passed`.

As consultas de contabilização retornaram:

| Empresa | Cota | Bytes contabilizados | Arquivos prontos | Reservas | Isenção |
| --- | ---: | ---: | ---: | ---: | --- |
| AS Lab | 25 GiB | 0 | 0 | 0 | Não |
| DentalFlow Homologação Sandbox | 1 GiB | 0 | 0 | 0 | Não |
| IPO — Instituto Praia de Odontologia | 500 GiB | 7.508.319.238 | 499 | 9 | Sim |

Nenhuma empresa estava acima da cota. A cota de 1 GiB do checkout pendente não
equivale à concessão antecipada dos 25 GiB do plano.

| Bucket | Objetos | Prontos no catálogo | Objetos sem catálogo | Prontos sem objeto | Divergências de tamanho | Reservas com mais de 24 h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| avatars | 6 | 6 | 0 | 0 | 0 | 0 |
| case-files | 462 | 459 | 3 | 0 | 0 | 9 |
| patient-photos | 36 | 34 | 2 | 0 | 0 | 0 |
| patient-files | 0 | 0 | 0 | 0 | 0 | 0 |
| dicom-files | 0 | 0 | 0 | 0 | 0 | 0 |

Todos os objetos retornaram metadados de tamanho válidos. Nos arquivos prontos
que têm objeto e catálogo, não houve diferença de tamanho. Isso não comprova
integridade do conteúdo nem sucesso de um novo upload pela interface.

## Pendências comprovadas

As nove reservas são de `case_attachment`, pertencem à IPO e somam
1.112.944.862 bytes (aproximadamente 1,04 GiB). Foram criadas entre
11/09/2026 e 30/09/2026; todas mantêm um caso existente, mas nenhuma possui
objeto nem registro ativo de anexo. Continuam entrando no uso de armazenamento.
O banco não permite concluir a causa de cada interrupção nem comprovar que
nenhum cliente ainda tem um envio pendente. A idade, por si só, não autoriza
limpeza automática.

Os três objetos de casos sem catálogo somam 36.020.039 bytes e datam de
30–31/07/2026. As duas fotos sem catálogo somam 36.479 bytes e datam de
27/07–21/08/2026. Os identificadores no caminho não correspondem a casos ou
pacientes atuais; não foi possível atribuir uma empresa. Nenhum objeto foi
apagado, movido ou atribuído a uma empresa por suposição.

O contrato atual de `cancel_storage_upload(uuid)` exige o autor da reserva ou
gestor da empresa e recusa liberar o catálogo se o objeto ainda existir. A
reconciliação das reservas precisa usar esse contrato e verificar antes que o
envio foi abandonado; não executar um `DELETE` geral no banco vivo.

## Próximo teste pela interface publicada

1. Atualizar `/master`, entrar com o operador autorizado e confirmar o
   autenticador já cadastrado. Após sair e entrar novamente, verificar que
   os formulários e confirmações locais da sessão anterior foram descartados.
   Se houver uma conta comum disponível, confirmar que `/master` nega seu
   acesso e não exibe a lista global de empresas. Não reenviar eventos nesta
   verificação.
2. Na operação normal de uma empresa autorizada, abrir **Armazenamento** e
   anotar a cota e o uso antes do teste.
3. Em um caso de homologação, anexar um arquivo pequeno sem dados clínicos.
   Confirmar que o anexo abre, permanece após atualizar a página e aumenta o
   uso pelo tamanho do arquivo. No backend, confirmar o objeto, o catálogo
   `ready` e a ausência de uma reserva restante para esse envio.
4. Remover apenas o anexo de homologação pela interface e confirmar que o
   objeto desapareceu e o uso retornou ao valor anterior.
5. **Adiado por decisão do responsável em 03/10:** a Radiologia ainda não
   funciona. Antes de ativar esse módulo, repetir com uma pequena série DICOM
   de homologação e validar instâncias, abertura e contabilização. Nenhum objeto
   DICOM foi encontrado nesta auditoria; o ensaio não bloqueia o SaaS atual.

Atualização posterior do roteiro: upload e exclusão de anexo de caso foram
comprovados na conta publicada; consulte
`STAGE-06-DELETE-CONFIRMATION-2026-10-03.md`. A validação DICOM permanece separada
para a futura ativação da Radiologia.

Interrupção de upload, recuperação de reserva e concorrência já têm testes em
base descartável. A prova de uma interrupção na interface publicada deve usar
um arquivo e um caso de homologação, sem alterar a cota para forçar falhas no
banco vivo. A limpeza das nove reservas históricas é uma pendência distinta.

## Publicação e limites

O Lovable informou `ready`, `is_published = true` e último commit conectado
`423b2a48879d27e27c50bd61250bf87c95c0275c`. Esses campos confirmam a existência
do site e a sincronização do código, mas não informam qual commit terminou de
ser publicado. A implantação solicitada anteriormente não tem confirmação
individual de conclusão. O teste da interface precisa verificar a versão
efetivamente servida antes de registrar evidência de sessão Master.

A etapa 06 permanece aberta pelos testes publicados e pela reconciliação dos
resíduos. A etapa 07 permanece aberta pelos testes com logins reais e pelo
replay auditado de um evento Sandbox previamente revisado. Permanecem seis
etapas com pendências: 04, 05, 06, 07, 08 e 09.

## Validação do registro

`npm run check:saas:stage-06`, `npm run check:saas:stage-09` e a checagem do
pacote de restauração passaram. Os 78 testes existentes de adapter Asaas,
checkout, webhook, renovação, documento fiscal, cotas e entitlement Desktop
também passaram via Vitest. Esta entrega altera somente documentação.
