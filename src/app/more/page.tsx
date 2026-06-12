"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, CalendarClock, FolderKanban, Loader2, PiggyBank, ShieldCheck, Wrench } from 'lucide-react';
import { AppHeader } from '../../components/mobile-ui';
import { parseHouseholdUser } from '../../lib/household-users';
import { supabase } from '../../lib/supabase';

function MorePageContent() {
  const currentUser = parseHouseholdUser(useSearchParams().get('user'));
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { void supabase.rpc('is_app_admin').then(({ data }) => setIsAdmin(Boolean(data))); }, []);
  const items = [
    { href: '/categories', label: 'カテゴリ設定', description: '収入・支出の分類を管理', icon: FolderKanban, color: 'bg-pink-100' },
    { href: '/reports', label: '家計レポート', description: '月別・年間の傾向を確認', icon: BarChart3, color: 'bg-indigo-100' },
    { href: '/recurring', label: '定期取引', description: '固定費・定期収入を管理', icon: CalendarClock, color: 'bg-sky-100' },
    { href: '/savings', label: '貯金目標', description: '目標と積立状況を管理', icon: PiggyBank, color: 'bg-emerald-100' },
    { href: '/tools', label: '便利機能設定', description: 'タグ・テンプレート・通知を管理', icon: Wrench, color: 'bg-amber-100' },
    ...(isAdmin ? [{ href: '/admin/approvals', label: '利用申請の承認', description: '新規アカウントの利用を許可', icon: ShieldCheck, color: 'bg-emerald-100' }] : []),
  ];
  return <div className="flex flex-col gap-6 px-4 py-5">
    <AppHeader title="その他の機能" currentUser={currentUser} />
    <div className="grid grid-cols-1 gap-3">
      {items.map(({ href, label, description, icon: Icon, color }) => <Link key={href} href={`${href}?user=${currentUser}`} className={`flex min-h-20 items-center gap-3 rounded-2xl border-2 border-slate-800 p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] ${color}`}>
        <Icon className="h-7 w-7 shrink-0" /><span><span className="block text-base font-black">{label}</span><span className="block text-xs font-bold text-slate-500">{description}</span></span>
      </Link>)}
    </div>
  </div>;
}

export default function MorePage() {
  return <Suspense fallback={<Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />}><MorePageContent /></Suspense>;
}
