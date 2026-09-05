# Lovable Cloud recovery order

For a partially migrated Lovable Cloud database that reports `function public.can_access_patient(uuid) does not exist` while applying the patient attachment prerequisite, run these scripts manually in this order:

1. `20260905005000_lovable_patient_access_helper_recovery.sql`
2. `20260904224400_patient_attachments_prerequisite.sql`
3. `20260904224500_clinic_storage_management.sql`

Fresh databases should already have `can_access_patient(uuid)` from the earlier case-access migrations; this sequence is only for recovery of an older/partial Lovable Cloud state.
