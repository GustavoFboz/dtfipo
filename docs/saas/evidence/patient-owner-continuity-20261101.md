# SaaS 4.2 — prevenção de cadastros órfãos e continuidade de identidade (01/11/2026)

Revisão somente leitura do Lovable Cloud e alterações locais no repositório. Nenhum paciente, caso, cobrança, contrato, bucket, RLS ou registro foi criado, alterado ou excluído no Cloud. Nenhum identificador, nome, prontuário, telefone, foto, e-mail ou segredo de paciente entra neste relatório.

## Defesa real de novos cadastros — já instalada no servidor

Inspeção de definições **atuais** de funções e triggers no catálogo PostgreSQL (não uma execução de INSERT):

- `public.patients.clinic_id` possui default `saas_company_current_id()`; ainda é coluna anulável por compatibilidade com o histórico.
- `aaa_saas_patient_company_guard` chama `saas_guard_patient_company()` em INSERT/UPDATE; INSERT sem empresa valida recebe `COMPANY_REQUIRED`, e mudança de empresa pelo cliente não confiável recebe `COMPANY_IMMUTABLE`.
- `trg_guard_saas_patient_company` chama `guard_saas_patient_company()` em INSERT/UPDATE OF clinic_id; para papéis cliente autenticado/anônimo, empresa diferente de `storage_current_clinic_id()` é recusada.
- A RPC `create_patient_idempotent_v1` exige usuário autenticado, empresa operacional, payload permitido, rejeita `clinic_id` divergente e insere sempre o `company` resolvido no servidor com chave de idempotência.
- O caminho existente `savePatientLocalFirst` já exige perfil com `clinic_id` para criar o paciente e sobrescreve uma eventual empresa enviada pelo formulário.

Isso é **proteção presente no código e banco**, não autorização para dizer que um teste negativo autenticado em Produção foi executado. Não adicionamos gatilho redundante nem CHECK NOT VALID em tabela clínica enquanto existirem registros legados e sem ensaio de migração.

## Falha de identidade corrigida nesta branch

Em `reference-local-first.ts`, o owner local era obtido antes de consultar a nuvem. Uma troca de conta durante a promessa permitia que o perfil retornado posteriormente fosse persistido no cache do owner antigo, ou que cache antigo fosse lido quando o token já pertencia a outra identidade. Agora o owner é conferido antes e após consultas/escritas; o payload `profile.id` deve coincidir com owner; falhas resultam em bloqueio, sem fallback silencioso.

Em `patients-local-first.ts`, perfis de criação devem pertencer ao usuário ativo; operações de criação/fila verificam continuidade antes de armazenar dados, e a sincronização da outbox exige identidade Cloud real **da mesma conta**. Respostas tardias da lista/detalhes de pacientes não podem atualizar SQLite sob uma identidade que já mudou.

Limites: estas são fronteiras de cache e interface, **não substituem autorização RLS**; dados já copiados em outros dispositivos requerem homologação física. A rotina nativa de expiração e exclusão em 72 horas permanece distinta.

## Auditoria histórica agregada — sem dados pessoais

| Medida confirmada em 01/11/2026 | Total |
| --- | ---: |
| Pacientes existentes | 104 |
| Com `clinic_id` válido/não nulo | 92 |
| Sem `clinic_id` | 12 |
| Sem empresa mesmo após `resolve_patient_clinic_id` | 12 |
| Sem casos associados | 12 |
| Sem foto nem notas/medical_history/clinical_notes | 12 |
| Com vínculo a agendamento de clínica existente | 1 |
| Agendamento cujo responsável tinha perfil da mesma clínica | 1 |
| Sem esse vínculo de agendamento | 11 |
| Com vínculo em `clinical_creation_requests` | 0 |
| Vínculos com anexos, evoluções, financeiro, radiologia ou `storage_files` | 0 |

Os 12 foram criados entre 07/08 e 17/09/2026 (3 em agosto; 9 em setembro). O registro relacionado a agendamento tem **pista para apuração manual**, não tem titularidade confirmada. Não concluir que ele pertence à clínica do agendamento sem revisar documentação ou processo de cadastro. Os outros 11 têm origem ainda menos definida.

O banco possui políticas RESTRICTIVE e função `can_access_patient`; isso requer testes negativos autenticados separados. Não usar função SECURITY DEFINER administrativa para inferir o que um usuário final pode ver.

## Próximas provas

1. Executar o novo teste de corrida de identidade em CI; conferir o build Windows e Android sem distribuir alterações.
2. Registrar teste negativo autenticado de INSERT órfão, empresa estrangeira e troca de conta com fixtures exclusivas, sem usar dados de pacientes reais nem alterar produção.
3. Investigar os 12 legados com o titular e evidência da empresa; só depois propor migração de titularidade audível, transacional, reversível, e com plano de incidente. A mera coincidência com uma clínica no agendamento não autoriza atribuição.
4. Concluir os demais aceites de 4.2 (sessão revogada/MFA/replay financeiro) separadamente.

Este marco não representa a conclusão do aceite 4.2 nem dos 60,87% **formais** (13/23 continuam aceitos). O indicador técnico só pode mudar após testes concluídos com evidência no ledger.
