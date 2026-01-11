import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, AtSign, FileText, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Setup() {
  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 max-w-2xl"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Profile Setup</h1>
          <p className="text-muted-foreground mt-1">Configure your TitiLINKS profile</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <User className="h-5 w-5 text-primary" />
              Basic Information
            </CardTitle>
            <CardDescription>
              Set up your public profile details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input id="displayName" placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handle" className="flex items-center gap-2">
                <AtSign className="h-4 w-4" />
                Handle
              </Label>
              <Input id="handle" placeholder="yourhandle" />
              <p className="text-xs text-muted-foreground">
                Your page will be available at titilinks.com/yourhandle
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Bio
              </Label>
              <Textarea id="bio" placeholder="Tell visitors about yourself..." rows={3} />
            </div>
            <Button className="gradient-primary text-primary-foreground">
              Save Profile
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Start with AI
            </CardTitle>
            <CardDescription>
              Let AI help you set up your page in seconds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Don't have time to set everything up manually? Use our AI assistant to create a professional page based on your preferences.
            </p>
            <Button variant="outline" asChild>
              <Link to="/dashboard/ai-setup" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Try AI Setup
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
