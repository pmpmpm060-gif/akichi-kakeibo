"use client";

import { useState, useEffect, Suspense } from 'react'; // 💡 Suspense をインポート
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import type { Budget, Category } from '../../lib/database-helpers';

// 💡 メインの処理を行うコンポーネント
function BudgetsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      const [categoryResult, budgetResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser),
        supabase
          .from('budgets')
          .select('category_id, amount')
          .eq('user_id', currentUser),
      ]);

      if (ignore) return;

      const error = categoryResult.error || budgetResult.error;
      if (error) {
        setDataError(error.message);
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const budgetData = budgetResult.data;

      if (catData) setCategories(catData);

      const budgetMap: { [key: string]: number } = {};
      budgetData?.forEach((budget: Pick<Budget, 'category_id' | 'amount'>) => {
        budgetMap[budget.category_id] = budget.amount;
      });
      setBudgets(budgetMap);
      setLoading(false);
    };

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [currentUser, retryKey]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const handleAmountChange = (categoryId: string, value: string) => {
    const amount = value === "" ? 0 : parseInt(value, 10);
    setBudgets({
      ...budgets,
      [categoryId]: isNaN(amount) ? 0 : amount,
    });
  };

  const handleSaveBudgets = async () => {
    setIsSaving(true);
    const upsertData = categories.map((cat) => ({
      user_id: currentUser,
      category_id: cat.id,
      amount: budgets[cat.id] || 0,
    }));

    const { error } = await supabase
      .from('budgets')
      .upsert(upsertData, { onConflict: 'household_id,user_id,category_id' });

    if (error) {
      alert('予算の保存に失敗しました：' + error.message);
    } else {
      alert('基本予算をほぞんしたよ！ 🐷✨');
    }
    setIsSaving(false);
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const renderCategoryRows = (targetCategories: Category[]) => {
    return targetCategories.map((cat) => (
      <div 
        key={cat.id}
        className="flex items-center justify-between p-4 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
      >
        <span className="font-black text-sm text-slate-800 flex items-center gap-2">
          <span className="text-xl">{cat.icon || (cat.type === 'income' ? "💰" : "💸")}</span> {cat.name}
        </span>
        <div className="flex items-center gap-1.5 max-w-[140px]">
          <input
            type="number"
            inputMode="numeric"
            value={budgets[cat.id] === undefined ? "" : budgets[cat.id]}
            onChange={(e) => handleAmountChange(cat.id, e.target.value)}
            placeholder="0"
            className={`w-full px-3 py-2 rounded-xl border-2 border-slate-800 text-right font-black text-sm focus:outline-none ${cat.type === 'income' ? 'focus:bg-emerald-50' : 'focus:bg-sky-50'}`}
          />
          <span className="font-black text-xs text-slate-500 shrink-0">円</span>
        </div>
      </div>
    ));
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link 
            href={`/?user=${currentUser}`}
            className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
          </Link>
          <h1 className="text-2xl font-black tracking-tight">予算をきめる</h1>
        </div>
        <span className={`text-[10px] font-black border-2 border-slate-800 px-2.5 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]
          ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}>
          {currentUser === 'user_a' ? '👩‍🦰 ママ' : '👨 パパ'}
        </span>
      </div>

      <div className="bg-sky-100 border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center gap-3">
        <div className="text-2xl">💡</div>
        <p className="text-xs font-bold text-sky-950 leading-relaxed">
          ここで設定した予算は、**毎月共通のベース予算**として自動で使い回されます！毎月入力し直す必要はありません。
        </p>
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : dataError ? (
          <DataErrorCard message={dataError} onRetry={retryFetch} />
        ) : categories.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <p className="text-sm font-bold text-slate-400 mb-3">まずはカテゴリを追加してね！</p>
            <Link href={`/categories?user=${currentUser}`} className="text-xs font-black bg-pink-300 text-slate-900 px-4 py-2 rounded-xl border-2 border-slate-800 inline-block">
              カテゴリ設定へ 🏃‍♂️
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {incomeCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💰 収入（目標金額）</p>
                <div className="flex flex-col gap-3">{renderCategoryRows(incomeCategories)}</div>
              </div>
            )}

            {expenseCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💸 支出（予算上限）</p>
                <div className="flex flex-col gap-3">{renderCategoryRows(expenseCategories)}</div>
              </div>
            )}

            <button
              onClick={handleSaveBudgets}
              disabled={isSaving}
              className="w-full bg-sky-300 text-slate-900 font-black py-4 rounded-2xl border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] text-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" strokeWidth={2.5} />基本予算をほぞんする！ ✨</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 💡 Next.jsがルーティングとして読み込む最外枠。ここで確実にSuspenseで包み込む
export default function BudgetsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <BudgetsPageContent />
    </Suspense>
  );
}
