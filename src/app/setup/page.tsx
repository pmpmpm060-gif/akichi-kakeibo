"use client";

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SetupPage() {
  const [householdName, setHouseholdName] = useState('わたしの家計簿');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!householdName.trim() || !displayName.trim() || saving) return;
    setSaving(true); setError('');
    try {
      const result = await supabase.rpc('setup_personal_household', { household_name: householdName.trim(), display_name: displayName.trim() });
      if (result.error) setError(result.error.message);
      else window.location.href = '/';
    } catch {
      setError('初期設定に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return <div className="flex min-h-screen flex-col justify-center gap-6 bg-amber-50 px-4 py-6">
    <div className="text-center"><Sparkles className="mx-auto h-8 w-8 text-amber-500" /><h1 className="mt-2 text-3xl font-black">最初の設定</h1><p className="mt-2 text-sm font-bold text-slate-500">あなた専用の家計簿を作ります。他の世帯からデータは見えません。</p></div>
    <form onSubmit={setup} className="flex flex-col gap-4 rounded-3xl border-4 border-slate-800 bg-white p-5 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      <label className="flex flex-col gap-1 text-xs font-black">家計簿の名前<input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
      <label className="flex flex-col gap-1 text-xs font-black">表示名<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：さくら" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
      <button disabled={saving} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-800 bg-emerald-300 text-sm font-black disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : '専用家計簿を作成する'}</button>
    </form>
  </div>;
}
