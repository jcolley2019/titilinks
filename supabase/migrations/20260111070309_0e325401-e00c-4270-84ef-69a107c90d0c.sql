-- Create table for user's custom theme presets
CREATE TABLE public.custom_theme_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  theme_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_theme_presets ENABLE ROW LEVEL SECURITY;

-- Users can only view their own presets
CREATE POLICY "Users can view their own presets"
ON public.custom_theme_presets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own presets
CREATE POLICY "Users can create their own presets"
ON public.custom_theme_presets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own presets
CREATE POLICY "Users can update their own presets"
ON public.custom_theme_presets
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own presets
CREATE POLICY "Users can delete their own presets"
ON public.custom_theme_presets
FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_custom_theme_presets_updated_at
BEFORE UPDATE ON public.custom_theme_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();