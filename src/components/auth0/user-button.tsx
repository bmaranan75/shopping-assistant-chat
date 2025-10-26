import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface KeyValueMap {
  [key: string]: any;
}

function LogOut() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" x2="9" y1="12" y2="12"></line>
    </svg>
  );
}

function getAvatarFallback(user: KeyValueMap) {
  const givenName = user.given_name;
  const familyName = user.family_name;
  const nickname = user.nickname;
  const name = user.name;
  const email = user.email;

  // Try to get initials from first and last name
  if (givenName && familyName) {
    return `${givenName[0].toUpperCase()}${familyName[0].toUpperCase()}`;
  }

  // Try to get initials from full name (split by space)
  if (name && name.includes(' ')) {
    const nameParts = name.trim().split(' ');
    if (nameParts.length >= 2) {
      return `${nameParts[0][0].toUpperCase()}${nameParts[nameParts.length - 1][0].toUpperCase()}`;
    }
  }

  // Fallback to nickname first letter
  if (nickname && nickname.length > 0) {
    return nickname[0].toUpperCase();
  }

  // Fallback to name first letter
  if (name && name.length > 0) {
    return name[0].toUpperCase();
  }

  // Final fallback to email first letter
  if (email && email.length > 0) {
    return email[0].toUpperCase();
  }

  // Ultimate fallback
  return '?';
}

export default function UserButton({
  user,
  children,
  logoutUrl = '/api/auth/logout',
}: {
  user: KeyValueMap;
  children?: React.ReactNode;
  logoutUrl?: string;
}) {
  const picture = user.picture;
  const name = user.name || user.nickname || user.email;
  const email = user.email;
  const resolvedLogoutUrl = logoutUrl;
  const avatarFallback = getAvatarFallback(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage 
              src={picture} 
              alt={`${name}'s profile picture`}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback className="text-xs font-medium bg-safeway-red text-white">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage 
                src={picture} 
                alt={`${name}'s profile picture`}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback className="text-xs font-medium bg-safeway-red text-white">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{name}</p>
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            </div>
          </div>
        </DropdownMenuLabel>

        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem>
          <a href={resolvedLogoutUrl} className="flex gap-2 items-center">
            <LogOut />
            Log out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
