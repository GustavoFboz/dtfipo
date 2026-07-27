CREATE OR REPLACE FUNCTION public.case_stage_requirement_blockers(_case_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case public.cases%ROWTYPE;
  v_requirements jsonb := '[]'::jsonb;
  v_req jsonb;
  v_type text;
  v_blocks boolean;
  v_blockers text[] := ARRAY[]::text[];
  v_implant_teeth integer[];
  v_missing_implants integer[];
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RETURN ARRAY['Caso não encontrado']; END IF;

  SELECT COALESCE(s.requirements, '[]'::jsonb) INTO v_requirements
    FROM public.stages s WHERE s.id = v_case.current_stage_id;

  IF v_requirements IS NULL OR jsonb_typeof(v_requirements) <> 'array' THEN
    RETURN ARRAY[]::text[];
  END IF;

  FOR v_req IN SELECT value FROM jsonb_array_elements(v_requirements)
  LOOP
    v_blocks := lower(COALESCE(v_req->>'blocks_advance', 'false')) = 'true';
    IF NOT v_blocks THEN CONTINUE; END IF;
    v_type := v_req->>'type';

    IF v_type = 'implant_components' THEN
      v_implant_teeth := COALESCE(v_case.implant_teeth, ARRAY[]::integer[]);
      -- Sem dentes com sistema de implante marcados: nada a exigir.
      IF COALESCE(array_length(v_implant_teeth, 1), 0) = 0 THEN
        CONTINUE;
      END IF;
      SELECT array_agg(t ORDER BY t) INTO v_missing_implants
        FROM unnest(v_implant_teeth) AS t
        WHERE NOT EXISTS (
          SELECT 1 FROM public.case_implant_teeth cit
          WHERE cit.case_id = _case_id AND cit.tooth_fdi = t AND cit.reversed_at IS NULL
        );
      IF COALESCE(array_length(v_missing_implants, 1), 0) > 0 THEN
        v_blockers := array_append(v_blockers,
          'Apontar componente para dentes com implantes (' || array_to_string(v_missing_implants, ', ') || ')');
      END IF;
    ELSIF v_type = 'download_scans' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_activity ca
        WHERE ca.case_id = _case_id AND ca.kind = 'download' AND ca.metadata->>'kind' = 'scans')
      THEN v_blockers := array_append(v_blockers, 'Baixar arquivos da aba "Escaneamentos"'); END IF;
    ELSIF v_type = 'upload_models' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id = _case_id AND a.kind = 'model' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Modelos"'); END IF;
    ELSIF v_type = 'upload_fabrication' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id = _case_id AND a.kind = 'fabrication' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Confecção"'); END IF;
    ELSIF v_type = 'upload_html' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id = _case_id AND a.kind = 'exocad_html' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Html"'); END IF;
    ELSIF v_type = 'upload_gallery' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id = _case_id AND a.kind = 'gallery' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar imagem na aba "Galeria"'); END IF;
    END IF;
  END LOOP;

  RETURN v_blockers;
END
$function$;