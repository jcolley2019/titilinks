
-- Update resolve_short_link to use correct metadata format
CREATE OR REPLACE FUNCTION public.resolve_short_link(p_code text, p_referrer text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(destination_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link RECORD;
BEGIN
  -- Find the short link
  SELECT sl.id, sl.destination_url, sl.page_id, sl.block_item_id
  INTO v_link
  FROM public.short_links sl
  WHERE sl.code = p_code;
  
  -- If not found, return empty
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Update click count and last_clicked_at
  UPDATE public.short_links
  SET 
    click_count = click_count + 1,
    last_clicked_at = now()
  WHERE id = v_link.id;
  
  -- Attempt to insert an outbound_click event (best-effort)
  BEGIN
    INSERT INTO public.events (
      page_id,
      mode,
      event_type,
      metadata_json
    ) VALUES (
      v_link.page_id,
      'shop', -- Default to shop mode for short links
      'outbound_click',
      jsonb_build_object(
        'via', 'shortlink',
        'short_code', p_code,
        'block_item_id', v_link.block_item_id,
        'destination_url', v_link.destination_url,
        'referrer', p_referrer,
        'user_agent', p_user_agent
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Silently ignore if insert fails - redirect still works
    NULL;
  END;
  
  -- Return the destination URL
  RETURN QUERY SELECT v_link.destination_url;
END;
$function$;
