# DentalFlow — auditoria agregada dos 12 pacientes sem clínica (01/11/2026)

**Fonte:** consulta SQL de leitura no PostgreSQL atual via projeto Lovable DentalFlow, sem alteração de registros e **sem acessar nomes, CPF, datas de nascimento ou campos clínicos**. Este recibo contém somente números agregados.

| Pergunta | Resultado |
| --- | ---: |
| Pacientes cadastrados na tabela `public.patients` | 104 |
| Pacientes com `clinic_id IS NOT NULL` | 92 |
| Empresas distintas dentre os 92 | 1 |
| Pacientes com `clinic_id IS NULL` | **12** |
| Casos de `public.cases` ligados a esses 12 por `patient_id` | **0** |
| Desses pacientes com casos | **0** |
| Registros sem clínica criados em agosto de 2026 | 3 |
| Registros sem clínica criados em setembro de 2026 | 9 |

**O que são:** linhas da tabela de cadastro de pacientes que não possuem empresa atribuída no campo `clinic_id`, criadas no período acima. A ausência de casos vinculados indica apenas que o vínculo direto `cases.patient_id` não existe para eles; não atesta que nunca tiveram anexos, solicitações, importações ou dados clínicos em outros locais.

**O que não é possível deduzir:** não há evidência suficiente de que pertençam à IPO, de que são testes, de que seriam duplicados ou de que possam ser descartados. A data e a ausência de casos não constituem prova de propriedade. Não fazer atribuição em massa, exclusão, movimentação ou exposição pública antes da análise da origem.

**Regra de segurança recomendada:** manter os 12 sem atribuição visível a empresas até que o proprietário legítimo seja documentado por trilhas de criação, importação, conta associada ou histórico autorizado. Para a operação beta, rejeitar criação de novos registros sem propriedade e impedir acesso cruzado. A prova de RLS com duas empresas no CI já existe, mas um teste real de sessão continua para o piloto.

A consulta para repetir o relatório agregado consta em `docs/saas/sql/unassigned-patients-readonly-summary.sql`. Este relatório não é inventário pessoal e não compartilha identificadores de pacientes.
