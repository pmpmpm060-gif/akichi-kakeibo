"use client";

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Home, List, Menu, Plus, PiggyBank } from 'lucide-react';
import { parseHouseholdUser } from '../lib/household-users';
import { useCurrentProfileId } from '../lib/household-profiles';

const items = [
  { label: 'ホーム', path: '/', icon: Home },
  { label: '履歴', path: '/dashboard', hash: '#transaction-history', icon: List },
  { label: '記録する', path: '/dashboard', hash: '#transaction-form', icon: Plus, primary: true },
  { label: '予算', path: '/budgets', icon: PiggyBank },
  { label: 'その他', path: '/more', icon: Menu },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const ownProfileId = useCurrentProfileId();
  const visibleItems = items.filter((item) => !item.primary || ownProfileId === currentUser);

  if (pathname === '/login' || pathname === '/setup' || pathname === '/approval-pending') return null;

  return (
    <nav
      aria-label="メインナビゲーション"
      className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t-2 border-slate-800 bg-white/95 px-2 pt-2 shadow-[0_-4px_18px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      <div className={`grid gap-1 ${visibleItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path && !item.primary;
          const href = `${item.path}?user=${currentUser}${item.hash || ''}`;

          return (
            <Link
              key={item.label}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-black transition-colors ${
                item.primary
                  ? '-mt-5 min-h-16 border-2 border-slate-800 bg-emerald-300 text-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                  : isActive
                    ? 'bg-amber-100 text-slate-900'
                    : 'text-slate-500'
              }`}
            >
              <Icon className={item.primary ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={2.5} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
