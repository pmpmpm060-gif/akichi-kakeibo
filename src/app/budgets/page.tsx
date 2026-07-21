"use client";

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Repeat2, Wand2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import type { Budget, Category } from '../../lib/database-helpers';
import { AppHeader, useToast } from '../../components/mobile-ui';
import { userErrorMessage } from '../../lib/user-errors';
import { AmountCalculator } from '../../components/amount-calculator';

const isValidBudgetAmount = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;
type BudgetAllocationTransaction = { amount: number; category_id: string };

const HISTORY_MONTH_OPTIONS = [3, 6, 12] as const;
const ROUND_UNIT_OPTIONS = [1, 100, 1000, 10000] as const;

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function allocateByHistory(
  totalBudget: number,
  roundUnit: number,
  expenseCategories: Category[],
  transactions: BudgetAllocationTransaction[]
) {
  if (expenseCategories.length === 0) return new Map<string, number>();

  const unitsToAllocate = Math.floor(totalBudget / roundUnit);
  const categoryTotals = new Map(expenseCategories.map((category) => [category.id, 0]));
  transactions.forEach((transaction) => {
    if (categoryTotals.has(transaction.category_id)) {
      categoryTotals.set(transaction.category_id, (categoryTotals.get(transaction.category_id) || 0) + Number(transaction.amount));
    }
  });

  const historyTotal = Array.from(categoryTotals.values()).reduce((sum, amount) => sum + amount, 0);
  const baseShares = expenseCategories.map((category) => {
    const exactUnits = historyTotal > 0
      ? ((categoryTotals.get(category.id) || 0) / historyTotal) * unitsToAllocate
      : unitsToAllocate / expenseCategories.length;
    return {
      categoryId: category.id,
      units: Math.floor(exactUnits),
      remainder: exactUnits - Math.floor(exactUnits),
      historyAmount: categoryTotals.get(category.id) || 0,
    };
  });

  let remainingUnits = unitsToAllocate - baseShares.reduce((sum, item) => sum + item.units, 0);
  const rankedShares = [...baseShares].sort((left, right) => {
    if (right.remainder !== left.remainder) return right.remainder - left.remainder;
    if (right.historyAmount !== left.historyAmount) return right.historyAmount - left.historyAmount;
    return left.categoryId.localeCompare(right.categoryId);
  });

  for (let index = 0; remainingUnits > 0; index += 1) {
    rankedShares[index % rankedShares.length].units += 1;
    remainingUnits -= 1;
  }

  return new Map(baseShares.map((item) => [item.categoryId, item.units * roundUnit]));
}

function BudgetsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const focusCategoryId = searchParams.get('focusCategory') || '';
  const notify = useToast();
  const focusCategoryRef = useRef<HTMLDivElement | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  const [totalCarryoverEnabled, setTotalCarryoverEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [autoTotalBudget, setAutoTotalBudget] = useState('');
  const [historyMonths, setHistoryMonths] = useState<(typeof HISTORY_MONTH_OPTIONS)[number]>(6);
  const [roundUnit, setRoundUnit] = useState<(typeof ROUND_UNIT_OPTIONS)[number]>(100);
  const [isAllocatingBudget, setIsAllocatingBudget] = useState(false);
  const [allocationSummary, setAllocationSummary] = useState<string | null>(null);

  useEffect(() => {
    // ユーザー切替前の通信結果が後から返る場合があるため、古い結果は無視する。
    // これにより、別ユーザーの編集内容が誤表示されることを防ぐ。
    let ignore = false;

    const fetchData = async () => {
      const [categoryResult, budgetResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).is('deleted_at', null).order('sort_order').order('created_at'),
        // この画面では毎月共通の基本予算を編集する。
        // 繰越反映後の予算は、表示時にget_effective_budgetsで計算する。
        supabase
          .from('budgets')
          .select('category_id, amount')
          .eq('user_id', currentUser),
      ]);

      if (ignore) return;

      const error = categoryResult.error || budgetResult.error;
      if (error) {
        setDataError('予算データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const budgetData = budgetResult.data;

      if (catData) {
        setCategories(catData);
        setTotalCarryoverEnabled(catData.some((category) => category.type === 'expense' && category.carryover_enabled));
      }

      const budgetMap: { [key: string]: number } = {};
      budgetData?.forEach((budget: Pick<Budget, 'category_id' | 'amount'>) => {
        budgetMap[budget.category_id] = budget.amount;
      });
      setBudgets(budgetMap);
      setHasChanges(false);
      setLoading(false);
    };

    void fetchData().catch(() => {
      if (!ignore) {
        setDataError('データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [currentUser, retryKey]);

  useEffect(() => {
    if (loading || dataError || !focusCategoryId) return;

    const timerId = window.setTimeout(() => {
      focusCategoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    return () => window.clearTimeout(timerId);
  }, [categories, dataError, focusCategoryId, loading]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const handleAmountChange = (categoryId: string, value: string) => {
    const amount = value === "" ? 0 : Number(value);
    setBudgets((current) => ({
      ...current,
      [categoryId]: Number.isNaN(amount) ? 0 : amount,
    }));
    setHasChanges(true);
  };

  const handleTotalCarryoverChange = (enabled: boolean) => {
    setTotalCarryoverEnabled(enabled);
    setHasChanges(true);
  };

  const handleAutoAllocateBudgets = async () => {
    if (isAllocatingBudget) return;

    const totalBudget = Number(autoTotalBudget);
    if (!Number.isSafeInteger(totalBudget) || totalBudget <= 0) {
      alert('全体の支出予算は1円以上の整数で入力してください。');
      return;
    }
    if (totalBudget % roundUnit !== 0) {
      alert(`全体の支出予算は${roundUnit.toLocaleString()}円単位で割り切れる金額にしてください。`);
      return;
    }
    if (expenseCategories.length === 0) {
      alert('支出カテゴリがありません。先にカテゴリを追加してください。');
      return;
    }

    const currentMonthStartDate = new Date();
    currentMonthStartDate.setDate(1);
    const historyStartDate = new Date(currentMonthStartDate.getFullYear(), currentMonthStartDate.getMonth() - historyMonths, 1);
    const historyStart = localDateString(historyStartDate);
    const historyEnd = localDateString(new Date(currentMonthStartDate.getFullYear(), currentMonthStartDate.getMonth(), 0));

    setIsAllocatingBudget(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('category_id, amount')
        .eq('user_id', currentUser)
        .eq('type', 'expense')
        .is('deleted_at', null)
        .is('recurring_transaction_id', null)
        .gte('date', historyStart)
        .lte('date', historyEnd);

      if (error) {
        alert(userErrorMessage('自動配分', error));
        return;
      }

      const allocation = allocateByHistory(totalBudget, roundUnit, expenseCategories, data || []);
      setBudgets((current) => {
        const next = { ...current };
        expenseCategories.forEach((category) => {
          next[category.id] = allocation.get(category.id) || 0;
        });
        return next;
      });
      const historyTotal = (data || []).reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      setAllocationSummary(
        historyTotal > 0
          ? `${monthLabel(historyStartDate)}〜${monthLabel(new Date(currentMonthStartDate.getFullYear(), currentMonthStartDate.getMonth() - 1, 1))}の支出実績で配分しました`
          : `過去${historyMonths}か月の支出実績がないため、支出カテゴリへ均等配分しました`
      );
      setHasChanges(true);
      notify('過去実績から支出予算を配分しました');
    } catch {
      alert('自動配分に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsAllocatingBudget(false);
    }
  };

  const handleSaveBudgets = async () => {
    if (isSaving) return;

    const invalidCategory = categories.find((category) => !isValidBudgetAmount(budgets[category.id] || 0));
    if (invalidCategory) {
      alert(`「${invalidCategory.name}」の予算額は、0以上の整数で入力してください。`);
      return;
    }

    setIsSaving(true);
    const budgetEntries = categories.map((cat) => ({
      category_id: cat.id,
      amount: budgets[cat.id] || 0,
      carryover_enabled: cat.type === 'expense' ? totalCarryoverEnabled : false,
    }));

    // 予算額と繰越設定を1回のRPC・DBトランザクションで保存し、
    // 一部の行だけが更新される状態を防ぐ。
    try {
      const { error } = await supabase.rpc('save_user_budgets', {
        target_user_id: currentUser,
        budget_entries: budgetEntries,
      });
      if (error) {
        alert(userErrorMessage('予算の保存', error));
      } else {
        notify('基本予算とTOTAL繰越設定を保存しました');
        setHasChanges(false);
      }
    } catch {
      alert('予算の保存に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const renderCategoryRows = (targetCategories: Category[]) => {
    return targetCategories.map((cat) => {
      const amount = budgets[cat.id];
      const hasInvalidAmount = amount !== undefined && !isValidBudgetAmount(amount);
      const isFocused = cat.id === focusCategoryId;

      return (
        <div
          key={cat.id}
          ref={isFocused ? focusCategoryRef : undefined}
          className={`grid gap-2 rounded-2xl border-2 p-3 ${
            isFocused
              ? 'border-pink-500 bg-pink-50 shadow-[4px_4px_0px_0px_rgba(236,72,153,1)]'
              : 'border-slate-800 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
          }`}
        >
          {isFocused && (
            <p className="w-fit rounded-xl border border-pink-300 bg-white px-2 py-1 text-[10px] font-black text-pink-700">
              見直しポイントのカテゴリ
            </p>
          )}
          <span className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-800">
            <span className="text-xl">{cat.icon || (cat.type === 'income' ? "💰" : "💸")}</span> {cat.name}
          </span>
          <div className="grid gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={!amount ? "" : amount}
                onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                disabled={isSaving}
                aria-invalid={hasInvalidAmount}
                placeholder="0"
                className={`min-h-11 w-full rounded-xl border-2 px-3 py-2 text-right text-base font-black focus:outline-none disabled:opacity-60 ${
                  hasInvalidAmount
                    ? 'border-rose-500 bg-rose-50'
                    : `border-slate-800 ${cat.type === 'income' ? 'focus:bg-emerald-50' : 'focus:bg-sky-50'}`
                }`}
              />
              <AmountCalculator value={amount ?? 0} onApply={(result) => handleAmountChange(cat.id, String(result))} disabled={isSaving} />
              <span className="font-black text-xs text-slate-500 shrink-0">円</span>
            </div>
            {hasInvalidAmount && (
              <p className="text-[10px] font-black text-rose-600">0以上の整数で入力してください</p>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="予算を決める" currentUser={currentUser} />

      <div className="bg-yellow-100 border-2 border-slate-800 rounded-2xl p-3 shadow-[3px_3px_0px_0px_rgba(236,72,153,1)] flex items-center gap-3">
        <div className="text-xl">💡</div>
        <p className="text-xs font-bold text-slate-900 leading-relaxed">
          基本予算は毎月使われます。TOTAL繰越をONにすると、支出全体の余り・超過を翌月の総予算へ反映します。
        </p>
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : dataError ? (
          <DataErrorCard message={dataError} onRetry={retryFetch} />
        ) : categories.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <p className="text-sm font-bold text-slate-400 mb-3">先にカテゴリを追加してください。</p>
            <Link href={`/categories?user=${currentUser}`} className="text-xs font-black bg-pink-300 text-slate-900 px-4 py-2 rounded-xl border-2 border-slate-800 inline-block">
              カテゴリ設定へ
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {incomeCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💰 収入（目標金額）</p>
                <div className="flex flex-col gap-2">{renderCategoryRows(incomeCategories)}</div>
              </div>
            )}

            {expenseCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💸 支出（予算上限）</p>
                <section className="flex flex-col gap-3 rounded-2xl border-2 border-slate-800 bg-cyan-50 p-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5 text-cyan-700" strokeWidth={2.5} />
                    <h2 className="text-sm font-black text-slate-900">全体予算から自動配分</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-xs font-black text-slate-600">全体の支出予算</label>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step={roundUnit}
                          value={autoTotalBudget}
                          onChange={(event) => setAutoTotalBudget(event.target.value)}
                          disabled={isSaving || isAllocatingBudget}
                          placeholder="例: 120000"
                          className="min-h-12 min-w-0 rounded-xl border-2 border-slate-800 px-3 py-2 text-right text-base font-black disabled:opacity-60"
                        />
                        <span className="shrink-0 text-xs font-black text-slate-500">円</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoAllocateBudgets}
                      disabled={isSaving || isAllocatingBudget}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-60"
                    >
                      {isAllocatingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      配分する
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-black text-slate-600">学習期間</span>
                      <select
                        value={historyMonths}
                        onChange={(event) => setHistoryMonths(Number(event.target.value) as typeof historyMonths)}
                        disabled={isSaving || isAllocatingBudget}
                        className="min-h-11 rounded-xl border-2 border-slate-800 bg-white px-3 text-sm font-black disabled:opacity-60"
                      >
                        {HISTORY_MONTH_OPTIONS.map((months) => (
                          <option key={months} value={months}>過去{months}か月</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-black text-slate-600">丸め単位</span>
                      <select
                        value={roundUnit}
                        onChange={(event) => setRoundUnit(Number(event.target.value) as typeof roundUnit)}
                        disabled={isSaving || isAllocatingBudget}
                        className="min-h-11 rounded-xl border-2 border-slate-800 bg-white px-3 text-sm font-black disabled:opacity-60"
                      >
                        {ROUND_UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>{unit.toLocaleString()}円単位</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {allocationSummary && (
                    <p className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-900">{allocationSummary}</p>
                  )}
                </section>
                <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-pink-100 px-3 py-2 text-xs font-black text-slate-800 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Repeat2 className="h-5 w-5 shrink-0 text-pink-600" />
                    <span className="min-w-0">
                      <span className="block text-sm">TOTALで余り・超過を繰越</span>
                      <span className="block text-[10px] text-slate-600">カテゴリ別ではなく、支出全体の合計で翌月へ反映</span>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={totalCarryoverEnabled}
                    onChange={(e) => handleTotalCarryoverChange(e.target.checked)}
                    disabled={isSaving}
                    className="peer sr-only"
                  />
                  <span className="relative h-7 w-12 shrink-0 rounded-full border-2 border-slate-800 bg-white transition-colors peer-checked:bg-cyan-300 peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-slate-500 after:bg-pink-400 after:transition-transform peer-checked:after:translate-x-5" />
                </label>
                <div className="flex flex-col gap-2">{renderCategoryRows(expenseCategories)}</div>
              </div>
            )}

            <button
              onClick={handleSaveBudgets}
              disabled={isSaving}
              className="w-full bg-sky-300 text-slate-900 font-black py-4 rounded-2xl border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] text-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" strokeWidth={2.5} />予算とTOTAL繰越を保存</>}
            </button>
          </div>
        )}
      </div>
      {!loading && !dataError && categories.length > 0 && hasChanges && (
        <div className="mobile-safe-bottom fixed inset-x-0 bottom-[4.5rem] z-30 mx-auto max-w-md border-t-2 border-slate-800 bg-white/95 p-3 backdrop-blur">
          <button onClick={handleSaveBudgets} disabled={isSaving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-sky-300 text-sm font-black shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] disabled:opacity-60">
            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}変更した予算を保存
          </button>
        </div>
      )}
    </div>
  );
}

// useSearchParamsは静的レンダリング中にSuspenseを必要とするため、
// ルート境界でフォールバックを表示する。
export default function BudgetsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <BudgetsPageContent />
    </Suspense>
  );
}
