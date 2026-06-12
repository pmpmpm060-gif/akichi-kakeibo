"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Repeat2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import type { Budget, Category } from '../../lib/database-helpers';
import { AppHeader, useToast } from '../../components/mobile-ui';

const isValidBudgetAmount = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;

function BudgetsPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const notify = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<{ [key: string]: number }>({});
  const [carryoverSettings, setCarryoverSettings] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // ユーザー切替前の通信結果が後から返る場合があるため、古い結果は無視する。
    // これにより、別ユーザーの編集内容が誤表示されることを防ぐ。
    let ignore = false;

    const fetchData = async () => {
      const [categoryResult, budgetResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
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
        setDataError(error.message);
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const budgetData = budgetResult.data;

      if (catData) {
        setCategories(catData);
        setCarryoverSettings(
          Object.fromEntries(catData.map((category) => [category.id, category.carryover_enabled]))
        );
      }

      const budgetMap: { [key: string]: number } = {};
      budgetData?.forEach((budget: Pick<Budget, 'category_id' | 'amount'>) => {
        budgetMap[budget.category_id] = budget.amount;
      });
      setBudgets(budgetMap);
      setHasChanges(false);
      setLoading(false);
    };

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [currentUser, retryKey]);

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

  const handleCarryoverChange = (categoryId: string, enabled: boolean) => {
    setCarryoverSettings((current) => ({
      ...current,
      [categoryId]: enabled,
    }));
    setHasChanges(true);
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
      carryover_enabled: carryoverSettings[cat.id] || false,
    }));

    // 予算額と繰越設定を1回のRPC・DBトランザクションで保存し、
    // 一部の行だけが更新される状態を防ぐ。
    try {
      const { error } = await supabase.rpc('save_user_budgets', {
        target_user_id: currentUser,
        budget_entries: budgetEntries,
      });
      if (error) {
        alert('予算の保存に失敗しました：' + error.message);
      } else {
        notify('基本予算と繰越設定を保存しました');
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

      return (
        <div
          key={cat.id}
          className="flex flex-col gap-3 rounded-2xl border-2 border-slate-800 bg-white p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
        >
          <span className="font-black text-sm text-slate-800 flex items-center gap-2">
            <span className="text-xl">{cat.icon || (cat.type === 'income' ? "💰" : "💸")}</span> {cat.name}
          </span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={amount === undefined ? "" : amount}
                onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                disabled={isSaving}
                aria-invalid={hasInvalidAmount}
                placeholder="0"
                className={`min-h-12 w-full rounded-xl border-2 px-3 py-2 text-right text-base font-black focus:outline-none disabled:opacity-60 ${
                  hasInvalidAmount
                    ? 'border-rose-500 bg-rose-50'
                    : `border-slate-800 ${cat.type === 'income' ? 'focus:bg-emerald-50' : 'focus:bg-sky-50'}`
                }`}
              />
              <span className="font-black text-xs text-slate-500 shrink-0">円</span>
            </div>
            {hasInvalidAmount && (
              <p className="text-[10px] font-black text-rose-600">0以上の整数で入力してください</p>
            )}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
              <span className="flex items-center gap-1.5">
                <Repeat2 className="w-4 h-4" />
                余り・超過を繰越
              </span>
              <input
                type="checkbox"
                checked={carryoverSettings[cat.id] || false}
                onChange={(e) => handleCarryoverChange(cat.id, e.target.checked)}
                disabled={isSaving}
                className="peer sr-only"
              />
              <span className="relative h-7 w-12 rounded-full border-2 border-slate-800 bg-slate-300 transition-colors peer-checked:bg-sky-400 peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-slate-500 after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="予算を決める" currentUser={currentUser} />

      <div className="bg-sky-100 border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center gap-3">
        <div className="text-2xl">💡</div>
        <p className="text-xs font-bold text-sky-950 leading-relaxed">
          基本予算は毎月使われます。カテゴリごとに繰越をONにすると、余りも超過も翌月の予算へ反映されます。
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
            <p className="text-sm font-bold text-slate-400 mb-3">まずはカテゴリを追加してね！</p>
            <Link href={`/categories?user=${currentUser}`} className="text-xs font-black bg-pink-300 text-slate-900 px-4 py-2 rounded-xl border-2 border-slate-800 inline-block">
              カテゴリ設定へ 🏃‍♂️
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {incomeCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💰 収入（目標金額）</p>
                <div className="flex flex-col gap-3">{renderCategoryRows(incomeCategories)}</div>
              </div>
            )}

            {expenseCategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">💸 支出（予算上限）</p>
                <div className="flex flex-col gap-3">{renderCategoryRows(expenseCategories)}</div>
              </div>
            )}

            <button
              onClick={handleSaveBudgets}
              disabled={isSaving}
              className="w-full bg-sky-300 text-slate-900 font-black py-4 rounded-2xl border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] text-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" strokeWidth={2.5} />予算と繰越設定を保存する！ ✨</>}
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
