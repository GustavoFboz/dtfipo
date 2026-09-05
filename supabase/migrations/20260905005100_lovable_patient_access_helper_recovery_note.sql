-- This intentionally-empty companion migration documents the manual recovery order:
-- 1) 20260905005000_lovable_patient_access_helper_recovery.sql
-- 2) 20260904224400_patient_attachments_prerequisite.sql
-- 3) 20260904224500_clinic_storage_management.sql
--
-- Fresh databases already receive can_access_patient from earlier case-access
-- migrations; this note exists only to make the Lovable Cloud recovery sequence
-- explicit in repository history.
SELECT 1;
