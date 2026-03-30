import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function Footer() {
  const { t } = useLanguage();

  const footerLinks = {
    [t('footer.product')]: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Demo', href: '#demo' },
      { label: 'Changelog', href: '#' },
    ],
    [t('footer.company')]: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Press', href: '#' },
    ],
    [t('footer.resources')]: [
      { label: 'Help Center', href: '#' },
      { label: 'API Docs', href: '#' },
      { label: 'Status', href: '#' },
      { label: 'Contact', href: '#' },
    ],
    [t('footer.legal')]: [
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

  return (
    <footer className="py-20 px-4 relative" style={{ background: 'hsl(30 15% 6%)', borderTop: '1px solid hsl(43 65% 55% / 0.2)' }}>
      <div className="container max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl border" style={{ background: 'hsl(43 65% 55% / 0.1)', borderColor: 'hsl(43 65% 55% / 0.3)' }}>
                <Link2 className="h-5 w-5" style={{ color: 'hsl(43 65% 55%)' }} />
              </div>
              <span className="text-xl font-bold">
                <span className="text-white">Titi</span><span className="text-[hsl(43,65%,55%)] italic">Links</span>
              </span>
            </Link>
            <p className="text-white/50 mb-4 font-body">{t('footer.tagline')}</p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-white/60 hover:text-[hsl(43,65%,55%)]"
                  style={{ background: 'hsl(30 12% 10%)', border: '1px solid hsl(43 65% 55% / 0.15)' }}
                  aria-label={social.label}
                >
                  <span className="text-lg">{social.emoji}</span>
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 text-white font-body uppercase tracking-wider text-xs">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-white/50 hover:text-white transition-colors text-sm font-body">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center pt-8 gap-4" style={{ borderTop: '1px solid hsl(43 65% 55% / 0.15)' }}>
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} <span className="text-white font-bold">Titi</span><span className="text-[hsl(43,65%,55%)] italic font-bold">Links</span>. {t('footer.copyright')}
          </p>
          <p className="text-sm text-white/40">{t('footer.made')}</p>
        </div>
      </div>
    </footer>
  );
}
