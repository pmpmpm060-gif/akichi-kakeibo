"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PiggyBank, AlertTriangle, CheckCircle2, Loader2, LogOut } from 'lucide-react';

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  created_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabaseクライアントの初期化
  const SUPABASE_URL = 'https://xxxx.supabase.co'; // 👈 ご自身のURL
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1Ni...'; // 👈 ご自身のAnon Key
  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    const fetchData = async () => {
      // 💡 現在の「年」と「月」を取得（例: 2026年6月なら、currentYear=2026, currentMonth=6）
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // 今月1日のISOスタンプ（支出データ抽出用）
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // 1. 今月の支出データを取得
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .select('*')
        .gte('created_at', firstDay)
        .order('created_at', { ascending: false });

      if (!expenseError && expenseData) {
        setExpenses(expenseData);
        const total = expenseData.reduce((sum, item) => sum + item.amount, 0);
        setTotalAmount(total);
      }

      // 2. 💡 ご提案していた予算構造（年・月で絞り込み）でデータを取得
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('amount')
        .eq('year', currentYear)   // 👈 今年のデータ
        .eq('month', currentMonth) // 👈 今月のデータ
        .maybeSingle();            // データが無くてもエラーにせずnullを返す安全な取得方法

      if (!budgetError && budgetData) {
        setMonthlyBudget(budgetData.amount);
      } else {
        // もし今月の予算がまだ未登録なら、暫定で0円（または一律のベース予算）にしておきます
        setMonthlyBudget(0); 
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  // ログアウト処理
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50/50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  // 予算データの確定
  const budget = monthlyBudget ?? 0;
  const remainingBudget = budget - totalAmount; // 残り予算
  const isOverBudget = remainingBudget < 0; // 予算オーバーしているか

  return (
    <div className="p-4 min-h-screen bg-amber-50/50 flex flex-col gap-6 max-w-md mx-auto">
      
      {/* ヘッダー部分 */}
      <div className="flex justify-between items-center mt-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800">ぽっぷ<span className="text-emerald-500">家計簿</span></h1>
          <p className="text-xs font-bold text-slate-400">今月も楽しくやりくり 🐷</p>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2.5 bg-white border-2 border-slate-800 rounded-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
          title="ログアウト"
        >
          <LogOut className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* 💰 メイン：今月の使ったお金カード */}
      <div className="bg-white border-4 border-slate-800 rounded-3xl p-5 shadow-[5px_5px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">今月の支出合計</span>
        <div className="text-4xl font-black text-slate-800 tracking-tight">
          ¥{totalAmount.toLocaleString()}
        </div>
      </div>

      {/* 📊 予算・過不足メーターカード（年・月連動版） */}
      <div className={`border-4 border-slate-800 rounded-3xl p-5 shadow-[5px_5px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3 transition-all ${
        budget === 0 ? 'bg-slate-50' : isOverBudget ? 'bg-rose-50' : 'bg-emerald-50/50'
      }`}>
        <div className="flex justify-between items-center">
          <span className="text-xs font-black text-slate-500">
            {budget === 0 ? '今月の予算は未設定です' : `今月の予算: ¥${budget.toLocaleString()}`}
          </span>
          {budget === 0 ? (
            <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
              未設定
            </span>
          ) : isOverBudget ? (
            <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> 予算オーバー！
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> セーフ！
            </span>
          )}
        </div>

        {budget > 0 && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black text-slate-400">
                {isOverBudget ? '使いすぎ（過剰額）' : 'あと使えるお金（残高）'}
              </span>
              <div className={`text-2xl font-black tracking-tight ${
                isOverBudget ? 'text-rose-500' : 'text-emerald-600'
          }`}>
                {isOverBudget ? `+¥${Math.abs(remainingBudget).toLocaleString()}` : `¥${remainingBudget.toLocaleString()}`}
              </div>
            </div>

            {/* 🐷 予算の進捗バー */}
            <div className="w-full bg-slate-200 h-3 rounded-full border-2 border-slate-800 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min((totalAmount / budget) * 100, 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

    </div>
  );
}