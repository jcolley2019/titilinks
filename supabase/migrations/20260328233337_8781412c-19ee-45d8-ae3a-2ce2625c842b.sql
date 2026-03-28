CREATE POLICY "Users can view their own pending auth"
ON public.pending_canva_auth
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);