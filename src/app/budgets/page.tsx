"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation'; // 💡 useSearchParams を追加
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
}

interface Budget {
  category_id: string;
  amount: number;
  user_id: string; // 💡 型定義に user_id を追加
}

export default function BudgetsPage() {
  // 💡 URLのパラメータからユーザー（?user=user_a など）を取得
  const searchParams = useSearchParams();
  const currentUser = searchParams.get('user') || 'user_a'; // 指定がなければ user_a にする

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // データ取得 (カテゴリと基本予算)
  const fetchData = async () => {
    setLoading(true);
    
    // 1. カテゴリは共通で取得
    const { data: catData } = await supabase
      .from('categories')
      .select('*');

    // 2. 全月共通の基本予算を選択中ユーザーのものだけに絞り込む 💡
    const { data: budgetData } = await supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('user_id', currentUser); // 💡 ユーザー絞り込み

    if (catData) setCategories(catData as Category[]);
    
    const budgetMap: { [key: string]: number } = {};
    if (budgetData) {
      budgetData.forEach((b: Omit<Budget, 'user_id'>) => {
        budgetMap[b.category_id] = b.amount;
      });
    }
    setBudgets(budgetMap);
    loading ? setLoading(false) : null; // 一括処理のため最後に一回だけ更新
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]); // 💡 ユーザーが切り替わったときも再取得する

  const handleAmountChange = (categoryId: string, value: string) => {
    const amount = value === "" ? 0 : parseInt(value, 10);
    setBudgets({
      ...budgets,
      [categoryId]: isNaN(amount) ? 0 : amount,
    });
  };

  // 予算の保存処理
  const handleSaveBudgets = async () => {
    setIsSaving(true);

    // 💡 保存するデータすべてに、現在の user_id を紐付ける
    const upsertData = categories.map((cat) => ({
      user_id: currentUser,   // 💡 誰の予算枠かを明確にする
      category_id: cat.id,
      amount: budgets[cat.id] || 0,
    }));

    // 💡 ユーザーごとに一意にするため、競合検知（onConflict）をユーザーID＋カテゴリIDの複合にする
    const { error } = await supabase
      .from('budgets')
      .upsert(upsertData, { onConflict: 'user_id,category_id' }); 

    if (error) {
      alert('予算の保存に失敗しました：' + error.message);
    } else {
      alert('基本予算をほぞんしたよ！ 🐷✨');
    }
    setIsSaving(false);
  };

  // 画面表示用に「収入」と「支出」にフィルタリング
  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  // 各カテゴリカードをレンダリングする共通コンポーネント
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
      {/* ヘッダー */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link 
            href={`/?user=${currentUser}`} // 💡 戻るリンクにもユーザー状態を引き継がせる
            className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
          </Link>
          <h1 className="text-2xl font-black tracking-tight">予算をきめる</h1>
        </div>

        {/* 💡 現在どちらのモードで開いているか右上に表示 */}
        <span className={`text-[10px] font-black border-2 border-slate-800 px-2.5 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]
          ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}>
          {currentUser === 'user_a' ? '👨‍💻 本番（私）' : '🧪 テスト用'}
        </span>
      </div>

      <div className="bg-sky-100 border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center gap-3">
        <div className="text-2xl">💡</div>
        <p className="text-xs font-bold text-sky-950 leading-relaxed">
          ここで設定した予算は、**毎月共通のベース予算**として自動で使い回されます！毎月入力し直す必要はありません。
        </p>
      </div>

      {/* 予算入力リスト */}
      <div className="flex flex-col gap-5 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <p className="text-sm font-bold text-slate-400 mb-3">まずはカテゴリを追加してね！</p>
            <Link href="/categories" className="text-xs font-black bg-pink-300 text-slate-900 px-4 py-2 rounded-xl border-2 border-slate-800 inline-block">
              カテゴリ設定へ 🏃‍♂️
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* 収入の予算設定セクション */}
            {incomeCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💰 収入（目標金額）</p>
                <div className="flex flex-col gap-3">
                  {renderCategoryRows(incomeCategories)}
                </div>
              </div>
            )}

            {/* 支出の予算設定セクション */}
            {expenseCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💸 支出（予算上限）</p>
                <div className="flex flex-col gap-3">
                  {renderCategoryRows(expenseCategories)}
                </div>
              </div>
            )}

            <button
              onClick={handleSaveBudgets}
              disabled={isSaving}
              className="w-full bg-sky-300 text-slate-900 font-black py-4 rounded-2xl border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] text-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" strokeWidth={2.5} />
                  基本予算をほぞんする！ ✨
                </                >
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}