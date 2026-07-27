-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'USER');
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Insert into profiles
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, v_role);

    -- If role is CADISTA, insert into cadistas
    IF v_role = 'CADISTA' THEN
        INSERT INTO public.cadistas (name, user_id)
        VALUES (v_full_name, new.id);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
