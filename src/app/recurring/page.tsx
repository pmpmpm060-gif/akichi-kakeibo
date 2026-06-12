"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, ChevronDown, ChevronUp, Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category, RecurringTransaction } from '../../lib/database-helpers';
import { AppHeader, useConfirm } from '../../components/mobile-ui';

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
  const confirmAction = useConfirm();
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
  const [editingItem, setEditingItem] = useState<RecurringWithCategory | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      const [categoryResult, recurringResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
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
        setIsAddFormOpen(false);
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
    if (mutatingId || !await confirmAction(`「${item.description || item.categories?.name || '定期取引'}」を削除しますか？\n生成済みの家計簿記録は残ります。`)) return;
    setMutatingId(item.id);
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', item.id);
    if (error) {
      alert('削除に失敗しました：' + error.message);
    } else {
      setItems((current) => current.filter((target) => target.id !== item.id));
      if (editingItem?.id === item.id) setEditingItem(null);
    }
    setMutatingId(null);
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || mutatingId) return;
    if (!Number.isSafeInteger(editingItem.amount) || editingItem.amount <= 0 || editingItem.day_of_month < 1 || editingItem.day_of_month > 31) {
      alert('金額と登録日を確認してください。');
      return;
    }
    if (editingItem.end_month && editingItem.end_month < editingItem.start_month) {
      alert('終了月は開始月以降を指定してください。');
      return;
    }
    setMutatingId(editingItem.id);
    const { data, error } = await supabase.from('recurring_transactions').update({
      category_id: editingItem.category_id,
      amount: editingItem.amount,
      description: editingItem.description.trim(),
      day_of_month: editingItem.day_of_month,
      start_month: editingItem.start_month,
      end_month: editingItem.end_month,
    }).eq('id', editingItem.id).select('*, categories(name, icon, type)').single();
    if (error) alert('定期取引の更新に失敗しました：' + error.message);
    else {
      setItems((current) => current.map((item) => item.id === data.id ? data as RecurringWithCategory : item));
      setEditingItem(null);
    }
    setMutatingId(null);
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="定期取引" currentUser={currentUser} />

      <button type="button" onClick={() => setIsAddFormOpen((current) => !current)} className="flex min-h-12 items-center justify-between rounded-2xl border-2 border-slate-800 bg-indigo-100 px-4 text-sm font-black shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
        <span className="flex items-center gap-2"><Plus className="h-5 w-5" />定期取引を追加</span>{isAddFormOpen ? <ChevronUp /> : <ChevronDown />}
      </button>
      {isAddFormOpen && <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-3xl border-2 border-slate-800 bg-indigo-50 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
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
      </form>}

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
              <button onClick={() => setEditingItem(item)} disabled={mutatingId !== null} aria-label="定期取引を編集" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 disabled:opacity-50"><Edit2 className="h-4 w-4" /></button>
            </div>
            <button onClick={() => handleToggle(item)} disabled={mutatingId !== null} className={`min-h-11 rounded-xl border-2 border-slate-800 text-xs font-black ${item.enabled ? 'bg-emerald-200' : 'bg-slate-200'}`}>
              {item.enabled ? '自動登録：有効' : '自動登録：停止中'}
            </button>
          </article>
        ))}
      </section>
      {editingItem && <div onClick={() => setEditingItem(null)} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div onClick={(event) => event.stopPropagation()} className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white sm:rounded-3xl">
          <div className="flex items-center justify-between border-b-2 border-slate-800 bg-indigo-100 p-4"><h2 className="font-black">定期取引を編集</h2><button onClick={() => setEditingItem(null)} className="flex min-h-11 min-w-11 items-center justify-center"><X className="h-5 w-5" /></button></div>
          <form onSubmit={handleUpdate} className="flex max-h-[calc(90dvh-76px)] flex-col gap-3 overflow-y-auto p-4">
            <select value={editingItem.category_id} onChange={(event) => setEditingItem({ ...editingItem, category_id: event.target.value })} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select>
            <input type="number" min="1" step="1" value={editingItem.amount} onChange={(event) => setEditingItem({ ...editingItem, amount: Number(event.target.value) })} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" />
            <input value={editingItem.description} onChange={(event) => setEditingItem({ ...editingItem, description: event.target.value })} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" />
            <input type="number" min="1" max="31" value={editingItem.day_of_month} onChange={(event) => setEditingItem({ ...editingItem, day_of_month: Number(event.target.value) })} className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" />
            <label className="text-xs font-black">開始月<input type="month" value={editingItem.start_month.slice(0, 7)} onChange={(event) => setEditingItem({ ...editingItem, start_month: `${event.target.value}-01` })} className="mobile-date-input mt-1 min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
            <label className="text-xs font-black">終了月（任意）<input type="month" value={editingItem.end_month?.slice(0, 7) || ''} onChange={(event) => setEditingItem({ ...editingItem, end_month: event.target.value ? `${event.target.value}-01` : null })} className="mobile-date-input mt-1 min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /></label>
            <p className="text-xs font-bold text-slate-500">変更内容は次回生成分から反映され、生成済みの記録は変更されません。</p>
            <button disabled={mutatingId !== null} className="min-h-12 rounded-xl border-2 border-slate-800 bg-slate-900 text-sm font-black text-white">変更を保存</button>
            <button type="button" onClick={() => handleDelete(editingItem)} disabled={mutatingId !== null} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 text-sm font-black text-rose-600"><Trash2 className="h-4 w-4" />この定期取引を削除</button>
          </form>
        </div>
      </div>}
    </div>
  );
}

export default function RecurringPage() {
  return <Suspense fallback={<div className="p-6 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><RecurringPageContent /></Suspense>;
}
