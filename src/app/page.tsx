"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, FolderKanban, PiggyBank, Sparkles, Loader2, AlertTriangle, CheckCircle2, User, RefreshCw, CalendarDays, TrendingUp, LogOut, ChevronDown, ChevronUp, Repeat2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DataErrorCard } from '../components/data-error-card';
import { parseHouseholdUser } from '../lib/household-users';
import type { Category } from '../lib/database-helpers';

type BudgetSummaryItem = Category & {
  actual: number;
  budget: number;
  carryover: number;
};

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));

  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [totalCarryover, setTotalCarryover] = useState<number>(0);
  const [hasBudget, setHasBudget] = useState(false);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryItem[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
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

      const [categoryResult, transactionResult, budgetResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser),
        supabase
          .from('transactions')
          .select('amount, category_id, type')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth),
        supabase.rpc('get_effective_budgets', {
          target_user_id: currentUser,
          target_month: startOfMonth,
        }),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error || budgetResult.error;
      if (error) {
        setDataError(error.message);
        setLoading(false);
        return;
      }

      setCurrentDay(todayNum);
      setDaysInMonth(lastDay);
      setRemainingDays(remDays > 0 ? remDays : 1);
      setTotalExpense(
        (transactionResult.data || [])
          .filter((item) => item.type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalBudget(
        (budgetResult.data || [])
          .filter((item) => item.category_type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalCarryover(
        (budgetResult.data || [])
          .filter((item) => item.category_type === 'expense')
          .reduce((sum, item) => sum + Number(item.carryover_amount), 0)
      );
      setHasBudget(
        (budgetResult.data || []).some(
          (item) =>
            item.category_type === 'expense'
            && (Number(item.base_amount) !== 0 || Number(item.carryover_amount) !== 0)
        )
      );
      setBudgetSummary(
        (categoryResult.data || [])
          .filter((category) => category.type === 'expense')
          .map((category) => {
            const effectiveBudget = (budgetResult.data || []).find(
              (budget) => budget.category_id === category.id
            );
            const actual = (transactionResult.data || [])
              .filter((transaction) =>
                transaction.category_id === category.id
                && transaction.type === category.type
              )
              .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

            return {
              ...category,
              actual,
              budget: Number(effectiveBudget?.amount || 0),
              carryover: Number(effectiveBudget?.carryover_amount || 0),
            };
          })
          .filter((item) => item.budget !== 0 || item.actual !== 0)
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

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setDataError(`ログアウトに失敗しました：${error.message}`);
      setIsSigningOut(false);
      return;
    }

    window.location.href = '/login';
  };

  const menus = [
    {
      title: "家計簿を付ける",
      href: `/dashboard?user=${currentUser}`,
      icon: Wallet,
      bgColor: "bg-emerald-300",
    },
    {
      title: "予算を決める",
      href: `/budgets?user=${currentUser}`,
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

        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="ログアウト"
            className="w-10 h-10 flex items-center justify-center rounded-2xl border-2 border-slate-800 bg-white text-slate-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-60"
          >
            {isSigningOut
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <LogOut className="w-4 h-4" />}
          </button>
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
      </div>

      {/* 各画面へのメニュー */}
      <nav
        aria-label="メインメニュー"
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        {menus.map((menu) => {
          const Icon = menu.icon;
          return (
            <Link
              key={menu.href}
              href={menu.href}
              className={`min-w-0 flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border-2 border-slate-800 ${menu.bgColor} shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] transition-all`}
            >
              <div className="w-10 h-10 bg-white rounded-xl border-2 border-slate-800 flex items-center justify-center">
                <Icon className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
              </div>
              <span className="text-center text-[11px] leading-tight font-black text-slate-950">
                {menu.title}
              </span>
            </Link>
          );
        })}
      </nav>

      {dataError && <DataErrorCard message={dataError} onRetry={retryFetch} />}

      {/* 今月のステータス */}
      {!dataError && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setIsSummaryOpen((current) => !current)}
            aria-expanded={isSummaryOpen}
            className="w-full text-left bg-amber-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center justify-between gap-3"
          >
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-600">
                【{currentUser === 'user_a' ? 'ママ' : 'パパ'}】今月使ったお金
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
            </div>
            {!loading && (
              <span className="shrink-0 bg-white border-2 border-slate-800 rounded-xl p-2">
                {isSummaryOpen
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </span>
            )}
          </button>

          {!loading && isSummaryOpen && (
            <div className="flex flex-col gap-5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月の予算・実績案内 📊</p>

              {budgetSummary.length === 0 && (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold text-slate-500">表示できる予算・実績はありません。</p>
                </div>
              )}

              {budgetSummary.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">💸 支出の残り枠</p>
                  {budgetSummary.map((item) => {
                    const percent = item.budget > 0
                      ? Math.min((item.actual / item.budget) * 100, 100)
                      : item.actual > item.budget ? 100 : 0;
                    const isOver = item.actual > item.budget && item.budget !== 0;

                    return (
                      <div key={item.id} className={`p-4 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 ${isOver ? 'bg-rose-50/50' : ''}`}>
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                            <span className="text-base">{item.icon || '💸'}</span> {item.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-500">¥{item.actual.toLocaleString()} / ¥{item.budget.toLocaleString()}</span>
                            {isOver && (
                              <span className="text-[10px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded border border-slate-800">
                                オーバー！
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-4 bg-slate-100 border-2 border-slate-800 rounded-full overflow-hidden p-[1px]">
                          <div className={`h-full rounded-full border-r border-slate-800 ${isOver ? 'bg-rose-400' : percent > 80 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${percent}%` }} />
                        </div>
                        {item.carryover !== 0 && (
                          <p className={`text-[10px] font-black flex items-center gap-1 ${item.carryover > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <Repeat2 className="w-3 h-3" />
                            前月までの繰越: {item.carryover > 0 ? '+' : ''}¥{item.carryover.toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 📊 予算・過不足メーターカード */}
      {!loading && !dataError && hasBudget && (
        <div className="flex flex-col gap-4">
          <div className={`border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3 transition-all ${
            isOverBudget ? 'bg-rose-100' : 'bg-emerald-100/60'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-slate-700">当月予算: ¥{totalBudget.toLocaleString()}</span>
                {totalCarryover !== 0 && (
                  <span className={`text-[10px] font-black ${totalCarryover > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    繰越: {totalCarryover > 0 ? '+' : ''}¥{totalCarryover.toLocaleString()}
                  </span>
                )}
              </div>
              {isOverBudget ? (
                <span className="text-[10px] font-black text-rose-700 bg-white border border-rose-400 px-2 py-0.5 rounded-full flex items-center gap-1">
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
                  <CalendarDays className="w-4 h-4 text-slate-700" /> 今日からの日当たり目安:
                </span>
                <span className="font-black text-sm text-slate-900">
                  ¥{dailyRemaining.toLocaleString()} <span className="text-[10px] text-slate-500">/ 日</span>
                </span>
              </div>
            )}

            <div className="w-full bg-white h-3 rounded-full border-2 border-slate-800 overflow-hidden mt-1">
              <div 
                className={`h-full border-r border-slate-800 transition-all duration-500 ${isOverBudget ? 'bg-rose-400' : 'bg-emerald-400'}`}
                style={{
                  width: `${totalBudget > 0
                    ? Math.max(0, Math.min((totalExpense / totalBudget) * 100, 100))
                    : 100}%`
                }}
              />
            </div>
          </div>

          {/* 💡 シミュレーション（理想の残高判定）カード */}
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
      {!loading && !dataError && !hasBudget && (
        <div className="bg-slate-50 border-2 border-slate-400 border-dashed rounded-3xl p-4 text-center">
          <p className="text-xs font-bold text-slate-500">予算がまだ設定されていません 🐷</p>
          <p className="text-[10px] text-slate-400 mt-0.5">上のメニューから「予算を決める」と、ここにメーターが表示されます！</p>
        </div>
      )}

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
