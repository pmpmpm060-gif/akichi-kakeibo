"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, FolderKanban, PiggyBank, Sparkles, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0); // 全カテゴリの合計予算額
  const [loading, setLoading] = useState(true);

  // 💡 豚さんAIおしゃべり用の状態管理
  const [pigMessage, setPigMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurrentMonthData = async () => {
      setLoading(true);
      
      const now = new Date();
      const jstYear = now.getFullYear();
      const jstMonth = String(now.getMonth() + 1).padStart(2, '0'); // 1月なら "01"
      const yearMonthStr = `${jstYear}-${jstMonth}`; // 例: "2026-06"

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

      // ② budgetsテーブルから現在設定されている全ての予算額を取得して足し算
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

  // 予算・過不足の計算ロジック
  const remainingBudget = totalBudget - totalExpense; // 残り予算
  const isOverBudget = remainingBudget < 0; // 予算オーバーしているか

  // 💡 豚さんAIおしゃべり生成ロジック（トップの予算と支出から可愛く分析！）
  const handlePigTalk = () => {
    if (loading) return;

    if (totalBudget === 0) {
      setPigMessage("まだ今月の予算が設定されてないぶー！下の「予算をきめる」から目標をセットしてくれたら、ボクがしっかり見守るぶひ！🐷");
      return;
    }

    const usageRate = (totalExpense / totalBudget) * 100;

    if (isOverBudget) {
      const msgs = [
        `ひえええーっ！！大ピンチだぶー！設定した予算を ¥${Math.abs(remainingBudget).toLocaleString()} もオーバーしちゃってるぶひ！お財布がペッちゃんこでボク泣いちゃうぶー！😭 緊急事態宣言を発令するぶひ！`,
        `ちょっと今月は飛ばしすぎちゃったぶー！？お買い物の嵐が吹き荒れたみたいだぶひ…！でも、現実から目を背けずに家計簿を開いてるだけでえらすぎるぶー。ここからはお茶を飲んで、物欲を無にするぶひ…！`
      ];
      setPigMessage(msgs[Math.floor(Math.random() * msgs.length)]);
    } else if (usageRate > 85) {
      setPigMessage(`イエローカードだぶー！残りの予算枠があと ¥${remainingBudget.toLocaleString()} になっちゃったぶひ。今月のゴールが見えてきたから、あとちょっとだけお財布の紐をギューッと締め直すぶー！がんばるぶひ！🔥`);
    } else if (totalExpense === 0) {
      setPigMessage("まだ今月は1円もつかってないぶー！真っ白でピカピカな家計簿だぶひ。この調子で今月もきれいにやりくりしていこうぶー！✨");
    } else if (usageRate < 40) {
      const msgs = [
        `すごすぎるぶー！予算に対してまだ ${Math.round(usageRate)}% しかつかってないぶひ！お財布がパンパンで、ボクのまるまるとしたお腹みたいだぶー！この調子でサクサク貯金しちゃおう！✨🐷`,
        `ほっくほくだぶー！残り予算が ¥${remainingBudget.toLocaleString()} もあって大富豪の気分だぶひ。ボクの背中のコイン投入口が喜びで震えてるぶー！堅実でとってもえらいぶひ！`
      ];
      setPigMessage(msgs[Math.floor(Math.random() * msgs.length)]);
    } else {
      const msgs = [
        `いい感じだぶー！いまのところ残り予算は ¥${remainingBudget.toLocaleString()} だぶひ！計画的でとってもえらいぶー。このまま油断せず、コンビニの誘惑をスルーしつつキープするぶー！`,
        `順調、順調！お財布のライフはバッチリ残ってるぶひ。無駄遣いトラップを上手に回避してて素晴らしいぶー！自分へのご褒美は月末までちょっとお預けだぶひ？`
      ];
      setPigMessage(msgs[Math.floor(Math.random() * msgs.length)]);
    }
  };

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
        
        {/* 💡 🐷 を button に変更し、ポコッと凹むアニメーションと通知エフェクトを追加 */}
        <button 
          onClick={handlePigTalk}
          className="w-12 h-12 rounded-2xl bg-amber-200 border-2 border-slate-800 flex items-center justify-center font-black text-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(15,23,42,1)] transition-all relative"
        >
          🐷
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border border-white animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border border-white" />
        </button>
      </div>

      {/* 今月のステータス */}
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

      {/* 📊 予算・過不足メーターカード */}
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

      {/* 💡 【新規追加】ブタさんAIアドバイス用ポップアップ（モーダル） */}
      {pigMessage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-5 z-50 animate-in fade-in duration-200">
          <div className="bg-white border-4 border-slate-800 rounded-3xl w-full max-w-sm shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
            <div className="bg-pink-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐷</span>
                <span className="font-black text-sm text-pink-950 tracking-wide">AIブタのトントン診断</span>
              </div>
              <button onClick={() => setPigMessage(null)} className="w-8 h-8 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center active:bg-slate-100">
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4 bg-pink-50/30">
              <div className="bg-white border-2 border-slate-800 rounded-2xl p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] relative">
                {/* 吹き出しの三角ピン */}
                <div className="absolute -top-2.5 right-6 w-4 h-4 bg-white border-t-2 border-l-2 border-slate-800 rotate-45" />
                <p className="text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {pigMessage}
                </p>
              </div>
              <button 
                onClick={() => setPigMessage(null)}
                className="w-full bg-slate-900 text-white font-black py-2.5 rounded-xl border-2 border-slate-800 text-xs active:translate-y-[2px] transition-all"
              >
                わかったぶー！ 👍
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs font-bold text-slate-400 mt-4">
        今日もサクッと記録しよう！ ✨
      </p>
    </div>
  );
}