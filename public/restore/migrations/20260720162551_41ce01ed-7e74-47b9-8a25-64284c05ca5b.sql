DROP FUNCTION IF EXISTS public.create_team_member(text, text, text, text);
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text, text) TO authenticated;
