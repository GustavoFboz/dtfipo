-- Fixed Sandbox fixture preparation only. The job can inspect provider GETs
-- and submit a normal customer request, never execute financial instructions.
-- The existing allowlist, expiring one-use capabilities and private grants stay.
ALTER TABLE public.saas_fixture_acceptance_jobs DROP CONSTRAINT saas_fixture_acceptance_jobs_kind_check;
ALTER TABLE public.saas_fixture_acceptance_jobs ADD CONSTRAINT saas_fixture_acceptance_jobs_kind_check
 CHECK(kind IN('identity','storage','billing','ownership','configuration','reconciliation','cancellation','plan_change'));
