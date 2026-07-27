-- Fix: trigger patients_set_unaccent (executed as invoker on INSERT/UPDATE of patients)
-- calls public.normalize_text(text), but a previous hardening migration revoked
-- EXECUTE on that function from authenticated. Result: "permission denied for
-- function normalize_text" ao cadastrar paciente/caso.
-- Solução: marcar ambas as funções como SECURITY DEFINER (executam com
-- privilégios do owner). São imutáveis/simples e não acessam dados sensíveis.

ALTER FUNCTION public.normalize_text(text) SECURITY DEFINER;
ALTER FUNCTION public.patients_set_unaccent() SECURITY DEFINER;

-- Garante que o trigger consiga invocar a função auxiliar
GRANT EXECUTE ON FUNCTION public.normalize_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patients_set_unaccent() TO authenticated;