"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2, ChevronLeft, ChevronRight, AlertTriangle, ChevronDown, ChevronUp, X, CheckCircle2 } from 'lucide-react';
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
  categories: { name: string; type: 'expense' | 'income'; icon: string } | null;
}

export default function DashboardPage() {
  const router = useRouter();

  // 安全な日付・月の状態管理（JSTベース）
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const jstYear = currentDate.getFullYear();
  const jstMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${jstYear}-${jstMonth}`;

  // データ用状態管理
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  
  // フォーム用状態管理
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
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
    setCurrentDate(newDate);
  };

  // データのまるごと取得
  const fetchData = async () => {
    setLoading(true);

    const { data: catData } = await supabase.from('categories').select('*');
    if (catData) {
      setCategories(catData as Category[]);
      if (catData.length > 0 && !categoryId) setCategoryId(catData[0].id);
    }

    const { data: budgetData } = await supabase.from('budgets').select('category_id, amount');
    const budgetMap: { [key: string]: number } = {};
    if (budgetData) {
      budgetData.forEach((b) => { budgetMap[b.category_id] = b.amount; });
    }
    setBudgets(budgetMap);

    const startOfMonth = `${yearMonth}-01`;
    const lastDay = new Date(jstYear, currentDate.getMonth() + 1, 0).getDate();
    const safeEndOfMonth = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const { data: transData } = await supabase
      .from('transactions')
      .select('*, categories(name, type, icon)')
      .gte('date', startOfMonth)
      .lte('date', safeEndOfMonth)
      .order('date', { ascending: false });

    if (transData) setTransactions(transData as unknown as Transaction[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [yearMonth]);

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
        description
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

  // --- 💡 集計ロジック（収入と支出をそれぞれ集計） ---
  const summaryData = categories.map(cat => {
    const totalActual = transactions
      .filter(t => t.category_id === cat.id && t.type === cat.type)
      .reduce((sum, t) => sum + t.amount, 0);
    const budget = budgets[cat.id] || 0;
    return { ...cat, actual: totalActual, budget };
  });

  const incomeSummary = summaryData.filter(item => item.type === 'income');
  const expenseSummary = summaryData.filter(item => item.type === 'expense');

  // カレンダー作成用ロジック
  const getCalendarDays = () => {
    const start = new Date(jstYear, currentDate.getMonth(), 1);
    const end = new Date(jstYear, currentDate.getMonth() + 1, 0);
    const days = [];
    
    const startDayOfWeek = start.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= end.getDate(); i++) {
      days.push(i);
    }
    return days;
  };

  const calendarDays = getCalendarDays();

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/" className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
        </Link>
        <h1 className="text-2xl font-black tracking-tight">家計簿をつける</h1>
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

          {/* 💡 グラフ ＆ 予実差異セクション（収入・支出両対応版） */}
          <div className="flex flex-col gap-2">
            <button onClick={() => setIsSummaryOpen(!isSummaryOpen)} className="flex justify-between items-center w-full px-1 py-2 text-left">
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
                
                {/* 💡 1. 収入の達成進捗 */}
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

                {/* 💡 2. 支出の予算枠 */}
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
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-400 mb-2">
                <span className="text-rose-500">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span className="text-sky-500">土</span>
              </div>
              
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((day, index) => {
                  if (day === null) return <div key={`empty-${index}`} />;
                  
                  const formattedDay = String(day).padStart(2, '0');
                  const targetDateStr = `${yearMonth}-${formattedDay}`;
                  const dayTransactions = transactions.filter(t => t.date === targetDateStr);
                  
                  const dayExpense = dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                  const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

                  return (
                    <button
                      key={`day-${day}`}
                      onClick={() => {
                        setSelectedDate(targetDateStr);
                      }}
                      className="aspect-square border border-slate-200 rounded-xl flex flex-col justify-between p-1 hover:bg-slate-50 active:bg-amber-100 transition-colors relative"
                    >
                      <span className="text-xs font-black text-slate-700">{day}</span>
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

      {/* サブ画面ポップアップ（モーダル） */}
      {selectedDate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* ポップアップヘッダー */}
            <div className="bg-amber-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <span className="font-black text-base text-slate-800">
                {selectedDate.slice(5).replace('-', '月')}日 のきろく
              </span>
              <button onClick={() => { setSelectedDate(null); setEditingTransaction(null); }} className="w-8 h-8 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center">
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            {/* ポップアップメインコンテンツ */}
            <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {editingTransaction ? (
                /* 📝 修正モードの入力フォーム */
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
                /* 🔍 閲覧・削除選択モード */
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
                          <button onClick={() => setEditingTransaction(t)} className="text-xs bg-white border border-slate-400 font-bold px-2 py-1 rounded-md text-slate-600 active:bg-slate-100">
                            直す
                          </button>
                          <button onClick={() => handleDeleteTransaction(t.id)} className="text-slate-400 hover:text-rose-500 p-1">
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