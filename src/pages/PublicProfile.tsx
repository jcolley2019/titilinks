import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Link as LinkIcon, ExternalLink } from 'lucide-react';

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();

  // Placeholder data - will be replaced with real data from database
  const profile = {
    displayName: handle || 'User',
    bio: 'Welcome to my TitiLINKS page!',
    links: [] as { id: string; title: string; url: string }[],
  };

  return (
    <div className="min-h-screen bg-background dark flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center space-y-6"
      >
        <Avatar className="h-24 w-24 mx-auto">
          <AvatarFallback className="text-2xl gradient-primary text-primary-foreground">
            {profile.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div>
          <h1 className="text-2xl font-bold text-foreground">@{handle}</h1>
          <p className="text-muted-foreground mt-1">{profile.bio}</p>
        </div>

        <div className="space-y-3">
          {profile.links.length > 0 ? (
            profile.links.map((link) => (
              <motion.a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="block w-full"
              >
                <Button
                  variant="outline"
                  className="w-full h-14 text-base justify-between hover:border-primary hover:bg-primary/10"
                >
                  <span>{link.title}</span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </motion.a>
            ))
          ) : (
            <div className="py-8">
              <div className="rounded-full bg-secondary p-4 w-fit mx-auto mb-4">
                <LinkIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No links yet</p>
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Powered by{' '}
          <span className="gradient-text font-semibold">TitiLINKS</span>
        </p>
      </motion.div>
    </div>
  );
}
