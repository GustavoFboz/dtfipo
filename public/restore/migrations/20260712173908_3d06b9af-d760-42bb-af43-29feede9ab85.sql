DROP POLICY IF EXISTS case_attachments_delete ON public.case_attachments;

CREATE POLICY case_attachments_delete
ON public.case_attachments
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.is_staff(auth.uid())
    AND public.can_access_case(case_id)
    AND (uploaded_by = auth.uid() OR uploaded_by IS NULL)
  )
);