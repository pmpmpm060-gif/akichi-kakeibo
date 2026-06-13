"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarRange, Loader2, Plus, Trash2 } from 'lucide-react';
import { AppHeader, useConfirm } from '../../components/mobile-ui';
import { DataErrorCard } from '../../components/data-error-card';
import { AmountCalculator } from '../../components/amount-calculator';
import { parseHouseholdUser } from '../../lib/household-users';
import { supabase } from '../../lib/supabase';
import type { Category } from '../../lib/database-helpers';
import type { Database, Json } from '../../lib/database.types';
import { userErrorMessage } from '../../lib/user-errors';

type Plan = Database['public']['Tables']['special_expense_plans']['Row'];
type PaymentInput = { date: string; amount: string };

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function SpecialExpensesContent() {
  const currentUser = parseHouseholdUser(useSearchParams().get('user'));
  const confirmAction = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [monthlyReserve, setMonthlyReserve] = useState('');
  const [reserveStartMonth, setReserveStartMonth] = useState(currentMonth);
  const [payments, setPayments] = useState<PaymentInput[]>([{ date: '', amount: '' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      supabase.from('categories').select('*').eq('user_id', currentUser).eq('type', 'expense').order('sort_order'),
      supabase.from('special_expense_plans').select('*').eq('user_id', currentUser).order('created_at', { ascending: false }),
    ]).then(([categoryResult, planResult]) => {
      if (ignore) return;
      const error = categoryResult.error || planResult.error;
      if (error) setDataError('特別支出予定の取得に失敗しました。通信状況を確認してください。');
      else {
        setCategories(categoryResult.data || []);
        setCategoryId((current) => current || categoryResult.data?.[0]?.id || '');
        setPlans(planResult.data || []);
      }
      setLoading(false);
    }).catch(() => {
      if (!ignore) {
        setDataError('特別支出予定の取得に失敗しました。通信状況を確認してください。');
        setLoading(false);
      }
    });
    return () => { ignore = true; };
  }, [currentUser, retryKey]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsedReserve = Number(monthlyReserve || 0);
    const parsedPayments = payments.map((payment) => ({ date: payment.date, amount: Number(payment.amount) }));
    if (!name.trim() || !categoryId || !reserveStartMonth || !Number.isSafeInteger(parsedReserve) || parsedReserve < 0
      || parsedPayments.some((payment) => !payment.date || !Number.isSafeInteger(payment.amount) || payment.amount <= 0)) {
      alert('名前・積立額・支払い予定日・金額を確認してください。');
      return;
    }
    setSaving(true);
    try {
      const result = await supabase.rpc('create_special_expense_plan', {
        target_user_id: currentUser,
        target_category_id: categoryId,
        target_name: name.trim(),
        target_monthly_reserve: parsedReserve,
        target_reserve_start_month: `${reserveStartMonth}-01`,
        target_payments: parsedPayments as Json,
      });
      if (result.error) alert(userErrorMessage('特別支出予定の保存', result.error));
      else {
        await supabase.rpc('generate_special_expense_payments', { target_user_id: currentUser, target_month: `${currentMonth()}-01` });
        setName(''); setMonthlyReserve(''); setPayments([{ date: '', amount: '' }]);
        setLoading(true); setRetryKey((current) => current + 1);
      }
    } catch {
      alert('特別支出予定の保存に失敗しました。通信状況を確認してください。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan: Plan) => {
    if (deletingId || !await confirmAction(`「${plan.name}」を削除しますか？\n生成済みの家計簿記録は残ります。`)) return;
    setDeletingId(plan.id);
    try {
      const { error } = await supabase.from('special_expense_plans').delete().eq('id', plan.id);
      if (error) alert(userErrorMessage('特別支出予定の削除', error));
      else setPlans((current) => current.filter((item) => item.id !== plan.id));
    } catch {
      alert('特別支出予定の削除に失敗しました。通信状況を確認してください。');
    } finally {
      setDeletingId(null);
    }
  };

  return <div className="flex flex-col gap-6 px-4 py-5">
    <AppHeader title="特別支出予定" currentUser={currentUser} />
    <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-slate-600">固定資産税・年払い保険などの個別日程を登録します。実績は支払月へ記録し、毎月の積立目安で家計を平準化します。</p>
    <form onSubmit={save} className="flex flex-col gap-4 rounded-3xl border-2 border-slate-800 bg-sky-50 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
      <h2 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5" />予定を追加</h2>
      <label className="flex flex-col gap-1 text-xs font-black">名前<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="例：固定資産税" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
      <label className="flex flex-col gap-1 text-xs font-black">カテゴリ<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs font-black">毎月の積立目安<div className="flex gap-2"><input type="number" min="0" step="1" value={monthlyReserve} onChange={(event) => setMonthlyReserve(event.target.value)} placeholder="例：10000" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-3 text-base" /><AmountCalculator value={monthlyReserve} min={0} onApply={(value) => setMonthlyReserve(String(value))} /></div></label>
      <label className="flex flex-col gap-1 text-xs font-black">積立開始月<input type="month" value={reserveStartMonth} onChange={(event) => setReserveStartMonth(event.target.value)} className="mobile-date-input min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
      <div className="flex flex-col gap-2"><p className="text-xs font-black">支払い予定</p>{payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label="支払い予定日" type="date" value={payment.date} onChange={(event) => setPayments((current) => current.map((item, target) => target === index ? { ...item, date: event.target.value } : item))} className="mobile-date-input min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-2 text-sm" /><input aria-label="支払い金額" type="number" min="1" step="1" value={payment.amount} onChange={(event) => setPayments((current) => current.map((item, target) => target === index ? { ...item, amount: event.target.value } : item))} placeholder="金額" className="min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-2 text-sm" /><button type="button" aria-label="予定を削除" disabled={payments.length === 1} onClick={() => setPayments((current) => current.filter((_, target) => target !== index))} className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border-2 border-slate-800 bg-rose-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      <button type="button" onClick={() => setPayments((current) => [...current, { date: '', amount: '' }])} className="min-h-11 rounded-xl border-2 border-slate-800 bg-white text-xs font-black">支払い日を追加</button>
      <button disabled={saving || categories.length === 0} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-slate-900 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarRange className="h-5 w-5" />}特別支出予定を保存</button>
    </form>
    <section className="flex flex-col gap-3"><h2 className="text-xs font-black uppercase tracking-widest text-slate-400">登録済み</h2>{loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : dataError ? <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((current) => current + 1); }} /> : plans.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">特別支出予定はありません。</p> : plans.map((plan) => <article key={plan.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-4"><div className="min-w-0"><p className="truncate font-black">{plan.name}</p><p className="mt-1 text-xs font-bold text-slate-500">毎月の積立目安 ¥{plan.monthly_reserve.toLocaleString()}・{plan.reserve_start_month.slice(0, 7)}開始</p></div><button type="button" onClick={() => remove(plan)} disabled={deletingId !== null} aria-label={`${plan.name}を削除`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-800 bg-rose-50 disabled:opacity-50">{deletingId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></article>)}</section>
  </div>;
}

export default function SpecialExpensesPage() {
  return <Suspense fallback={<Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />}><SpecialExpensesContent /></Suspense>;
}
