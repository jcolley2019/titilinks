import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Eye, MousePointer, TrendingUp } from 'lucide-react';

const stats = [
  { label: 'Total Views', value: '0', icon: Eye, change: '+0%' },
  { label: 'Link Clicks', value: '0', icon: MousePointer, change: '+0%' },
  { label: 'Click Rate', value: '0%', icon: TrendingUp, change: '+0%' },
  { label: 'Active Links', value: '0', icon: BarChart3, change: '0' },
];

export default function Dashboard() {
  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome to your TitiLINKS dashboard</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.change} from last week</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Quick Start</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Get started by setting up your profile in the Setup tab, then add your links in the Editor.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
