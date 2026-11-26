# SaaS 6.3 — ensaio reproduzível de fixtures e diário de staging isolado

**01/11/2026 — NÃO é homologação de capacidade do DentalFlow.**

O workflow de restauração isolada agora prepara uma base PostgreSQL descartável com as migrações reais e cria, em uma transação rollback-only, uma pequena amostra de **dois usuários com domínio .invalid, duas empresas, quatro pacientes fictícios, quatro casos e duas assinaturas de testes sem qualquer cobrança**. Os dados são sintéticos e não devem ser apresentados ao Asaas, ao Cloud ou ao Storage real.

### Contrato técnico

- Executa unicamente no contêiner local `supabase_db_dtfipo_restore_rehearsal`, criado pelo GitHub Actions depois do restore.
- Usa IDs `739...` reservados a esta fixture, nomes sintéticos e e-mails `example.invalid`.
- Verifica os registros positivos (quatro casos e quatro pacientes) e assume duas identidades de **papel PostgreSQL autenticado com claims simuladas**, sem fingir um login JWT real.
- Sob cada ator, exige **duas leituras próprias de paciente e duas de caso**, e nega acesso aos dois pacientes do outro ator.
- Gera apenas a linha de diário fixa `STAGING_FIXTURE_VERIFIED:2_companies_2_SQL_roles_4_patients_4_cases_0_real_clients`.
- Finaliza por `ROLLBACK` e não deixa entidades, cobranças ou arquivos no banco.
- CI falha se o diário não aparecer, se uma leitura for vazia ou cruzada, ou se houver divergência com o schema migrado.

**O que foi obtido:** uma fixture de staging SQL versionada e um diário sanitizado repetível, que sustentam o preparo de um piloto isolado. **O que não foi obtido:** serviço HTTP/PostgREST de staging rodando para clientes, Realtime com métricas, Web/Desktop/Android conectados à fixture, capacidade de 10 mil sessões ou testes físicos.

O gate `staging-journal-and-fixtures` só pode ser marcado após a execução do workflow com resultado positivo; ele não substitui os próximos gates `database-realtime-baseline`, `native-onboarding-pilot` e `progressive-capacity-approval`.

**Artefatos de código:** `docs/saas/sql/staging-63-fixture-journal.sql`, `scripts/saas-staging-fixture-safety.test.mjs`, `.github/workflows/saas-restore-rehearsal.yml`. Nenhuma credencial ou dado pessoal real está presente.
