ALTER TABLE public.case_attachments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_case_attachments_case_kind
  ON public.case_attachments (case_id, kind);