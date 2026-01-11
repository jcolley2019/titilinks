-- Create enums
CREATE TYPE public.mode_type AS ENUM ('shop', 'recruit');
CREATE TYPE public.block_type AS ENUM ('primary_cta', 'product_cards', 'featured_media', 'social_links', 'links');
CREATE TYPE public.event_type AS ENUM ('page_view', 'outbound_click', 'mode_routed');

-- Create profiles table (User entity)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pages table
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  theme_json JSONB DEFAULT '{}',
  goal_primary_offer_item_id UUID,
  goal_recruit_item_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create modes table
CREATE TABLE public.modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  type public.mode_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(page_id, type)
);

-- Create blocks table
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_id UUID NOT NULL REFERENCES public.modes(id) ON DELETE CASCADE,
  type public.block_type NOT NULL,
  title TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create block_items table
CREATE TABLE public.block_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  subtitle TEXT,
  badge TEXT,
  image_url TEXT,
  is_adult BOOLEAN,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraints for goal items (after block_items exists)
ALTER TABLE public.pages 
  ADD CONSTRAINT fk_goal_primary_offer FOREIGN KEY (goal_primary_offer_item_id) REFERENCES public.block_items(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_goal_recruit FOREIGN KEY (goal_recruit_item_id) REFERENCES public.block_items(id) ON DELETE SET NULL;

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  mode public.mode_type NOT NULL,
  event_type public.event_type NOT NULL,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_pages_user_id ON public.pages(user_id);
CREATE INDEX idx_pages_handle ON public.pages(handle);
CREATE INDEX idx_modes_page_id ON public.modes(page_id);
CREATE INDEX idx_blocks_mode_id ON public.blocks(mode_id);
CREATE INDEX idx_block_items_block_id ON public.block_items(block_id);
CREATE INDEX idx_events_page_id ON public.events(page_id);
CREATE INDEX idx_events_created_at ON public.events(created_at);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.block_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Helper function to get page owner (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_page_owner(page_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.pages WHERE id = page_id
$$;

-- Helper function to get mode's page owner
CREATE OR REPLACE FUNCTION public.get_mode_owner(mode_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id FROM public.pages p
  JOIN public.modes m ON m.page_id = p.id
  WHERE m.id = mode_id
$$;

-- Helper function to get block's page owner
CREATE OR REPLACE FUNCTION public.get_block_owner(block_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id FROM public.pages p
  JOIN public.modes m ON m.page_id = p.id
  JOIN public.blocks b ON b.mode_id = m.id
  WHERE b.id = block_id
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Pages RLS policies
CREATE POLICY "Users can view their own pages"
  ON public.pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view pages by handle"
  ON public.pages FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own pages"
  ON public.pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pages"
  ON public.pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pages"
  ON public.pages FOR DELETE
  USING (auth.uid() = user_id);

-- Modes RLS policies
CREATE POLICY "Public can view modes"
  ON public.modes FOR SELECT
  USING (true);

CREATE POLICY "Users can create modes for their pages"
  ON public.modes FOR INSERT
  WITH CHECK (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Users can update their own modes"
  ON public.modes FOR UPDATE
  USING (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Users can delete their own modes"
  ON public.modes FOR DELETE
  USING (auth.uid() = public.get_page_owner(page_id));

-- Blocks RLS policies
CREATE POLICY "Public can view enabled blocks"
  ON public.blocks FOR SELECT
  USING (true);

CREATE POLICY "Users can create blocks for their modes"
  ON public.blocks FOR INSERT
  WITH CHECK (auth.uid() = public.get_mode_owner(mode_id));

CREATE POLICY "Users can update their own blocks"
  ON public.blocks FOR UPDATE
  USING (auth.uid() = public.get_mode_owner(mode_id));

CREATE POLICY "Users can delete their own blocks"
  ON public.blocks FOR DELETE
  USING (auth.uid() = public.get_mode_owner(mode_id));

-- BlockItems RLS policies
CREATE POLICY "Public can view block items"
  ON public.block_items FOR SELECT
  USING (true);

CREATE POLICY "Users can create items for their blocks"
  ON public.block_items FOR INSERT
  WITH CHECK (auth.uid() = public.get_block_owner(block_id));

CREATE POLICY "Users can update their own items"
  ON public.block_items FOR UPDATE
  USING (auth.uid() = public.get_block_owner(block_id));

CREATE POLICY "Users can delete their own items"
  ON public.block_items FOR DELETE
  USING (auth.uid() = public.get_block_owner(block_id));

-- Events RLS policies (users can view their own, anyone can insert for tracking)
CREATE POLICY "Users can view their own page events"
  ON public.events FOR SELECT
  USING (auth.uid() = public.get_page_owner(page_id));

CREATE POLICY "Anyone can insert events"
  ON public.events FOR INSERT
  WITH CHECK (true);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_modes_updated_at BEFORE UPDATE ON public.modes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_blocks_updated_at BEFORE UPDATE ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_block_items_updated_at BEFORE UPDATE ON public.block_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();