import { LogIn, UserPlus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ChatWindow } from '@/components/chat-window';
import { GuideInfoBox } from '@/components/guide/GuideInfoBox';
import { Button } from '@/components/ui/button';

import { auth0 } from '@/lib/auth0';

// Force dynamic rendering because we use auth0.getSession() which accesses cookies
export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] my-auto gap-6 p-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="bg-safeway-red p-3 rounded-xl">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-safeway-dark-gray">Welcome to Safeway Assistant</h1>
          </div>
          <p className="text-lg text-safeway-dark-gray max-w-md">
            Your AI-powered shopping companion. Get personalized recommendations, find deals, and make shopping easier.
          </p>
        </div>
        <div className="flex gap-4 flex-col sm:flex-row">
          <Button asChild variant="default" size="lg" className="safeway-button-primary px-8 py-3">
            <Link href="/auth/login" className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              <span>Sign In</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-safeway-red text-safeway-red hover:bg-safeway-red hover:text-white px-8 py-3"
          >
            <Link href="/auth/login?screen_hint=signup" className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <span>Create Account</span>
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl">
          <div className="safeway-card p-6 text-center">
            <Sparkles className="h-8 w-8 text-safeway-red mx-auto mb-3" />
            <h3 className="font-semibold text-safeway-dark-gray mb-2">Smart Recommendations</h3>
            <p className="text-sm text-safeway-dark-gray/70">
              Get personalized product suggestions based on your preferences
            </p>
          </div>
          <div className="safeway-card p-6 text-center">
            <div className="text-2xl mb-3">💰</div>
            <h3 className="font-semibold text-safeway-dark-gray mb-2">Find Great Deals</h3>
            <p className="text-sm text-safeway-dark-gray/70">Discover current promotions and savings opportunities</p>
          </div>
        </div>
      </div>
    );
  }

  const InfoCard = (
    <GuideInfoBox>
      <ul className="space-y-4">
        <li className="text-base flex items-start gap-3">
          <span className="text-2xl">🛒</span>
          <span>
            Welcome to your <strong>Safeway AI Assistant</strong>! I can help you find products, 
            and discover great deals. Just ask me anything about your shopping needs.
          </span>
        </li>
        <li className="text-base flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <span>
            Try asking: <em>&ldquo;Help me plan a healthy meal for tonight&rdquo;</em> or <em>&ldquo;What&rsquo;s on sale this week?&rdquo;</em>
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <ChatWindow
      endpoint="/api/chat"
      emoji="🛒"
      placeholder={`Hello ${session?.user?.name}! I'm your Safeway shopping assistant. How can I help you today?`}
      emptyStateComponent={InfoCard}
    />
  );
}
