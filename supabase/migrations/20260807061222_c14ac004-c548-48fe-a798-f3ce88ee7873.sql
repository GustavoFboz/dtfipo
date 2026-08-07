CREATE OR REPLACE FUNCTION public.apply_resin_weighing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_initial_weight numeric;
    v_declared_net numeric;
    v_packaging_weight numeric;
BEGIN
    -- Obter peso inicial do pote lacrado e conteúdo declarado
    SELECT tare_g, declared_net_g INTO v_initial_weight, v_declared_net 
    FROM public.resin_pots 
    WHERE id = NEW.pot_id;
    
    -- O peso da embalagem é o peso inicial menos o que vinha de resina
    v_packaging_weight := GREATEST(v_initial_weight - v_declared_net, 0);
    
    -- A resina restante é o peso atual na balança menos o peso da embalagem
    NEW.net_g := GREATEST(COALESCE(NEW.gross_g, 0) - COALESCE(v_packaging_weight, 0), 0);
    
    -- Atualizar o pote com o valor líquido calculado
    UPDATE public.resin_pots SET current_net_g = NEW.net_g, updated_at = now() WHERE id = NEW.pot_id;
    
    RETURN NEW;
END $function$;