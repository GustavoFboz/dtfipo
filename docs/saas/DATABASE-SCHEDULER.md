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
no momento de enfileirar a requisição. Tabelas de headers/respostas pg_net e
a tabela de configuração ficam sem acesso das contas do aplicativo.

Configuração repetida reutiliza o job e a referência do segredo. A mudança
de ambiente desativa o job anterior antes de registrar o novo. A rota não
invoca o processador imediatamente; os disparos posteriores seguem a cadência.
Um job SQL concluído comprova o enfileiramento HTTP, não a execução financeira.

## Publicação e comprovação

1. Revisar código, testes e restauração em banco isolado. O ensaio SQL mantém
   tudo numa transação com rollback: pg_net não inicia HTTP antes de commit.
2. Integrar na branch SaaS, aplicar somente a nova migração ao backend e
   publicar a versão correspondente.
3. Executar SaaS Sandbox database scheduler bootstrap. Antes de qualquer POST,
   ele exige o GET com o contrato específico e ambiente Sandbox. Isso impede
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

Após os gates aplicáveis, o titular muda os campos protegidos de ambiente e
habilitação conforme PRODUCTION-ACCESS-SETUP.md. O registro privado posterior
deve corresponder ao ambiente production; não reutiliza o token Sandbox.
A produção não é registrada ou ativada pelo bootstrap Sandbox desta etapa.
Webhook, entrega, recebimento real, ledger e acesso precisam de provas próprias.

Para parar o job, a função privada billing_disable_database_scheduler recebe
somente o ambiente. Ela desativa o cron e sua configuração; preserva ledger,
eventos, períodos pagos e dados remotos. Mudança de segredo exige sincronizar
as configurações protegidas antes de atualizar a cópia do agendador.
Não consultar ou imprimir headers da fila pg_net, segredos do Vault ou corpos
de erros como diagnóstico. O status privado retorna somente indicadores seguros.

Fontes:
https://supabase.com/docs/guides/cron
https://supabase.com/docs/guides/functions/schedule-functions
https://supabase.com/docs/guides/database/extensions/pg_net
