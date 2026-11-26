# DentalFlow — baseline vivo para restauração de casos e anexos

**Conferência exclusivamente de leitura, 04/11/2026.** Usar [SQL de pré/pós-restauração](../sql/clinical-storage-restore-aggregate-preflight.sql). O registro publica apenas contagens; nomes de pacientes, IDs, caminhos e conteúdo de anexos nunca são copiados ao repositório.

## Banco atual (contagens)

| Entidade | Contagem |
|---|---:|
| Pacientes | 93 |
| Casos | 86 |
| Agendamentos clínicos | 8 |
| Registros em storage_files | 702 |
| Anexos em case_attachments | 613 |

Um cadastro de paciente sem clínica foi preservado porque mantém agendamento legítimo. Não reatribuir ou excluir registros para forçar uma contagem.

## Vínculos com objetos armazenados

| Bucket em storage_files | Registros | Objeto encontrado | Referência de caso/paciente/clínica quebrada |
|---|---:|---:|---:|
| avatars | 6 | 6 | 0 |
| case-files | 648 | 648 | 0 |
| patient-photos | 48 | 48 | 0 |
| **Total** | **702** | **702** | **0** |

Dos **613 registros case_attachments**, todos os 613 apontam para objetos existentes no bucket case-files. **609** estão ligados a casos atualmente existentes; **4** têm vínculo com **um único caso antigo ausente da tabela cases**. Todos os quatro foram criados em 21/09/2026, sem sinalização de expiração nem falta de bytes. Esta é uma divergência histórica a investigar durante a restauração; não é motivo para excluir anexos ou recriar casos sem evidência.

RLS está habilitada em cases, case_attachments e storage_files. Quantidade de policies observada respectivamente: 11, 6 e 1. **A existência de RLS não prova sozinha o isolamento entre empresas**; isso demanda testes de autenticação e acesso cruzado na etapa 4/8.

## Regras durante a recuperação

- Não apagar os quatro registros históricos nem seus objetos. Não inventar um case_id substituto; preservar a associação original para perícia/decisão de retenção.
- Repetir o SQL **em staging isolado** depois de importar o banco atual e Storage. Comparar contagens; contabilizar mudanças legítimas ocorridas entre backup e importação.
- Qualquer ausência adicional de bytes, caso ou paciente deve interromper a homologação; não forçar o indicador 3/8 e não disparar cobrança, webhook ou deploy.
- O inventário de metadados original de 708 objetos já coincide em SHA-256 nos quatro buckets. Os 21 objetos extras são exportações de banco fora daquele inventário; nenhum deles deve ser confundido com anexos clínicos novos.
- Restauração real exige tanto a cópia independente de Storage (conferida pelo proprietário após readback Drive) quanto **uma exportação nova do banco atual**, não o dump de 29/10.

**Resultado:** baseline confiável para futura comparação, mas etapa **3/8 pendente** e piloto pago ainda bloqueado. CI de restauração do schema com dados sintéticos **não substitui** restore das informações reais com autorização.

Rastro técnico: [issue #241](https://github.com/GustavoFboz/dtfipo/issues/241) e docs/saas/BETA-RELEASE-8-EXECUTIONS.json.
