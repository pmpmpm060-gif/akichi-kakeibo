"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Budget, Category, Transaction } from '../../lib/database-helpers';
import { useHorizontalSwipe } from '../../components/mobile-ui';
import { AppHeader } from '../../components/mobile-ui';

type ReportTransaction = Pick<Transaction, 'id' | 'amount' | 'budget_offset_category_id' | 'budget_offset_type' | 'category_id' | 'date' | 'type' | 'recurring_transaction_id'>;
const PAGE_SIZE = 1000;

async function fetchReportTransactions(currentUser: string, reportStart: string, reportEnd: string) {
  const rows: ReportTransaction[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase.from('transactions')
      .select('id, amount, budget_offset_category_id, budget_offset_type, category_id, date, type, recurring_transaction_id')
      .eq('user_id', currentUser)
      .is('deleted_at', null)
      .gte('date', reportStart)
      .lte('date', reportEnd)
      .order('date')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
    if ((result.data?.length || 0) < PAGE_SIZE) return { data: rows, error: null };
  }
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(startMonth: string, endMonth: string) {
  const [startYear, startMonthIndex] = startMonth.split('-').map(Number);
  const [endYear, endMonthIndex] = endMonth.split('-').map(Number);
  return (endYear - startYear) * 12 + (endMonthIndex - startMonthIndex);
}

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Pick<Budget, 'category_id' | 'amount'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [reportMode, setReportMode] = useState<'monthly' | 'yearly'>('monthly');
  const [includeFixedExpenses, setIncludeFixedExpenses] = useState(false);

  const currentMonth = monthKey(selectedDate);
  const previousDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
  const previousMonth = monthKey(previousDate);
  const reportStart = `${selectedDate.getFullYear() - 1}-12-01`;
  const reportEnd = `${selectedDate.getFullYear()}-12-31`;

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      const [categoryResult, budgetSettingResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase.from('budgets').select('category_id, amount').eq('user_id', currentUser),
      ]);
      if (ignore) return;
      const carryoverStart = (categoryResult.data || [])
        .filter((category) => category.type === 'expense' && category.deleted_at === null && category.carryover_enabled && category.carryover_start_month)
        .map((category) => category.carryover_start_month || '')
        .sort()[0];
      const transactionStart = carryoverStart && carryoverStart < reportStart ? carryoverStart : reportStart;
      const transactionResult = await fetchReportTransactions(currentUser, transactionStart, reportEnd);
      if (ignore) return;
      const error = transactionResult.error || categoryResult.error || budgetSettingResult.error;
      if (error) setDataError('レポートの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
      else {
        setTransactions(transactionResult.data || []);
        setCategories(categoryResult.data || []);
        setBudgets(budgetSettingResult.data || []);
      }
      setLoading(false);
    };
    void fetchData().catch(() => {
      if (!ignore) {
        setDataError('レポートの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
      }
    });
    return () => { ignore = true; };
  }, [currentMonth, currentUser, reportEnd, reportStart, retryKey]);

  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonth));
  const previousTransactions = transactions.filter((transaction) => transaction.date.startsWith(previousMonth));
  const currentIncome = monthTransactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0);
  const currentExpense = monthTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const incomeBudgetOffsets = monthTransactions.filter((transaction) => transaction.type === 'income' && transaction.budget_offset_type !== 'none');
  const monthlyBudgetOffset = incomeBudgetOffsets.reduce((sum, transaction) => sum + transaction.amount, 0);
  const activeExpenseCategories = categories.filter((category) => category.type === 'expense' && category.deleted_at === null);
  const budgetAmountByCategory = new Map(budgets.map((budget) => [budget.category_id, Number(budget.amount)]));
  const calculateCarryover = (targetMonth: string) => {
    const targetMonthStart = `${targetMonth}-01`;
    return activeExpenseCategories.reduce(
      (summary, category) => {
        const carryoverStartMonth = category.carryover_start_month;
        if (!category.carryover_enabled || !carryoverStartMonth || carryoverStartMonth >= targetMonthStart) return summary;

        const categoryBudget = budgetAmountByCategory.get(category.id) || 0;
        const budgetMonths = monthDiff(carryoverStartMonth.slice(0, 7), targetMonth);
        const budgetTotal = categoryBudget * budgetMonths;
        const spentTotal = transactions
          .filter((transaction) =>
            transaction.category_id === category.id
            && transaction.type === 'expense'
            && transaction.date >= carryoverStartMonth
            && transaction.date < targetMonthStart
          )
          .reduce((sum, transaction) => sum + transaction.amount, 0);

        return {
          budgetTotal: summary.budgetTotal + budgetTotal,
          spentTotal: summary.spentTotal + spentTotal,
          amount: summary.amount + budgetTotal - spentTotal,
          startMonth: summary.startMonth === null || carryoverStartMonth < summary.startMonth ? carryoverStartMonth : summary.startMonth,
        };
      },
      { budgetTotal: 0, spentTotal: 0, amount: 0, startMonth: null as string | null }
    );
  };
  const previousCarryover = calculateCarryover(previousMonth);
  const currentCarryover = calculateCarryover(currentMonth);
  const monthlyBaseBudget = activeExpenseCategories.reduce((sum, category) => sum + (budgetAmountByCategory.get(category.id) || 0), 0);
  const monthlyCarryover = currentCarryover.amount;
  const monthlyTotalBudget = monthlyBaseBudget + monthlyCarryover + monthlyBudgetOffset;
  const hasMonthlyBudget = monthlyBaseBudget !== 0 || monthlyCarryover !== 0 || monthlyBudgetOffset !== 0 || previousCarryover.amount !== 0;
  const previousExpense = previousTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenseDifference = currentExpense - previousExpense;
  const expenseChangePercent = previousExpense > 0 ? Math.round((expenseDifference / previousExpense) * 100) : null;
  const rankingTransactions = includeFixedExpenses
    ? transactions
    : transactions.filter((transaction) => transaction.recurring_transaction_id === null);
  const rankingMonthTransactions = rankingTransactions.filter((transaction) => transaction.date.startsWith(currentMonth));
  const rankingPreviousTransactions = rankingTransactions.filter((transaction) => transaction.date.startsWith(previousMonth));
  const monthlyFixedExpense = monthTransactions
    .filter((transaction) => transaction.type === 'expense' && transaction.recurring_transaction_id !== null)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const yearlyFixedExpense = transactions
    .filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.type === 'expense' && transaction.recurring_transaction_id !== null)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const yearlyIncome = transactions
    .filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const yearlyExpense = transactions
    .filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const categoryRanking = categories
    .filter((category) => category.type === 'expense')
    .map((category) => {
      const current = rankingMonthTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      const previous = rankingPreviousTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      return { ...category, current, previous, difference: current - previous };
    })
    .filter((category) => category.current > 0 || category.previous > 0)
    .sort((left, right) => right.current - left.current);
  const yearlyCategoryRanking = categories.filter((category) => category.type === 'expense').map((category) => ({
    ...category,
    total: rankingTransactions.filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
  })).filter((category) => category.total > 0).sort((left, right) => right.total - left.total);

  const changeMonth = (increment: number) => {
    setLoading(true);
    setDataError(null);
    setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth() + increment, 1));
  };
  const reportSwipe = useHorizontalSwipe(
    () => changeMonth(reportMode === 'monthly' ? -1 : -12),
    () => changeMonth(reportMode === 'monthly' ? 1 : 12)
  );
  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="家計レポート" currentUser={currentUser} subtitle={`${currentMonth.replace('-', '年')}月`} />
      <div className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-slate-800 bg-slate-100 p-1">
        <button onClick={() => setReportMode('monthly')} className={`min-h-11 rounded-xl text-sm font-black ${reportMode === 'monthly' ? 'bg-white shadow' : 'text-slate-500'}`}>月別</button>
        <button onClick={() => setReportMode('yearly')} className={`min-h-11 rounded-xl text-sm font-black ${reportMode === 'yearly' ? 'bg-white shadow' : 'text-slate-500'}`}>年間</button>
      </div>
      <div {...reportSwipe} className="flex items-center justify-between rounded-2xl border-2 border-slate-800 bg-indigo-50 p-2">
        <button onClick={() => changeMonth(reportMode === 'monthly' ? -1 : -12)} className="flex min-h-11 min-w-11 items-center justify-center"><ChevronLeft /></button>
        <span className="font-black">{reportMode === 'monthly' ? `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月` : `${selectedDate.getFullYear()}年`}</span>
        <button onClick={() => changeMonth(reportMode === 'monthly' ? 1 : 12)} className="flex min-h-11 min-w-11 items-center justify-center"><ChevronRight /></button>
      </div>
      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" /> : dataError ? (
        <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((current) => current + 1); }} />
      ) : reportMode === 'monthly' ? <>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-slate-800 bg-emerald-50 p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <p className="flex items-center gap-1 text-xs font-black text-emerald-700"><ArrowUpRight className="h-4 w-4" />対象月の収入</p>
            <p className="mt-2 text-lg font-black">¥{currentIncome.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border-2 border-slate-800 bg-rose-50 p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <p className="flex items-center gap-1 text-xs font-black text-rose-600"><ArrowDownRight className="h-4 w-4" />対象月の支出</p>
            <p className="mt-2 text-lg font-black">¥{currentExpense.toLocaleString()}</p>
          </div>
          {hasMonthlyBudget && (
            <div className="col-span-2 grid grid-cols-2 gap-2 rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">支出基本予算</p>
                <p className="mt-1 text-sm font-black">¥{monthlyBaseBudget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">繰越込み予算</p>
                <p className="mt-1 text-sm font-black text-slate-900">¥{monthlyTotalBudget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">前月のTOTAL繰越</p>
                <p className={`mt-1 text-sm font-black ${previousCarryover.amount >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{previousCarryover.amount > 0 ? '+' : ''}¥{previousCarryover.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">当月のTOTAL繰越</p>
                <p className={`mt-1 text-sm font-black ${monthlyCarryover >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{monthlyCarryover > 0 ? '+' : ''}¥{monthlyCarryover.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">臨時収入上乗せ</p>
                <p className="mt-1 text-sm font-black text-emerald-700">+¥{monthlyBudgetOffset.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">繰越開始</p>
                <p className="mt-1 text-sm font-black text-slate-700">{currentCarryover.startMonth?.slice(0, 7).replace('-', '年') || '未設定'}{currentCarryover.startMonth ? '月' : ''}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">当月繰越の根拠</p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs font-bold text-slate-600 sm:grid-cols-3">
                  <span>予算累計: ¥{currentCarryover.budgetTotal.toLocaleString()}</span>
                  <span>支出累計: ¥{currentCarryover.spentTotal.toLocaleString()}</span>
                  <span className={monthlyCarryover >= 0 ? 'text-emerald-700' : 'text-rose-600'}>差額: {monthlyCarryover > 0 ? '+' : ''}¥{monthlyCarryover.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={`rounded-3xl border-2 border-slate-800 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] ${expenseDifference <= 0 ? 'bg-sky-50' : 'bg-orange-50'}`}>
          <p className="flex items-center gap-2 text-sm font-black">{expenseDifference <= 0 ? <TrendingDown className="h-5 w-5 text-sky-600" /> : <TrendingUp className="h-5 w-5 text-orange-600" />}前月との支出比較</p>
          <p className="mt-2 text-2xl font-black">{expenseDifference > 0 ? '+' : expenseDifference < 0 ? '-' : ''}¥{Math.abs(expenseDifference).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500">{expenseChangePercent === null ? '前月の支出データがありません' : `前月比 ${expenseChangePercent > 0 ? '+' : ''}${expenseChangePercent}%`}</p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-black">{includeFixedExpenses ? 'カテゴリ別支出ランキング' : '見直せる支出ランキング'}</h2><p className="text-[10px] font-bold text-slate-500">{includeFixedExpenses ? '定期取引から生成された固定費を含みます' : `固定費 ¥${monthlyFixedExpense.toLocaleString()} を除外中`}</p></div><button type="button" onClick={() => setIncludeFixedExpenses((current) => !current)} className="min-h-11 shrink-0 rounded-xl border-2 border-slate-800 bg-sky-100 px-3 text-xs font-black">{includeFixedExpenses ? '固定費を除く' : '全支出を見る'}</button></div>
          {categoryRanking.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">比較できる支出はありません。</p> : categoryRanking.map((category, index) => (
            <article key={category.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="min-w-0"><p className="truncate text-sm font-black">{index + 1}. {category.icon} {category.name}</p><p className={`text-[10px] font-black ${category.difference > 0 ? 'text-orange-600' : 'text-sky-600'}`}>前月より {category.difference > 0 ? '+' : category.difference < 0 ? '-' : ''}¥{Math.abs(category.difference).toLocaleString()}</p></div>
              <p className="shrink-0 text-sm font-black text-rose-600">¥{category.current.toLocaleString()}</p>
            </article>
          ))}
        </section>
      </> : <>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-slate-800 bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-700">年間収入</p><p className="mt-2 text-lg font-black">¥{yearlyIncome.toLocaleString()}</p></div>
          <div className="rounded-2xl border-2 border-slate-800 bg-rose-50 p-3"><p className="text-xs font-black text-rose-600">年間支出</p><p className="mt-2 text-lg font-black">¥{yearlyExpense.toLocaleString()}</p></div>
        </section>
        <section className="rounded-3xl border-2 border-slate-800 bg-amber-50 p-4"><p className="text-sm font-black">月平均支出</p><p className="mt-2 text-2xl font-black">¥{Math.round(yearlyExpense / 12).toLocaleString()}</p><p className="text-xs font-bold text-slate-500">年間収支 ¥{(yearlyIncome - yearlyExpense).toLocaleString()}</p></section>
        <section className="flex flex-col gap-3"><div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-black">{includeFixedExpenses ? '年間カテゴリランキング' : '年間の見直せる支出ランキング'}</h2><p className="text-[10px] font-bold text-slate-500">{includeFixedExpenses ? '定期取引から生成された固定費を含みます' : `固定費 ¥${yearlyFixedExpense.toLocaleString()} を除外中`}</p></div><button type="button" onClick={() => setIncludeFixedExpenses((current) => !current)} className="min-h-11 shrink-0 rounded-xl border-2 border-slate-800 bg-sky-100 px-3 text-xs font-black">{includeFixedExpenses ? '固定費を除く' : '全支出を見る'}</button></div>{yearlyCategoryRanking.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">対象となる支出はありません。</p> : yearlyCategoryRanking.map((category, index) => <article key={category.id} className="flex justify-between rounded-2xl border-2 border-slate-800 bg-white p-3"><p className="text-sm font-black">{index + 1}. {category.icon} {category.name}</p><p className="text-sm font-black text-rose-600">¥{category.total.toLocaleString()}</p></article>)}</section>
      </>}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<div className="p-6 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><ReportsPageContent /></Suspense>;
}
