import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  /** Current hex color, e.g. "#C9A55C". */
  value: string;
  /** Fires live as the user drags or types — wire straight to your state so the
   *  preview updates immediately. */
  onChange: (color: string) => void;
  className?: string;
}

/**
 * Modern in-page color picker: a swatch button that opens a popover with a live
 * react-colorful picker + hex input. Updates immediately (no OS dialog), and
 * closes on click-outside. Drop-in replacement for `<input type="color">`.
 */
export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick a color"
          className={cn('h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border', className)}
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[130] w-auto p-3">
        <HexColorPicker color={value} onChange={onChange} />
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm uppercase outline-none focus:ring-1 focus:ring-ring"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Inline color picker (Link.me-style): the saturation/value square + hue bar +
 * hex input rendered directly in the page (no popover). Use inside an expanded
 * "Customize Color" section. Full-width via the `.lb-inline-picker` rule in
 * index.css.
 */
export function InlineColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <div className={cn('lb-inline-picker space-y-2.5', className)}>
      <HexColorPicker color={value} onChange={onChange} />
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm uppercase outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
