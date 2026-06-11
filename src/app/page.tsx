"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, FolderKanban, PiggyBank, Sparkles, Loader2, AlertTriangle, CheckCircle2, User, RefreshCw, CalendarDays, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DataErrorCard } from '../components/data-error-card';
import { parseHouseholdUser } from '../lib/household-users';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));

  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // 日付・残日数に関する状態
  const [daysInMonth, setDaysInMonth] = useState<number>(30);
  const [remainingDays, setRemainingDays] = useState<number>(1);
  const [currentDay, setCurrentDay] = useState<number>(1);

  // 💡 データの取得処理（currentUser が変わるたびに自動で再実行されます）
  useEffect(() => {
    let ignore = false;

    const fetchCurrentMonthData = async () => {
      const now = new Date();
      const jstYear = now.getFullYear();
      const jstMonth = String(now.getMonth() + 1).padStart(2, '0');
      const yearMonthStr = `${jstYear}-${jstMonth}`;

      const startOfMonth = `${yearMonthStr}-01`;
      const lastDay = new Date(jstYear, now.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonthStr}-${String(lastDay).padStart(2, '0')}`;

      // 📅 日数計算ロジック
      const todayNum = now.getDate();
      // 残り日数（今日を含めるため +1）
      const remDays = lastDay - todayNum + 1;

      const [expenseResult, budgetResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount')
          .eq('type', 'expense')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth),
        supabase
          .from('budgets')
          .select('amount')
          .eq('user_id', currentUser),
      ]);

      if (ignore) return;

      const error = expenseResult.error || budgetResult.error;
      if (error) {
        setDataError(error.message);
        setLoading(false);
        return;
      }

      setCurrentDay(todayNum);
      setDaysInMonth(lastDay);
      setRemainingDays(remDays > 0 ? remDays : 1);
      setTotalExpense(
        (expenseResult.data || []).reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalBudget(
        (budgetResult.data || []).reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setLoading(false);
    };

    void fetchCurrentMonthData();

    return () => {
      ignore = true;
    };
  }, [currentUser, retryKey]);

  // 💡 ユーザーをトグルで切り替える関数
  const toggleUser = () => {
    setLoading(true);
    setDataError(null);
    const nextUser = currentUser === 'user_a' ? 'user_b' : 'user_a';
    router.replace(`/?user=${nextUser}`);
  };

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const menus = [
    {
      title: "家計簿をつける",
      desc: "毎日の収支を入力・予実をチェック！",
      href: `/dashboard?user=${currentUser}`,
      icon: Wallet,
      bgColor: "bg-emerald-300",
    },
    {
      title: "予算をきめる",
      href: `/budgets?user=${currentUser}`,
      desc: "今月のカテゴリごとの予算を設定",
      icon: PiggyBank,
      bgColor: "bg-sky-300",
    },
    {
      title: "カテゴリ管理",
      href: `/categories?user=${currentUser}`,
      icon: FolderKanban,
      bgColor: "bg-pink-300",
    },
  ];

  const remainingBudget = totalBudget - totalExpense;
  const isOverBudget = remainingBudget < 0;

  // 💡 日当たり予算とシミュレーションの計算
  // 1日あたりあとどれくらい使えるか
  const dailyRemaining = !isOverBudget ? Math.floor(remainingBudget / remainingDays) : 0;

  // 日割り基準での「現時点の理想の残り予算」
  const idealRemaining = Math.floor(totalBudget * (remainingDays / daysInMonth));
  
  // シミュレーション評価 (実際の残り予算 vs 理想の残り予算)
  const isSimulationOk = remainingBudget >= idealRemaining;
  const simulationDiff = Math.abs(remainingBudget - idealRemaining);

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

        <button
          onClick={toggleUser}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border-2 border-slate-800 font-black text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(15,23,42,1)] transition-all
            ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}
        >
          <User className="w-3.5 h-3.5" />
          <span>{currentUser === 'user_a' ? '👩‍🦰 ママ' : '👨 パパ'}</span>
          <RefreshCw className="w-3 h-3 text-slate-500 ml-0.5" />
        </button>
      </div>

      {dataError && <DataErrorCard message={dataError} onRetry={retryFetch} />}

      {/* 今月のステータス */}
      {!dataError && <div className="bg-amber-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2">
        <p className="text-xs font-bold text-slate-600">
          【{currentUser === 'user_a' ? 'ママ' : 'パパ'}】今月のつかったお金
        </p>
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
      </div>}

      {/* 📊 予算・過不足メーターカード */}
      {!loading && !dataError && totalBudget > 0 && (
        <div className="flex flex-col gap-4">
          <div className={`border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3 transition-all ${
            isOverBudget ? 'bg-rose-100' : 'bg-emerald-100/60'
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-700">設定予算: ¥{totalBudget.toLocaleString()}</span>
              {isOverBudget ? (
                <span className="text-[10px] font-black text-rose-700 bg-white border border-rose-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-500" /> 予算オーバー！
                </span>
              ) : (
                <span className="text-[10px] font-black text-emerald-700 bg-white border border-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> セーフ！!
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-bold text-slate-600">
                {isOverBudget ? '使いすぎているお金' : 'あと使えるお金'}
              </p>
              <div className="text-2xl font-black tracking-tight flex items-baseline gap-2">
                <span>
                  {isOverBudget 
                    ? `+¥${Math.abs(remainingBudget).toLocaleString()}` 
                    : `¥${remainingBudget.toLocaleString()}`
                  }
                </span>
                <span className="text-xs font-bold text-slate-500">
                  (残り {remainingDays} 日 / {daysInMonth}日中)
                </span>
              </div>
            </div>

            {/* 💡 日当たりあといくら使えるかエリア */}
            {!isOverBudget && (
              <div className="bg-white/80 border-2 border-dashed border-slate-700 rounded-2xl p-2.5 flex items-center justify-between text-xs mt-1">
                <span className="font-bold text-slate-600 flex items-center gap-1">
                  <CalendarDays className="w-4 h-4 text-slate-700" /> 今日からの日当り目安:
                </span>
                <span className="font-black text-sm text-slate-900">
                  ¥{dailyRemaining.toLocaleString()} <span className="text-[10px] text-slate-500">/ 日</span>
                </span>
              </div>
            )}

            <div className="w-full bg-white h-3 rounded-full border-2 border-slate-800 overflow-hidden mt-1">
              <div 
                className={`h-full border-r border-slate-800 transition-all duration-500 ${isOverBudget ? 'bg-rose-400' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min((totalExpense / totalBudget) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* 💡 シュミレーション（理想の残高判定）カード */}
          <div className={`border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 transition-all ${
            isSimulationOk ? 'bg-indigo-50' : 'bg-orange-50'
          }`}>
            <div className="flex items-center justify-between text-xs font-black text-slate-700">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-indigo-600" /> 月末までのシミュレーション
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
                isSimulationOk ? 'bg-indigo-200 border-indigo-400 text-indigo-800' : 'bg-orange-200 border-orange-400 text-orange-800'
              }`}>
                {isSimulationOk ? 'ペースばっちり！✨' : 'ちょっと使いすぎ！⚠️'}
              </span>
            </div>

            <div className="text-xs text-slate-600 flex flex-col gap-1 mt-1 bg-white p-3 rounded-2xl border border-slate-300">
              <div className="flex justify-between">
                <span>現在（{currentDay}日目）の理想の残高:</span>
                <span className="font-bold text-slate-800">¥{idealRemaining.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 mt-1 font-bold">
                <span>結果・診断:</span>
                <span className={isSimulationOk ? 'text-indigo-600' : 'text-orange-600'}>
                  {isSimulationOk 
                    ? `理想より ¥${simulationDiff.toLocaleString()} 多く残せています！`
                    : `理想より ¥${simulationDiff.toLocaleString()} ペースが早いです！`
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 予算が1円も登録されていない場合のフォールバック */}
      {!loading && !dataError && totalBudget === 0 && (
        <div className="bg-slate-50 border-2 border-slate-400 border-dashed rounded-3xl p-4 text-center">
          <p className="text-xs font-bold text-slate-500">予算がまだ設定されていません 🐷</p>
          <p className="text-[10px] text-slate-400 mt-0.5">下のメニューから「予算をきめる」とここにメーターが出現します！</p>
        </div>
      )}

      {/* メメニューボタン一覧 */}
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
        現在のモード: {currentUser === 'user_a' ? 'ママデータ' : 'パパデータ'} 🚀
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
