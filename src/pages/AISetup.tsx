import { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2, Eye, ArrowRight } from 'lucide-react';

export default function AISetup() {
  const [step, setStep] = useState(1);

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 max-w-3xl"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            AI Setup Assistant
          </h1>
          <p className="text-muted-foreground mt-1">
            Answer a few questions and we'll create your perfect page
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-secondary'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Tell us about yourself</CardTitle>
                <CardDescription>
                  This helps our AI understand your brand and style
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profession">What do you do?</Label>
                  <Input id="profession" placeholder="e.g., Content Creator, Musician, Designer" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goals">What are your main goals?</Label>
                  <Textarea
                    id="goals"
                    placeholder="e.g., Grow my audience, sell products, share my portfolio..."
                    rows={3}
                  />
                </div>
                <Button
                  className="gradient-primary text-primary-foreground gap-2"
                  onClick={() => setStep(2)}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Choose your style</CardTitle>
                <CardDescription>
                  Select a style that matches your brand
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {['Minimal', 'Bold', 'Professional', 'Creative'].map((style) => (
                    <Button
                      key={style}
                      variant="outline"
                      className="h-20 text-lg hover:border-primary hover:bg-primary/10"
                    >
                      {style}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className="gradient-primary text-primary-foreground gap-2 flex-1"
                    onClick={() => setStep(3)}
                  >
                    Generate Preview
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Eye className="h-5 w-5 text-primary" />
                  Preview Your Page
                </CardTitle>
                <CardDescription>
                  Here's what your TitiLINKS page could look like
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-[9/16] max-w-xs mx-auto bg-secondary rounded-2xl flex items-center justify-center">
                  <p className="text-muted-foreground text-center px-4">
                    AI-generated preview will appear here
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button className="gradient-primary text-primary-foreground flex-1">
                    Apply This Design
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
