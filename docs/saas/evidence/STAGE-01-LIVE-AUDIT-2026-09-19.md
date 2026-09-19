# Evidência viva — Etapa 01 SaaS

Status: aprovada

Execução no Lovable Cloud: 2026-09-19 23:05:07 UTC

Arquivo de origem recebido: `query-results-export-2026-09-19_19-05-17.csv`

SHA-256 do arquivo de origem:
`12292cc25e6f87464967de22b74456d9999bb753b92b8df156424fe7df11225f`

O CSV original não foi versionado. Esta evidência preserva somente presença de
schema, contagens e permissões, sem CPF/CNPJ, nomes, UUIDs, e-mails ou dados
clínicos.

## Resultado

### Contrato e identidade externa

- a migration canônica da Etapa 01 estava presente no schema vivo;
- as 12 colunas esperadas estavam presentes;
- os seis índices únicos por provedor e ambiente estavam presentes;
- todas as assinaturas auditadas permaneciam no ciclo `MONTHLY`;
- não havia grupos duplicados de clientes, assinaturas, pagamentos ou eventos;
- não havia tuplas inválidas de provedor e ambiente.

### Perfil fiscal e cliente Asaas

| Métrica | Resultado |
| --- | ---: |
| Perfis fiscais cadastrados | 0 |
| Clientes Asaas vinculados no Sandbox | 0 |
| Clientes Asaas vinculados em Produção | 0 |

As contagens zeradas são o estado esperado antes da Etapa 02. A Etapa 01 cria
o contrato protegido, mas não envia dados ao Asaas nem ativa assinaturas.

### Segurança

- RLS estava habilitada em `company_billing_profiles` e
  `billing_provider_customers`;
- `anon` e `authenticated` não possuíam leitura direta das tabelas restritas;
- `service_role` possuía a leitura necessária para o adapter do backend;
- não havia policies de cliente expondo o perfil fiscal;
- `billing_get_company_profile()` e `billing_upsert_company_profile()` eram
  executáveis por usuário autenticado e protegidas internamente pela associação
  e pelo papel da empresa;
- `billing_bind_asaas_customer()` negava execução a `anon` e `authenticated` e
  permitia somente `service_role`.

## Veredito

A aplicação viva e a auditoria da Etapa 01 estão aprovadas. O schema oficial
possui as fronteiras necessárias para cliente Asaas, perfil fiscal, ambiente e
idempotência sem expor dados fiscais ao navegador.

A Etapa 01 permanece aberta somente para:

1. regenerar os tipos Supabase a partir do schema vivo;
2. ensaiar o pacote consolidado em um banco limpo;
3. anexar a evidência do ensaio e concluir a revisão da PR.
