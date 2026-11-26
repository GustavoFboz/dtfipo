# DentalFlow — Etapa 4/8: comprovação autenticada de casos em QA

**Situação (10/11/2026): etapa 4/8 aprovada tecnicamente em staging local isolado com Auth/REST/Storage + navegador Web reais. Publicação/produção/Asaas NÃO aprovados.**
Este procedimento não autoriza cobrança, publicação ou acesso a dados clínicos reais.

## Objetivo

Completar a lacuna entre os testes SQL fictícios da PR #270 e o aceite de isolamento entre empresas na aplicação. Verificar com **duas sessões de usuários reais de QA**, em duas clínicas fictícias isoladas, que cada usuário:

1. Autentica sua identidade por `GET /auth/v1/user`.
2. Enxerga seu próprio perfil/empresa e um paciente fictício criado no QA.
3. Não enxerga o paciente fictício da outra empresa.
4. Enxerga exatamente um caso próprio **vinculado àquele paciente**.
5. Não enxerga o caso fictício da outra empresa.

A ferramenta `scripts/saas-case-tenant-readonly-probe.mjs` **só faz GET** e usa as mesmas barreiras de origem/credenciais do ensaio `saas-tenant-readonly-probe.mjs`. Emite somente códigos, nomes genéricos de verificações e resultado; não imprime nomes, IDs de pacientes, URLs nem tokens.

## Nova evidência — Supabase Auth/REST/Storage local com duas contas

A [PR #275](https://github.com/GustavoFboz/dtfipo/pull/275) foi integrada depois que [a execução no GitHub Actions](https://github.com/GustavoFboz/dtfipo/actions/runs/42751269610) passou. O workflow iniciou Supabase Auth, PostgREST, Storage e PostgreSQL reais num runner descartável, exclusivamente em loopback, sem Lovable nem credenciais Cloud.

| Contrato verificado | Contagem |
| --- | ---: |
| Contas reais de Auth e clínicas fictícias | 2 / 2 |
| Pacientes/casos criados pelas RPCs reais e não duplicados | 2 / 2 |
| Casos próprios editados, edição estrangeira impedida | 2 / 2 |
| Leituras cruzadas de pacientes/casos negadas | 4 |
| Reatribuição para paciente de outra empresa negada | 2 |
| Upload e download sintético pelo Storage API real | 2 |
| Download de arquivos de outra empresa negado | 2 |
| Leitura cruzada de metadados de anexos negada | 2 |
| Exclusão cruzada de metadados de anexos impedida | 2 |
| Contêineres e dados descartáveis removidos | Sim |

Este primeiro teste é **HTTP de backend com JWTs verdadeiros**, não simulação SQL. A execução de navegador descrita abaixo complementa essa prova: usa o aplicativo Web real em localhost e confirma os formulários e a aba de anexos. O progresso 4/8 representa exclusivamente a QA técnica isolada, sem liberar beta pago.

## Aceite técnico independente — caso Web real com duas empresas (10/11/2026)

A execução [42767499220](https://github.com/GustavoFboz/dtfipo/actions/runs/42767499220) passou após a correção da PR [#279](https://github.com/GustavoFboz/dtfipo/pull/279). O runner descartável criou duas empresas e contas fictícias no Supabase Auth local. Na aplicação Vite real, um Chrome headless fez login nas duas contas, mantendo as origens restritas ao loopback.

- **2 casos novos cadastrados pelos formulários da Web**, sem chamar a RPC em substituição ao formulário; vínculo dos pacientes confirmado usando o JWT de cada autor.
- **2 detalhes de caso realmente abertos**, após distinguir o menu do caso da ficha rápida do paciente.
- **2 casos editados pelos controles Web**, com confirmação de persistência.
- **2 abas Escaneamentos com arquivos sintéticos visíveis**, criados no mesmo Storage API real.
- **2 casos da clínica oposta invisíveis na Web**; negativas de leitura, edição, relink, download e exclusão de metadados cruzados comprovadas por requests autenticados reais.
- **0 dados clínicos reais, 0 cobranças Asaas, 0 mudanças em Lovable/produção**. Contêineres/volumes locais destruídos depois da execução.

A PR #279 corrige um defeito funcional concreto: o campo de ID do cadista recebia antecipadamente o ID do usuário, impedindo o efeito correto de escolher o ID do registro profissional vinculado. O formulário mantém a seleção apenas quando a consulta ao diretório encontra a conta correspondente.

**Critério da etapa 4/8:** criação, abertura, edição e isolamento clínico entre duas empresas foram comprovados num ambiente de staging **local e descartável**. Por isso a etapa técnica pode contar **+1/8**, passando a **4/8**, desde que a PR de correção de código e esta atualização de controle sejam integradas com a CI verde.

**Importante:** este aceite não comprova paridade do deploy Web hospedado, preview 3D de STL, upload/exclusão manual via interface, atendimento ao beta nem regras de cobrança em produção. Esses itens seguem nos gates P0 e nas etapas 5–8, e devem ser testados no ambiente correspondente. O paciente histórico vinculado a agendamento não foi alterado, já que nenhum dado ou banco de produção foi acessado.

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

A ferramenta GET remota continua opcional como confirmação adicional de paridade do QA hospedado (seus testes próprios de CI usam HTTP sintético). A **nova workflow local de integração**, em contraste, usa Auth, REST, Storage e navegador completos e comprovou o aceite técnico da etapa 4. A publicação Web, paridade de produção, gates P0 e 23 aceites gerais não foram automaticamente concluídos.

Reverter o código equivale a reverter a PR desta ferramenta; não existe migration, alteração de banco, escrita no Asaas ou deploy envolvido.
