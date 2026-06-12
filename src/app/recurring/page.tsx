"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category, RecurringTransaction } from '../../lib/database-helpers';

type RecurringWithCategory = RecurringTransaction & {
  categories: Pick<Category, 'name' | 'icon' | 'type'> | null;
};

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function RecurringPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<RecurringWithCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [startMonth, setStartMonth] = useState(currentMonthString);
  const [endMonth, setEndMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      const [categoryResult, recurringResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('created_at'),
        supabase
          .from('recurring_transactions')
          .select('*, categories(name, icon, type)')
          .eq('user_id', currentUser)
          .order('created_at', { ascending: false }),
      ]);

      if (ignore) return;
      const error = categoryResult.error || recurringResult.error;
      if (error) {
        setDataError(error.message);
      } else {
        const categoryData = categoryResult.data || [];
        setCategories(categoryData);
        setCategoryId((current) => current || categoryData[0]?.id || '');
        setItems((recurringResult.data || []) as RecurringWithCategory[]);
      }
      setLoading(false);
    };

    void fetchData();
    return () => { ignore = true; };
  }, [currentUser, retryKey]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    const parsedAmount = Number(amount);
    const parsedDay = Number(dayOfMonth);
    if (!categoryId || !startMonth || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      alert('登録日は1日から31日の間で入力してください。');
      return;
    }
    if (endMonth && endMonth < startMonth) {
      alert('終了月は開始月以降を指定してください。');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert({
          user_id: currentUser,
          category_id: categoryId,
          amount: parsedAmount,
          description: description.trim(),
          day_of_month: parsedDay,
          start_month: `${startMonth}-01`,
          end_month: endMonth ? `${endMonth}-01` : null,
        })
        .select('*, categories(name, icon, type)')
        .single();

      if (error) {
        alert('定期取引の追加に失敗しました：' + error.message);
      } else {
        setItems((current) => [data as RecurringWithCategory, ...current]);
        setAmount('');
        setDescription('');
        const { error: generateError } = await supabase.rpc('generate_recurring_transactions', {
          target_user_id: currentUser,
          target_month: `${currentMonthString()}-01`,
        });
        if (generateError) {
          alert('定期取引は保存しましたが、当月分の生成に失敗しました：' + generateError.message);
        }
      }
    } catch {
      alert('定期取引の追加に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (item: RecurringWithCategory) => {
    if (mutatingId) return;
    setMutatingId(item.id);
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ enabled: !item.enabled })
      .eq('id', item.id);
    if (error) {
      alert('状態の変更に失敗しました：' + error.message);
    } else {
      setItems((current) => current.map((target) =>
        target.id === item.id ? { ...target, enabled: !target.enabled } : target
      ));
      if (!item.enabled) {
        const { error: generateError } = await supabase.rpc('generate_recurring_transactions', {
          target_user_id: currentUser,
          target_month: `${currentMonthString()}-01`,
        });
        if (generateError) alert('有効化しましたが、当月分の生成に失敗しました：' + generateError.message);
      }
    }
    setMutatingId(null);
  };

  const handleDelete = async (item: RecurringWithCategory) => {
    if (mutatingId || !confirm(`「${item.description || item.categories?.name || '定期取引'}」を削除しますか？\n生成済みの家計簿記録は残ります。`)) return;
    setMutatingId(item.id);
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', item.id);
    if (error) {
      alert('削除に失敗しました：' + error.message);
    } else {
      setItems((current) => current.filter((target) => target.id !== item.id));
    }
    setMutatingId(null);
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link href={`/?user=${currentUser}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-slate-800 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-black">定期取引</h1>
        </div>
        <span className="rounded-full border-2 border-slate-800 bg-indigo-100 px-2 py-1 text-[10px] font-black">
          {currentUser === 'user_a' ? 'ママ' : 'パパ'}
        </span>
      </header>

      <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-3xl border-2 border-slate-800 bg-indigo-50 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <h2 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5" />定期取引を追加</h2>
        <label className="flex flex-col gap-1 text-xs font-black">
          分類
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">
            {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-black">
          金額
          <input type="number" inputMode="numeric" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" placeholder="例: 80000" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-black">
          メモ
          <input value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" placeholder="例: 家賃、給与" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-black">毎月何日
            <input type="number" min="1" max="31" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} className="min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-3 text-base" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-black">開始月
            <input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className="mobile-date-input min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-3 text-base" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-black">終了月（任意）
            <input type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className="mobile-date-input min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-3 text-base" />
          </label>
        </div>
        <button disabled={isSaving || categories.length === 0} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900 text-sm font-black text-white disabled:opacity-50">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-5 w-5" />}
          定期取引を保存する
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">登録済みの定期取引</h2>
        {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" /> : dataError ? (
          <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((current) => current + 1); }} />
        ) : items.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">定期取引はまだありません。</p>
        ) : items.map((item) => (
          <article key={item.id} className={`flex flex-col gap-3 rounded-2xl border-2 border-slate-800 p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] ${item.enabled ? 'bg-white' : 'bg-slate-100 opacity-70'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.categories?.icon} {item.description || item.categories?.name}</p>
                <p className="text-xs font-bold text-slate-500">毎月{item.day_of_month}日・¥{item.amount.toLocaleString()}</p>
                <p className="text-[10px] font-bold text-slate-400">{item.start_month.slice(0, 7)} ～ {item.end_month?.slice(0, 7) || '終了なし'}</p>
              </div>
              <button onClick={() => handleDelete(item)} disabled={mutatingId !== null} aria-label="定期取引を削除" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 disabled:opacity-50">
                {mutatingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
            <button onClick={() => handleToggle(item)} disabled={mutatingId !== null} className={`min-h-11 rounded-xl border-2 border-slate-800 text-xs font-black ${item.enabled ? 'bg-emerald-200' : 'bg-slate-200'}`}>
              {item.enabled ? '自動登録：有効' : '自動登録：停止中'}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

export default function RecurringPage() {
  return <Suspense fallback={<div className="p-6 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><RecurringPageContent /></Suspense>;
}
