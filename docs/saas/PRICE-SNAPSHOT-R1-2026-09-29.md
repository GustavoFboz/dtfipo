# Preço de R$ 1 para a compra controlada

O catálogo `public.billing_plans` é a fonte do preço enviado pelo DentalFlow
ao Asaas. Em 29/09/2026, a empresa Inicial ainda constava a R$ 249,00 nesse
catálogo; a assinatura já paga da AS Lab e seu checkout também eram de R$ 249,00.
Alterar apenas um valor no painel do Asaas não muda novos checkouts do app.

A migração `20260929133000_saas_asaas_price_snapshot_r1.sql` ajusta o preço de
novos checkouts da Empresa Inicial para 100 centavos. Cada assinatura Asaas
passa a ser verificada pelo valor do checkout vinculado (ou pelo pagamento
confirmado histórico), inclusive em renovação, estorno e evento tardio. O
preço antigo da AS Lab segue R$ 249,00; não se altera sua assinatura no Asaas.
Um checkout pendente a R$ 249,00 sem cobrança criada é descartado quando o
gestor inicia outro checkout. Uma cobrança do Asaas já criada preserva seu
valor original e deve ser concluída ou revisada antes de escolher outro plano.

O preço de R$ 1 é **mensal recorrente** para novas assinaturas até uma alteração
posterior de preço no provedor e no catálogo. Antes de vender a terceiros,
restaurar o preço comercial do catálogo e definir como ficam as assinaturas
promocionais já contratadas. A migração não habilita a API de Produção: ela
continua protegida por `ASAAS_ENVIRONMENT`, chave exclusiva e
`ASAAS_PRODUCTION_ENABLED=true`.

Critérios de implantação: restauração limpa, ensaio de contrato antigo e novo,
asserções somente leitura no banco ativo e verificação visual do valor exibido.
Não executar pagamento real até o operador decidir iniciar o teste.

## Alterações futuras por pedido no chat

Quando o operador informar plano e novo valor, comparar primeiro o catálogo
vivo e executar `node scripts/prepare-saas-plan-price.mjs --plan company_initial
--from 1,00 --to 249,00 --dry-run` com os valores atuais. Sem `--dry-run`, o
comando gera migration e pacote de restauração, mas não chama Asaas nem altera
o banco. Depois de ensaio e revisão, aplicar a migration em transação, verificar
o preço no catálogo e publicar a versão correspondente. Isso permite pedidos
como “coloque Empresa Crescimento a R$ 499” sem editar código da interface.
O valor informado vale para **novas contratações**; mudar a mensalidade de uma
assinatura existente exige uma decisão separada e atualização controlada no
Asaas, pois cobranças já geradas não mudam automaticamente.
