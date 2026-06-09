"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
}

interface Transaction {
  id: string;
  category_id: string;
  type: 'expense' | 'income';
  amount: number;
  date: string;
  description: string;
  categories: { name: string } | null;
}

export default function DashboardPage() {
  // 日付・月の状態管理 (2026年想定)
  const [currentDate, setCurrentDate] = useState(new Date());
  const yearMonth = currentDate.toISOString().slice(0, 7); // "2026-06" 形式

  // データ用状態管理
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  
  // フォーム用状態管理
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); // 今日
  const [description, setDescription] = useState("");

  // 月の切り替え
  const changeMonth = (increment: number) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + increment));
    setCurrentDate(new Date(newDate));
  };

  // データのまるごと取得
  const fetchData = async () => {
    setLoading(true);

    // 1. カテゴリ一覧
    const { data: catData } = await supabase.from('categories').select('*');
    if (catData) {
      setCategories(catData);
      if (catData.length > 0 && !categoryId) setCategoryId(catData[0].id);
    }

    // 2. 共通予算
    const { data: budgetData } = await supabase.from('budgets').select('category_id, amount');
    const budgetMap: { [key: string]: number } = {};
    if (budgetData) {
      budgetData.forEach((b) => { budgetMap[b.category_id] = b.amount; });
    }
    setBudgets(budgetMap);

    // 3. 選択された月の家計簿実績（リレーションでカテゴリ名も一緒に取得）
    const startOfMonth = `${yearMonth}-01`;
    const endOfMonth = `${yearMonth}-31`; // 簡易的な末日指定（PostgreSQL側で丸めてくれます）

    const { data: transData } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
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
      .select('*, categories(name)');

    if (error) {
      alert('登録に失敗しました：' + error.message);
    } else if (data) {
      setTransactions([data[0] as unknown as Transaction, ...transactions]);
      setAmount("");
      setDescription("");
    }
  };

  // 実績の削除
  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('この記録をけしちゃうよ？')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) alert('削除に失敗しました：' + error.message);
    else setTransactions(transactions.filter(t => t.id !== id));
  };

  // --- 集計ロジック ---
  // カテゴリごとの今月の支出合計を計算
  const expenseSummary = categories
    .filter(c => c.type === 'expense')
    .map(cat => {
      const totalActual = transactions
        .filter(t => t.category_id === cat.id && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const budget = budgets[cat.id] || 0;
      return { ...cat, actual: totalActual, budget };
    });

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
          {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
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
          {/* グラフ ＆ 予実差異セクション */}
          <div className="flex flex-col gap-3.5">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月の予実あんない 📊</p>
            <div className="flex flex-col gap-3">
              {expenseSummary.map(item => {
                const percent = item.budget > 0 ? Math.min((item.actual / item.budget) * 100, 100) : 0;
                const isOver = item.actual > item.budget && item.budget > 0;

                return (
                  <div key={item.id} className={`p-4 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 ${isOver ? 'bg-rose-50/50' : ''}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-black text-sm text-slate-800">{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-500">¥{item.actual.toLocaleString()} / ¥{item.budget.toLocaleString()}</span>
                        {isOver && (
                          <span className="text-[10px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-0.5 animate-bounce">
                            <AlertTriangle className="w-3 h-3" /> オーバー！
                          </span>
                        )}
                      </div>
                    </div>
                    {/* ポップな進捗バーグラフ */}
                    <div className="w-full h-4 bg-slate-100 border-2 border-slate-800 rounded-full overflow-hidden p-[1px]">
                      <div 
                        className={`h-full rounded-full border-r border-slate-800 transition-all duration-500 ${isOver ? 'bg-rose-400' : percent > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
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
                    <option key={c.id} value={c.id}>{c.type === 'expense' ? '💸' : '💰'} {c.name}</option>
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

          {/* 入力履歴一覧 */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月のきろく履歴 📝</p>
            <div className="flex flex-col gap-2">
              {transactions.length === 0 ? (
                <p className="text-center text-xs font-bold text-slate-400 py-6">今月はまだ記録がありません 🍃</p>
              ) : (
                transactions.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3.5 bg-white border-2 border-slate-800 rounded-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                    <div className="flex flex-col">
                      <span className="font-black text-xs text-slate-400">{t.date.slice(5)} │ {t.categories?.name || '未分類'}</span>
                      <span className="font-bold text-sm text-slate-700 mt-0.5">{t.description || 'メモなし'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-black text-sm ${t.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {t.type === 'expense' ? '-' : '+'}¥{t.amount.toLocaleString()}
                      </span>
                      <button onClick={() => handleDeleteTransaction(t.id)} className="text-slate-400 hover:text-rose-500 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}