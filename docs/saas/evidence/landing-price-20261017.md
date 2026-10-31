# Preço atual na página pública de planos

Em 17/10, a leitura do catálogo confirmou `company_initial` ativo com
`monthly_price_cents = 100` (BRL). A página publicada `/lp#planos` ainda mostrava
R$249: os três preços de apresentação estavam fixos no frontend. A divergência
foi confirmada também na interface pública, sem login ou operação financeira.

A página passa a consultar `fetchBillingPlans`, o mesmo catálogo público usado
pelo cadastro e pela cobrança. Os cards mantêm os códigos empresariais e os
links de seleção. Carregamento ou falha não inventam um preço; uma falha de
atualização oculta o preço antigo e oferece nova consulta. Não há polling novo.

Validação local: 7 regressões da página e 11 de cadastro/senha passaram, assim
como 340 testes de billing, 4 de entitlement Desktop, TypeScript, build Web,
checks 06/09, Hub/IPO e integridade do restore de 175 migrations. O check de Hub
agora exige os três códigos empresariais e preço vindo do catálogo; não exige
os antigos valores fixos. A confirmação no site publicado ocorre após o merge.

Não foram alterados catálogo, contratos históricos, checkouts, cobranças,
migrations, secrets, certificados, instaladores ou a branch main. A compra real
continua reservada ao usuário. Sandbox e o contador SaaS de 5/23 permanecem.
