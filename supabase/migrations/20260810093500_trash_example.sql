-- Insert example canceled case for trash page
INSERT INTO public.cases (
  patient_id,
  doctor_id,
  case_type_id,
  status,
  case_number,
  case_label,
  entry_date,
  delivery_date,
  notes
)
SELECT 
  p.id as patient_id,
  d.id as doctor_id,
  ct.id as case_type_id,
  'cancelado' as status,
  9999 as case_number,
  'Exemplo de Lixeira' as case_label,
  CURRENT_DATE - INTERVAL '2 days' as entry_date,
  CURRENT_DATE + INTERVAL '5 days' as delivery_date,
  'Este é um caso de exemplo na lixeira. Você pode restaurá-lo ou excluí-lo definitivamente.' as notes
FROM public.patients p
LEFT JOIN public.doctors d ON true
LEFT JOIN public.case_types ct ON true
LIMIT 1
ON CONFLICT DO NOTHING;
