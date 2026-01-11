interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <span className={className}>
      <span className="text-foreground">Titi</span>
      <span className="italic text-primary">Links</span>
    </span>
  );
}

export function BrandLogoText({ className = '' }: BrandLogoProps) {
  return (
    <>
      <span className="text-foreground">Titi</span>
      <span className="italic text-primary">Links</span>
    </>
  );
}
