import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Check, Loader2, Smartphone } from 'lucide-react';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  getTemplatesByCategory,
  type TemplateCategory,
  type TemplateDefinition,
} from '@/lib/template-gallery';
import { cn } from '@/lib/utils';

interface TemplateGalleryProps {
  pageId: string;
  onApply: () => void;
}

export function TemplateGallery({ pageId, onApply }: TemplateGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  const templates = getTemplatesByCategory(selectedCategory);

  const applyTemplate = async (template: TemplateDefinition, applyBlockStyles: boolean = false) => {
    setApplying(template.id);
    try {
      // Update page theme_json
      const { error: pageError } = await supabase
        .from('pages')
        .update({ theme_json: JSON.parse(JSON.stringify(template.theme)) })
        .eq('id', pageId);

      if (pageError) throw pageError;

      // Optionally apply block styles to all link-type blocks
      if (applyBlockStyles) {
        // Get all modes for this page
        const { data: modes, error: modesError } = await supabase
          .from('modes')
          .select('id')
          .eq('page_id', pageId);

        if (modesError) throw modesError;

        if (modes && modes.length > 0) {
          const modeIds = modes.map((m) => m.id);

          // Get all blocks that support style variants
          const { data: blocks, error: blocksError } = await supabase
            .from('blocks')
            .select('id, type, title')
            .in('mode_id', modeIds)
            .in('type', ['primary_cta', 'links']);

          if (blocksError) throw blocksError;

          // Update each block's title with the new style config
          if (blocks && blocks.length > 0) {
            for (const block of blocks) {
              let existingConfig = {};
              try {
                existingConfig = JSON.parse(block.title || '{}');
              } catch {
                existingConfig = {};
              }

              const newConfig = {
                ...existingConfig,
                style: template.blockStyles,
              };

              const { error: updateError } = await supabase
                .from('blocks')
                .update({ title: JSON.stringify(newConfig) })
                .eq('id', block.id);

              if (updateError) {
                console.error('Error updating block style:', updateError);
              }
            }
          }
        }
      }

      setAppliedTemplate(template.id);
      toast.success(`Applied "${template.name}" template!`);
      onApply();

      // Reset applied indicator after a delay
      setTimeout(() => setAppliedTemplate(null), 2000);
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Category Chips */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                'border border-border hover:border-primary/50',
                selectedCategory === category.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="mr-1.5">{category.emoji}</span>
              {category.label}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Template Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <AnimatePresence mode="popLayout">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isApplying={applying === template.id}
              isApplied={appliedTemplate === template.id}
              onApply={() => applyTemplate(template, true)}
            />
          ))}
        </AnimatePresence>
      </div>

      {templates.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No templates in this category yet.</p>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: TemplateDefinition;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}

function TemplateCard({ template, isApplying, isApplied, onApply }: TemplateCardProps) {
  const [hovered, setHovered] = useState(false);

  // Generate inline preview styles
  const getPreviewBackground = () => {
    if (template.theme.background.type === 'gradient') {
      return template.theme.background.gradient_css;
    }
    return template.theme.background.solid_color;
  };

  const getButtonRadius = () => {
    switch (template.theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '6px';
      case 'square': return '2px';
      default: return '6px';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="border border-border rounded-xl overflow-hidden bg-card hover:border-primary/50 transition-all">
        {/* Mobile Preview Mock */}
        <div className="relative aspect-[9/16] overflow-hidden">
          {/* Background */}
          <div
            className="absolute inset-0"
            style={{ background: getPreviewBackground() }}
          />

          {/* Phone Frame Overlay */}
          <div className="absolute inset-0 flex flex-col items-center pt-6 px-3">
            {/* Avatar mock */}
            <div
              className="w-10 h-10 rounded-full mb-2"
              style={{ backgroundColor: template.theme.buttons.fill_color }}
            />
            {/* Name mock */}
            <div
              className="w-16 h-2 rounded mb-1"
              style={{ backgroundColor: template.theme.typography.text_color, opacity: 0.8 }}
            />
            {/* Bio mock */}
            <div
              className="w-20 h-1.5 rounded mb-4"
              style={{ backgroundColor: template.theme.typography.text_color, opacity: 0.4 }}
            />

            {/* Button mocks */}
            <div className="w-full space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-full h-6"
                  style={{
                    backgroundColor: template.blockStyles.variant === 'outline' || template.blockStyles.variant === 'glass'
                      ? 'transparent'
                      : template.theme.buttons.fill_color,
                    border: template.blockStyles.variant === 'outline' || template.blockStyles.variant === 'glass'
                      ? `1px solid ${template.theme.buttons.fill_color}`
                      : 'none',
                    borderRadius: getButtonRadius(),
                    opacity: 1 - i * 0.15,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Hover overlay with apply button */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center"
              >
                <Button
                  size="sm"
                  onClick={onApply}
                  disabled={isApplying}
                  className="gap-2"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying...
                    </>
                  ) : isApplied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Applied!
                    </>
                  ) : (
                    'Apply'
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Template Info */}
        <div className="p-2.5">
          <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground truncate">{template.description}</p>
        </div>
      </div>
    </motion.div>
  );
}
