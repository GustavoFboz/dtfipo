
-- Add sort_order to tooth_colors and seed VITA palette
ALTER TABLE public.tooth_colors ADD COLUMN IF NOT EXISTS sort_order int;

-- Replace existing colors with the VITA list (preserve referenced rows by upserting)
DO $$
DECLARE
  v_codes text[] := ARRAY[
    'A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4',
    'BL1','BL2','BL3','BL4','0M1','0M2','0M3','OM1','OM2','OM3','OM4','OM5','W0','W1','W2','W3','XL','XXL'
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(v_codes,1) LOOP
    INSERT INTO public.tooth_colors(code, sort_order)
    VALUES (v_codes[i], i)
    ON CONFLICT (code) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END LOOP;
  -- Remove colors not in the canonical list and not referenced
  DELETE FROM public.tooth_colors tc
  WHERE NOT (tc.code = ANY(v_codes))
    AND NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.tooth_color_id = tc.id);
END $$;

-- Add unique constraint on code if missing (idempotent)
DO $$ BEGIN
  ALTER TABLE public.tooth_colors ADD CONSTRAINT tooth_colors_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- Seed case_types (idempotent)
INSERT INTO public.case_types(name)
SELECT n FROM (VALUES
 ('Coroa'),('Faceta'),('Lente de Contato'),('Inlay'),('Onlay'),('Overlay'),('Endocrown'),
 ('Pôntico'),('Ponte Fixa'),('Prótese Parcial Removível (PPR)'),('Prótese Total (PT)'),
 ('Overdenture'),('Protocolo'),('Barra Protética'),('Pilar Personalizado'),('Guia Cirúrgica'),
 ('Mock-up'),('Enceramento Diagnóstico'),('Alinhador Ortodôntico'),('Contenção Ortodôntica'),
 ('Placa Miorrelaxante'),('Placa de Clareamento'),('Protetor Bucal'),('Jig de Verificação'),
 ('Jig de Escaneamento'),('Moldeira Individual'),('Base de Prova'),('Plano de Cera'),
 ('Caracterização Gengival'),('Reembasamento'),('Conserto de Prótese'),('Conversão de Prótese'),
 ('Impressão 3D'),('Fresagem CAD/CAM'),('Outro')
) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.case_types ct WHERE ct.name = t.n);

-- Implant systems
CREATE TABLE IF NOT EXISTS public.implant_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  line text,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, line)
);

GRANT SELECT ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;

ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "implant_systems read all auth"
    ON public.implant_systems FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "implant_systems admin write"
    ON public.implant_systems FOR ALL TO authenticated
    USING (public.current_user_is_admin())
    WITH CHECK (public.current_user_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.implant_systems(name, line, sort_order) VALUES
 ('Neodent','GM',1),('Neodent','CM',2),('Neodent','HE',3),
 ('S.I.N.', NULL, 4),('Oralfix', NULL, 5),
 ('Straumann','BL',6),('Straumann','TL',7),
 ('Nobel Biocare','Active',8),('Nobel Biocare','Replace',9),('Nobel Biocare','Conical Connection',10),
 ('Conexão', NULL, 11),('Bicon', NULL, 12),
 ('Implacil De Bortoli', NULL, 13),('Singular', NULL, 14),
 ('Outro', NULL, 99)
ON CONFLICT (name, line) DO NOTHING;

-- New case columns
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_provisional boolean NOT NULL DEFAULT false;

-- Attachment kind
ALTER TABLE public.case_attachments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';

DO $$ BEGIN
  ALTER TABLE public.case_attachments
    ADD CONSTRAINT case_attachments_kind_check
    CHECK (kind IN ('fabrication','model','exocad_html','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
