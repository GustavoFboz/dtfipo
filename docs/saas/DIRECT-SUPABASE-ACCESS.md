# Acesso direto ao Supabase e ativação Asaas

## Webhook ativo em 18/10/2026, 16h47 Manaus

O titular ativou o webhook existente no próprio navegador. A leitura privada
da API confirmou `enabled=true`, `interrupted=false`, API v3, processamento
sequencial e os 13 eventos esperados. Backend e GitHub continuam em Produção;
o cron respondeu HTTP 200 às 20h46 UTC e o processador permanece saudável.
Não é necessário retomar o login no navegador em nuvem para essa ativação.

O próximo passo é o titular gerar o checkout do plano Inicial de R$1,00/mês
em uma empresa comum do DentalFlow e pagar na página oficial do Asaas.
A IPO é isenta. Na consulta das 20h47 UTC, ainda havia zero pagamentos e
zero eventos de Produção. A autenticação na entrega, o recebimento, o ledger
e a liberação de acesso precisam da prova real; nenhum deles é presumido
pela ativação. Ver [conferência e instruções](evidence/production-webhook-activation-20261018.md).
Contador preservado em **5/23 (21,74%), 0/7 etapas encerradas**.

As seções abaixo são históricas e descrevem as pendências em cada data.

## Ativação técnica em 18/10/2026, 16h11 Manaus

O login administrativo do GitHub foi concluído. Backend e GitHub estão
alinhados em Produção; a configuração foi publicada no aplicativo existente.
O cron Production foi registrado às 20h00 UTC, com três disparos às 20h01,
20h06 e 20h11, todos HTTP 200 sem timeout. Processador status ok, sem falhas
ou revisões. O job Sandbox foi retirado e seus dados permanecem preservados.

O plano Inicial continua BRL 100 centavos/mês. O ledger contém zero pagamentos
de Produção e quatro Sandbox. O webhook não foi ativado pelo agente. O login
Asaas avançou até SMS; a observação posterior foi bloqueada pela revisão
automática, que exige nova autorização explícita para retomar a autenticação.
Não houve mensagem de erro do provedor observada nem tentativa de contorno.
Ver [recibo e próximos passos](evidence/production-activation-20261018.md).

As configurações foram feitas nos formulários administrativos, sem uso do
agente de construção Lovable, geração/leitura de credenciais ou mudança de
hospedagem. O restante deste documento registra as conferências anteriores.
Progresso: **5/23 (21,74%), 0/7 etapas encerradas**.

## Histórico de acesso em 18/10/2026, 01h37 Manaus

O titular esclareceu que o Supabase é integrado ao Lovable e autorizou o uso
do painel de configurações do backend com sua conta Google. O código continua
pelo GitHub; não foi usado o agente de IA do Lovable nesta conferência.

Após a aprovação Google no celular, o projeto abriu. O proprietário e o
subdomínio `dtfipo` foram conferidos. A lista protegida confirmou os nomes das
credenciais de Produção e dos dois campos de ambiente; nenhum valor foi lido,
substituído ou publicado. O caminho atual está no item 5 de
[PRODUCTION-ACCESS-SETUP.md](PRODUCTION-ACCESS-SETUP.md).

A etapa administrativa do GitHub pediu login para as duas variáveis de
ambiente. A solicitação segura expirou, sem acesso confirmado. Nenhuma variável
GitHub foi alterada. A consulta posterior ao banco confirmou cron Sandbox
ativo, último disparo em `2026-10-18T05:31:00.413214+00:00`, HTTP 200 sem timeout,
e ausência de cron de Produção. Não é uma ativação financeira; 5/23 preservados.

O registro abaixo descreve a verificação anterior, antes dessa autorização
limitada de acesso ao painel Lovable. Não solicita mudança de hospedagem.

## Histórico da verificação direta

Orientação do titular em 17/10/2026, 23h53 de Manaus: continuar por GitHub e
Supabase, sem ações na plataforma Lovable. Não há solicitação de trocar a
hospedagem, criar um banco substituto ou migrar dados automaticamente.

## Resultado da conferência

- `supabase/config.toml` aponta para `bbyhpwocwamgwcuqqnck`. Essa referência
  identifica o projeto esperado, mas não comprova administração pela conta
  pessoal do titular nem acesso às variáveis do servidor.
- `docs/LOVABLE_CLOUD_DATABASE.md` identifica o backend atual como Lovable Cloud.
  A documentação oficial do Supabase explica que uma instância gerenciada
  dessa forma não aparece automaticamente no dashboard Supabase pessoal.
- O acesso direto ao projeto abriu a tela de login. O login seguro não foi
  concluído. A integração Supabase foi localizada, mas sua conexão não está
  confirmada. Nenhum projeto, tabela, usuário, segredo ou configuração foi alterado.
- A página oferecia GitHub, ChatGPT, SSO e e-mail/senha; não oferecia Google.
  Conhecer o e-mail do titular não concede sessão nem acesso ao projeto.

O próximo passo é confirmar, por acesso autorizado ao Supabase, se esse mesmo
projeto está disponível para administração. Se não estiver, apresentar o limite
e as opções ao titular antes de propor qualquer mudança de infraestrutura.
Conectar um projeto diferente ou alterar `config.toml` não transfere os dados.

## O que falta no Asaas

A [conferência real registrada](evidence/production-readiness-20261017.md)
confirmou a chave de Produção e os quatro segredos já preparados. Não foi
identificada necessidade de outra API ou de gerar novas credenciais Asaas.
Não houve nova consulta à conta nesta verificação de acesso.

Continuam pendentes:

1. Aplicar `ASAAS_ENVIRONMENT=production` e `ASAAS_PRODUCTION_ENABLED=true`
   no servidor que executa as rotas de cobrança. As variáveis do GitHub não
   substituem essas variáveis do backend.
2. Alinhar o agendador ao mesmo ambiente e comprovar execução saudável.
3. Ativar o webhook de Produção já preparado e comprovar sua autenticação
   na entrega. Se o destino mudar, atualizar somente a URL necessária;
   preservar o token existente e os eventos configurados.
4. Rever no Asaas a pendência específica dos dados bancários. Na última
   consulta, a aprovação geral era `APPROVED`; a pendência bancária não deve
   ser confundida com falta de aprovação geral.
5. O titular concluir o pagamento do plano Inicial de R$1,00/mês em uma
   empresa comum, confirmando recebimento no provedor, ledger e acesso.

Os meios e o valor precisam ser aceitos pelo provedor na operação real.
Não alterar o valor sem autorização, nem usar dados fictícios ou a IPO nesse teste.

## Limite da entrega

A [PR168](https://github.com/GustavoFboz/dtfipo/pull/168) preparou o agendador
e passou CI, restore, Windows e Android. O bootstrap preservou o Sandbox.
Este registro acrescenta diagnóstico de acesso, sem novo deploy financeiro,
ativação de webhook, alteração de segredo ou pagamento real.
Progresso preservado em **5/23 (21,74%), 0/7 etapas concluídas**.

Referências oficiais consultadas:

- https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud
- https://docs.asaas.com/reference/comece-por-aqui
- https://docs.asaas.com/docs/prepara%C3%A7%C3%A3o-para-produ%C3%A7%C3%A3o
- https://docs.asaas.com/reference/atualizar-webhook-existente
- https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta
