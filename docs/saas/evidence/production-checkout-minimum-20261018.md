# Checkout real: valor abaixo do mínimo do Asaas

## Resultado observado em 18/10/2026, 17h56 Manaus

As imagens do titular mostram cadastro concluído, confirmação de e-mail e
plano Inicial de R$1/mês, seguido da mensagem genérica de falha no checkout.
A leitura restrita do banco confirmou uma intenção pendente de BRL 100
centavos, sem pagamento vinculado. O cliente foi criado no Asaas em Produção;
a criação da assinatura falhou quatro vezes com `invalid_value`. O ledger
continha zero pagamentos e zero eventos de Produção. Não houve pagamento real.

A descrição original do erro do provedor não foi persistida. O código por si
só não informa um mínimo; a regra aplicável foi verificada na
[Central oficial Asaas](https://central.ajuda.asaas.com/hc/pt-br/articles/31972480144795-Quais-s%C3%A3o-os-limites-para-cria%C3%A7%C3%A3o-de-cobran%C3%A7as),
atualizada em 19/08/2026: mínimo de R$5 por cobrança para pessoas físicas e
jurídicas. O valor solicitado de R$1 está abaixo desse limite. Nenhuma nova
escrita financeira foi feita para diagnosticar a falha.

## Correção e limites

- Novos contratos de Produção abaixo de 500 centavos são recusados antes de
  reivindicar operações ou criar cliente/assinatura no provedor.
- A fronteira comum Web/Windows/Android devolve HTTP 422 e informa o mínimo
  com texto próprio do DentalFlow. O valor nunca é aumentado automaticamente.
- `invalid_value` recebe mensagem específica sobre o valor da assinatura;
  outros códigos do provedor recebem mensagem segura, sem descrição bruta.
- Fixtures Sandbox e contratos externos já vinculados conservam seus valores.
  A janela offline, a isenção IPO e o restante do ciclo financeiro são preservados.
- O titular autorizou R$5/mês em 18/10, às 18h00 Manaus. A transação das
  22h01m52s UTC ajustou somente `company_initial` de 100 para 500 centavos;
  a leitura confirmou BRL, ativo, 500 centavos. A migração versionada
  `20261018220200_saas_plan_price_company_initial_500c.sql` reproduz a mudança
  para novas restaurações e aceita reaplicação quando o catálogo já está em 500.

O titular não precisa recriar a empresa, o cadastro ou os dados de cobrança.
Depois de atualizar a página para conferir R$5/mês, o fluxo gera uma intenção com
o novo preço e reaproveita o cliente existente. A assinatura e a cobrança
precisam ser criadas e pagas pelo fluxo oficial antes de comprovar acesso.

O e-mail anexado usa a marca padrão `Hello-World-Starter`. O template e o nome
do remetente são configuração do Auth gerenciado; não foram alterados por
esta correção de checkout. Não se presume correção por editar apenas o site.

Validação: recusa real de R$1 registrada; testes da fronteira HTTP e do
provisionamento cobrem bloqueio antes do provedor, preservação de contratos,
Sandbox de R$1, novo contrato real de R$5 e ausência de vazamento de dados.
Passaram 356 testes de cobrança/desktop em 17 arquivos e os checks das etapas
06/09. O bundle foi regenerado com 176 migrações. O ensaio de restauração
confere nova intenção de 500 centavos, cancelamento da intenção antiga de 100
e preservação de contratos históricos de R$1 e R$249; deve passar no CI antes
da integração. Não foi atribuído novo aceite integral:
**5/23 (21,74%), 0/7 etapas encerradas**.
