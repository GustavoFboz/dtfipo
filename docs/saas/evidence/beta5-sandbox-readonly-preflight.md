# DentalFlow — Etapa 5: verificação de segunda mensalidade no Asaas Sandbox

**11/11/2026. Preparação em PR, sem consulta ao provedor real nesta rodada. Etapa 5 PENDENTE.**

## Finalidade

Comprovar pontualmente uma parte do ciclo recorrente da **mesma assinatura** sem afetar a operação existente. A sonda consulta apenas os endpoints oficiais do Sandbox:

- `GET https://api-sandbox.asaas.com/v3/subscriptions/{id}`
- `GET https://api-sandbox.asaas.com/v3/subscriptions/{id}/payments`

O resultado positivo exige cliente/assinatura idênticos nas duas chamadas, periodicidade mensal, preço fixado informado pelo operador, faturas de meses consecutivos e uma cobrança com status recebido/confirmado. As respostas são reduzidas a contagens e indicadores, sem mostrar CPF, nome, email, IDs de cliente/assinatura/faturas, URL de cobrança ou credencial.

**Atenção:** uma segunda fatura aparecer no provedor não comprova webhook entregue, liquidação do segundo ciclo, idempotência do worker, atualização do ledger, vencimento/cancelamento ou concessão de acesso. O programa mantém `stage5_done=false` e `release_authorized=false` em todos os resultados.

## Segurança e limites

- Chave exclusivamente Sandbox com prefixo `$aact_hmlg_`. Chaves de Produção e chaves legadas sem prefixo de ambiente são recusadas para evitar troca acidental de ambiente.
- Somente duas operações GET, sem polling, retries, pagamento, criação de carnê, edição de cobrança, confirmação manual ou alteração de assinatura.
- O endpoint `paymentBook` não é usado: a geração antecipada do carnê pode criar cobranças futuras, não sendo operação meramente de leitura.
- O teste não aceita paginação parcial, ID misturado, preço divergente, data inválida ou cobrança duplicada.
- PR roda exclusivamente **testes sintéticos locais**. A ação real `workflow_dispatch` exige os três parâmetros abaixo nas configurações protegidas do GitHub, somente depois de aprovado o código e autorizado o ensaio. A configuração de secrets/vars é responsabilidade do usuário ou de administrador com acesso seguro; nunca cole token neste chat.

## Entradas para um teste manual futuro

| Configuração do repositório | Tipo | Descrição |
| --- | --- | --- |
| `ASAAS_SANDBOX_READONLY_API_KEY` | Secret | Chave nova da conta Asaas Sandbox, isolada de Produção |
| `ASAAS_SANDBOX_SUBSCRIPTION_ID` | Variable | ID de assinatura fictícia já existente no Sandbox |
| `ASAAS_SANDBOX_EXPECTED_CENTS` | Variable | Valor da mensalidade do plano de teste em centavos |

A etapa 5 só vira `done` depois de ensaio integrado com ambiente de QA separado: segunda mensalidade de fato quitada em Sandbox, webhook autêntico recebido, worker reconciliado, uma linha de ledger para o ciclo, período e direito de acesso prorrogados corretamente; atraso/carência/suspensão/regularização/cancelamento e parada emergencial demonstrados, sem cobrança real. A PR isolada não modifica banco, Lovable, cron, Asaas nem dados clínicos.

## Diagnóstico do ambiente de QA nesta rodada

O projeto separado **DentalFlow - Beta Web QA Isolado 20261102** foi localizado pelo conector Lovable. O status reportou banco habilitado (Supabase), porém a consulta agregada somente de leitura retornou `Database is possibly not accessible at the moment`. Nenhum dado foi consultado ou modificado; não há prova de integridade do staging e nenhum deploy foi tentado. A PR #290 de controles de convite e parada de vendas segue draft, sem merge/deploy.

## Fontes externas

- https://docs.asaas.com/docs/sandbox
- https://docs.asaas.com/reference/recuperar-uma-unica-assinatura
- https://docs.asaas.com/reference/listar-cobrancas-de-uma-assinatura
- https://docs.asaas.com/changelog/novidade-novo-prefixo-de-identifica%C3%A7%C3%A3o-das-chaves-api
