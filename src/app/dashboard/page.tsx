"use client";

import { useState, useEffect, Suspense } from 'react'; // 💡 Suspense を追加
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2, ChevronLeft, ChevronRight, AlertTriangle, ChevronDown, ChevronUp, X, CheckCircle2, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
}

interface Transaction {
  id: string;
  category_id: string;
  type: 'expense' | 'income';
  amount: number;
  date: string;
  description: string;
  user_id: string;
  categories: { name: string; type: 'expense' | 'income'; icon: string } | null;
}

// 💡 メインのダッシュボード処理を行うコンポーネントに分離
function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = searchParams.get('user') || 'user_a';

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  
  // フォーム用状態管理
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => todayStr);
  const [description, setDescription] = useState("");

  // 予実あんないの開閉状態
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // サブ画面（モーダル）用の状態管理
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // 月の切り替え
  const changeMonth = (increment: number) => {
    const newDate = new Date(currentDate.getTime());
    newDate.setMonth(newDate.getMonth() + increment);
    setLoading(true);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      const startOfMonth = `${yearMonth}-01`;
      const lastDay = new Date(jstYear, currentDate.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const [{ data: catData }, { data: budgetData }, { data: transData }] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase
          .from('budgets')
          .select('category_id, amount')
          .eq('user_id', currentUser),
        supabase
          .from('transactions')
          .select('*, categories(name, type, icon)')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth)
          .order('date', { ascending: false }),
      ]);

      if (ignore) return;

      if (catData) {
        setCategories(catData as Category[]);
        setCategoryId((current) => current || catData[0]?.id || "");
      }

      const budgetMap: { [key: string]: number } = {};
      budgetData?.forEach((budget) => {
        budgetMap[budget.category_id] = budget.amount;
      });
      setBudgets(budgetMap);
      setTransactions((transData || []) as unknown as Transaction[]);
      setLoading(false);
    };

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [currentDate, currentUser, jstYear, yearMonth]);

  // 実績の追加
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) return;

    const selectedCategory = categories.find(c => c.id === categoryId);
    if (!selectedCategory) return;

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        category_id: categoryId,
        type: selectedCategory.type,
        amount: parseInt(amount, 10),
        date,
        description,
        user_id: currentUser
      }])
      .select('*, categories(name, type, icon)');

    if (error) {
      alert('登録に失敗しました：' + error.message);
    } else if (data) {
      setTransactions([data[0] as unknown as Transaction, ...transactions]);
      setAmount("");
      setDescription("");
      router.refresh();
    }
  };

  // 実績の修正
  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !editingTransaction.amount) return;

    const { error } = await supabase
      .from('transactions')
      .update({
        amount: Number(editingTransaction.amount),
        description: editingTransaction.description,
        category_id: editingTransaction.category_id
      })
      .eq('id', editingTransaction.id);

    if (error) {
      alert('修正に失敗しました：' + error.message);
    } else {
      const targetCategory = categories.find(c => c.id === editingTransaction.category_id);
      setTransactions(transactions.map(t => t.id === editingTransaction.id ? {
        ...editingTransaction,
        categories: targetCategory ? { name: targetCategory.name, type: targetCategory.type, icon: targetCategory.icon } : null
      } : t));
      setEditingTransaction(null);
      router.refresh();
    }
  };

  // 実績の削除
  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('この記録をけしちゃうよ？')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) alert('削除に失敗しました：' + error.message);
    else {
      setTransactions(transactions.filter(t => t.id !== id));
      setEditingTransaction(null);
      router.refresh();
    }
  };

  // 集計ロジック
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;

  const summaryData = categories.map(cat => {
    const totalActual = transactions
      .filter(t => t.category_id === cat.id && t.type === cat.type)
      .reduce((sum, t) => sum + t.amount, 0);
    const budget = budgets[cat.id] || 0;
    return { ...cat, actual: totalActual, budget };
  });

  const incomeSummary = summaryData.filter(item => item.type === 'income');
  const expenseSummary = summaryData.filter(item => item.type === 'expense');

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
          <Link href="/" className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
          </Link>
          <h1 className="text-2xl font-black tracking-tight">家計簿をつける</h1>
        </div>
        
        <span className={`text-[10px] font-black border-2 border-slate-800 px-2.5 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]
          ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}>
          {currentUser === 'user_a' ? '👩‍🦰 ママ' : '👨 パパ'}
        </span>
      </div>

      {/* 月切り替えコントローラー */}
      <div className="flex items-center justify-between bg-emerald-100 border-2 border-slate-800 rounded-3xl p-3 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* 今月の全体集計カード */}
          <div className="bg-amber-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
              <span className="font-black text-sm text-slate-700 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> 今月ののこり残高
              </span>
              <span className={`text-xl font-black ${totalBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                ¥{totalBalance.toLocaleString()}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-white border-2 border-slate-800 rounded-2xl p-2.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col items-center justify-center">
                <span className="text-[10px] font-black text-slate-400 flex items-center gap-0.5 uppercase tracking-wider">
                  <ArrowUpRight className="w-3 h-3 text-emerald-500" strokeWidth={3} /> 総しゅうにゅう
                </span>
                <span className="text-sm font-black text-slate-800 mt-1">
                  ¥{totalIncome.toLocaleString()}
                </span>
              </div>
              <div className="bg-white border-2 border-slate-800 rounded-2xl p-2.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col items-center justify-center">
                <span className="text-[10px] font-black text-slate-400 flex items-center gap-0.5 uppercase tracking-wider">
                  <ArrowDownRight className="w-3 h-3 text-rose-400" strokeWidth={3} /> 総しゅっぴつ
                </span>
                <span className="text-sm font-black text-slate-800 mt-1">
                  ¥{totalExpense.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 実績入力フォーム */}
          <form onSubmit={handleAddTransaction} className="bg-emerald-50 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
            <h2 className="font-black text-base text-emerald-950 flex items-center gap-1.5">
              <Plus className="w-5 h-5" strokeWidth={3} /> 今日のしゅっぴつ・しゅうにゅう
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
              <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額を入力" className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-black text-sm" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">メモ（なにつかった？）</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="カフェ、お買い物など（任意）" className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-bold text-sm" />
            </div>

            <button type="submit" className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 text-sm mt-1">
              きろくする！ ✨
            </button>
          </form>

          {/* 予実差異セクション */}
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setIsSummaryOpen(!isSummaryOpen)} className="flex justify-between items-center w-full px-1 py-2 text-left">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">今月の予実あんない 📊</p>
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                {isSummaryOpen ? (
                  <>折りたたむ <ChevronUp className="w-3.5 h-3.5" /></>
                ) : (
                  <>ひらく・予算をみる <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </div>
            </button>

            {isSummaryOpen && (
              <div className="flex flex-col gap-5 transition-all duration-300">
                {incomeSummary.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">💰 収入の達成スピード</p>
                    {incomeSummary.map(item => {
                      const percent = item.budget > 0 ? Math.min((item.actual / item.budget) * 100, 100) : 0;
                      const isAchieved = item.actual >= item.budget && item.budget > 0;

                      return (
                        <div key={item.id} className={`p-4 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 ${isAchieved ? 'bg-emerald-50/40' : ''}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                              <span className="text-base">{item.icon || "💰"}</span> {item.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-500">¥{item.actual.toLocaleString()} / ¥{item.budget.toLocaleString()}</span>
                              {isAchieved && (
                                <span className="text-[10px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> 達成！
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full h-4 bg-slate-100 border-2 border-slate-800 rounded-full overflow-hidden p-[1px]">
                            <div className={`h-full rounded-full border-r border-slate-800 transition-all duration-500 ${isAchieved ? 'bg-emerald-400' : 'bg-teal-300'}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {expenseSummary.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">💸 支出の残り枠</p>
                    {expenseSummary.map(item => {
                      const percent = item.budget > 0 ? Math.min((item.actual / item.budget) * 100, 100) : 0;
                      const isOver = item.actual > item.budget && item.budget > 0;

                      return (
                        <div key={item.id} className={`p-4 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 ${isOver ? 'bg-rose-50/50' : ''}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                              <span className="text-base">{item.icon || "💸"}</span> {item.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-500">¥{item.actual.toLocaleString()} / ¥{item.budget.toLocaleString()}</span>
                              {isOver && (
                                <span className="text-[10px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> オーバー！
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full h-4 bg-slate-100 border-2 border-slate-800 rounded-full overflow-hidden p-[1px]">
                            <div className={`h-full rounded-full border-r border-slate-800 transition-all duration-500 ${isOver ? 'bg-rose-400' : percent > 80 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* カレンダー履歴セクション */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月のきろくカレンダー 📅</p>
            
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
                {selectedDate.slice(5).replace('-', '月')}日 のきろく
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
                      value={editingTransaction.amount} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, amount: parseInt(e.target.value, 10) || 0})} 
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
                      もどる
                    </button>
                    <button type="submit" className="flex-1 bg-slate-900 text-white border-2 border-slate-800 font-black py-2.5 rounded-xl text-xs">
                      へんこうを保存する！
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  {transactions.filter(t => t.date === selectedDate).length === 0 ? (
                    <p className="text-center text-sm font-bold text-slate-400 py-6">この日のきろくはありません 🍃</p>
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
                            直す
                          </button>
                          <button type="button" onClick={() => handleDeleteTransaction(t.id)} className="text-slate-400 hover:text-rose-500 p-1">
                            <Trash2 className="w-4 h-4" />
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
