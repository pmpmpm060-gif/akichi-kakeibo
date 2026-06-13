"use client";

import { useEffect, useState } from 'react';
import { Check, Link2, Loader2, ShieldCheck, X } from 'lucide-react';
import { DataErrorCard } from '../../../components/data-error-card';
import { AppHeader, useConfirm, useToast } from '../../../components/mobile-ui';
import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../lib/database.types';

type Approval = Database['public']['Tables']['user_approvals']['Row'];

export default function ApprovalsPage() {
  const confirm = useConfirm();
  const notify = useToast();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mutating, setMutating] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    setError('');
    try {
      const admin = await supabase.rpc('is_app_admin');
      if (admin.error || !admin.data) {
        setError('この画面を利用する権限がありません。');
        return;
      }
      const result = await supabase.from('user_approvals').select('*').eq('is_admin', false).order('requested_at', { ascending: false }).limit(200);
      if (result.error) setError('利用申請の取得に失敗しました。');
      else setApprovals(result.data || []);
    } catch {
      setError('利用申請の取得に失敗しました。通信状況を確認してください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      supabase.rpc('is_app_admin'),
      supabase.from('user_approvals').select('*').eq('is_admin', false).order('requested_at', { ascending: false }).limit(200),
    ]).then(([admin, result]) => {
      if (ignore) return;
      if (admin.error || !admin.data) setError('この画面を利用する権限がありません。');
      else if (result.error) setError('利用申請の取得に失敗しました。');
      else setApprovals(result.data || []);
      setLoading(false);
    }).catch(() => {
      if (!ignore) {
        setError('利用申請の取得に失敗しました。通信状況を確認してください。');
        setLoading(false);
      }
    });
    return () => { ignore = true; };
  }, []);

  const review = async (approval: Approval, approve: boolean) => {
    if (!await confirm(`${approval.email} の利用を${approve ? '承認' : '却下'}しますか？`)) return;
    setMutating(approval.user_id);
    try {
      const result = await supabase.rpc('review_app_user', { target_user_id: approval.user_id, approve });
      if (result.error) notify('承認状況の更新に失敗しました。', 'error');
      else {
        notify(approve ? '利用を承認しました。' : '利用を却下しました。');
        await fetchApprovals();
      }
    } catch {
      notify('承認状況の更新に失敗しました。通信状況を確認してください。', 'error');
    } finally {
      setMutating(null);
    }
  };

  const assignMama = async (approval: Approval) => {
    if (!await confirm(`${approval.email} を、この世帯のママとして割り当てますか？\n割り当て後、このアカウントはママのデータだけを編集できます。`)) return;
    setMutating(approval.user_id);
    try {
      const result = await supabase.rpc('assign_household_profile', { target_user_id: approval.user_id, target_profile_id: 'user_a' });
      if (result.error) notify('割り当てに失敗しました。未所属の承認済みアカウントか確認してください。', 'error');
      else notify('ママのログインアカウントを割り当てました。');
    } catch {
      notify('割り当てに失敗しました。通信状況を確認してください。', 'error');
    } finally {
      setMutating(null);
    }
  };

  return <div className="flex flex-col gap-6 px-4 py-5">
    <AppHeader title="利用申請の承認" currentUser="user_b" />
    <p className="flex gap-2 rounded-2xl bg-indigo-50 p-3 text-xs font-bold leading-relaxed text-slate-600"><ShieldCheck className="h-5 w-5 shrink-0 text-indigo-600" />パパだけが利用承認とママアカウントの割り当てを行えます。通常の承認だけでは既存世帯のデータは共有されません。</p>
    {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : error ? <DataErrorCard message={error} onRetry={fetchApprovals} /> : approvals.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">利用申請はありません。</p> : <div className="flex flex-col gap-3">
      {approvals.map((approval) => <article key={approval.user_id} className="rounded-2xl border-2 border-slate-800 bg-white p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
        <p className="break-all text-sm font-black">{approval.email}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">状態：{approval.status === 'pending' ? '承認待ち' : approval.status === 'approved' ? '承認済み' : '却下'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => review(approval, false)} disabled={mutating === approval.user_id} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border-2 border-slate-800 bg-rose-100 text-xs font-black disabled:opacity-50"><X className="h-4 w-4" />却下</button>
          <button type="button" onClick={() => review(approval, true)} disabled={mutating === approval.user_id} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border-2 border-slate-800 bg-emerald-300 text-xs font-black disabled:opacity-50"><Check className="h-4 w-4" />承認</button>
        </div>
        {approval.status === 'approved' && <button type="button" onClick={() => assignMama(approval)} disabled={mutating === approval.user_id} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border-2 border-slate-800 bg-purple-100 text-xs font-black disabled:opacity-50"><Link2 className="h-4 w-4" />この世帯のママとして割り当て</button>}
      </article>)}
    </div>}
  </div>;
}
