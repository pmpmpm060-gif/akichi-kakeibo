"use client";

import { useState, useEffect, Suspense } from 'react'; // 💡 Suspense を追加
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2, ChevronLeft, ChevronRight, X, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import {
  type Category,
  type TransactionWithCategory,
} from '../../lib/database-helpers';

// 💡 メインのダッシュボード処理を行うコンポーネントに分離
function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));

  // 安全な日付・月の状態管理（JSTベース）
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const jstYear = currentDate.getFullYear();
  const jstMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${jstYear}-${jstMonth}`;

  // 本日の日付（yyyy-mm-dd形式）
  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  // データ用状態管理
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  
  // フォーム用状態管理
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => todayStr);
  const [description, setDescription] = useState("");
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isUpdatingTransaction, setIsUpdatingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  // サブ画面（モーダル）用の状態管理
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);

  // 月の切り替え
  const changeMonth = (increment: number) => {
    const newDate = new Date(currentDate.getTime());
    newDate.setMonth(newDate.getMonth() + increment);
    setLoading(true);
    setDataError(null);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      const startOfMonth = `${yearMonth}-01`;
      const lastDay = new Date(jstYear, currentDate.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const [categoryResult, transactionResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser),
        supabase
          .from('transactions')
          .select('*, categories(name, type, icon)')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth)
          .order('date', { ascending: false }),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error;
      if (error) {
        setDataError(error.message);
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const transData = transactionResult.data;

      if (catData) {
        setCategories(catData);
        setCategoryId((current) =>
          catData.some((category) => category.id === current)
            ? current
            : catData[0]?.id || ""
        );
      }

      setTransactions(transData || []);
      setLoading(false);
    };

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [currentDate, currentUser, jstYear, retryKey, yearMonth]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  // 実績の追加
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingTransaction || !amount || !categoryId) return;

    const selectedCategory = categories.find(c => c.id === categoryId);
    if (!selectedCategory) return;

    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }

    setIsAddingTransaction(true);
    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        category_id: categoryId,
        type: selectedCategory.type,
        amount: parsedAmount,
        date,
        description,
        user_id: currentUser
      }])
      .select('*, categories(name, type, icon)');

    if (error) {
      alert('登録に失敗しました：' + error.message);
    } else if (data) {
      setTransactions((current) => [data[0], ...current]);
      setAmount("");
      setDescription("");
      router.refresh();
    }
    setIsAddingTransaction(false);
  };

  // 実績の修正
  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpdatingTransaction || !editingTransaction) return;

    const targetCategory = categories.find(c => c.id === editingTransaction.category_id);
    if (!targetCategory) return;

    const parsedAmount = Number(editingTransaction.amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }

    setIsUpdatingTransaction(true);
    const { error } = await supabase
      .from('transactions')
      .update({
        amount: parsedAmount,
        description: editingTransaction.description,
        category_id: editingTransaction.category_id,
        type: targetCategory.type,
      })
      .eq('id', editingTransaction.id);

    if (error) {
      alert('修正に失敗しました：' + error.message);
    } else {
      setTransactions((current) => current.map(t => t.id === editingTransaction.id ? {
        ...editingTransaction,
        type: targetCategory.type,
        categories: { name: targetCategory.name, type: targetCategory.type, icon: targetCategory.icon }
      } : t));
      setEditingTransaction(null);
      router.refresh();
    }
    setIsUpdatingTransaction(false);
  };

  // 実績の削除
  const handleDeleteTransaction = async (id: string) => {
    if (deletingTransactionId) return;
    if (!confirm('この記録を削除しますか？')) return;

    setDeletingTransactionId(id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) alert('削除に失敗しました：' + error.message);
    else {
      setTransactions((current) => current.filter(t => t.id !== id));
      setEditingTransaction(null);
      router.refresh();
    }
    setDeletingTransactionId(null);
  };

  // 集計ロジック
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;

  const getCalendarDays = () => {
    const start = new Date(jstYear, currentDate.getMonth(), 1);
    const end = new Date(jstYear, currentDate.getMonth() + 1, 0);
    const days = [];
    
    const startDayOfWeek = start.getDay();
    for (let i = 0; i < startDayOfWeek; i++) { days.push(null); }
    for (let i = 1; i <= end.getDate(); i++) { days.push(i); }
    return days;
  };

  const calendarDays = getCalendarDays();

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link href={`/?user=${currentUser}`} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
          </Link>
          <h1 className="text-2xl font-black tracking-tight">家計簿を付ける</h1>
        </div>
        
        <span className={`text-[10px] font-black border-2 border-slate-800 px-2.5 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]
          ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}>
          {currentUser === 'user_a' ? '👩‍🦰 ママ' : '👨 パパ'}
        </span>
      </div>

      {/* 月切り替えコントローラー */}
      <div className="bg-emerald-100 border-2 border-slate-800 rounded-3xl p-3 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center active:bg-slate-100">
            <ChevronLeft className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
          </button>
          <span className="font-black text-lg text-emerald-950">
            {jstYear}年{Number(jstMonth)}月
          </span>
          <button onClick={() => changeMonth(1)} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center active:bg-slate-100">
            <ChevronRight className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex items-center justify-between border-t-2 border-slate-800 pt-3 px-1">
          <span className="font-black text-sm text-slate-700 flex items-center gap-1.5">
            <Wallet className="w-4 h-4" /> 収支残高
          </span>
          {loading ? (
            <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
          ) : (
            <span className={`text-xl font-black ${totalBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              ¥{totalBalance.toLocaleString()}
            </span>
          )}
        </div>
        {!loading && (
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-white border-2 border-slate-800 rounded-xl p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-0.5 uppercase tracking-wider">
                <ArrowUpRight className="w-3 h-3 text-emerald-500" strokeWidth={3} /> 総収入
              </span>
              <span className="text-sm font-black text-emerald-700 mt-1 block">
                ¥{totalIncome.toLocaleString()}
              </span>
            </div>
            <div className="bg-white border-2 border-slate-800 rounded-xl p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-0.5 uppercase tracking-wider">
                <ArrowDownRight className="w-3 h-3 text-rose-400" strokeWidth={3} /> 総支出
              </span>
              <span className="text-sm font-black text-rose-600 mt-1 block">
                ¥{totalExpense.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : dataError ? (
        <DataErrorCard message={dataError} onRetry={retryFetch} />
      ) : (
        <>
          {/* 実績入力フォーム */}
          <form onSubmit={handleAddTransaction} className="bg-emerald-50 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
            <h2 className="font-black text-base text-emerald-950 flex items-center gap-1.5">
              <Plus className="w-5 h-5" strokeWidth={3} /> 今日の支出・収入
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-emerald-900 pl-1">いつ？</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-800 font-bold text-sm text-center" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-emerald-900 pl-1">分類</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-800 font-bold text-sm bg-white">
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon || (c.type === 'expense' ? '💸' : '💰')} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">いくら？</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額を入力" className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-black text-sm" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">メモ（何に使った？）</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="カフェ、お買い物など（任意）" className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-bold text-sm" />
            </div>

            <button type="submit" disabled={isAddingTransaction} className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 text-sm mt-1 disabled:opacity-60 flex items-center justify-center gap-2">
              {isAddingTransaction
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 記録中...</>
                : '記録する！ ✨'}
            </button>
          </form>

          {/* カレンダー履歴セクション */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月の記録カレンダー 📅</p>
            
            <div className="bg-white border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-black mb-2">
                <span className="text-rose-500 bg-rose-50 py-0.5 rounded-md">日</span>
                <span className="text-slate-500">月</span>
                <span className="text-slate-500">火</span>
                <span className="text-slate-500">水</span>
                <span className="text-slate-500">木</span>
                <span className="text-slate-500">金</span>
                <span className="text-sky-500 bg-sky-50 py-0.5 rounded-md">土</span>
              </div>
              
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((day, index) => {
                  if (day === null) return <div key={`empty-${index}`} />;
                  
                  const formattedDay = String(day).padStart(2, '0');
                  const targetDateStr = `${yearMonth}-${formattedDay}`;
                  
                  const isToday = targetDateStr === todayStr;
                  const dayOfWeek = new Date(jstYear, currentDate.getMonth(), day).getDay();

                  const dayTransactions = transactions.filter(t => t.date === targetDateStr);
                  const dayExpense = dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                  const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

                  return (
                    <button
                      type="button"
                      key={`day-${day}`}
                      onClick={() => { setSelectedDate(targetDateStr); }}
                      className={`aspect-square border-2 rounded-xl flex flex-col justify-between p-1 hover:bg-amber-50 active:bg-amber-100 transition-all relative
                        ${isToday ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-300 ring-offset-1' : 'border-slate-200'}
                        ${!isToday && dayOfWeek === 0 ? 'bg-rose-50/30' : ''}
                        ${!isToday && dayOfWeek === 6 ? 'bg-sky-50/30' : ''}
                      `}
                    >
                      <span className={`text-xs font-black 
                        ${dayOfWeek === 0 ? 'text-rose-600' : dayOfWeek === 6 ? 'text-sky-600' : 'text-slate-700'}
                        ${isToday ? 'bg-amber-400 text-slate-900 px-1 rounded-md text-[10px]' : ''}
                      `}>
                        {day}
                      </span>
                      
                      <div className="flex flex-col text-[8px] leading-tight w-full text-right font-bold overflow-hidden">
                        {dayExpense > 0 && <span className="text-rose-500 text-right">-{dayExpense}</span>}
                        {dayIncome > 0 && <span className="text-emerald-500 text-right">+{dayIncome}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* モーダルポップアップ */}
      {selectedDate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="bg-amber-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <span className="font-black text-base text-slate-800">
                {selectedDate.slice(5).replace('-', '月')}日 の記録
              </span>
              <button type="button" onClick={() => { setSelectedDate(null); setEditingTransaction(null); }} className="w-8 h-8 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center">
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {editingTransaction ? (
                <form onSubmit={handleUpdateTransaction} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">分類</label>
                    <select 
                      value={editingTransaction.category_id} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, category_id: e.target.value})} 
                      className="w-full px-3 py-2 rounded-xl border-2 border-slate-800 font-bold text-sm bg-white"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon || (c.type === 'expense' ? '💸' : '💰')} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">いくら？</label>
                    <input 
                      type="number" 
                      min="1"
                      step="1"
                      value={editingTransaction.amount} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, amount: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border-2 border-slate-800 font-black text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">メモ</label>
                    <input 
                      type="text" 
                      value={editingTransaction.description} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, description: e.target.value})} 
                      className="w-full px-4 py-2 rounded-xl border-2 border-slate-800 font-bold text-sm"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setEditingTransaction(null)} className="flex-1 bg-slate-100 border-2 border-slate-800 font-black py-2.5 rounded-xl text-xs">
                      戻る
                    </button>
                    <button type="submit" disabled={isUpdatingTransaction} className="flex-1 bg-slate-900 text-white border-2 border-slate-800 font-black py-2.5 rounded-xl text-xs disabled:opacity-60 flex items-center justify-center gap-1.5">
                      {isUpdatingTransaction
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                        : '変更を保存する！'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  {transactions.filter(t => t.date === selectedDate).length === 0 ? (
                    <p className="text-center text-sm font-bold text-slate-400 py-6">この日の記録はありません 🍃</p>
                  ) : (
                    transactions.filter(t => t.date === selectedDate).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3.5 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-lg shrink-0">
                            {t.categories?.icon || (t.type === 'expense' ? '💸' : '💰')}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-xs text-slate-400">{t.categories?.name || '未分類'}</span>
                            <span className="font-bold text-sm text-slate-700 mt-0.5">{t.description || 'メモなし'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-sm mr-1 ${t.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {t.type === 'expense' ? '-' : '+'}¥{t.amount.toLocaleString()}
                          </span>
                          <button type="button" onClick={() => setEditingTransaction(t)} className="text-xs bg-white border border-slate-400 font-bold px-2 py-1 rounded-md text-slate-600 active:bg-slate-100">
                            編集
                          </button>
                          <button type="button" onClick={() => handleDeleteTransaction(t.id)} disabled={deletingTransactionId !== null} className="text-slate-400 hover:text-rose-500 p-1 disabled:opacity-50">
                            {deletingTransactionId === t.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 💡 Next.jsがルーティングとして読み込む最外枠。ここで確実にDashboardPageContentをSuspenseで包む
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  );
}
