// AI Bio Generation Service
// Optional step to generate creative bios based on intake data

import { supabase } from '@/integrations/supabase/client';
import type { CreatorType, Tone } from './page-plan-templates';

export interface BioGenerationInput {
  display_name: string;
  creator_type: CreatorType;
  tone: Tone;
  primary_offer_description?: string;
}

export interface GeneratedBios {
  bio_short: string;
  bio_long: string;
  error?: string;
}

// Fallback bios when AI generation fails
export const FALLBACK_BIOS: GeneratedBios = {
  bio_short: "Creator | Links below",
  bio_long: "Find my latest content, offers, and ways to connect.",
};

// Creator type to human-readable labels
const creatorTypeLabels: Record<CreatorType, string> = {
  streaming_tiktok: "TikTok & streaming creator",
  gamer: "gaming creator",
  fitness: "fitness creator",
  musician: "musician",
  affiliate_marketer: "affiliate marketer",
  adult_creator: "content creator",
};

/**
 * Generate AI-powered bios based on creator profile
 * Falls back to default bios if AI fails
 */
export async function generateBios(input: BioGenerationInput): Promise<GeneratedBios> {
  try {
    const { data, error } = await supabase.functions.invoke<GeneratedBios>('generate-bio', {
      body: {
        display_name: input.display_name,
        creator_type: input.creator_type,
        tone: input.tone,
        primary_offer_description: input.primary_offer_description,
      },
    });

    if (error) {
      console.error('Bio generation error:', error);
      return FALLBACK_BIOS;
    }

    return data || FALLBACK_BIOS;
  } catch (err) {
    console.error('Failed to generate bios:', err);
    return FALLBACK_BIOS;
  }
}

/**
 * Generate simple fallback bios without AI
 * Used when AI is unavailable or user opts out
 */
export function generateFallbackBios(input: BioGenerationInput): GeneratedBios {
  const label = creatorTypeLabels[input.creator_type] || "creator";
  
  // Simple templates based on tone
  const templates: Record<Tone, { short: string; long: string }> = {
    professional: {
      short: `${input.display_name} | ${label.charAt(0).toUpperCase() + label.slice(1)}`,
      long: `Welcome! I'm ${input.display_name}, a ${label}. Explore my links and connect with me.`,
    },
    friendly: {
      short: `Hey! I'm ${input.display_name} 👋`,
      long: `Hi there! I'm ${input.display_name}, a ${label}. Check out my favorite things below!`,
    },
    bold: {
      short: `${input.display_name.toUpperCase()} | THE ${label.toUpperCase()}`,
      long: `${input.display_name} here. ${label.charAt(0).toUpperCase() + label.slice(1)} bringing you the best content and deals.`,
    },
    minimal: {
      short: input.display_name,
      long: `${input.display_name} · ${label.charAt(0).toUpperCase() + label.slice(1)} · Links`,
    },
    funny: {
      short: `${input.display_name} | Professional link-haver`,
      long: `I'm ${input.display_name}. I make content. You click links. We both win. 🎉`,
    },
  };

  const template = templates[input.tone] || templates.friendly;

  return {
    bio_short: template.short.slice(0, 90),
    bio_long: template.long.slice(0, 180),
  };
}
