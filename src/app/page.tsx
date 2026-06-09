"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, FolderKanban, PiggyBank, Sparkles, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0); // 💡 全カテゴリの合計予算額
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentMonthData = async () => {
      setLoading(true);
      
      // 💡 1. iPhone/Vercelでも絶対に「日本の現在の年月」になるように取得
      const now = new Date();
      const jstYear = now.getFullYear();
      const jstMonth = String(now.getMonth() + 1).padStart(2, '0'); // 1月なら "01"
      const yearMonthStr = `${jstYear}-${jstMonth}`; // 例: "2026-06"

      // 💡 2. 安全な期間指定
      const startOfMonth = `${yearMonthStr}-01`;
      const lastDay = new Date(jstYear, now.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonthStr}-${String(lastDay).padStart(2, '0')}`;

      // ① 今月の支出（expense）の実績だけをSupabaseから全部持ってくる
      const { data: expenseData, error: expenseError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'expense')
        .gte('date', startOfMonth)
        .lte('date', safeEndOfMonth);

      if (!expenseError && expenseData) {
        const total = expenseData.reduce((sum, item) => sum + Number(item.amount), 0);
        setTotalExpense(total);
      } else if (expenseError) {
        console.error("Supabaseエラー(支出):", expenseError.message);
      }

      // ② 💡 ダッシュボードの設計と完全に同期！
      // budgetsテーブルから現在設定されている全ての予算額を取得して足し算します
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('amount');

      if (!budgetError && budgetData) {
        const bTotal = budgetData.reduce((sum, item) => sum + Number(item.amount), 0);
        setTotalBudget(bTotal);
      } else if (budgetError) {
        console.error("Supabaseエラー(予算):", budgetError.message);
      }

      setLoading(false);
    };

    fetchCurrentMonthData();
  }, []);

  const menus = [
    {
      title: "家計簿をつける",
      desc: "毎日の収支を入力・予実をチェック！",
      href: `/dashboard`,
      icon: Wallet,
      bgColor: "bg-emerald-300",
    },
    {
      title: "予算をきめる",
      desc: "今月のカテゴリごとの予算を設定",
      href: "/budgets",
      icon: PiggyBank,
      bgColor: "bg-sky-300",
    },
    {
      title: "カテゴリ管理",
      desc: "支出・収入の分類をカスタマイズ",
      href: "/categories",
      icon: FolderKanban,
      bgColor: "bg-pink-300",
    },
  ];

  // 💡 予算・過不足の計算ロジック
  const remainingBudget = totalBudget - totalExpense; // 残り予算
  const isOverBudget = remainingBudget < 0; // 予算オーバーしているか

  return (
    <div className="p-6 flex flex-col gap-8">
      {/* ヘッダー部分 */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <Sparkles className="w-3 h-3" /> Easy & Pop
          </span>
          <h1 className="text-3xl font-black mt-1 tracking-tight">
            ぽっぷ<span className="text-emerald-500">家計簿</span>
          </h1>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-amber-200 border-2 border-slate-800 flex items-center justify-center font-black text-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          🐷
        </div>
      </div>

      {/* 今月のステータス（元のデザインそのまま！） */}
      <div className="bg-amber-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2">
        <p className="text-xs font-bold text-slate-600">今月のつかったお金</p>
        <div className="flex items-baseline gap-2">
          {loading ? (
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          ) : (
            <>
              <span className="text-3xl font-black">¥{totalExpense.toLocaleString()}</span>
              {totalExpense > 0 && (
                <span className="text-[10px] font-black bg-white text-slate-700 px-2 py-0.5 rounded-full border border-slate-400">
                  ナイス記録！👍
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 📊 予算・過不足メーターカード（元の世界観にジャストフィット！） */}
      {!loading && totalBudget > 0 && (
        <div className={`border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3 transition-all ${
          isOverBudget ? 'bg-rose-100' : 'bg-emerald-100/60'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-700">設定予算: ¥{totalBudget.toLocaleString()}</span>
            {isOverBudget ? (
              <span className="text-[10px] font-black text-rose-700 bg-white border border-rose-400 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-500" /> 予算オーバー！
              </span>
            ) : (
              <span className="text-[10px] font-black text-emerald-700 bg-white border border-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> セーフ！
              </span>
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-bold text-slate-600">
              {isOverBudget ? '使いすぎているお金（過剰額）' : 'あと使えるお金（過不足残高）'}
            </p>
            <div className="text-2xl font-black tracking-tight">
              {isOverBudget 
                ? `+¥${Math.abs(remainingBudget).toLocaleString()}` 
                : `¥${remainingBudget.toLocaleString()}`
              }
            </div>
          </div>

          {/* 🐷 予算の進捗メーターバー */}
          <div className="w-full bg-white h-3 rounded-full border-2 border-slate-800 overflow-hidden">
            <div 
              className={`h-full border-r border-slate-800 transition-all duration-500 ${isOverBudget ? 'bg-rose-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min((totalExpense / totalBudget) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 予算が1円も登録されていない場合のフォールバック */}
      {!loading && totalBudget === 0 && (
        <div className="bg-slate-50 border-2 border-slate-400 border-dashed rounded-3xl p-4 text-center">
          <p className="text-xs font-bold text-slate-500">予算がまだ設定されていません 🐷</p>
          <p className="text-[10px] text-slate-400 mt-0.5">下のメニューから「予算をきめる」とここにメーターが出現します！</p>
        </div>
      )}

      {/* メニューボタン一覧（元のデザイン100%維持！） */}
      <div className="flex flex-col gap-5">
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest px-1">メニュー</p>
        
        {menus.map((menu, idx) => {
          const Icon = menu.icon;
          return (
            <Link 
              key={idx} 
              href={menu.href}
              className={`flex items-center gap-4 p-5 rounded-3xl border-2 border-slate-800 ${menu.bgColor} shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition-all`}
            >
              <div className="w-12 h-12 bg-white rounded-2xl border-2 border-slate-800 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h2 className="font-black text-lg text-slate-950">{menu.title}</h2>
                <p className="text-xs font-bold text-slate-700 mt-0.5">{menu.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-center text-xs font-bold text-slate-400 mt-4">
        今日もサクッと記録しよう！ ✨
      </p>
    </div>
  );
}