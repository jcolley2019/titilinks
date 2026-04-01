import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, Sun, Moon, Bell } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from 'next-themes';

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {t('settings.languageTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.languageDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  {language === 'en' ? t('settings.languageEn') : t('settings.languageEs')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'en'
                    ? t('settings.switchToEs')
                    : t('settings.switchToEn')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${language === 'en' ? 'text-primary' : 'text-muted-foreground'}`}>
                  EN
                </span>
                <Switch
                  checked={language === 'es'}
                  onCheckedChange={(checked) => setLanguage(checked ? 'es' : 'en')}
                />
                <span className={`text-sm font-medium ${language === 'es' ? 'text-primary' : 'text-muted-foreground'}`}>
                  ES
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              {t('settings.appearanceTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.appearanceDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.themeToggleDesc')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Sun className={`h-4 w-4 ${theme !== 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
                <Moon className={`h-4 w-4 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t('settings.notificationsTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.notificationsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('settings.emailNotifications')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.emailNotificationsDesc')}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('settings.weeklyDigest')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.weeklyDigestDesc')}</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
