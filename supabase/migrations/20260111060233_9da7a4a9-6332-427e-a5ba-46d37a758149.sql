-- Create short_links table for link shortening
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  block_item_id uuid REFERENCES public.block_items(id) ON DELETE SET NULL,
  code text UNIQUE NOT NULL,
  destination_url text NOT NULL,
  click_count integer DEFAULT 0,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for fast code lookups
CREATE INDEX idx_short_links_code ON public.short_links(code);
CREATE INDEX idx_short_links_page_id ON public.short_links(page_id);

-- Enable RLS
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only manage short_links for pages they own
CREATE POLICY "Users can view their own short links"
ON public.short_links
FOR SELECT
USING (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Users can create short links for their pages"
ON public.short_links
FOR INSERT
WITH CHECK (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Users can update their own short links"
ON public.short_links
FOR UPDATE
USING (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Users can delete their own short links"
ON public.short_links
FOR DELETE
USING (auth.uid() = public.get_page_owner(page_id));

-- Add updated_at trigger
CREATE TRIGGER update_short_links_updated_at
BEFORE UPDATE ON public.short_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create SECURITY DEFINER function to resolve short links
-- This bypasses RLS so public visitors can resolve links
CREATE OR REPLACE FUNCTION public.resolve_short_link(
  p_code text,
  p_referrer text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (destination_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_referrer_domain text;
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
  
  -- Extract domain from referrer if provided
  IF p_referrer IS NOT NULL AND p_referrer <> '' THEN
    BEGIN
      -- Simple domain extraction (handles most cases)
      v_referrer_domain := substring(p_referrer from 'https?://([^/]+)');
    EXCEPTION WHEN OTHERS THEN
      v_referrer_domain := NULL;
    END;
  END IF;
  
  -- Attempt to insert an outbound_click event
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
        'block_type', 'short_link',
        'block_id', NULL,
        'item_id', v_link.block_item_id,
        'destination_domain', v_referrer_domain,
        'full_url', v_link.destination_url,
        'short_code', p_code,
        'referrer', p_referrer,
        'user_agent', p_user_agent
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Silently ignore if events table doesn't exist or insert fails
    NULL;
  END;
  
  -- Return the destination URL
  RETURN QUERY SELECT v_link.destination_url;
END;
$$;

-- Grant execute to anon and authenticated so redirects work publicly
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text, text, text) TO authenticated;