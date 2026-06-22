'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/traders', label: 'Traders' },
  { href: '/copy', label: 'Copy' },
  { href: '/vault', label: 'Vault' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold text-brand-purple">
          SCT
        </Link>

        <div className="hidden md:flex items-center space-x-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'bg-gray-800 text-brand-purple'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center">
          <WalletMultiButton className="!bg-brand-purple hover:!bg-brand-purple/90 !h-10 !rounded-md !text-sm" />
        </div>
      </div>
    </nav>
  );
}
