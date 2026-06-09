// Shared config + parser for the Text block. Heading and body each carry their
// own typography (font, bold, size, align). Includes migration from the older
// flat {font,bold,size,align} format (applies that shared style to both).

export type TextAlign = 'left' | 'center' | 'right';
export type TextSize = 'sm' | 'base' | 'lg';

export interface ElementStyle {
  font: string; // '' = inherit page font; otherwise a font key
  bold: boolean;
  size: TextSize;
  align: TextAlign;
}

export interface TextConfig {
  heading: string;
  body: string;
  headingStyle: ElementStyle;
  bodyStyle: ElementStyle;
}

export const DEFAULT_HEADING_STYLE: ElementStyle = { font: '', bold: true, size: 'lg', align: 'left' };
export const DEFAULT_BODY_STYLE: ElementStyle = { font: '', bold: false, size: 'base', align: 'left' };

export function defaultTextConfig(): TextConfig {
  return {
    heading: '',
    body: '',
    headingStyle: { ...DEFAULT_HEADING_STYLE },
    bodyStyle: { ...DEFAULT_BODY_STYLE },
  };
}

// Parse block.title into a TextConfig, tolerating: the new nested format, the
// older flat format, a raw (non-JSON) string, or null/undefined.
export function parseTextConfig(raw: string | null | undefined): TextConfig {
  const cfg = defaultTextConfig();
  if (!raw) return cfg;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    cfg.body = raw;
    return cfg;
  }

  cfg.heading = typeof parsed.heading === 'string' ? parsed.heading : '';
  cfg.body = typeof parsed.body === 'string' ? parsed.body : '';

  if (parsed.headingStyle || parsed.bodyStyle) {
    // New nested format
    cfg.headingStyle = { ...cfg.headingStyle, ...(parsed.headingStyle ?? {}) };
    cfg.bodyStyle = { ...cfg.bodyStyle, ...(parsed.bodyStyle ?? {}) };
  } else if (
    parsed.font !== undefined ||
    parsed.bold !== undefined ||
    parsed.size !== undefined ||
    parsed.align !== undefined
  ) {
    // Old flat format — apply the shared style to both elements
    const shared: ElementStyle = {
      font: typeof parsed.font === 'string' ? parsed.font : '',
      bold: !!parsed.bold,
      size: (parsed.size as TextSize) ?? 'base',
      align: (parsed.align as TextAlign) ?? 'left',
    };
    cfg.headingStyle = { ...shared };
    cfg.bodyStyle = { ...shared };
  }

  return cfg;
}
