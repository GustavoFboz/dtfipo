-- DentalFlow | Diagnóstico pré-migração | 2026-10-21
-- Somente LEITURA. Executar no SQL Editor do backend ativo com acesso autorizado.
-- Nunca executar em repositório público com exportação de conteúdo clínico.
-- Retorna APENAS contagens, capacidades, versões e nomes técnicos.
-- Não registra e-mails, identificadores de usuários, CPFs, arquivos, chaves ou tokens.
-- Todos os resultados precisam ser revisados e armazenados em relatório privado.

BEGIN TRANSACTION READ ONLY;

-- 1. Banco, versão e conexões (snapshot de um instante).
SELECT current_database() AS banco,
       current_setting('server_version') AS versao_postgresql,
       pg_database_size(current_database()) AS tamanho_banco_bytes,
       pg_size_pretty(pg_database_size(current_database())) AS tamanho_banco,
       (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database()) AS conexoes_observadas;

-- 2. Extensões instaladas (inclui possíveis dependências de pg_cron, pg_net e Vault).
SELECT extname AS extensao, extversion AS versao
FROM pg_extension
ORDER BY extname;

-- 3. Número de tabelas e políticas (não consulta linhas pessoais).
SELECT n.nspname AS esquema,
       COUNT(*) FILTER (WHERE c.relkind IN ('r', 'p')) AS tabelas,
       COUNT(*) FILTER (WHERE c.relkind IN ('v', 'm')) AS views
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth', 'storage', 'realtime', 'vault', 'cron')
GROUP BY n.nspname
ORDER BY n.nspname;

SELECT schemaname AS esquema,
       count(*) AS politicas_rls
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
GROUP BY schemaname
ORDER BY schemaname;

-- 4. Usuários (somente quantidade). Não exibir emails ou hashes.
SELECT count(*) AS usuarios_auth FROM auth.users;

-- 5. Armazenamento: quantidade de buckets, objetos e bytes do metadado.
-- Pode demorar em um ambiente com muitos objetos; testar em janela de baixo uso.
SELECT count(DISTINCT bucket_id) AS buckets_com_objetos,
       count(*) AS total_objetos,
       coalesce(sum(
         CASE WHEN metadata ->> 'size' ~ '^[0-9]+$'
              THEN (metadata ->> 'size')::numeric ELSE 0 END
       ), 0) AS bytes_estimados_metadados
FROM storage.objects;
-- ATENÇÃO: isto NÃO detecta arquivos ausentes, órfãos ou buckets vazios.
-- Na fase de cópia, confrontar também a listagem real do storage e hashes.

-- 6. Contadores financeiros (NENHUM ID/valor/evento é retornado).
SELECT
  (SELECT count(*) FROM public.billing_plans) AS planos,
  (SELECT count(*) FROM public.account_subscriptions) AS assinaturas,
  (SELECT count(*) FROM public.checkout_intents) AS checkouts,
  (SELECT count(*) FROM public.billing_payments) AS pagamentos,
  (SELECT count(*) FROM public.billing_events) AS eventos_webhook;

-- 7. Verificações de presença de estruturas (não expõe segredos).
SELECT
  to_regclass('cron.job') IS NOT NULL AS existe_cron_job,
  to_regclass('net.http_request_queue') IS NOT NULL AS existe_fila_pg_net,
  to_regclass('vault.secrets') IS NOT NULL AS existe_vault;

ROLLBACK;

-- LIMITES: este diagnóstico não comprova integridade, RTO/RPO, tamanho real
-- de objetos S3, versões em produção, configurações Asaas, backups ou latência.
-- Não executar scripts de migração/restore em produção durante este levantamento.
