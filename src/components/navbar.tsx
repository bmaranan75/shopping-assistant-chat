'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/utils/cn';

export const ActiveLink = (props: { href: string; children: ReactNode; className?: string }) => {
  const pathname = usePathname();
  return (
    <Link
      href={props.href}
      className={cn(
        'px-4 py-2 rounded-md whitespace-nowrap flex items-center gap-2 text-sm transition-all',
        pathname === props.href
          ? 'bg-white/15 text-white font-semibold'
          : 'text-white/90 hover:bg-white/10 hover:text-white',
        props.className,
      )}
    >
      {props.children}
    </Link>
  );
};
