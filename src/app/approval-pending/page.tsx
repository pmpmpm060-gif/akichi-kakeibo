"use client";

import { useEffect, useState } from 'react';
import { Clock3, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ApprovalPendingPage() {
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const checkStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const request = await supabase.rpc('request_app_approval');
      if (request.error) throw request.error;
      setStatus(request.data);
      if (request.data === 'approved') window.location.href = '/setup';
    } catch {
      setError('承認状況を確認できませんでした。通信状況を確認してください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    void supabase.rpc('request_app_approval').then((request) => {
      if (ignore) return;
      if (request.error) setError('承認状況を確認できませんでした。通信状況を確認してください。');
      else {
        setStatus(request.data);
        if (request.data === 'approved') window.location.href = '/setup';
      }
      setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return <div className="flex min-h-screen flex-col justify-center gap-6 bg-amber-50 px-4 py-6">
    <section className="flex flex-col items-center gap-4 rounded-3xl border-4 border-slate-800 bg-white p-6 text-center shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
      <Clock3 className="h-12 w-12 text-amber-500" />
      <div><h1 className="text-2xl font-black">利用承認を待っています</h1><p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">パパが承認すると、あなた専用の家計簿を作成できます。メール確認は不要です。</p></div>
      {status === 'rejected' && <p className="rounded-xl bg-rose-50 p-3 text-sm font-black text-rose-600">現在は利用が承認されていません。パパへ確認してください。</p>}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-black text-rose-600">{error}</p>}
      <button type="button" onClick={checkStatus} disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-amber-300 text-sm font-black disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}承認状況を確認する</button>
      <button type="button" onClick={logout} className="flex min-h-11 items-center justify-center gap-2 text-xs font-black text-slate-500"><LogOut className="h-4 w-4" />別のアカウントでログイン</button>
    </section>
  </div>;
}
