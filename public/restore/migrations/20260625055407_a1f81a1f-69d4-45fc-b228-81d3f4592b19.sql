
INSERT INTO public.phase_assignments (phase_id, user_id)
SELECT p.id, pr.id
FROM public.phases p
CROSS JOIN public.profiles pr
ON CONFLICT DO NOTHING;

INSERT INTO public.stage_assignments (stage_id, user_id)
SELECT s.id, pr.id
FROM public.stages s
CROSS JOIN public.profiles pr
ON CONFLICT DO NOTHING;
