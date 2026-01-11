-- ADV-4: Create page_subscribers table for email collection

-- Create the table
CREATE TABLE public.page_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_page_subscribers_page_id ON public.page_subscribers(page_id);
CREATE INDEX idx_page_subscribers_email ON public.page_subscribers(email);

-- Prevent duplicate email per page
CREATE UNIQUE INDEX idx_page_subscribers_unique_email ON public.page_subscribers(page_id, email);

-- Enable RLS
ALTER TABLE public.page_subscribers ENABLE ROW LEVEL SECURITY;

-- Only page owner can SELECT (read/export) their subscribers
CREATE POLICY "Page owners can view their subscribers"
ON public.page_subscribers
FOR SELECT
USING (auth.uid() = get_page_owner(page_id));

-- Only page owner can DELETE their subscribers
CREATE POLICY "Page owners can delete their subscribers"
ON public.page_subscribers
FOR DELETE
USING (auth.uid() = get_page_owner(page_id));

-- Create a security definer function for public subscription
-- This prevents abuse by validating email and rate limiting could be added
CREATE OR REPLACE FUNCTION public.subscribe_to_page(
  p_page_id UUID,
  p_email TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Validate email format (basic check)
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN json_build_object('success', false, 'error', 'Invalid email format');
  END IF;

  -- Check if page exists
  IF NOT EXISTS (SELECT 1 FROM public.pages WHERE id = p_page_id) THEN
    RETURN json_build_object('success', false, 'error', 'Page not found');
  END IF;

  -- Insert subscriber (will fail on duplicate due to unique constraint)
  BEGIN
    INSERT INTO public.page_subscribers (page_id, email, name)
    VALUES (p_page_id, lower(trim(p_email)), nullif(trim(p_name), ''));
    
    RETURN json_build_object('success', true);
  EXCEPTION 
    WHEN unique_violation THEN
      -- Already subscribed - return success anyway (don't leak info)
      RETURN json_build_object('success', true);
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', 'Failed to subscribe');
  END;
END;
$$;