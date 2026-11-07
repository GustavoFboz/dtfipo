# DentalFlow — Etapa 4/8: comprovação autenticada de casos em QA

**Situação (07/11/2026): ferramenta preparada; execução autenticada real pendente.**
Este procedimento não autoriza cobrança, publicação ou acesso a dados clínicos reais.

## Objetivo

Completar a lacuna entre os testes SQL fictícios da PR #270 e o aceite de isolamento entre empresas na aplicação. Verificar com **duas sessões de usuários reais de QA**, em duas clínicas fictícias isoladas, que cada usuário:

1. Autentica sua identidade por `GET /auth/v1/user`.
2. Enxerga seu próprio perfil/empresa e um paciente fictício criado no QA.
3. Não enxerga o paciente fictício da outra empresa.
4. Enxerga exatamente um caso próprio **vinculado àquele paciente**.
5. Não enxerga o caso fictício da outra empresa.

A ferramenta `scripts/saas-case-tenant-readonly-probe.mjs` **só faz GET** e usa as mesmas barreiras de origem/credenciais do ensaio `saas-tenant-readonly-probe.mjs`. Emite somente códigos, nomes genéricos de verificações e resultado; não imprime nomes, IDs de pacientes, URLs nem tokens.

## Pré-requisitos para execução real

- Projeto **Supabase de QA separado da produção**, com duas clínicas e contas de teste autorizadas, criadas pelas rotas normais; **não** usar contas IPO nem dados clínicos.
- Um paciente e um caso por clínica, com vínculos corretos e confirmação prévia de que não foram apagados.
- JWTs efêmeros de cada usuário, somente em secrets de execução privada, nunca em GitHub, arquivos de texto ou chat. Não usar `service_role` nem `sb_secret_`.
- Valores privados locais: `DENTALFLOW_QA_SUPABASE_URL`, `DENTALFLOW_QA_ANON_KEY`, `DENTALFLOW_QA_ACTOR_A_JWT`, `DENTALFLOW_QA_ACTOR_B_JWT`, `DENTALFLOW_QA_PATIENT_A_ID`, `DENTALFLOW_QA_PATIENT_B_ID`, `DENTALFLOW_QA_CASE_A_ID`, `DENTALFLOW_QA_CASE_B_ID`.
- Conferir que o projeto selecionado é realmente QA antes de executar. Não configurar esse script com projeto ou credenciais de produção.

## Execução

Após configurar as variáveis **fora do repositório**, no ambiente de QA autorizado:

```sh
node scripts/saas-case-tenant-readonly-probe.mjs
```

O retorno só é aprovado se houver **controles positivos e negativos reais para ambas as empresas**. Se faltar uma conta, paciente, caso, vínculo ou credencial, o script falha sem tratar resultados vazios como isolamento bem-sucedido.

## Limites

A CI prova apenas o comportamento da ferramenta com HTTP sintético. O ensaio real acima ainda deve ser executado; ele comprova somente leitura de pacientes/casos. A conclusão da etapa 4 exige também abrir/editar casos pela interface com sessões QA reais, validar anexos e operações negadas; **não** transformar este teste read-only em aceite integral. O conjunto de oito P0 e os aceites do SaaS permanecem pendentes.

Reverter o código equivale a reverter a PR desta ferramenta; não existe migration, alteração de banco, escrita no Asaas ou deploy envolvido.
