# Revisão das onze tabelas legadas restantes

Consulta somente de metadados em 22/10/2026: colunas, chaves estrangeiras e
políticas. Nenhum conteúdo de diretório, paciente ou item de estoque foi
retornado. [Metadados](legacy-table-metadata-20261022.json).

Esta revisão sucede a correção separada de `case_activity_reads`. O item 4.2
permanece parcial; um SELECT amplo não comprova por si só a finalidade do dado.

| Grupo | Observação confirmada | Próximo trabalho |
| --- | --- | --- |
| cadistas, doctors, proteticos | Guardam nome e vínculo opcional com usuário. SELECT amplo autenticado. | Restringir pelo próprio usuário, empresa e participação autorizada no caso; definir o destino dos registros sem vínculo. |
| stock_items | Guarda saldo, mínimo e notas; não tem `clinic_id` nem autor. SELECT amplo autenticado; escrita usa papéis globais legados. | Implantar propriedade por empresa e conferir vínculos históricos antes de atribuir dados existentes. |
| case_types, component_categories, components, implant_systems, scan_jigs, tooth_colors | Não possuem coluna de empresa. Há permissões de escrita baseadas em papéis globais. | Determinar o que é catálogo global e o que pode ser personalizado por empresa, com separação de autoria e escrita. |
| workflow_templates | Chave global `flow_key`, versão ativa e `updated_by`; leitura ampla. | Rever configuração global versus por empresa e a fronteira de publicação de workflows. |

As chamadas existentes de `fetchStockItems`, `fetchStockItemsV2`, `fetchDoctors`
e `fetchCadistas` consultam essas tabelas diretamente, sem filtro de empresa.
Logo, esconder opções na interface não substitui a proteção no banco. O mesmo
contrato é usado nos clientes instalados e deve preservar o sincronismo local.

Não é seguro preencher uma empresa arbitrária nos registros históricos: a
estrutura atual não identifica sua propriedade. Também não foi aplicada uma
negação geral que interromperia os fluxos existentes. A correção de marcadores
é independente dessa migração de propriedade; nenhuma destas onze tabelas foi
alterada por ela. Não há novo aceite nem aprovação comercial nesta revisão.
