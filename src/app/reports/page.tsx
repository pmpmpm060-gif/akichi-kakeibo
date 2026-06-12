"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, BarChart3, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category, Transaction } from '../../lib/database-helpers';

type ReportTransaction = Pick<Transaction, 'amount' | 'category_id' | 'date' | 'type'>;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const now = useMemo(() => new Date(), []);
  const currentMonth = monthKey(now);
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKey(previousDate);
  const firstReportDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const reportStart = `${monthKey(firstReportDate)}-01`;
  const reportEnd = `${currentMonth}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      const [transactionResult, categoryResult] = await Promise.all([
        supabase.from('transactions').select('amount, category_id, date, type').eq('user_id', currentUser).gte('date', reportStart).lte('date', reportEnd),
        supabase.from('categories').select('*').eq('user_id', currentUser),
      ]);
      if (ignore) return;
      const error = transactionResult.error || categoryResult.error;
      if (error) setDataError(error.message);
      else {
        setTransactions(transactionResult.data || []);
        setCategories(categoryResult.data || []);
      }
      setLoading(false);
    };
    void fetchData();
    return () => { ignore = true; };
  }, [currentUser, reportEnd, reportStart, retryKey]);

  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonth));
  const previousTransactions = transactions.filter((transaction) => transaction.date.startsWith(previousMonth));
  const currentIncome = monthTransactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0);
  const currentExpense = monthTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousExpense = previousTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenseDifference = currentExpense - previousExpense;
  const expenseChangePercent = previousExpense > 0 ? Math.round((expenseDifference / previousExpense) * 100) : null;

  const categoryRanking = categories
    .filter((category) => category.type === 'expense')
    .map((category) => {
      const current = monthTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      const previous = previousTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      return { ...category, current, previous, difference: current - previous };
    })
    .filter((category) => category.current > 0 || category.previous > 0)
    .sort((left, right) => right.current - left.current);

  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    const targets = transactions.filter((transaction) => transaction.date.startsWith(key));
    return {
      key,
      label: `${date.getMonth() + 1}月`,
      income: targets.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0),
      expense: targets.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
    };
  });
  const maxTrendAmount = Math.max(1, ...monthlyTrend.flatMap((month) => [month.income, month.expense]));

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <header className="flex items-center gap-3 pt-2">
        <Link href={`/?user=${currentUser}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-slate-800 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div><p className="text-xs font-black text-slate-400">{currentMonth.replace('-', '年')}月</p><h1 className="text-2xl font-black">月次レポート</h1></div>
      </header>

      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" /> : dataError ? (
        <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((current) => current + 1); }} />
      ) : <>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-slate-800 bg-emerald-50 p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <p className="flex items-center gap-1 text-xs font-black text-emerald-700"><ArrowUpRight className="h-4 w-4" />今月の収入</p>
            <p className="mt-2 text-lg font-black">¥{currentIncome.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border-2 border-slate-800 bg-rose-50 p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <p className="flex items-center gap-1 text-xs font-black text-rose-600"><ArrowDownRight className="h-4 w-4" />今月の支出</p>
            <p className="mt-2 text-lg font-black">¥{currentExpense.toLocaleString()}</p>
          </div>
        </section>

        <section className={`rounded-3xl border-2 border-slate-800 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] ${expenseDifference <= 0 ? 'bg-sky-50' : 'bg-orange-50'}`}>
          <p className="flex items-center gap-2 text-sm font-black">{expenseDifference <= 0 ? <TrendingDown className="h-5 w-5 text-sky-600" /> : <TrendingUp className="h-5 w-5 text-orange-600" />}前月との支出比較</p>
          <p className="mt-2 text-2xl font-black">{expenseDifference > 0 ? '+' : expenseDifference < 0 ? '-' : ''}¥{Math.abs(expenseDifference).toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-500">{expenseChangePercent === null ? '前月の支出データがありません' : `前月比 ${expenseChangePercent > 0 ? '+' : ''}${expenseChangePercent}%`}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black"><BarChart3 className="h-5 w-5" />過去6か月の推移</h2>
          <div className="flex h-48 items-end justify-between gap-2 rounded-3xl border-2 border-slate-800 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            {monthlyTrend.map((month) => (
              <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div title={`収入 ¥${month.income.toLocaleString()}`} className="w-2.5 rounded-t bg-emerald-400" style={{ height: `${Math.max(2, (month.income / maxTrendAmount) * 100)}%` }} />
                  <div title={`支出 ¥${month.expense.toLocaleString()}`} className="w-2.5 rounded-t bg-rose-400" style={{ height: `${Math.max(2, (month.expense / maxTrendAmount) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-black text-slate-500">{month.label}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] font-bold text-slate-500"><span className="text-emerald-600">■ 収入</span>　<span className="text-rose-500">■ 支出</span></p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-black">カテゴリ別支出ランキング</h2>
          {categoryRanking.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">比較できる支出はありません。</p> : categoryRanking.map((category, index) => (
            <article key={category.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="min-w-0"><p className="truncate text-sm font-black">{index + 1}. {category.icon} {category.name}</p><p className={`text-[10px] font-black ${category.difference > 0 ? 'text-orange-600' : 'text-sky-600'}`}>前月より {category.difference > 0 ? '+' : category.difference < 0 ? '-' : ''}¥{Math.abs(category.difference).toLocaleString()}</p></div>
              <p className="shrink-0 text-sm font-black text-rose-600">¥{category.current.toLocaleString()}</p>
            </article>
          ))}
        </section>
      </>}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<div className="p-6 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><ReportsPageContent /></Suspense>;
}
