"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, User, RefreshCw, CalendarDays, TrendingUp, LogOut, ChevronDown, ChevronUp, Repeat2, BarChart3, CalendarClock, CalendarRange, Bell, PiggyBank, X, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DataErrorCard } from '../components/data-error-card';
import { parseHouseholdUser } from '../lib/household-users';
import type { Category } from '../lib/database-helpers';
import { useCurrentProfileId, useHouseholdProfiles } from '../lib/household-profiles';
import { userErrorMessage } from '../lib/user-errors';

type BudgetSummaryItem = Category & {
  actual: number;
  budget: number;
  carryover: number;
};
type HouseholdAlert = { key: string; message: string };

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const profiles = useHouseholdProfiles();
  const ownProfileId = useCurrentProfileId();
  const currentProfile = profiles.find((profile) => profile.profile_id === currentUser);
  const canEdit = ownProfileId === currentUser;

  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [totalCarryover, setTotalCarryover] = useState<number>(0);
  const [totalBudgetOffset, setTotalBudgetOffset] = useState<number>(0);
  const [hasBudget, setHasBudget] = useState(false);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryItem[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [alerts, setAlerts] = useState<HouseholdAlert[]>([]);
  const [dismissingAlertKey, setDismissingAlertKey] = useState<string | null>(null);
  const [specialExpenseSummary, setSpecialExpenseSummary] = useState({ monthlyReserve: 0, scheduledPayment: 0, reserveBalance: 0 });

  // シミュレーションでは、ブラウザのJSTローカル日付を使用する。
  const [daysInMonth, setDaysInMonth] = useState<number>(30);
  const [remainingDays, setRemainingDays] = useState<number>(1);
  const [currentDay, setCurrentDay] = useState<number>(1);

  useEffect(() => {
    // ユーザー切替前の通信結果が後から返る場合があるため、古い結果は無視する。
    let ignore = false;

    const fetchCurrentMonthData = async () => {
      const now = new Date();
      const jstYear = now.getFullYear();
      const jstMonth = String(now.getMonth() + 1).padStart(2, '0');
      const yearMonthStr = `${jstYear}-${jstMonth}`;

      const startOfMonth = `${yearMonthStr}-01`;
      const lastDay = new Date(jstYear, now.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonthStr}-${String(lastDay).padStart(2, '0')}`;
      const previousDate = new Date(jstYear, now.getMonth() - 1, 1);
      const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
      const previousEnd = `${previousMonth}-${String(new Date(previousDate.getFullYear(), previousDate.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

      const todayNum = now.getDate();
      // 日当たり目安は今日から計算するため、残り日数に今日を含める。
      const remDays = lastDay - todayNum + 1;

      if (canEdit) {
        const [generateResult, specialGenerateResult] = await Promise.all([
          supabase.rpc('generate_recurring_transactions', { target_user_id: currentUser, target_month: startOfMonth }),
          supabase.rpc('generate_special_expense_payments', { target_user_id: currentUser, target_month: startOfMonth }),
        ]);
        if (ignore) return;
        if (generateResult.error || specialGenerateResult.error) {
          setDataError('定期取引・特別支出予定の反映に失敗しました。通信状況を確認して、もう一度お試しください。');
          setLoading(false);
          return;
        }
      }

      const [categoryResult, transactionResult, budgetResult, previousTransactionResult, dismissedAlertResult, specialSummaryResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase
          .from('transactions')
          .select('amount, category_id, type, recurring_transaction_id, budget_offset_type, budget_offset_category_id')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth),
        supabase.rpc('get_effective_budgets', {
          target_user_id: currentUser,
          target_month: startOfMonth,
        }),
        supabase.from('transactions').select('amount, category_id, type').eq('user_id', currentUser).gte('date', `${previousMonth}-01`).lte('date', previousEnd),
        supabase.from('dismissed_alerts').select('alert_key').eq('user_id', currentUser),
        supabase.rpc('get_special_expense_summary', { target_user_id: currentUser, target_month: startOfMonth }),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error || budgetResult.error || previousTransactionResult.error || dismissedAlertResult.error || specialSummaryResult.error;
      if (error) {
        setDataError('ホーム画面のデータ取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
        return;
      }

      setCurrentDay(todayNum);
      setDaysInMonth(lastDay);
      setRemainingDays(remDays > 0 ? remDays : 1);
      const currentTransactions = transactionResult.data || [];
      const incomeBudgetOffsets = currentTransactions.filter((item) => item.type === 'income' && item.budget_offset_type !== 'none');
      const overallBudgetOffset = incomeBudgetOffsets
        .filter((item) => item.budget_offset_type === 'overall')
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const categoryBudgetOffsetMap = incomeBudgetOffsets
        .filter((item) => item.budget_offset_type === 'category' && item.budget_offset_category_id)
        .reduce<Map<string, number>>((map, item) => {
          const categoryId = item.budget_offset_category_id || '';
          map.set(categoryId, (map.get(categoryId) || 0) + Number(item.amount));
          return map;
        }, new Map<string, number>());
      const categoryBudgetOffsetTotal = Array.from(categoryBudgetOffsetMap.values()).reduce((sum, value) => sum + value, 0);
      const normalBudgetOffsetTotal = overallBudgetOffset + categoryBudgetOffsetTotal;
      const specialSummary = specialSummaryResult.data?.[0];
      setSpecialExpenseSummary({
        monthlyReserve: Number(specialSummary?.monthly_reserve || 0),
        scheduledPayment: Number(specialSummary?.scheduled_payment || 0),
        reserveBalance: Number(specialSummary?.reserve_balance || 0),
      });
      setTotalExpense(
        currentTransactions
          .filter((item) => item.type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalBudget(
        // 収入予算は目標額であり、支出可能額ではないため合計から除外する。
        (budgetResult.data || [])
          .filter((item) => item.category_type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount), 0) + normalBudgetOffsetTotal
      );
      setTotalBudgetOffset(normalBudgetOffsetTotal);
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
        ) || normalBudgetOffsetTotal > 0
      );
      setBudgetSummary(
        // トップ画面の予算案内は、支出カテゴリだけを対象にする。
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
            const categoryBudgetOffset = categoryBudgetOffsetMap.get(category.id) || 0;

            return {
              ...category,
              actual,
              budget: Number(effectiveBudget?.amount || 0) + categoryBudgetOffset,
              carryover: Number(effectiveBudget?.carryover_amount || 0),
            };
          })
          .filter((item) => item.budget !== 0 || item.actual !== 0)
      );
      const dismissedAlertKeys = new Set((dismissedAlertResult.data || []).map((item) => item.alert_key));
      const nextAlerts: HouseholdAlert[] = [];
      (categoryResult.data || []).filter((category) => category.type === 'expense').forEach((category) => {
        const currentCategoryExpenses = currentTransactions.filter((item) => item.category_id === category.id && item.type === 'expense');
        const currentActual = currentCategoryExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
        const previousActual = (previousTransactionResult.data || []).filter((item) => item.category_id === category.id && item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
        const budget = Number((budgetResult.data || []).find((item) => item.category_id === category.id)?.amount || 0) + (categoryBudgetOffsetMap.get(category.id) || 0);
        // 定期取引由来の固定費だけなら到達通知は不要だが、超過時は見逃さない。
        const hasVariableExpense = currentCategoryExpenses.some((item) => item.recurring_transaction_id === null);
        if (budget > 0 && currentActual > budget) nextAlerts.push({ key: `${yearMonthStr}:${category.id}:budget-over`, message: `${category.name}が予算を超過しています` });
        else if (budget > 0 && currentActual === budget && hasVariableExpense) nextAlerts.push({ key: `${yearMonthStr}:${category.id}:budget-reached`, message: `${category.name}が予算に到達しました` });
        else if (budget > 0 && currentActual >= budget * 0.8 && hasVariableExpense) nextAlerts.push({ key: `${yearMonthStr}:${category.id}:budget-80`, message: `${category.name}が予算の80%に達しました` });
        if (previousActual > 0 && currentActual >= previousActual * 1.5 && currentActual - previousActual >= 3000) nextAlerts.push({ key: `${yearMonthStr}:${category.id}:previous-increase`, message: `${category.name}が前月より大きく増えています` });
      });
      setAlerts(nextAlerts.filter((alert) => !dismissedAlertKeys.has(alert.key)));
      setLoading(false);
    };

    void fetchCurrentMonthData().catch(() => {
      if (!ignore) {
        setDataError('データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [canEdit, currentUser, retryKey]);

  const toggleUser = () => {
    if (profiles.length < 2) return;
    setLoading(true);
    setDataError(null);
    const currentIndex = profiles.findIndex((profile) => profile.profile_id === currentUser);
    const nextUser = profiles[(currentIndex + 1) % profiles.length].profile_id;
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
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setDataError('ログアウトに失敗しました。通信状況を確認してください。');
        return;
      }
      window.location.href = '/login';
    } catch {
      setDataError('ログアウトに失敗しました。通信状況を確認してください。');
    } finally {
      setIsSigningOut(false);
    }
  };

  const dismissAlert = async (targetAlert: HouseholdAlert) => {
    if (dismissingAlertKey) return;
    setDismissingAlertKey(targetAlert.key);
    try {
      const { error } = await supabase.from('dismissed_alerts').insert({
        user_id: currentUser,
        alert_key: targetAlert.key,
      });
      if (error) {
        if (error.code === '23505') {
          setAlerts((current) => current.filter((item) => item.key !== targetAlert.key));
        } else if (error.code === 'P0001') {
          alert('このプロフィールではアラートを削除できません。本人のログインでお試しください。');
        } else {
          alert(userErrorMessage('アラートの削除', error));
        }
      } else {
        setAlerts((current) => current.filter((item) => item.key !== targetAlert.key));
      }
    } catch {
      alert('アラートの削除に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setDismissingAlertKey(null);
    }
  };

  const remainingBudget = totalBudget - totalExpense;
  const isOverBudget = remainingBudget < 0;

  // 実際の残予算を、月内で均等に支出した場合の理想値と比較する。
  const dailyRemaining = !isOverBudget ? Math.floor(remainingBudget / remainingDays) : 0;
  const idealRemaining = Math.floor(totalBudget * (remainingDays / daysInMonth));
  const isSimulationOk = remainingBudget >= idealRemaining;
  const simulationDiff = Math.abs(remainingBudget - idealRemaining);

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      {/* ヘッダーとアカウント操作 */}
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
            className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-slate-800 bg-white text-slate-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-60"
          >
            {isSigningOut
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <LogOut className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleUser}
            disabled={profiles.length < 2}
            className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-2xl border-2 border-slate-800 font-black text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(15,23,42,1)] transition-all
              ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{currentProfile?.icon} {currentProfile?.display_name || (currentUser === 'user_a' ? 'ママ' : 'パパ')}</span>
            {profiles.length > 1 && <RefreshCw className="w-3 h-3 text-slate-500 ml-0.5" />}
          </button>
        </div>
      </div>

      {dataError && <DataErrorCard message={dataError} onRetry={retryFetch} />}
      {ownProfileId !== undefined && !canEdit && <p className="flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800"><Eye className="h-4 w-4 shrink-0" />このプロフィールは参照モードです。変更は本人のログインで行ってください。</p>}

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Link href={`/reports?user=${currentUser}`} className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-800 bg-indigo-100 px-1 text-center text-[10px] font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <BarChart3 className="h-5 w-5 shrink-0" /><span>月次レポート</span>
        </Link>
        <Link href={`/recurring?user=${currentUser}`} className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-800 bg-sky-100 px-1 text-center text-[10px] font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <CalendarClock className="h-5 w-5 shrink-0" /><span>定期取引</span>
        </Link>
        <Link href={`/savings?user=${currentUser}`} className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-800 bg-emerald-100 px-1 text-center text-[10px] font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <PiggyBank className="h-5 w-5 shrink-0" /><span>貯金目標</span>
        </Link>
      </div>
      {!loading && alerts.length > 0 && <section className="flex flex-col gap-2 rounded-3xl border-2 border-slate-800 bg-orange-50 p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"><h2 className="flex items-center gap-2 text-sm font-black text-orange-800"><Bell className="h-5 w-5" />家計アラート</h2>{alerts.map((item) => <div key={item.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-orange-700"><span className="min-w-0 flex-1">・{item.message}</span>{canEdit && <button type="button" onClick={() => dismissAlert(item)} disabled={dismissingAlertKey !== null} aria-label={`${item.message}を削除`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 disabled:opacity-50">{dismissingAlertKey === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</button>}</div>)}</section>}
      {!loading && specialExpenseSummary.monthlyReserve > 0 && <Link href={`/special-expenses?user=${currentUser}`} className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-cyan-50 p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
        <h2 className="flex items-center gap-2 text-sm font-black"><CalendarRange className="h-5 w-5 text-cyan-700" />特別支出の積立</h2>
        <div className="grid grid-cols-3 gap-2 text-center"><span className="rounded-xl bg-white p-2"><span className="block text-[10px] font-bold text-slate-500">毎月の目安</span><span className="text-xs font-black">¥{specialExpenseSummary.monthlyReserve.toLocaleString()}</span></span><span className="rounded-xl bg-white p-2"><span className="block text-[10px] font-bold text-slate-500">今月支払い</span><span className="text-xs font-black">¥{specialExpenseSummary.scheduledPayment.toLocaleString()}</span></span><span className="rounded-xl bg-white p-2"><span className="block text-[10px] font-bold text-slate-500">積立残高</span><span className={`text-xs font-black ${specialExpenseSummary.reserveBalance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>¥{specialExpenseSummary.reserveBalance.toLocaleString()}</span></span></div>
        {hasBudget && <p className={`rounded-xl bg-white px-3 py-2 text-xs font-black ${remainingBudget - specialExpenseSummary.monthlyReserve < 0 ? 'text-rose-600' : 'text-cyan-800'}`}>今月の積立分を確保した後に使える通常予算：¥{(remainingBudget - specialExpenseSummary.monthlyReserve).toLocaleString()}</p>}
      </Link>}

      {/* 押下するとカテゴリ別の支出予算案内を展開する。 */}
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
                【{currentProfile?.display_name || (currentUser === 'user_a' ? 'ママ' : 'パパ')}】今月使ったお金
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
              {!loading && hasBudget && (
                <p className={`text-sm font-black ${isOverBudget ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {isOverBudget ? '予算超過' : 'あと使える'}: ¥{Math.abs(remainingBudget).toLocaleString()}
                </p>
              )}
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

      {/* 支出予算の全体状況と消化ペース */}
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
                {totalBudgetOffset > 0 && (
                  <span className="text-[10px] font-black text-emerald-700">
                    臨時収入の上乗せ: +¥{totalBudgetOffset.toLocaleString()}
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

          {/* 月末まで均等に支出する場合とのペース比較 */}
          <button
            type="button"
            onClick={() => setIsSimulationOpen((current) => !current)}
            aria-expanded={isSimulationOpen}
            className={`w-full border-2 border-slate-800 rounded-3xl p-4 text-left shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-2 transition-all ${
            isSimulationOk ? 'bg-indigo-50' : 'bg-orange-50'
          }`}>
            <div className="flex items-center justify-between text-xs font-black text-slate-700">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-indigo-600" /> 月末までのシミュレーション
              </span>
              <span className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
                  isSimulationOk ? 'bg-indigo-200 border-indigo-400 text-indigo-800' : 'bg-orange-200 border-orange-400 text-orange-800'
                }`}>
                  {isSimulationOk ? 'ペースばっちり！✨' : 'ちょっと使いすぎ！⚠️'}
                </span>
                {isSimulationOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </div>

            {isSimulationOpen && <div className="text-xs text-slate-600 flex flex-col gap-1 mt-1 bg-white p-3 rounded-2xl border border-slate-300">
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
            </div>}
          </button>
        </div>
      )}

      {/* 支出予算が未設定の場合は、設定画面への案内を表示する。 */}
      {!loading && !dataError && !hasBudget && (
        <div className="bg-slate-50 border-2 border-slate-400 border-dashed rounded-3xl p-4 text-center">
          <p className="text-xs font-bold text-slate-500">予算がまだ設定されていません 🐷</p>
          <p className="text-[10px] text-slate-400 mt-0.5">上のメニューから「予算を決める」と、ここにメーターが表示されます！</p>
        </div>
      )}

      <p className="text-center text-xs font-bold text-slate-400 mt-4">
        現在のモード: {currentProfile?.display_name || (currentUser === 'user_a' ? 'ママ' : 'パパ')}データ 🚀
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
