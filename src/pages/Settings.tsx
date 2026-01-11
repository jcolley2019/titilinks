import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, Moon, Bell } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export default function Settings() {
  const { language, setLanguage } = useLanguage();

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account preferences</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Language / Idioma
            </CardTitle>
            <CardDescription>
              Choose your preferred language for the app interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  {language === 'en' ? 'English' : 'Español'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'en' 
                    ? 'Switch to Spanish / Cambiar a Español' 
                    : 'Cambiar a Inglés / Switch to English'}
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
              <Bell className="h-5 w-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>
              Manage how you receive updates and alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Email notifications</Label>
                <p className="text-sm text-muted-foreground">Receive updates about your page performance</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Weekly digest</Label>
                <p className="text-sm text-muted-foreground">Get a summary of your analytics every week</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
