# Segurança SaaS 4.2 — isolamento de etapas de casos compartilhados

Data: 31/10/2026. Mudança isolada no frontend; **sem escrita no banco de produção**.

## Evidência de risco corrigido

A leitura colaborativa pode expor à interface definições de fluxo de múltiplas empresas. `workflowCompanyStages` selecionava a empresa pelo `current_stage_id`, mas quando o ID não existia na lista usava como fallback qualquer lista que contivesse apenas uma empresa. Isso podia exibir a sequência de **outra** empresa. A mesma regra incluía linhas legadas sem `clinic_id` quando coexistiam com uma única empresa.

Essa é uma barreira de **apresentação e integridade da operação**. Não substitui RLS, checagem de autorização do backend, nem prova que ocorreu exposição de prontuários. Não houve acesso aos dados reais do paciente nesta mudança.

## Alteração

- Se o caso referencia uma etapa ausente ou sem empresa, nenhuma sequência é exibida; não se assume outra empresa.
- Se não há etapa selecionada, somente uma empresa identificável permite exibir a sequência; etapas sem empresa são excluídas.
- Uma etapa válida continua mostrando todas as etapas da mesma empresa e versão histórica, sem misturar versões nem fluxos.
- Tests estendidos em `src/lib/workflow-company-boundary.test.ts`: etapa ausente, órfã, lista legada e colaboração A/B.

## Limites do aceite 4.2

A verificação de CI neste repositório é **sintética**. O aceite geral continua exigindo testes autenticados e negativos de acesso entre empresas, revogação de sessão, replay financeiro real e origem dos doze pacientes previamente classificados sem vínculo de empresa. Não fazer correção de `clinic_id` por suposição; verificar titularidade em ambiente auditável antes de qualquer SQL de atualização.

Esta PR não toca em Asaas, backups 6.2, sessão Master real, migrações ou publicação de builds. A métrica de implementação deve contar um marco técnico somente depois de verificar a CI integral.
