import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navbar
    'nav.products': 'Products',
    'nav.products.linkInBio': 'Link in Bio',
    'nav.products.linkInBio.desc': 'Your entire brand in one link',
    'nav.products.linkShortener': 'Link Shortener',
    'nav.products.linkShortener.desc': 'Create trackable short URLs',
    'nav.products.qrGenerator': 'QR Generator',
    'nav.products.qrGenerator.desc': 'Generate QR codes for any link',
    'nav.templates': 'Templates',
    'nav.pricing': 'Pricing',
    'nav.login': 'Log in',
    'nav.signup': 'Sign up free',
    
    // Hero
    'hero.badge': 'Built for Creators, by Creators',
    'hero.title1': 'Your entire brand.',
    'hero.title2': 'One',
    'hero.title3': 'powerful link.',
    'hero.subtitle': 'Creating impact through presence, performance, and purpose.',
    'hero.description': 'Bring your brand to life with stunning link-in-bio pages. Every connection is a journey, every click a new opportunity.',
    'hero.cta': 'Start Free Today',
    'hero.cta2': 'See Examples',
    'hero.stat1': 'Setup in 2 min',
    'hero.stat2': 'Built for Creators',
    
    // Problem Section
    'problem.title': 'Sound',
    'problem.title2': 'familiar?',
    'problem.subtitle': 'Most creators struggle with the same frustrating problems',
    'problem.item1.title': 'Scattered links, lost sales',
    'problem.item1.desc': 'Your audience clicks away before they find what matters. Multiple links mean multiple chances to lose them.',
    'problem.item2.title': 'Hours wasted on setup',
    'problem.item2.desc': 'Building a website takes weeks. Updating it takes hours. Your content moves faster than your tools.',
    'problem.item3.title': "No idea what's working",
    'problem.item3.desc': "You're flying blind. Which links convert? Where do visitors drop off? Traditional bios tell you nothing.",
    
    // Solution Section
    'solution.title': 'Your bio link,',
    'solution.title2': 'elevated',
    'solution.description': 'TitiLINKS transforms your single bio link into a dynamic, trackable storefront that converts followers into customers—in minutes, not months.',
    'solution.feature1': 'Beautiful, mobile-first design',
    'solution.feature2': 'Built-in analytics & tracking',
    'solution.feature3': 'Mode switching for different audiences',
    'solution.feature4': 'Lightning-fast load times',
    'solution.clicks': '+127 clicks today',
    'solution.mockup.name': 'TheCreator 🥰',
    'solution.mockup.bio': 'Welcome to my world ✨',
    
    // Features Section
    'features.title': 'Everything you need to',
    'features.title2': 'convert',
    'features.subtitle': 'Powerful features that help you turn clicks into customers',
    'features.themes.title': 'Stunning Themes',
    'features.themes.desc': 'Choose from beautiful presets or customize colors, fonts, and layouts to match your brand perfectly.',
    'features.analytics.title': 'Deep Analytics',
    'features.analytics.desc': 'Track every click, view, and conversion. Know exactly where your audience comes from and what they want.',
    'features.modes.title': 'Mode Switching',
    'features.modes.desc': 'Show different content to different audiences. Shopping mode, recruiting mode—switch with one click.',
    'features.speed.title': 'Blazing Fast',
    'features.speed.desc': 'Sub-100ms load times. Your page loads before they can blink, so they never bounce.',
    'features.privacy.title': 'Privacy First',
    'features.privacy.desc': "Your data stays yours. We don't sell your analytics or share visitor information.",
    'features.builder.title': 'Manual or AI Builder',
    'features.builder.desc': 'Build your page your way—craft it manually with full control, or let AI create it for you in seconds.',
    
    // How It Works
    'how.title': 'Live in',
    'how.title2': '3 simple steps',
    'how.subtitle': 'From signup to sharing in under 5 minutes',
    'how.step1.title': 'Sign up in seconds',
    'how.step1.desc': 'Create your account with email or Google. No credit card required to get started.',
    'how.step2.title': 'Customize your page',
    'how.step2.desc': 'Add your links, products, and media. Pick a theme that matches your vibe.',
    'how.step3.title': 'Share & grow',
    'how.step3.desc': 'Drop your link in your bio and watch the analytics roll in. Optimize and convert.',
    
    // Testimonials
    'testimonials.title': 'Loved by',
    'testimonials.title2': 'creators',
    'testimonials.subtitle': "Join thousands of creators who've upgraded their bio link",
    
    // Stats
    'stats.title': 'Results that',
    'stats.title2': 'speak',
    'stats.subtitle': 'Real numbers from real creators',
    'stats.ctr': 'Higher CTR',
    'stats.ctr.desc': 'vs. traditional bio links',
    'stats.conversions': 'More Conversions',
    'stats.conversions.desc': 'with mode switching',
    'stats.load': 'Avg Load Time',
    'stats.load.desc': 'globally distributed',
    
    // Pricing
    'pricing.title': 'Simple,',
    'pricing.title2': 'transparent',
    'pricing.title3': 'pricing',
    'pricing.subtitle': 'Start free and scale as you grow. No hidden fees.',
    'pricing.monthly': 'Monthly',
    'pricing.annual': 'Annual',
    'pricing.save': 'Save up to 40%',
    'pricing.period.monthly': '/month',
    'pricing.period.annual': '/mo, billed annually',
    'pricing.free': 'Free',
    'pricing.free.period': 'forever',
    'pricing.free.desc': 'Perfect for getting started',
    'pricing.pro': 'Pro',
    'pricing.pro.desc': 'For serious creators',
    'pricing.premium': 'Premium',
    'pricing.premium.desc': 'For teams & agencies',
    'pricing.popular': 'Most Popular',
    'pricing.cta.free': 'Start Free',
    'pricing.cta.pro': 'Go Pro',
    'pricing.cta.premium': 'Contact Sales',
    
    // CTA
    'cta.badge': 'Start free today',
    'cta.title': 'Ready to',
    'cta.title2': 'level up',
    'cta.title3': 'your bio?',
    'cta.description': "Join thousands of creators who've already made the switch. Your new link-in-bio is just a click away.",
    'cta.button': 'Start Free Today',
    'cta.button2': 'Watch Demo',
    'cta.note': 'No credit card required · Free forever tier · Setup in 2 minutes',
    
    // Footer
    'footer.tagline': 'The link-in-bio for creators who sell. Turn clicks into customers.',
    'footer.product': 'Product',
    'footer.company': 'Company',
    'footer.resources': 'Resources',
    'footer.legal': 'Legal',
    'footer.copyright': 'All rights reserved.',
    'footer.made': 'Made with ✨ for creators everywhere',
    
    // Templates Page
    'templates.title': 'Find your perfect',
    'templates.title2': 'template',
    'templates.subtitle': 'Browse templates designed for your industry and start customizing in seconds.',
    'templates.comingSoon': 'Click any category to explore templates coming soon!',
    'templates.backToCategories': 'Back to categories',
    'templates.categoryTitle': 'Templates',
    'templates.categorySubtitle': 'Choose a template that fits your style and start building your page in minutes.',
    'templates.preview': 'Preview',
    'templates.useTemplate': 'Use This Template',
    'templates.noTemplates': 'No templates available for this category yet.',
    'templates.category.fashion': 'Fashion',
    'templates.category.healthFitness': 'Health and Fitness',
    'templates.category.influencer': 'Influencer and Creator',
    'templates.category.marketing': 'Marketing',
    'templates.category.music': 'Music',
    'templates.category.smallBusiness': 'Small Business',
    'templates.category.socialMedia': 'Social Media',
    'templates.category.sports': 'Sports',
    'templates.category.telegram': 'Telegram',
    'templates.category.whatsapp': 'Whatsapp',
  },
  es: {
    // Navbar
    'nav.products': 'Productos',
    'nav.products.linkInBio': 'Link en Bio',
    'nav.products.linkInBio.desc': 'Toda tu marca en un enlace',
    'nav.products.linkShortener': 'Acortador de Links',
    'nav.products.linkShortener.desc': 'Crea URLs cortas rastreables',
    'nav.products.qrGenerator': 'Generador QR',
    'nav.products.qrGenerator.desc': 'Genera códigos QR para cualquier link',
    'nav.templates': 'Plantillas',
    'nav.pricing': 'Precios',
    'nav.login': 'Iniciar sesión',
    'nav.signup': 'Regístrate gratis',
    
    // Hero
    'hero.badge': 'Confiado por más de 50,000 creadores',
    'hero.title1': 'Toda tu marca.',
    'hero.title2': 'Un',
    'hero.title3': 'enlace poderoso.',
    'hero.subtitle': 'Creando impacto a través de presencia, rendimiento y propósito.',
    'hero.description': 'Da vida a tu marca con impresionantes páginas de enlace en bio. Cada conexión es un viaje, cada clic una nueva oportunidad.',
    'hero.cta': 'Comienza Gratis Hoy',
    'hero.cta2': 'Ver Ejemplos',
    'hero.stat1': 'Configura en 2 min',
    'hero.stat2': 'Hecho para Creadores',
    
    // Problem Section
    'problem.title': '¿Te suena',
    'problem.title2': 'familiar?',
    'problem.subtitle': 'La mayoría de los creadores luchan con los mismos problemas frustrantes',
    'problem.item1.title': 'Enlaces dispersos, ventas perdidas',
    'problem.item1.desc': 'Tu audiencia se va antes de encontrar lo que importa. Múltiples enlaces significan múltiples oportunidades de perderlos.',
    'problem.item2.title': 'Horas perdidas en configuración',
    'problem.item2.desc': 'Construir un sitio web toma semanas. Actualizarlo toma horas. Tu contenido se mueve más rápido que tus herramientas.',
    'problem.item3.title': 'Sin idea de qué funciona',
    'problem.item3.desc': 'Estás a ciegas. ¿Qué enlaces convierten? ¿Dónde abandonan los visitantes? Los bios tradicionales no te dicen nada.',
    
    // Solution Section
    'solution.title': 'Tu enlace bio,',
    'solution.title2': 'elevado',
    'solution.description': 'TitiLINKS transforma tu único enlace bio en una tienda dinámica y rastreable que convierte seguidores en clientes—en minutos, no meses.',
    'solution.feature1': 'Diseño hermoso, móvil primero',
    'solution.feature2': 'Analíticas y seguimiento integrados',
    'solution.feature3': 'Cambio de modo para diferentes audiencias',
    'solution.feature4': 'Tiempos de carga ultrarrápidos',
    'solution.clicks': '+127 clics hoy',
    'solution.mockup.name': 'SoyCreadora 🥰',
    'solution.mockup.bio': 'Bienvenidos a mi mundo ✨',
    
    // Features Section
    'features.title': 'Todo lo que necesitas para',
    'features.title2': 'convertir',
    'features.subtitle': 'Funciones poderosas que te ayudan a convertir clics en clientes',
    'features.themes.title': 'Temas Impresionantes',
    'features.themes.desc': 'Elige entre hermosos preajustes o personaliza colores, fuentes y diseños para que coincidan perfectamente con tu marca.',
    'features.analytics.title': 'Analíticas Profundas',
    'features.analytics.desc': 'Rastrea cada clic, vista y conversión. Sabe exactamente de dónde viene tu audiencia y qué quieren.',
    'features.modes.title': 'Cambio de Modo',
    'features.modes.desc': 'Muestra contenido diferente a diferentes audiencias. Modo compras, modo reclutamiento—cambia con un clic.',
    'features.speed.title': 'Ultrarrápido',
    'features.speed.desc': 'Tiempos de carga de menos de 100ms. Tu página carga antes de que puedan parpadear.',
    'features.privacy.title': 'Privacidad Primero',
    'features.privacy.desc': 'Tus datos son tuyos. No vendemos tus analíticas ni compartimos información de visitantes.',
    'features.builder.title': 'Constructor Manual o con IA',
    'features.builder.desc': 'Construye tu página a tu manera—créala manualmente con control total, o deja que la IA la cree por ti en segundos.',
    
    // How It Works
    'how.title': 'En vivo en',
    'how.title2': '3 simples pasos',
    'how.subtitle': 'De registro a compartir en menos de 5 minutos',
    'how.step1.title': 'Regístrate en segundos',
    'how.step1.desc': 'Crea tu cuenta con email o Google. No se requiere tarjeta de crédito.',
    'how.step2.title': 'Personaliza tu página',
    'how.step2.desc': 'Agrega tus enlaces, productos y medios. Elige un tema que coincida con tu estilo.',
    'how.step3.title': 'Comparte y crece',
    'how.step3.desc': 'Pon tu enlace en tu bio y mira cómo llegan las analíticas. Optimiza y convierte.',
    
    // Testimonials
    'testimonials.title': 'Amado por',
    'testimonials.title2': 'creadores',
    'testimonials.subtitle': 'Únete a miles de creadores que han mejorado su enlace bio',
    
    // Stats
    'stats.title': 'Resultados que',
    'stats.title2': 'hablan',
    'stats.subtitle': 'Números reales de creadores reales',
    'stats.ctr': 'Mayor CTR',
    'stats.ctr.desc': 'vs. enlaces bio tradicionales',
    'stats.conversions': 'Más Conversiones',
    'stats.conversions.desc': 'con cambio de modo',
    'stats.load': 'Tiempo de Carga Prom.',
    'stats.load.desc': 'distribuido globalmente',
    
    // Pricing
    'pricing.title': 'Precios',
    'pricing.title2': 'simples',
    'pricing.title3': 'y transparentes',
    'pricing.subtitle': 'Comienza gratis y escala mientras creces. Sin tarifas ocultas.',
    'pricing.monthly': 'Mensual',
    'pricing.annual': 'Anual',
    'pricing.save': 'Ahorra hasta 40%',
    'pricing.period.monthly': '/mes',
    'pricing.period.annual': '/mes, facturado anualmente',
    'pricing.free': 'Gratis',
    'pricing.free.period': 'para siempre',
    'pricing.free.desc': 'Perfecto para comenzar',
    'pricing.pro': 'Pro',
    'pricing.pro.desc': 'Para creadores serios',
    'pricing.premium': 'Premium',
    'pricing.premium.desc': 'Para equipos y agencias',
    'pricing.popular': 'Más Popular',
    'pricing.cta.free': 'Comienza Gratis',
    'pricing.cta.pro': 'Ir a Pro',
    'pricing.cta.premium': 'Contactar Ventas',
    
    // CTA
    'cta.badge': 'Comienza gratis hoy',
    'cta.title': '¿Listo para',
    'cta.title2': 'subir de nivel',
    'cta.title3': 'tu bio?',
    'cta.description': 'Únete a miles de creadores que ya hicieron el cambio. Tu nuevo enlace-en-bio está a un clic de distancia.',
    'cta.button': 'Comienza Gratis Hoy',
    'cta.button2': 'Ver Demo',
    'cta.note': 'Sin tarjeta de crédito · Gratis para siempre · Configura en 2 minutos',
    
    // Footer
    'footer.tagline': 'El enlace-en-bio para creadores que venden. Convierte clics en clientes.',
    'footer.product': 'Producto',
    'footer.company': 'Compañía',
    'footer.resources': 'Recursos',
    'footer.legal': 'Legal',
    'footer.copyright': 'Todos los derechos reservados.',
    'footer.made': 'Hecho con ✨ para creadores en todo el mundo',
    
    // Templates Page
    'templates.title': 'Encuentra tu',
    'templates.title2': 'plantilla perfecta',
    'templates.subtitle': 'Explora plantillas diseñadas para tu industria y comienza a personalizar en segundos.',
    'templates.comingSoon': '¡Haz clic en cualquier categoría para explorar plantillas próximamente!',
    'templates.backToCategories': 'Volver a categorías',
    'templates.categoryTitle': 'Plantillas',
    'templates.categorySubtitle': 'Elige una plantilla que se adapte a tu estilo y comienza a construir tu página en minutos.',
    'templates.preview': 'Vista previa',
    'templates.useTemplate': 'Usar Esta Plantilla',
    'templates.noTemplates': 'Aún no hay plantillas disponibles para esta categoría.',
    'templates.category.fashion': 'Moda',
    'templates.category.healthFitness': 'Salud y Fitness',
    'templates.category.influencer': 'Influencer y Creador',
    'templates.category.marketing': 'Marketing',
    'templates.category.music': 'Música',
    'templates.category.smallBusiness': 'Pequeños Negocios',
    'templates.category.socialMedia': 'Redes Sociales',
    'templates.category.sports': 'Deportes',
    'templates.category.telegram': 'Telegram',
    'templates.category.whatsapp': 'Whatsapp',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectBrowserLanguage(): Language {
  const browserLang = navigator.language.split('-')[0];
  return browserLang === 'es' ? 'es' : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('titilinks-language');
    if (saved === 'en' || saved === 'es') return saved;
    return detectBrowserLanguage();
  });

  useEffect(() => {
    localStorage.setItem('titilinks-language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
