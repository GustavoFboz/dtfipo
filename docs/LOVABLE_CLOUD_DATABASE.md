# Dental Flow — banco de produção no Lovable Cloud

O backend de produção do Dental Flow é o **Lovable Cloud**.

O projeto usa APIs e convenções compatíveis com Supabase (`supabase-js`, RPCs, RLS, Storage, migrations SQL), mas o banco Live não é publicado por um projeto Supabase externo administrado pelo GitHub Actions.

## Regra de deploy

- Alterações de frontend/código continuam pelo fluxo GitHub: branch -> PR -> validação -> merge em `main`.
- Alterações SQL que modificam o banco Live devem ser aplicadas no **Lovable -> Cloud -> SQL editor**.
- Não configurar `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` ou `SUPABASE_DB_PASSWORD` no GitHub apenas para este projeto enquanto o backend oficial permanecer no Lovable Cloud.
- O antigo workflow `.github/workflows/deploy-supabase-migrations.yml` foi removido para evitar tentativas de deploy em um backend externo incorreto.

## Cotas de armazenamento

- Cota base: 1 GiB por clínica.
- A cota efetiva é materializada em `public.clinics.storage_limit_bytes`.
- Adicionais e cortesias são registrados em `public.clinic_storage_entitlements`.
- IPO / Instituto Praia de Odontologia: 10 GiB totais de cortesia, sem expiração, até alteração administrativa futura.

## Aplicação inicial das cotas variáveis no Lovable Cloud

Executar no SQL editor, nesta ordem:

1. `supabase/migrations/20260905014000_storage_entitlements_and_ipo_courtesy.sql`
2. `supabase/migrations/20260905023000_ipo_storage_quota_reconcile.sql`

O segundo script é idempotente, identifica a IPO de forma restrita e falha se não encontrar exatamente uma clínica correspondente.

Resultado esperado da consulta final:

- `storage_limit_bytes = 10737418240`
- `storage_limit_gib = 10.00`

Depois, atualizar o Dental Flow. O card lateral deve passar a usar a cota real retornada por `get_storage_usage()`.
