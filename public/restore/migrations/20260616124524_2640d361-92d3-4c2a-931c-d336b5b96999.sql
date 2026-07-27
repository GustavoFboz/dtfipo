REVOKE ALL ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_team_member(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_team_member(uuid,text) TO authenticated;