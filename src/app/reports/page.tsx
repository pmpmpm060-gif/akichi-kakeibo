"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, BarChart3, Bookmark, ChevronLeft, ChevronRight, Loader2, Save, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category, Transaction } from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';
import { useHorizontalSwipe } from '../../components/mobile-ui';
import { AppHeader } from '../../components/mobile-ui';
import { userErrorMessage } from '../../lib/user-errors';

type ReportTransaction = Pick<Transaction, 'id' | 'amount' | 'category_id' | 'date' | 'type' | 'recurring_transaction_id'>;
type TagRow = Database['public']['Tables']['tags']['Row'];
type SavedFilter = Database['public']['Tables']['saved_filters']['Row'];
const PAGE_SIZE = 1000;

async function fetchReportTransactions(currentUser: string, reportStart: string, reportEnd: string) {
  const rows: ReportTransaction[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase.from('transactions')
      .select('id, amount, category_id, date, type, recurring_transaction_id')
      .eq('user_id', currentUser)
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

function compactYen(amount: number) {
  if (amount >= 10_000) return `${Math.round(amount / 10_000)}万`;
  return amount.toLocaleString();
}

function chartLinePath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function chartAreaPath(points: { x: number; y: number }[], bottom: number) {
  if (points.length === 0) return '';
  return `${chartLinePath(points)} L ${points.at(-1)!.x} ${bottom} L ${points[0].x} ${bottom} Z`;
}

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [reportMode, setReportMode] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [transactionTagMap, setTransactionTagMap] = useState<Record<string, string[]>>({});
  const [monthlyReview, setMonthlyReview] = useState('');
  const [savedReports, setSavedReports] = useState<SavedFilter[]>([]);
  const [savingReview, setSavingReview] = useState(false);
  const [includeFixedExpenses, setIncludeFixedExpenses] = useState(false);

  const currentMonth = monthKey(selectedDate);
  const previousDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
  const previousMonth = monthKey(previousDate);
  const reportStart = `${selectedDate.getFullYear() - 1}-12-01`;
  const reportEnd = `${selectedDate.getFullYear()}-12-31`;

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      const [transactionResult, categoryResult, tagResult, transactionTagResult, reviewResult, savedReportResult] = await Promise.all([
        fetchReportTransactions(currentUser, reportStart, reportEnd),
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase.from('tags').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('transaction_tags')
          .select('transaction_id, tag_id, transactions!inner(user_id, date)')
          .eq('transactions.user_id', currentUser)
          .gte('transactions.date', reportStart)
          .lte('transactions.date', reportEnd),
        supabase.from('monthly_reviews').select('content').eq('user_id', currentUser).eq('month', `${currentMonth}-01`).maybeSingle(),
        supabase.from('saved_filters').select('*').eq('user_id', currentUser).eq('filter_type', 'reports').order('created_at'),
      ]);
      if (ignore) return;
      const error = transactionResult.error || categoryResult.error || tagResult.error || transactionTagResult.error || reviewResult.error || savedReportResult.error;
      if (error) setDataError('レポートの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
      else {
        setTransactions(transactionResult.data || []);
        setCategories(categoryResult.data || []);
        setTags(tagResult.data || []);
        setTransactionTagMap((transactionTagResult.data || []).reduce<Record<string, string[]>>((map, item) => {
          map[item.transaction_id] = [...(map[item.transaction_id] || []), item.tag_id];
          return map;
        }, {}));
        setMonthlyReview(reviewResult.data?.content || '');
        setSavedReports(savedReportResult.data || []);
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

  const categoryRanking = categories
    .filter((category) => category.type === 'expense')
    .map((category) => {
      const current = rankingMonthTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      const previous = rankingPreviousTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      return { ...category, current, previous, difference: current - previous };
    })
    .filter((category) => category.current > 0 || category.previous > 0)
    .sort((left, right) => right.current - left.current);

  const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(selectedDate.getFullYear(), index, 1);
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
  const yearlyIncome = monthlyTrend.reduce((sum, month) => sum + month.income, 0);
  const yearlyExpense = monthlyTrend.reduce((sum, month) => sum + month.expense, 0);
  const activeTrend = monthlyTrend.find((month) => month.key === selectedTrendKey)
    || monthlyTrend.find((month) => month.key === currentMonth)
    || monthlyTrend[0];
  const chartWidth = 360;
  const chartHeight = 176;
  const chartTop = 14;
  const chartBottom = 158;
  const chartX = (index: number) => 12 + index * ((chartWidth - 24) / 11);
  const chartY = (amount: number) => chartTop + (1 - amount / maxTrendAmount) * (chartBottom - chartTop);
  const incomePoints = monthlyTrend.map((month, index) => ({ x: chartX(index), y: chartY(month.income) }));
  const expensePoints = monthlyTrend.map((month, index) => ({ x: chartX(index), y: chartY(month.expense) }));
  const yearlyCategoryRanking = categories.filter((category) => category.type === 'expense').map((category) => ({
    ...category,
    total: rankingTransactions.filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
  })).filter((category) => category.total > 0).sort((left, right) => right.total - left.total);
  const tagRanking = tags.map((tag) => ({
    ...tag,
    total: monthTransactions.filter((transaction) => transaction.type === 'expense' && (transactionTagMap[transaction.id] || []).includes(tag.id)).reduce((sum, transaction) => sum + transaction.amount, 0),
  })).filter((tag) => tag.total > 0).sort((left, right) => right.total - left.total);

  const changeMonth = (increment: number) => {
    setLoading(true);
    setDataError(null);
    setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth() + increment, 1));
  };
  const reportSwipe = useHorizontalSwipe(
    () => changeMonth(reportMode === 'monthly' ? -1 : -12),
    () => changeMonth(reportMode === 'monthly' ? 1 : 12)
  );
  const saveReview = async () => {
    setSavingReview(true);
    try {
      if (monthlyReview.length > 5000) {
        alert('振り返りは5000文字以内で入力してください。');
        return;
      }
      const { error } = await supabase.from('monthly_reviews').upsert({ user_id: currentUser, month: `${currentMonth}-01`, content: monthlyReview }, { onConflict: 'household_id,user_id,month' });
      if (error) alert(userErrorMessage('振り返りの保存', error));
    } catch {
      alert('振り返りの保存に失敗しました。通信状況を確認してください。');
    } finally {
      setSavingReview(false);
    }
  };
  const saveReportCondition = async () => {
    const name = window.prompt('保存するレポート条件の名前を入力してください');
    if (!name?.trim()) return;
    if (name.trim().length > 50) {
      alert('レポート条件の名前は50文字以内で入力してください。');
      return;
    }
    try {
      const { data, error } = await supabase.from('saved_filters').insert({ user_id: currentUser, name: name.trim(), filter_type: 'reports', conditions: { reportMode, currentMonth } }).select().single();
      if (error) alert(userErrorMessage('レポート条件の保存', error));
      else setSavedReports((current) => [...current, data]);
    } catch {
      alert('レポート条件の保存に失敗しました。通信状況を確認してください。');
    }
  };
  const applySavedReport = (filter: SavedFilter) => {
    const conditions = filter.conditions as { reportMode?: 'monthly' | 'yearly'; currentMonth?: string };
    if (conditions.reportMode) setReportMode(conditions.reportMode);
    if (conditions.currentMonth) setSelectedDate(new Date(`${conditions.currentMonth}-01T00:00:00`));
  };

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
      <div className="flex flex-wrap gap-2"><button onClick={saveReportCondition} className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-slate-800 bg-indigo-100 px-3 text-xs font-black"><Bookmark className="h-4 w-4" />現在の表示を保存</button>{savedReports.map((filter) => <button key={filter.id} onClick={() => applySavedReport(filter)} className="min-h-11 rounded-xl border border-slate-400 px-3 text-xs font-black">{filter.name}</button>)}</div>

      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" /> : dataError ? (
        <DataErrorCard message={dataError} onRetry={() => { setLoading(true); setDataError(null); setRetryKey((current) => current + 1); }} />
      ) : reportMode === 'monthly' ? <>
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
          <div className="flex items-end justify-between gap-2"><div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-black"><BarChart3 className="h-5 w-5 text-indigo-500" />{selectedDate.getFullYear()}年の推移</h2><p className="mt-1 text-[10px] font-bold text-slate-500">月をタップすると収支の詳細を確認できます</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${activeTrend.income - activeTrend.expense >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{activeTrend.label} {activeTrend.income - activeTrend.expense >= 0 ? '+' : '-'}¥{compactYen(Math.abs(activeTrend.income - activeTrend.expense))}</span></div>
          <div className="overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-950 shadow-[5px_5px_0px_0px_rgba(15,23,42,1)]">
            <div className="grid grid-cols-3 gap-px bg-white/10">
              <div className="bg-slate-950 p-3"><p className="text-[10px] font-black text-emerald-300">収入</p><p className="mt-1 text-sm font-black text-white">¥{compactYen(activeTrend.income)}</p></div>
              <div className="bg-slate-950 p-3"><p className="text-[10px] font-black text-rose-300">支出</p><p className="mt-1 text-sm font-black text-white">¥{compactYen(activeTrend.expense)}</p></div>
              <div className="bg-slate-950 p-3"><p className="text-[10px] font-black text-indigo-300">収支</p><p className={`mt-1 text-sm font-black ${activeTrend.income - activeTrend.expense >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{activeTrend.income - activeTrend.expense >= 0 ? '+' : '-'}¥{compactYen(Math.abs(activeTrend.income - activeTrend.expense))}</p></div>
            </div>
            <div className="relative px-2 pt-3">
              <span className="absolute left-4 top-4 z-10 rounded-full bg-white/10 px-2 py-1 text-[9px] font-black text-slate-300">最大 ¥{compactYen(maxTrendAmount)}</span>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${selectedDate.getFullYear()}年の収入と支出の推移`} className="h-52 w-full overflow-visible">
                <defs>
                  <linearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity="0.38" /><stop offset="100%" stopColor="#34d399" stopOpacity="0" /></linearGradient>
                  <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb7185" stopOpacity="0.34" /><stop offset="100%" stopColor="#fb7185" stopOpacity="0" /></linearGradient>
                </defs>
                {[0, 1, 2, 3].map((line) => <line key={line} x1="12" x2="348" y1={chartTop + line * 48} y2={chartTop + line * 48} stroke="rgba(255,255,255,0.09)" strokeDasharray="3 5" />)}
                <path d={chartAreaPath(incomePoints, chartBottom)} fill="url(#incomeArea)" />
                <path d={chartAreaPath(expensePoints, chartBottom)} fill="url(#expenseArea)" />
                <path d={chartLinePath(incomePoints)} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={chartLinePath(expensePoints)} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {monthlyTrend.map((month, index) => {
                  const active = month.key === activeTrend.key;
                  return <g key={month.key} onClick={() => setSelectedTrendKey(month.key)} className="cursor-pointer">
                    <rect x={chartX(index) - 13} y="0" width="26" height={chartHeight} fill="transparent" />
                    {active && <line x1={chartX(index)} x2={chartX(index)} y1={chartTop} y2={chartBottom} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />}
                    <circle cx={chartX(index)} cy={incomePoints[index].y} r={active ? 5 : 3} fill="#34d399" stroke="#0f172a" strokeWidth="2" />
                    <circle cx={chartX(index)} cy={expensePoints[index].y} r={active ? 5 : 3} fill="#fb7185" stroke="#0f172a" strokeWidth="2" />
                  </g>;
                })}
              </svg>
            </div>
            <div className="grid grid-cols-12 border-t border-white/10 px-2 pb-2 pt-1">
              {monthlyTrend.map((month) => <button type="button" onClick={() => setSelectedTrendKey(month.key)} key={month.key} aria-label={`${month.label}を表示`} className={`min-h-8 rounded-lg text-[9px] font-black ${month.key === activeTrend.key ? 'bg-white text-slate-900' : 'text-slate-400'}`}>{month.label.replace('月', '')}</button>)}
            </div>
            <div className="flex items-center justify-center gap-5 border-t border-white/10 py-3 text-[10px] font-black text-slate-300"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />収入</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" />支出</span></div>
          </div>
        </section>
        {tagRanking.length > 0 && <section className="flex flex-col gap-3"><h2 className="flex items-center gap-2 text-sm font-black"><Tag className="h-5 w-5" />タグ別支出</h2>{tagRanking.map((tag) => <article key={tag.id} className="flex justify-between rounded-2xl border-2 border-slate-800 bg-white p-3"><p className="text-sm font-black"># {tag.name}</p><p className="text-sm font-black text-rose-600">¥{tag.total.toLocaleString()}</p></article>)}</section>}
        <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-amber-50 p-4"><h2 className="text-sm font-black">今月の振り返り</h2><textarea value={monthlyReview} onChange={(event) => setMonthlyReview(event.target.value)} rows={5} placeholder="今月よかったこと、来月気を付けたいことなど" className="rounded-xl border-2 border-slate-800 p-3 text-base" /><button onClick={saveReview} disabled={savingReview} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-amber-300 text-sm font-black disabled:opacity-50"><Save className="h-5 w-5" />{savingReview ? '保存中...' : '振り返りを保存'}</button></section>

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
