import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  PenSquare, 
  BarChart3, 
  Sparkles,
  LogOut,
  Menu,
  X,
  Cog,
  UserCircle,
  CheckCircle2,
  Crown,
  Zap,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface ProfileCompletion {
  percentage: number;
  items: { label: string; completed: boolean }[];
}

type UserPlan = 'Free' | 'Pro' | 'Premium';

const planBadgeStyles: Record<UserPlan, string> = {
  Free: 'bg-muted text-muted-foreground border-border cursor-pointer hover:bg-muted/80',
  Pro: 'bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20',
  Premium: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-500 border-amber-500/30',
};

const planFeatures = {
  Pro: ['Unlimited links', 'Custom themes', 'Advanced analytics', 'Priority support'],
  Premium: ['Everything in Pro', 'Custom domain', 'Remove branding', 'API access'],
};

// Base nav items (Setup is conditionally added)
const baseNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/dashboard/editor', label: 'Editor', icon: PenSquare },
  { path: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/dashboard/ai-setup', label: 'AI Setup', icon: Sparkles },
  { path: '/dashboard/settings', label: 'Settings', icon: Cog },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasPage, setHasPage] = useState<boolean | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletion | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan>('Free');
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  // TODO: Fetch actual plan from subscription data when Stripe is enabled
  // For now, defaults to 'Free'. This will be updated when subscription management is implemented.

  // Scroll to top on route change and check scroll position for indicator
  useEffect(() => {
    window.scrollTo(0, 0);
    setShowScrollIndicator(true);
  }, [location.pathname]);

  // Handle scroll to show/hide bottom indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Hide indicator when near bottom (within 100px)
      const isNearBottom = scrollTop + windowHeight >= documentHeight - 100;
      setShowScrollIndicator(!isNearBottom && documentHeight > windowHeight + 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  // Check if user has set up their profile/page and calculate completion
  useEffect(() => {
    async function checkUserPage() {
      if (!user) {
        setHasPage(null);
        setProfileCompletion(null);
        return;
      }

      // Fetch page with related data for completion calculation
      const { data: page } = await supabase
        .from('pages')
        .select(`
          id,
          display_name,
          bio,
          avatar_url,
          handle
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      setHasPage(!!page);

      if (page) {
        // Fetch blocks count for this page
        const { data: modes } = await supabase
          .from('modes')
          .select('id')
          .eq('page_id', page.id);

        const modeIds = modes?.map(m => m.id) || [];
        
        let hasBlocks = false;
        if (modeIds.length > 0) {
          const { count } = await supabase
            .from('blocks')
            .select('id', { count: 'exact', head: true })
            .in('mode_id', modeIds);
          hasBlocks = (count || 0) > 0;
        }

        // Calculate completion
        const items = [
          { label: 'Display name', completed: !!page.display_name },
          { label: 'Bio', completed: !!page.bio },
          { label: 'Profile photo', completed: !!page.avatar_url },
          { label: 'Custom handle', completed: !!page.handle && page.handle.length > 3 },
          { label: 'Add content blocks', completed: hasBlocks },
        ];

        const completedCount = items.filter(i => i.completed).length;
        const percentage = Math.round((completedCount / items.length) * 100);

        setProfileCompletion({ percentage, items });
      }
    }
    checkUserPage();
  }, [user]);

  // Build nav items - only include Setup if user hasn't set up their profile
  const navItems = hasPage === false
    ? [
        ...baseNavItems.slice(0, 3), // Dashboard, Editor, Analytics
        { path: '/dashboard/setup', label: 'Profile Setup', icon: UserCircle },
        ...baseNavItems.slice(3), // AI Setup, Settings
      ]
    : baseNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Profile completion indicator component
  const ProfileCompletionIndicator = () => {
    if (!profileCompletion || profileCompletion.percentage === 100) return null;

    return (
      <div className="mx-4 mb-4 p-3 rounded-lg bg-secondary/50 border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">Profile Completion</span>
          <span className="text-xs font-bold text-primary">{profileCompletion.percentage}%</span>
        </div>
        <Progress value={profileCompletion.percentage} className="h-2 mb-3" />
        <div className="space-y-1.5">
          {profileCompletion.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 
                className={`h-3 w-3 ${item.completed ? 'text-green-500' : 'text-muted-foreground/40'}`} 
              />
              <span className={item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
        <Link 
          to="/dashboard/editor"
          className="mt-3 block text-center text-xs text-primary hover:underline"
        >
          Complete your profile →
        </Link>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background dark">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:bg-card lg:border-r lg:border-border">
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          <span className="text-2xl font-bold">
            <span className="text-foreground">Titi</span>
            <span className="italic text-primary">Links</span>
          </span>
          {userPlan === 'Free' ? (
            <Popover>
              <PopoverTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0.5 font-semibold ${planBadgeStyles[userPlan]}`}
                >
                  {userPlan}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Upgrade your plan</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Unlock more features and grow your audience faster.
                  </p>
                  <div className="space-y-1.5">
                    {planFeatures.Pro.slice(0, 3).map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Link to="/#pricing">
                    <Button size="sm" className="w-full mt-2 gap-1">
                      View Plans <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Badge 
              variant="outline" 
              className={`text-[10px] px-1.5 py-0.5 font-semibold ${planBadgeStyles[userPlan]}`}
            >
              {userPlan === 'Premium' && <Crown className="h-2.5 w-2.5 mr-0.5" />}
              {userPlan}
            </Badge>
          )}
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* Profile Completion Indicator */}
        <ProfileCompletionIndicator />
        
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-card border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">
            <span className="text-foreground">Titi</span>
            <span className="italic text-primary">Links</span>
          </span>
          {userPlan === 'Free' ? (
            <Popover>
              <PopoverTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`text-[9px] px-1 py-0 font-semibold ${planBadgeStyles[userPlan]}`}
                >
                  {userPlan}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3" align="start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-xs">Upgrade your plan</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Unlock more features and grow faster.
                  </p>
                  <Link to="/#pricing">
                    <Button size="sm" className="w-full text-xs h-7 gap-1">
                      View Plans <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Badge 
              variant="outline" 
              className={`text-[9px] px-1 py-0 font-semibold ${planBadgeStyles[userPlan]}`}
            >
              {userPlan === 'Premium' && <Crown className="h-2 w-2 mr-0.5" />}
              {userPlan}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="lg:hidden fixed top-16 right-0 bottom-0 z-50 w-64 bg-card border-l border-border"
        >
          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              className="justify-start gap-3 text-muted-foreground hover:text-foreground mt-4"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </Button>
          </nav>
        </motion.aside>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom">
        <div className="flex items-center justify-around py-2">
          {navItems.slice(0, 5).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen scrollbar-hide-mobile">
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile scroll indicator shadow with animated chevron */}
      <div 
        className={`lg:hidden fixed bottom-16 left-0 right-0 h-16 pointer-events-none transition-opacity duration-300 flex flex-col items-center justify-end pb-1 ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'linear-gradient(to top, hsl(var(--background)) 0%, transparent 100%)'
        }}
      >
        <ChevronDown className="w-5 h-5 text-muted-foreground animate-bounce" />
      </div>
    </div>
  );
}
