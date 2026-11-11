# Agendamento privado no backend

O GitHub tem registrado execuções agendadas bem-sucedidas, porém com intervalos
extensos. Uma execução recente não comprova a cadência configurada de cinco
minutos. Esta preparação usa pg_cron e pg_net no próprio backend para chamar
o processador existente. Não muda o comportamento financeiro, limites de
armazenamento, período pago, conta IPO isenta ou política offline de 72 horas.

## Registro e proteção

A migração 20261005190000 cria extensões, tabela privada e funções. Não cria
jobs ativos ou segredos. O restore inclui a mesma migração e preserva também
o hotfix de RLS 20261005111000, antes ausente do manifesto consolidado.
O self-heal final reaplica as restrições do agendador após seus grants gerais;
o ensaio de restauração verifica essa fronteira no banco já restaurado.

O POST privado /api/billing/asaas-worker?check=database-scheduler exige o token
exclusivo do operador de Produção, mesmo ao preparar Sandbox. Seu único campo
é expected_environment. O backend valida o ambiente e todos os secrets, lê
seu próprio token do processador e o guarda no Vault. O chamador não envia
credencial, endereço de destino nem expressão cron. Produção exige a flag
ativa e ambiente correspondente; o bootstrap automático prepara só Sandbox.

O job executa nos minutos 1, 6, 11 etc. O comando gravado chama uma função
privada com o ambiente; não contém o token. Somente a função obtém o segredo
no momento de enfileirar a requisição. A tabela de configuração e as funções
de despacho não concedem acesso às contas do aplicativo. O Supabase pode
preservar grants PUBLIC próprios do pg_net que postgres não consegue revogar.
A proteção dessas tabelas é comprovada pelo bloqueio do schema net na Data API,
pelas contas anon/authenticated sem login SQL e pela ausência de funções
SECURITY DEFINER executáveis por essas contas que exponham net. O POST de
registro verifica HTTP 406/PGRST106 com Accept-Profile net antes de copiar a
credencial; a função de despacho verifica novamente a fronteira SQL.

Configuração repetida reutiliza o job e a referência do segredo. A mudança
de ambiente remove o job anterior com cron.unschedule antes de registrar o
novo, sem depender da permissão gerenciada de cron.alter_job. A rota não
invoca o processador imediatamente; os disparos posteriores seguem a cadência.
Um job SQL concluído comprova o enfileiramento HTTP, não a execução financeira.

## Publicação e comprovação

1. Revisar código, testes e restauração em banco isolado. O ensaio SQL mantém
   tudo numa transação com rollback: pg_net não inicia HTTP antes de commit.
2. Integrar na branch SaaS, aplicar somente a nova migração ao backend e
   publicar a versão correspondente.
3. Executar o workflow `saas-database-scheduler-bootstrap.yml` na branch SaaS.
   O padrão continua Sandbox. Antes de qualquer POST,
   ele exige o GET com o contrato específico e o ambiente selecionado. Isso impede
   invocação acidental do processador de uma versão antiga. Se o job correto
   já estiver ativo, preserva o segredo; HTTP 401/403 anterior permite atualizar
   sua cópia a partir do backend sem gerar um token novo.
4. Conferir GET privado de status, HTTP da última resposta, heartbeat e filas.
   Observar execuções sucessivas no intervalo e registrar horários. O bootstrap
   verde sozinho não encerra a regularidade ou o aceite 6.1.
5. Manter GitHub como apoio, usando o processador somente se o agendador do
   backend não tiver execução saudável recente. Alertas/recuperação continuam
   com seus próprios aceites operacionais.

## Ativação de Produção e rollback

Após a conferência real e a autorização do titular, os campos protegidos do
backend devem usar `ASAAS_ENVIRONMENT=production` e
`ASAAS_PRODUCTION_ENABLED=true`. No GitHub, `BILLING_ENVIRONMENT=production`
e `BILLING_PRODUCTION_ENABLED=true` selecionam o mesmo ambiente para o
bootstrap e o fallback. O bootstrap recusa Produção sem a flag explícita e
recusa uma resposta de ambiente diferente antes de enviar qualquer POST.

Executar manualmente `saas-database-scheduler-bootstrap.yml`, selecionando
`saas/stage-03-asaas-checkout`. O registro privado copia o token correspondente
ao ambiente production do próprio backend, sem reutilizar o token Sandbox.
A função já existente retira o agendamento do ambiente anterior e registra
a mesma cadência para o ambiente selecionado. Uma configuração saudável já
ativa é preservada. O workflow não altera flags, webhooks, preços ou pagamentos
nem chama o processador imediatamente; não é uma prova de execução financeira.
Conferir seu recibo e observar os disparos reais antes do teste de pagamento.
Webhook, entrega, recebimento real, ledger e acesso precisam de provas próprias.

Conferência em 17/10/2026, 19h12 Manaus: chave real autenticada, conta
`general=APPROVED`, dados comerciais e documentação aprovados. Dados bancários
`PENDING` permanecem identificados separadamente. Webhook único correto,
desativado, sem interrupção e com os 13 eventos esperados; autenticação aguarda
entrega real. Backend e cron permanecem em Sandbox neste checkpoint.

Para parar o job, a função privada billing_disable_database_scheduler recebe
somente o ambiente. Ela remove o job correspondente e desativa sua configuração; preserva ledger,
eventos, períodos pagos e dados remotos. Mudança de segredo exige sincronizar
as configurações protegidas antes de atualizar a cópia do agendador.
Não consultar ou imprimir headers da fila pg_net, segredos do Vault ou corpos
de erros como diagnóstico. O status privado retorna somente indicadores seguros.

Fontes:
https://supabase.com/docs/guides/cron
https://supabase.com/docs/guides/functions/schedule-functions
https://supabase.com/docs/guides/database/extensions/pg_net
