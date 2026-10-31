-- Adds preparation/readback for one existing disposable Sandbox fixture.
-- No operator enrollment, MFA change, financial executor or table grant.
ALTER TABLE public.saas_fixture_acceptance_jobs DROP CONSTRAINT saas_fixture_acceptance_jobs_kind_check;
ALTER TABLE public.saas_fixture_acceptance_jobs ADD CONSTRAINT saas_fixture_acceptance_jobs_kind_check
 CHECK(kind IN('identity','storage','billing','ownership','configuration','reconciliation','cancellation'));
