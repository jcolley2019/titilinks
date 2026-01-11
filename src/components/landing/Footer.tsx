import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Demo', href: '#demo' },
    { label: 'Changelog', href: '#' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Press', href: '#' },
  ],
  Resources: [
    { label: 'Help Center', href: '#' },
    { label: 'API Docs', href: '#' },
    { label: 'Status', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Legal: [
    { label: 'Privacy', href: '#' },
    { label: 'Terms', href: '#' },
    { label: 'Cookies', href: '#' },
    { label: 'Licenses', href: '#' },
  ],
};

const socialLinks = [
  { label: 'Twitter', emoji: '𝕏', href: '#' },
  { label: 'Instagram', emoji: '📸', href: '#' },
  { label: 'TikTok', emoji: '🎵', href: '#' },
  { label: 'Discord', emoji: '💬', href: '#' },
];

export function Footer() {
  return (
    <footer className="py-16 px-4 border-t border-border">
      <div className="container max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Logo and tagline */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xl font-bold">
                Titi<span className="italic text-primary">Links</span>
              </span>
            </Link>
            <p className="text-muted-foreground mb-4">
              The link-in-bio for creators who sell. Turn clicks into customers.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center hover:border-primary/30 transition-colors"
                  aria-label={social.label}
                >
                  <span className="text-lg">{social.emoji}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 text-primary">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t border-border gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} TitiLINKS. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Made with ✨ for creators everywhere
          </p>
        </div>
      </div>
    </footer>
  );
}
