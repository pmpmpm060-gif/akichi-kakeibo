"use client";

export const dynamic = 'force-dynamic'; // 👈 これを追加！常に最新データを引き出すおまじないです
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, FolderKanban, PiggyBank, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase'; // パスを合わせてインポート

export default function HomePage() {
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // 今月の文字列を取得 (例: 2026-06)
  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const fetchCurrentMonthExpense = async () => {
      setLoading(true);
      
      const startOfMonth = `${currentMonth}-01`;
      const endOfMonth = `${currentMonth}-31`;

      // 今月の支出（expense）の実績だけをSupabaseから全部持ってくる
      const { data, error } = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'expense')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (!error && data) {
        // 合計金額を計算
        const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
        setTotalExpense(total);
      }
      setLoading(false);
    };

    fetchCurrentMonthExpense();
  }, [currentMonth]);

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

      {/* 今月のステータス（本物になったよ！） */}
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

      {/* メニューボタン一覧 */}
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