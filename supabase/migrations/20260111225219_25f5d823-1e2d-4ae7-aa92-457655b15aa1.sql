-- Make refresh_token and scope NOT NULL (with defaults for existing rows)
ALTER TABLE public.canva_connections 
ALTER COLUMN refresh_token SET NOT NULL;

ALTER TABLE public.canva_connections 
ALTER COLUMN scope SET NOT NULL;

-- Add INSERT policy for users to insert their own connection
CREATE POLICY "Users can insert their own canva connection"
ON public.canva_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);