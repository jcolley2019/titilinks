CREATE POLICY "Public can subscribe to pages"
ON public.page_subscribers
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pages WHERE id = page_id
  )
);