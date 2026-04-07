/**
 * Maps known default/placeholder English content strings to translation keys.
 * When rendering block items, if a label/subtitle/badge matches a known default,
 * the translated version is returned. Custom user content passes through unchanged.
 */

const CONTENT_MAP: Record<string, string> = {
  // Primary CTA
  'Shop My Collection': 'content.shopMyCollection',
  'New arrivals every week': 'content.newArrivalsEveryWeek',
  'Book a Consultation': 'content.bookConsultation',
  "Let's work together": 'content.letsWorkTogether',

  // Links
  'My Website': 'content.myWebsite',
  'Check out my website': 'content.checkOutMyWebsite',
  'Latest Blog Post': 'content.latestBlogPost',
  'Read my latest content': 'content.readMyLatestContent',
  'Work With Me': 'content.workWithMe',
  'Collaborations & partnerships': 'content.collaborationsPartnerships',
  'My Resume': 'content.myResume',
  'Download my CV': 'content.downloadMyCv',
  'Press Kit': 'content.pressKit',
  'Media resources': 'content.mediaResources',
  'Testimonials': 'content.testimonials',
  'What clients say': 'content.whatClientsSay',

  // Product Cards
  'Product One': 'content.productOne',
  'Your best seller': 'content.yourBestSeller',
  'Product Two': 'content.productTwo',
  'New arrival': 'content.newArrival',
  'Product Three': 'content.productThree',
  'Fan favorite': 'content.fanFavorite',

  // Featured Media
  'My Showreel': 'content.myShowreel',
  'Watch my latest work': 'content.watchMyLatestWork',
  'Portfolio': 'content.portfolio',
  'View my full portfolio': 'content.viewMyFullPortfolio',
  'Featured Content 1': 'content.featuredContent1',
  'Featured Content 2': 'content.featuredContent2',
  'Featured Content 3': 'content.featuredContent3',

  // Social link subtitles
  'Follow me on TikTok': 'content.followMeOnTiktok',
  'Follow me on Instagram': 'content.followMeOnInstagram',
  'Subscribe to my channel': 'content.subscribeToMyChannel',
  'Connect professionally': 'content.connectProfessionally',
  'Follow my content': 'content.followMyContent',

  // Email subscribe
  'Stay up to date': 'content.stayUpToDate',
  'Thanks for subscribing!': 'content.thanksForSubscribing',
  'Subscribe': 'content.subscribe',

  // AI Setup template content
  'Shop My Favorites': 'content.shopMyFavorites',
  'Exclusive deals just for you': 'content.exclusiveDeals',
  'Become a Creator': 'content.becomeACreator',
  'Join my affiliate program': 'content.joinAffiliateProgram',
  'Shop My Gaming Gear': 'content.shopMyGamingGear',
  'The exact setup I use': 'content.theExactSetup',
  'Join My Affiliate Program': 'content.joinMyAffiliateProgram',
  'Earn while you game': 'content.earnWhileYouGame',
  'Shop My Supplements': 'content.shopMySupplements',
  'What I use daily': 'content.whatIUseDaily',
  'Join My Coaching Team': 'content.joinMyCoachingTeam',
  'Build your fitness business': 'content.buildYourFitnessBusiness',
  'Stream My Music': 'content.streamMyMusic',
  'Available on all platforms': 'content.availableOnAllPlatforms',
  'Booking & collaborations': 'content.bookingCollaborations',
  'Shop My Recommendations': 'content.shopMyRecommendations',
  'Curated just for you': 'content.curatedForYou',
  'Join My Team': 'content.joinMyTeam',
  'Learn to earn online': 'content.learnToEarnOnline',
  'Subscribe Now': 'content.subscribeNow',
  'Unlock premium content': 'content.unlockPremiumContent',
  'Start Creating': 'content.startCreating',
  'Join my referral program': 'content.joinReferralProgram',

  // Block titles
  'Primary CTA': 'content.primaryCta',
  'Products': 'content.products',
  'Social Links': 'content.socialLinks',
  'Links': 'content.links',
  'Featured Media': 'content.featuredMedia',
};

/**
 * Translates a content string if it matches a known default.
 * Returns the original string if no match is found.
 */
export function translateContent(text: string | null | undefined, t: (key: string) => string): string {
  if (!text) return '';
  const key = CONTENT_MAP[text];
  return key ? t(key) : text;
}
