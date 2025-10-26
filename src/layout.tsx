import './globals.css';
import { Open_Sans, Roboto } from 'next/font/google';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { ActiveLink } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { auth0 } from '@/lib/auth0';
import UserButton from '@/components/auth0/user-button';
import { DynamicFavicon } from '@/components/DynamicFavicon';
import { ThemeProvider } from 'next-themes';

const openSans = Open_Sans({ weight: ['400', '600', '700'], subsets: ['latin'] });
const roboto = Roboto({ weight: ['400', '500', '700'], subsets: ['latin'] });

const TITLE = 'Safeway Assistant: Your AI Shopping Companion';
const DESCRIPTION = 'Get personalized shopping assistance and discover great deals with our AI-powered assistant.';

// Force dynamic rendering because we use auth0.getSession() which accesses cookies
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let session = null;

  try {
    session = await auth0.getSession();
  } catch (error) {
    console.warn('Auth0 session error:', error);
    // Continue without session - user can still see the login page
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{TITLE}</title>
  {/* Dynamic favicon based on theme */}
  <link rel="shortcut icon" type="image/x-icon" href="/images/safeway-favicon.ico" />
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="/images/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content="/images/og-image.png" />
      </head>
      <body className={openSans.className}>
        <DynamicFavicon />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            <div className="bg-safeway-light-gray grid grid-rows-[auto,1fr] h-[100dvh]">
              <div className="safeway-header grid grid-cols-[1fr,auto] gap-4 p-4">
                <div className="flex gap-6 flex-col md:flex-row md:items-center">
                  <Link href="/" className="flex items-center gap-3 px-4">
                    <div className="bg-white p-2 rounded-lg">
                      <Sparkles className="h-8 w-8 text-safeway-red" />
                    </div>
                  <span className={`${roboto.className} text-white text-2xl font-bold`}>Safeway Assistant</span>
                </Link>
                <nav className="flex gap-2 flex-col md:flex-row">
                  <ActiveLink href="/" className="safeway-nav-link">
                    Chat Assistant
                  </ActiveLink>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                {session && (
                  <div className="flex items-center gap-3 px-4 text-white">
                    <UserButton user={session?.user!} logoutUrl="/auth/logout" />
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white relative grid">
              <div className="absolute inset-0">{children}</div>
            </div>
          </div>
          <Toaster richColors />
        </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
