"use client";

export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, User, RefreshCw, CalendarDays, TrendingUp, LogOut, ChevronDown, ChevronUp, Repeat2, Bell, X, Eye, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DataErrorCard } from '../components/data-error-card';
import { parseHouseholdUser, type HouseholdUser } from '../lib/household-users';
import type { Category, TransactionWithCategory } from '../lib/database-helpers';
import { useCurrentProfileId, useHouseholdProfiles } from '../lib/household-profiles';
import { userErrorMessage } from '../lib/user-errors';
import { TransactionCalendar } from '../components/transaction-calendar';
import { AmountCalculator } from '../components/amount-calculator';
import { useConfirm } from '../components/mobile-ui';

type BudgetSummaryItem = Category & {
  actual: number;
  budget: number;
  carryover: number;
};
type HouseholdAlert = { key: string; message: string };

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const requestedUser = parseHouseholdUser(searchParams.get('user'));
  const [selectedUser, setSelectedUser] = useState<HouseholdUser | null>(null);
  const currentUser = selectedUser || requestedUser;
  const profiles = useHouseholdProfiles();
  const ownProfileId = useCurrentProfileId();
  const currentProfile = profiles.find((profile) => profile.profile_id === currentUser);
  const canEdit = ownProfileId === currentUser;
  const confirmAction = useConfirm();

  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [totalFixedExpense, setTotalFixedExpense] = useState<number>(0);
  const [totalCarryover, setTotalCarryover] = useState<number>(0);
  const [totalBudgetOffset, setTotalBudgetOffset] = useState<number>(0);
  const [hasBudget, setHasBudget] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryItem[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [alerts, setAlerts] = useState<HouseholdAlert[]>([]);
  const [dismissingAlertKey, setDismissingAlertKey] = useState<string | null>(null);
  const [calendarTransactions, setCalendarTransactions] = useState<TransactionWithCategory[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [isUpdatingTransaction, setIsUpdatingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

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
        const generateResult = await supabase.rpc('generate_recurring_transactions', { target_user_id: currentUser, target_month: startOfMonth });
        if (ignore) return;
        if (generateResult.error) {
          setDataError('定期取引の反映に失敗しました。通信状況を確認して、もう一度お試しください。');
          setLoading(false);
          return;
        }
      }

      const [categoryResult, transactionResult, budgetResult, previousTransactionResult, dismissedAlertResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase
          .from('transactions')
          .select('*, categories!transactions_category_id_fkey(name, type, icon)')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth)
          .order('date', { ascending: false }),
        supabase.rpc('get_effective_budgets', {
          target_user_id: currentUser,
          target_month: startOfMonth,
        }),
        supabase.from('transactions').select('amount, category_id, type').eq('user_id', currentUser).gte('date', `${previousMonth}-01`).lte('date', previousEnd),
        supabase.from('dismissed_alerts').select('alert_key').eq('user_id', currentUser),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error || budgetResult.error || previousTransactionResult.error || dismissedAlertResult.error;
      if (error) {
        setDataError('ホーム画面のデータ取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
        return;
      }

      setCurrentDay(todayNum);
      setDaysInMonth(lastDay);
      setRemainingDays(remDays > 0 ? remDays : 1);
      const currentTransactions = transactionResult.data || [];
      setCategories(categoryResult.data || []);
      setCalendarTransactions(currentTransactions as TransactionWithCategory[]);
      setSelectedCalendarDate(localDateString(now));
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
      const expenseBudgets = (budgetResult.data || []).filter((item) => item.category_type === 'expense');
      const totalCarryoverAmount = expenseBudgets.reduce((sum, item) => sum + Number(item.carryover_amount), 0);
      setTotalExpense(
        currentTransactions
          .filter((item) => item.type === 'expense')
          .reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalFixedExpense(
        currentTransactions
          .filter((item) => item.type === 'expense' && item.recurring_transaction_id !== null)
          .reduce((sum, item) => sum + Number(item.amount), 0)
      );
      setTotalBudget(
        // 収入予算は目標額であり、支出可能額ではないため合計から除外する。
        expenseBudgets.reduce((sum, item) => sum + Number(item.base_amount), 0) + totalCarryoverAmount + normalBudgetOffsetTotal
      );
      setTotalBudgetOffset(normalBudgetOffsetTotal);
      setTotalCarryover(totalCarryoverAmount);
      setHasBudget(
        expenseBudgets.some(
          (item) =>
            Number(item.base_amount) !== 0 || Number(item.carryover_amount) !== 0
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
              budget: Number(effectiveBudget?.base_amount || 0) + categoryBudgetOffset,
              carryover: 0,
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
        const budget = Number((budgetResult.data || []).find((item) => item.category_id === category.id)?.base_amount || 0) + (categoryBudgetOffsetMap.get(category.id) || 0);
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
    const currentIndex = profiles.findIndex((profile) => profile.profile_id === currentUser);
    const nextProfile = profiles[currentIndex >= 0 ? (currentIndex + 1) % profiles.length : 0];
    const nextUser = parseHouseholdUser(nextProfile?.profile_id || null);
    if (nextUser === currentUser) return;
    setLoading(true);
    setDataError(null);
    setSelectedUser(nextUser);
    window.history.replaceState(null, '', `/?user=${nextUser}`);
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

  const refreshHomeData = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const handleUpdateTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isUpdatingTransaction || !editingTransaction || !canEdit) return;

    const selectedCategory = categories.find((category) => category.id === editingTransaction.category_id);
    if (!selectedCategory) return;

    const parsedAmount = Number(editingTransaction.amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }

    setIsUpdatingTransaction(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          amount: parsedAmount,
          description: editingTransaction.description,
          category_id: editingTransaction.category_id,
          type: selectedCategory.type,
          budget_offset_type: selectedCategory.type === 'income' ? editingTransaction.budget_offset_type : 'none',
          budget_offset_category_id: selectedCategory.type === 'income' ? editingTransaction.budget_offset_category_id : null,
        })
        .eq('id', editingTransaction.id);

      if (error) {
        alert(userErrorMessage('修正', error));
        return;
      }
      setEditingTransaction(null);
      refreshHomeData();
    } catch {
      alert('修正に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsUpdatingTransaction(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (deletingTransactionId || !canEdit) return;
    if (!await confirmAction('この記録を削除しますか？')) return;

    setDeletingTransactionId(id);
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) {
        alert(userErrorMessage('削除', error));
        return;
      }
      setEditingTransaction(null);
      refreshHomeData();
    } catch {
      alert('削除に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const remainingBudget = totalBudget - totalExpense;
  const isOverBudget = remainingBudget < 0;
  const currentMonthDate = new Date();
  const todayStr = localDateString(currentMonthDate);

  // 固定費は月内の発生日に左右されるため、消化ペースは変動費だけで見る。
  const variableExpense = totalExpense - totalFixedExpense;
  const variableBudget = Math.max(totalBudget - totalFixedExpense, 0);
  const variableRemainingBudget = variableBudget - variableExpense;
  const isVariableOverBudget = variableRemainingBudget < 0;
  const dailyRemaining = !isVariableOverBudget ? Math.floor(variableRemainingBudget / remainingDays) : 0;
  const idealRemaining = Math.floor(variableBudget * (remainingDays / daysInMonth));
  const isSimulationOk = variableRemainingBudget >= idealRemaining;
  const simulationDiff = Math.abs(variableRemainingBudget - idealRemaining);

  return (
    <div className="relative flex flex-col gap-6 overflow-hidden bg-[#fff36d] px-4 py-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 top-20 h-40 w-40 rounded-[45%] bg-pink-400" />
      <div aria-hidden="true" className="pointer-events-none absolute left-4 top-28 h-20 w-32 rotate-[-12deg] rounded-[50%] bg-white" />
      <div aria-hidden="true" className="pointer-events-none absolute right-4 top-48 h-24 w-32 rotate-[10deg] rounded-[45%] bg-cyan-200" />
      <div aria-hidden="true" className="pointer-events-none absolute left-2 top-3 text-4xl font-black text-pink-500">+</div>
      <div aria-hidden="true" className="pointer-events-none absolute right-8 top-7 text-5xl font-black text-slate-900">♡</div>
      {/* ヘッダーとアカウント操作 */}
      <div className="relative z-10 flex items-center justify-between pt-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-pink-700 bg-white px-2.5 py-1 rounded-full flex items-center gap-1 w-max border-2 border-pink-300">
            <Sparkles className="w-3 h-3" /> Easy & Pop
          </span>
          <h1 className="text-3xl font-black mt-1 tracking-tight">
            ぽっぷ<span className="text-pink-500">家計簿</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="ログアウト"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-slate-900 bg-white text-slate-700 shadow-[2px_2px_0px_0px_rgba(236,72,153,1)] disabled:opacity-60"
          >
            {isSigningOut
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <LogOut className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleUser}
            disabled={profiles.length < 2}
            className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-2xl border-2 border-slate-900 font-black text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(15,23,42,1)] transition-all
              ${currentUser === 'user_a' ? 'bg-cyan-200' : 'bg-pink-200'}`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{currentProfile?.icon} {currentProfile?.display_name || (currentUser === 'user_a' ? 'ママ' : 'パパ')}</span>
            {profiles.length > 1 && <RefreshCw className="w-3 h-3 text-slate-500 ml-0.5" />}
          </button>
        </div>
      </div>

      {dataError && <DataErrorCard message={dataError} onRetry={retryFetch} />}
      {ownProfileId !== undefined && !canEdit && <p className="relative z-10 flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800"><Eye className="h-4 w-4 shrink-0" />このプロフィールは参照モードです。変更は本人のログインで行ってください。</p>}

      {!loading && alerts.length > 0 && <section className="relative z-10 flex flex-col gap-2 rounded-3xl border-2 border-slate-800 bg-orange-50 p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"><h2 className="flex items-center gap-2 text-sm font-black text-orange-800"><Bell className="h-5 w-5" />家計アラート</h2>{alerts.map((item) => <div key={item.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-orange-700"><span className="min-w-0 flex-1">・{item.message}</span>{canEdit && <button type="button" onClick={() => dismissAlert(item)} disabled={dismissingAlertKey !== null} aria-label={`${item.message}を削除`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 disabled:opacity-50">{dismissingAlertKey === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</button>}</div>)}</section>}

      {/* 押下するとカテゴリ別の支出予算案内を展開する。 */}
      {!dataError && (
        <div className="relative z-10 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setIsSummaryOpen((current) => !current)}
            aria-expanded={isSummaryOpen}
            className="w-full text-left bg-pink-100 border-2 border-slate-900 rounded-3xl p-5 shadow-[5px_5px_0px_0px_rgba(34,211,238,1)] flex items-center justify-between gap-3"
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
                      <span className="text-[10px] font-black bg-yellow-200 text-slate-700 px-2 py-0.5 rounded-full border border-slate-400">
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
          <div className={`border-2 border-slate-900 rounded-3xl p-5 shadow-[5px_5px_0px_0px_rgba(236,72,153,1)] flex flex-col gap-3 transition-all ${
            isOverBudget ? 'bg-pink-100' : 'bg-cyan-100'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-slate-700">当月予算: ¥{totalBudget.toLocaleString()}</span>
                {totalCarryover !== 0 && (
                  <span className={`text-[10px] font-black ${totalCarryover > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    TOTAL繰越: {totalCarryover > 0 ? '+' : ''}¥{totalCarryover.toLocaleString()}
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

            {!isVariableOverBudget && (
              <div className="bg-white/80 border-2 border-dashed border-slate-700 rounded-2xl p-2.5 flex items-center justify-between text-xs mt-1">
                <span className="font-bold text-slate-600 flex items-center gap-1">
                  <CalendarDays className="w-4 h-4 text-slate-700" /> 変動費の日当たり目安:
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

          {/* 当月の記録カレンダー */}
          <TransactionCalendar
            currentDate={currentMonthDate}
            transactions={calendarTransactions}
            todayStr={todayStr}
            selectedDate={selectedCalendarDate}
            onSelectDate={setSelectedCalendarDate}
            onTransactionClick={canEdit ? setEditingTransaction : undefined}
          />

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
                <span>固定費を除いた変動費予算:</span>
                <span className="font-bold text-slate-800">¥{variableBudget.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>今月の変動費実績:</span>
                <span className="font-bold text-slate-800">¥{variableExpense.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>現在（{currentDay}日目）の理想の残り変動費:</span>
                <span className="font-bold text-slate-800">¥{idealRemaining.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 mt-1 font-bold">
                <span>結果・診断:</span>
                <span className={isSimulationOk ? 'text-indigo-600' : 'text-orange-600'}>
                  {isSimulationOk 
                    ? `理想より ¥${simulationDiff.toLocaleString()} 多く変動費を残せています！`
                    : `理想より ¥${simulationDiff.toLocaleString()} 変動費のペースが早いです！`
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

      {editingTransaction && (
        <div onClick={() => setEditingTransaction(null)} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div onClick={(event) => event.stopPropagation()} className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl">
            <div className="flex items-center justify-between border-b-2 border-slate-800 bg-amber-100 p-4">
              <span className="text-base font-black text-slate-800">
                {editingTransaction.date.slice(5).replace('-', '月')}日 の記録
              </span>
              <button type="button" onClick={() => setEditingTransaction(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white">
                <X className="h-4 w-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            <div className="flex max-h-[calc(90dvh-76px)] flex-col gap-4 overflow-y-auto p-4">
              <form onSubmit={handleUpdateTransaction} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">分類</label>
                  <select
                    value={editingTransaction.category_id}
                    onChange={(event) => setEditingTransaction({ ...editingTransaction, category_id: event.target.value })}
                    className="min-h-12 w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-base font-bold"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.icon || (category.type === 'expense' ? '💸' : '💰')} {category.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">いくら？</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editingTransaction.amount}
                      onChange={(event) => setEditingTransaction({ ...editingTransaction, amount: Number(event.target.value) })}
                      className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-black"
                    />
                    <AmountCalculator value={editingTransaction.amount} min={1} onApply={(result) => setEditingTransaction({ ...editingTransaction, amount: result })} disabled={isUpdatingTransaction} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">メモ</label>
                  <input
                    type="text"
                    value={editingTransaction.description}
                    maxLength={500}
                    onChange={(event) => setEditingTransaction({ ...editingTransaction, description: event.target.value })}
                    className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-bold"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setEditingTransaction(null)} className="min-h-12 flex-1 rounded-xl border-2 border-slate-800 bg-slate-100 py-2.5 text-sm font-black">
                    戻る
                  </button>
                  <button type="submit" disabled={isUpdatingTransaction} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-800 bg-slate-900 py-2.5 text-sm font-black text-white disabled:opacity-60">
                    {isUpdatingTransaction
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中...</>
                      : '変更を保存する！'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteTransaction(editingTransaction.id)}
                  disabled={deletingTransactionId !== null || isUpdatingTransaction}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 text-sm font-black text-rose-600 disabled:opacity-50"
                >
                  {deletingTransactionId === editingTransaction.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                  この記録を削除する
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
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
