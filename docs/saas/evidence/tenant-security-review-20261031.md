# SaaS 4.2 — auditoria conservadora de isolamento (31/10/2026)

Somente leitura do Lovable Cloud + inspeção do código em branch separada. Nenhuma atualização em `patients`, permissões/RLS, sessões, arquivos, planos ou Asaas. Dados individuais, nomes, emails, IDs de pacientes e endereços não foram copiados ao GitHub.

## Diagnóstico agregado da titularidade de pacientes

A consulta contadora em `public.patients` retornou:

| Inventário | Contagem |
| --- | ---: |
| Pacientes totais | 104 |
| Pacientes com `clinic_id` | 92 |
| Pacientes sem `clinic_id` | 12 |
| Desses 12, com dono inferido por `resolve_patient_clinic_id` | 0 |
| Desses 12, ainda sem dono após a resolução | 12 |

Verificamos o corpo de `resolve_patient_clinic_id`: primeiro retorna o `clinic_id` próprio do paciente; se ausente, procura uma associação com o caso mais recente por `resolve_case_clinic_id`. **Nenhum dos 12 pacientes sem vinculação foi resolvido por essa função**. A consulta não atribuiu dono. Não houve operação de leitura de prontuários nem exposição de dados identificáveis nesta auditoria.

O catálogo `pg_policies` mostrou política RESTRICTIVE `patients_company_read_boundary` que exige `can_access_patient(id)` para SELECT, além de políticas positivas para membro/caso. Em `can_access_patient`, sem `auth.uid()` ou sem clínica empresarial operacional o acesso retorna `false`. Isso documenta a defesa declarada, **não substitui uma tentativa negativa real por contas de duas empresas**. Não afirmar que os 12 registros são acessíveis ou inacessíveis a todos os usuários com base apenas nesta leitura administrativa.

## Proteção da interface de fluxos

A PR [#215](https://github.com/GustavoFboz/dtfipo/pull/215) elimina fallback que confundia etapas de empresa em caso compartilhado quando a etapa atual não estava na lista. CI geral validou os testes sintéticos de isolamento no [workflow 41267138270](https://github.com/GustavoFboz/dtfipo/actions/runs/41267138270). Esta barreira é do **frontend**, não é uma substituição do RLS.

## Segurança Master/MFA

O aceite parcial já registrava a sessão Master AAL2 real e duas decisões individuais de revisão com auditoria em 24/10: `docs/saas/evidence/events-recovery-master-20261024.md`. A revisão positiva de replay financeiro não ocorreu; o contador de replays permaneceu zero.

## Próximos aceites não concluídos

1. Rastrear a origem legítima dos 12 pacientes sem vínculo usando prova de propriedade; somente então elaborar migração auditável e reversível, se autorizada. Nunca inferir que pertencem à IPO.
2. Verificar negativas reais entre duas empresas, suspensão/revogação e login simultâneo em dispositivos distintos sem violar dados.
3. Realizar replay financeiro positivo único por mecanismo Master/MFA autorizado, com reconciliação e idempotência. Não acionar cobrança adicional durante a auditoria estática.

Progresso 4.2: **dois marcos de cinco comprovados**, três não concluídos. O critério formal segue **parcial**. `60,87%` de implementação técnica anterior mais `0,4/23` de pontos comprovados do 4.2 resulta em **62,61%** segundo o ledger técnico, mas não altera os 13/23 aceites finais.
