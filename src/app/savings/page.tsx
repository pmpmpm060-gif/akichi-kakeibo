"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { SavingsGoal } from '../../lib/database-helpers';
import { DataErrorCard } from '../../components/data-error-card';
import { AppHeader, useConfirm } from '../../components/mobile-ui';
import { userErrorMessage } from '../../lib/user-errors';
import { AmountCalculator } from '../../components/amount-calculator';

type GoalWithTotal = SavingsGoal & { total: number };

function SavingsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const confirmAction = useConfirm();
  const [goals, setGoals] = useState<GoalWithTotal[]>([]);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [todayTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      try {
        const [goalResult, contributionResult] = await Promise.all([
          supabase.from('savings_goals').select('*').eq('user_id', currentUser).order('created_at', { ascending: false }),
          supabase.rpc('get_savings_goal_totals', { target_user_id: currentUser }),
        ]);
        if (ignore) return;
        const error = goalResult.error || contributionResult.error;
        if (error) {
          setDataError('貯金データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
          return;
        }
        const totalMap = new Map((contributionResult.data || []).map((item) => [item.goal_id, Number(item.total)]));
        setGoals((goalResult.data || []).map((goal) => ({
          ...goal,
          total: totalMap.get(goal.id) || 0,
        })));
        setDataError(null);
      } catch {
        if (!ignore) {
          setDataError('データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void fetchData();
    return () => { ignore = true; };
  }, [currentUser, retryKey]);

  const addGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(targetAmount);
    if (mutating || !name.trim() || !Number.isSafeInteger(amount) || amount <= 0) return;
    setMutating('new');
    try {
      const { data, error } = await supabase.from('savings_goals').insert({
        user_id: currentUser, name: name.trim(), target_amount: amount, target_date: targetDate || null,
      }).select().single();
      if (error) alert(userErrorMessage('目標の追加', error));
      else {
        setGoals((current) => [{ ...data, total: 0 }, ...current]);
        setName(''); setTargetAmount(''); setTargetDate('');
      }
    } catch {
      alert('目標の追加に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setMutating(null);
    }
  };

  const addContribution = async (goal: GoalWithTotal) => {
    const amount = Number(contributionAmounts[goal.id]);
    if (mutating || !Number.isSafeInteger(amount) || amount === 0) {
      alert('積立額は0以外の整数で入力してください。マイナス入力で取り崩しできます。');
      return;
    }
    if (goal.total + amount < 0) {
      alert('取り崩し後の積立額を0円未満にはできません。');
      return;
    }
    setMutating(goal.id);
    try {
      const { error } = await supabase.from('savings_contributions').insert({ user_id: currentUser, goal_id: goal.id, amount });
      if (error) alert(userErrorMessage('積立の登録', error));
      else {
        setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, total: item.total + amount } : item));
        setContributionAmounts((current) => ({ ...current, [goal.id]: '' }));
      }
    } catch {
      alert('積立の登録に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setMutating(null);
    }
  };

  const deleteGoal = async (goal: GoalWithTotal) => {
    if (mutating || !await confirmAction(`「${goal.name}」と積立履歴を削除しますか？`)) return;
    setMutating(goal.id);
    try {
      const { error } = await supabase.from('savings_goals').delete().eq('id', goal.id);
      if (error) alert(userErrorMessage('削除', error));
      else setGoals((current) => current.filter((item) => item.id !== goal.id));
    } catch {
      alert('削除に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setMutating(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="貯金目標" currentUser={currentUser} />
      <form onSubmit={addGoal} className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-emerald-50 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <h2 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5" />新しい目標</h2>
        <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="旅行、緊急資金など" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" />
        <div className="flex gap-2"><input type="number" min="1" step="1" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="目標金額" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-3 text-base" /><AmountCalculator value={targetAmount} min={1} onApply={(result) => setTargetAmount(String(result))} disabled={mutating !== null} /></div>
        <label className="flex flex-col gap-1 text-xs font-black">目標日（任意）<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="mobile-date-input min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
        <button disabled={mutating !== null} className="min-h-12 rounded-xl border-2 border-slate-800 bg-slate-900 text-sm font-black text-white disabled:opacity-50">{mutating === 'new' ? '保存中...' : '目標を追加する'}</button>
      </form>
      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : dataError ? <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((value) => value + 1); }} /> : goals.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">貯金目標はまだありません。</p> : goals.map((goal) => {
        const percent = Math.min(100, Math.max(0, (goal.total / goal.target_amount) * 100));
        const months = goal.target_date ? Math.max(1, Math.ceil((new Date(goal.target_date).getTime() - todayTimestamp) / (1000 * 60 * 60 * 24 * 30))) : null;
        const monthlyNeeded = months ? Math.max(0, Math.ceil((goal.target_amount - goal.total) / months)) : null;
        return <article key={goal.id} className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          <div className="flex justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black"><PiggyBank className="h-5 w-5 text-emerald-600" />{goal.name}</h2><p className="text-xs font-bold text-slate-500">¥{goal.total.toLocaleString()} / ¥{goal.target_amount.toLocaleString()}</p></div><button onClick={() => deleteGoal(goal)} className="flex min-h-11 min-w-11 items-center justify-center text-rose-500"><Trash2 className="h-4 w-4" /></button></div>
          <div className="h-4 overflow-hidden rounded-full border-2 border-slate-800 bg-slate-100"><div className="h-full bg-emerald-400" style={{ width: `${percent}%` }} /></div>
          <p className="text-xs font-black text-slate-600">達成率 {Math.round(percent)}%{monthlyNeeded !== null && `・月々の目安 ¥${monthlyNeeded.toLocaleString()}`}</p>
          <div className="flex gap-2"><input type="number" step="1" value={contributionAmounts[goal.id] || ''} onChange={(event) => setContributionAmounts((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder="積立額（取り崩しはマイナス）" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-3 text-base" /><AmountCalculator value={contributionAmounts[goal.id] || ''} allowNegative min={-1_000_000_000} onApply={(result) => setContributionAmounts((current) => ({ ...current, [goal.id]: String(result) }))} disabled={mutating !== null} /><button onClick={() => addContribution(goal)} disabled={mutating !== null} className="min-h-12 rounded-xl border-2 border-slate-800 bg-emerald-300 px-4 text-xs font-black disabled:opacity-50">反映</button></div>
        </article>;
      })}
    </div>
  );
}

export default function SavingsPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><SavingsPageContent /></Suspense>;
}
