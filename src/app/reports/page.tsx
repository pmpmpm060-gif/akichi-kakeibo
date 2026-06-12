"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, BarChart3, Bookmark, ChevronLeft, ChevronRight, Loader2, Save, ShieldCheck, Sparkles, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { DataErrorCard } from '../../components/data-error-card';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category, Transaction } from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';
import { useHorizontalSwipe } from '../../components/mobile-ui';
import { AppHeader } from '../../components/mobile-ui';

type ReportTransaction = Pick<Transaction, 'id' | 'amount' | 'category_id' | 'date' | 'type'>;
type TagRow = Database['public']['Tables']['tags']['Row'];
type SavedFilter = Database['public']['Tables']['saved_filters']['Row'];
type AiDiagnosis = Database['public']['Tables']['ai_household_diagnoses']['Row'];
type RecommendedBudget = { categoryName: string; amount: number; reason: string };

function jsonStrings(value: AiDiagnosis['strengths']) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recommendedBudgets(value: AiDiagnosis['recommended_budgets']) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecommendedBudget => Boolean(
    item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.categoryName === 'string' && typeof item.amount === 'number' && typeof item.reason === 'string'
  ));
}

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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [reportMode, setReportMode] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [transactionTagMap, setTransactionTagMap] = useState<Record<string, string[]>>({});
  const [monthlyReview, setMonthlyReview] = useState('');
  const [savedReports, setSavedReports] = useState<SavedFilter[]>([]);
  const [savingReview, setSavingReview] = useState(false);
  const [diagnoses, setDiagnoses] = useState<AiDiagnosis[]>([]);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  const currentMonth = monthKey(selectedDate);
  const previousDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
  const previousMonth = monthKey(previousDate);
  const reportStart = `${selectedDate.getFullYear() - 1}-12-01`;
  const reportEnd = `${selectedDate.getFullYear()}-12-31`;

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      const [transactionResult, categoryResult, tagResult, transactionTagResult, reviewResult, savedReportResult, diagnosisResult] = await Promise.all([
        supabase.from('transactions').select('id, amount, category_id, date, type').eq('user_id', currentUser).gte('date', reportStart).lte('date', reportEnd),
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase.from('tags').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('transaction_tags').select('transaction_id, tag_id'),
        supabase.from('monthly_reviews').select('content').eq('user_id', currentUser).eq('month', `${currentMonth}-01`).maybeSingle(),
        supabase.from('saved_filters').select('*').eq('user_id', currentUser).eq('filter_type', 'reports').order('created_at'),
        supabase.from('ai_household_diagnoses').select('*').eq('user_id', currentUser).eq('target_month', `${currentMonth}-01`).order('created_at', { ascending: false }),
      ]);
      if (ignore) return;
      const error = transactionResult.error || categoryResult.error || tagResult.error || transactionTagResult.error || reviewResult.error || savedReportResult.error || diagnosisResult.error;
      if (error) setDataError(error.message);
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
        setDiagnoses(diagnosisResult.data || []);
        setSelectedDiagnosisId(diagnosisResult.data?.[0]?.id || null);
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

  const categoryRanking = categories
    .filter((category) => category.type === 'expense')
    .map((category) => {
      const current = monthTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
      const previous = previousTransactions.filter((transaction) => transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
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
  const yearlyCategoryRanking = categories.filter((category) => category.type === 'expense').map((category) => ({
    ...category,
    total: transactions.filter((transaction) => transaction.date.startsWith(String(selectedDate.getFullYear())) && transaction.category_id === category.id && transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
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
  const selectedTrend = monthlyTrend.find((month) => month.key === selectedTrendKey);
  const saveReview = async () => {
    setSavingReview(true);
    const { error } = await supabase.from('monthly_reviews').upsert({ user_id: currentUser, month: `${currentMonth}-01`, content: monthlyReview }, { onConflict: 'household_id,user_id,month' });
    if (error) alert('振り返りの保存に失敗しました：' + error.message);
    setSavingReview(false);
  };
  const saveReportCondition = async () => {
    const name = window.prompt('保存するレポート条件の名前を入力してください');
    if (!name?.trim()) return;
    const { data, error } = await supabase.from('saved_filters').insert({ user_id: currentUser, name: name.trim(), filter_type: 'reports', conditions: { reportMode, currentMonth } }).select().single();
    if (error) alert('レポート条件の保存に失敗しました：' + error.message);
    else setSavedReports((current) => [...current, data]);
  };
  const applySavedReport = (filter: SavedFilter) => {
    const conditions = filter.conditions as { reportMode?: 'monthly' | 'yearly'; currentMonth?: string };
    if (conditions.reportMode) setReportMode(conditions.reportMode);
    if (conditions.currentMonth) setSelectedDate(new Date(`${conditions.currentMonth}-01T00:00:00`));
  };
  const selectedDiagnosis = diagnoses.find((diagnosis) => diagnosis.id === selectedDiagnosisId) || diagnoses[0] || null;
  const runDiagnosis = async () => {
    setDiagnosing(true);
    setDiagnosisError(null);
    try {
      const response = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: currentUser, targetMonth: currentMonth }),
      });
      const result = await response.json() as { diagnosis?: AiDiagnosis; error?: string };
      if (!response.ok || !result.diagnosis) throw new Error(result.error || 'AI診断に失敗しました。');
      setDiagnoses((current) => [result.diagnosis!, ...current]);
      setSelectedDiagnosisId(result.diagnosis.id);
    } catch (error: unknown) {
      setDiagnosisError(error instanceof Error ? error.message : 'AI診断に失敗しました。');
    } finally {
      setDiagnosing(false);
    }
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

        <section className="flex flex-col gap-4 rounded-3xl border-2 border-slate-800 bg-violet-50 p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-5 w-5 text-violet-600" />AI家計診断</h2>
            <p className="mt-1 flex items-start gap-1 text-xs font-bold leading-relaxed text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />AIへ送るのは集計値だけです。取引メモやレシート画像は送信しません。</p>
          </div>
          <button type="button" onClick={runDiagnosis} disabled={diagnosing} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-violet-300 text-sm font-black disabled:opacity-50">
            {diagnosing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{diagnosing ? '診断中...' : 'AI家計診断を実行'}
          </button>
          {diagnosisError && <p className="rounded-xl bg-rose-100 p-3 text-xs font-bold text-rose-700">{diagnosisError}</p>}
          {diagnoses.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{diagnoses.map((diagnosis, index) => <button type="button" key={diagnosis.id} onClick={() => setSelectedDiagnosisId(diagnosis.id)} className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-black ${selectedDiagnosis?.id === diagnosis.id ? 'border-slate-800 bg-white' : 'border-slate-300 bg-violet-100 text-slate-500'}`}>{index === 0 ? '最新' : new Date(diagnosis.created_at).toLocaleDateString('ja-JP')}</button>)}</div>}
          {selectedDiagnosis ? <article className="flex flex-col gap-4 rounded-2xl border-2 border-slate-800 bg-white p-4">
            <div className="flex items-center gap-3"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-violet-300 text-2xl font-black">{selectedDiagnosis.score}</span><p className="text-sm font-bold leading-relaxed">{selectedDiagnosis.summary}</p></div>
            {jsonStrings(selectedDiagnosis.strengths).length > 0 && <div><h3 className="text-xs font-black text-emerald-700">よいところ</h3><ul className="mt-1 space-y-1 text-xs font-bold text-slate-700">{jsonStrings(selectedDiagnosis.strengths).map((item) => <li key={item}>・{item}</li>)}</ul></div>}
            {jsonStrings(selectedDiagnosis.concerns).length > 0 && <div><h3 className="text-xs font-black text-orange-700">気になるところ</h3><ul className="mt-1 space-y-1 text-xs font-bold text-slate-700">{jsonStrings(selectedDiagnosis.concerns).map((item) => <li key={item}>・{item}</li>)}</ul></div>}
            {jsonStrings(selectedDiagnosis.actions).length > 0 && <div><h3 className="text-xs font-black text-violet-700">次にやること</h3><ol className="mt-1 space-y-1 text-xs font-bold text-slate-700">{jsonStrings(selectedDiagnosis.actions).map((item, index) => <li key={item}>{index + 1}. {item}</li>)}</ol></div>}
            {recommendedBudgets(selectedDiagnosis.recommended_budgets).length > 0 && <div><h3 className="text-xs font-black text-sky-700">予算の提案</h3><div className="mt-2 space-y-2">{recommendedBudgets(selectedDiagnosis.recommended_budgets).map((item) => <div key={`${item.categoryName}-${item.amount}`} className="rounded-xl bg-sky-50 p-3"><p className="text-xs font-black">{item.categoryName}：¥{item.amount.toLocaleString()}</p><p className="mt-1 text-xs font-bold text-slate-600">{item.reason}</p></div>)}</div></div>}
          </article> : <p className="rounded-xl border-2 border-dashed border-violet-300 p-4 text-center text-xs font-bold text-slate-500">まだ診断履歴はありません。</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black"><BarChart3 className="h-5 w-5" />{selectedDate.getFullYear()}年の推移</h2>
          <div className="flex h-48 items-end justify-between gap-2 rounded-3xl border-2 border-slate-800 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            {monthlyTrend.map((month) => (
              <button type="button" onClick={() => setSelectedTrendKey(month.key)} key={month.key} className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md ${selectedTrendKey === month.key ? 'bg-amber-100' : ''}`}>
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div title={`収入 ¥${month.income.toLocaleString()}`} className="w-2.5 rounded-t bg-emerald-400" style={{ height: `${Math.max(2, (month.income / maxTrendAmount) * 100)}%` }} />
                  <div title={`支出 ¥${month.expense.toLocaleString()}`} className="w-2.5 rounded-t bg-rose-400" style={{ height: `${Math.max(2, (month.expense / maxTrendAmount) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-black text-slate-500">{month.label}</span>
              </button>
            ))}
          </div>
          {selectedTrend && <p className="rounded-xl bg-indigo-50 p-3 text-center text-xs font-black">{selectedTrend.label}：収入 ¥{selectedTrend.income.toLocaleString()} ／ 支出 ¥{selectedTrend.expense.toLocaleString()}</p>}
          <p className="text-center text-[10px] font-bold text-slate-500"><span className="text-emerald-600">■ 収入</span>　<span className="text-rose-500">■ 支出</span></p>
        </section>
        {tagRanking.length > 0 && <section className="flex flex-col gap-3"><h2 className="flex items-center gap-2 text-sm font-black"><Tag className="h-5 w-5" />タグ別支出</h2>{tagRanking.map((tag) => <article key={tag.id} className="flex justify-between rounded-2xl border-2 border-slate-800 bg-white p-3"><p className="text-sm font-black"># {tag.name}</p><p className="text-sm font-black text-rose-600">¥{tag.total.toLocaleString()}</p></article>)}</section>}
        <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-amber-50 p-4"><h2 className="text-sm font-black">今月の振り返り</h2><textarea value={monthlyReview} onChange={(event) => setMonthlyReview(event.target.value)} rows={5} placeholder="今月よかったこと、来月気を付けたいことなど" className="rounded-xl border-2 border-slate-800 p-3 text-base" /><button onClick={saveReview} disabled={savingReview} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-amber-300 text-sm font-black disabled:opacity-50"><Save className="h-5 w-5" />{savingReview ? '保存中...' : '振り返りを保存'}</button></section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-black">カテゴリ別支出ランキング</h2>
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
        <section className="flex flex-col gap-3"><h2 className="text-sm font-black">年間カテゴリランキング</h2>{yearlyCategoryRanking.map((category, index) => <article key={category.id} className="flex justify-between rounded-2xl border-2 border-slate-800 bg-white p-3"><p className="text-sm font-black">{index + 1}. {category.icon} {category.name}</p><p className="text-sm font-black text-rose-600">¥{category.total.toLocaleString()}</p></article>)}</section>
      </>}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<div className="p-6 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></div>}><ReportsPageContent /></Suspense>;
}
