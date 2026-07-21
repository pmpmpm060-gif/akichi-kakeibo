"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Loader2, ChevronLeft, ChevronRight, Wallet, ArrowDownRight, ArrowUpRight, Zap, X, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import { AppHeader, useConfirm, useHorizontalSwipe, useToast } from '../../components/mobile-ui';
import {
  type Category,
  type TransactionWithCategory,
} from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';
import { userErrorMessage } from '../../lib/user-errors';
import { AmountCalculator } from '../../components/amount-calculator';
import { useCurrentProfileId } from '../../lib/household-profiles';

type Template = Database['public']['Tables']['transaction_templates']['Row'];
type BudgetOffsetType = 'overall' | 'category';

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const focusCategoryId = searchParams.get('focusCategory') || '';
  const ownProfileId = useCurrentProfileId();
  const canEdit = ownProfileId === currentUser;
  const notify = useToast();
  const confirmAction = useConfirm();
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const focusedRecordListRef = useRef<HTMLElement | null>(null);

  // currentDateは表示対象の月を表す。取引入力日は別のdate状態で管理する。
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const jstYear = currentDate.getFullYear();
  const jstMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${jstYear}-${jstMonth}`;

  // UTC変換による日付ずれを避けるため、ローカル時刻から日付文字列を作る。
  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => todayStr);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalCarryover, setTotalCarryover] = useState(0);
  const [totalBudgetOffset, setTotalBudgetOffset] = useState(0);
  const [budgetOffsetEnabled, setBudgetOffsetEnabled] = useState(false);
  const [budgetOffsetType, setBudgetOffsetType] = useState<BudgetOffsetType>('overall');
  const [budgetOffsetCategoryId, setBudgetOffsetCategoryId] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [isUpdatingTransaction, setIsUpdatingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const changeMonth = (increment: number) => {
    const newDate = new Date(currentDate.getTime());
    newDate.setMonth(newDate.getMonth() + increment);
    setLoading(true);
    setDataError(null);
    setCurrentDate(newDate);
  };
  const monthSwipe = useHorizontalSwipe(() => changeMonth(-1), () => changeMonth(1));

  useEffect(() => {
    // 月・ユーザー切替前の通信結果が後から返る場合があるため、古い結果は無視する。
    // これにより、切替前の取引が現在の画面へ一時表示されることを防ぐ。
    let ignore = false;

    const fetchData = async () => {
      const startOfMonth = `${yearMonth}-01`;
      const lastDay = new Date(jstYear, currentDate.getMonth() + 1, 0).getDate();
      const safeEndOfMonth = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      if (canEdit) {
        const generateResult = await supabase.rpc('generate_recurring_transactions', { target_user_id: currentUser, target_month: startOfMonth });
        if (ignore) return;
        if (generateResult.error) {
          setDataError('定期取引の反映に失敗しました。通信状況を確認して、もう一度お試しください。');
          setLoading(false);
          return;
        }
      }

      const [categoryResult, transactionResult, templateResult, budgetResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).is('deleted_at', null).order('sort_order').order('created_at'),
        supabase
          .from('transactions')
          .select('*, categories!transactions_category_id_fkey(name, type, icon)')
          .eq('user_id', currentUser)
          .is('deleted_at', null)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth)
          .order('date', { ascending: false }),
        supabase.from('transaction_templates').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.rpc('get_effective_budgets', {
          target_user_id: currentUser,
          target_month: startOfMonth,
        }),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error || templateResult.error || budgetResult.error;
      if (error) {
        setDataError('家計簿データの取得に失敗しました。通信状況を確認して、もう一度お試しください。');
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const transData = transactionResult.data;
      const budgetData = budgetResult.data || [];

      if (catData) {
        setCategories(catData);
        setCategoryId((current) =>
          catData.some((category) => category.id === current)
            ? current
            : catData[0]?.id || ""
        );
      }

      setTransactions(transData || []);
      setTemplates(templateResult.data || []);
      const incomeBudgetOffsets = (transData || []).filter((item) => item.type === 'income' && item.budget_offset_type !== 'none');
      const overallBudgetOffset = incomeBudgetOffsets
        .filter((item) => item.budget_offset_type === 'overall')
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const categoryBudgetOffsetTotal = incomeBudgetOffsets
        .filter((item) => item.budget_offset_type === 'category' && item.budget_offset_category_id)
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const normalBudgetOffsetTotal = overallBudgetOffset + categoryBudgetOffsetTotal;
      const expenseBudgets = budgetData.filter((item) => item.category_type === 'expense');
      const carryoverAmount = expenseBudgets.reduce((sum, item) => sum + Number(item.carryover_amount), 0);
      setTotalCarryover(carryoverAmount);
      setTotalBudgetOffset(normalBudgetOffsetTotal);
      setTotalBudget(expenseBudgets.reduce((sum, item) => sum + Number(item.base_amount), 0) + carryoverAmount + normalBudgetOffsetTotal);
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
  }, [canEdit, currentDate, currentUser, jstYear, retryKey, yearMonth]);

  useEffect(() => {
    if (loading || dataError || !focusCategoryId) return;

    const timerId = window.setTimeout(() => {
      focusedRecordListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    return () => window.clearTimeout(timerId);
  }, [dataError, focusCategoryId, loading, transactions]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const refreshDashboardData = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const closeTransactionEditor = () => {
    setEditingTransaction(null);
    setCorrectionReason('');
  };

  const beginTransactionCorrection = (transaction: TransactionWithCategory) => {
    setEditingTransaction(transaction);
    setCorrectionReason('');
  };

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const focusCategory = focusCategoryId ? categories.find((category) => category.id === focusCategoryId) : null;
  const expenseCategories = categories.filter((category) => category.type === 'expense');
  const activeTemplates = templates.filter((template) => categories.some((category) => category.id === template.category_id));
  const reusableLastTransaction = transactions.find((transaction) => categories.some((category) => category.id === transaction.category_id)) || null;
  const visibleTransactions = focusCategoryId
    ? transactions.filter((transaction) => transaction.category_id === focusCategoryId)
    : transactions;
  const focusTransactionTotal = visibleTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const focusTransactionAverage = visibleTransactions.length > 0
    ? Math.round(focusTransactionTotal / visibleTransactions.length)
    : 0;
  const canApplyBudgetOffset = selectedCategory?.type === 'income';

  const validateTransactionForm = () => {
    if (!canEdit) return '参照中のプロフィールには記録できません。本人プロフィールに切り替えてください。';
    if (categories.length === 0) return '分類がまだありません。先に「その他」からカテゴリを追加してください。';
    if (!categoryId) return '分類を選んでください。';
    if (!selectedCategory) return '選択中の分類を利用できません。別の分類を選んでください。';
    if (!date) return '日付を選んでください。';

    const parsedAmount = Number(amount);
    if (!amount.trim()) return '金額を入力してください。';
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) return '金額は1円以上の整数で入力してください。';

    if (canApplyBudgetOffset && budgetOffsetEnabled && budgetOffsetType === 'category') {
      if (!budgetOffsetCategoryId || !expenseCategories.some((category) => category.id === budgetOffsetCategoryId)) {
        return '上乗せ先の支出カテゴリを選んでください。';
      }
    }

    return '';
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingTransaction) return;

    const validationError = validateTransactionForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");
    const parsedAmount = Number(amount);

    let targetBudgetOffsetType: 'none' | BudgetOffsetType = 'none';
    let targetBudgetOffsetCategoryId: string | null = null;
    if (canApplyBudgetOffset && budgetOffsetEnabled) {
      targetBudgetOffsetType = budgetOffsetType;
      if (budgetOffsetType === 'category') {
        targetBudgetOffsetCategoryId = budgetOffsetCategoryId;
      }
    }

    setIsAddingTransaction(true);
    try {
      // 取引登録はRPC内で一括処理し、入力の整合性をDB側でも検証する。
      const { data: transactionId, error } = await supabase.rpc('create_transaction_with_tags', {
        target_user_id: currentUser,
        target_category_id: categoryId,
        target_amount: parsedAmount,
        target_date: date,
        target_description: description,
        target_budget_offset_type: targetBudgetOffsetType,
        target_budget_offset_category_id: targetBudgetOffsetCategoryId,
      });
      if (error) {
        setFormError(`${userErrorMessage('登録', error)} 入力内容は残しています。`);
        return;
      }
      const { data: createdData, error: fetchError } = await supabase.from('transactions').select('*, categories!transactions_category_id_fkey(name, type, icon)').eq('id', transactionId).is('deleted_at', null).single();
      if (fetchError) {
        setFormError('登録しましたが、画面への反映に失敗しました。二重登録を避けるため、画面を再読み込みして確認してください。');
        return;
      }
      const created = createdData;
      setTransactions((current) => [created, ...current]);
      setAmount("");
      setDescription("");
      setBudgetOffsetEnabled(false);
      setBudgetOffsetType('overall');
      setBudgetOffsetCategoryId('');
      setFormError("");
      setRecentCategoryIds((current) => [categoryId, ...current.filter((id) => id !== categoryId)].slice(0, 4));
      notify('家計簿に記録しました');
      router.refresh();
    } catch {
      setFormError('登録処理中に通信エラーが発生しました。入力内容は残しています。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsAddingTransaction(false);
    }
  };

  const handleUpdateTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isUpdatingTransaction || !editingTransaction || !canEdit) return;

    const normalizedReason = correctionReason.trim();
    if (!normalizedReason) {
      alert('訂正理由を入力してください。');
      return;
    }

    const selectedEditCategory = categories.find((category) => category.id === editingTransaction.category_id);
    const selectedEditCategoryType = selectedEditCategory?.type ?? editingTransaction.categories?.type ?? null;
    if (!selectedEditCategoryType) return;

    const parsedAmount = Number(editingTransaction.amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }

    setIsUpdatingTransaction(true);
    try {
      const { error } = await supabase.rpc('update_transaction_with_history', {
        target_transaction_id: editingTransaction.id,
        target_category_id: editingTransaction.category_id,
        target_amount: parsedAmount,
        target_date: editingTransaction.date,
        target_description: editingTransaction.description,
        target_budget_offset_type: selectedEditCategoryType === 'income' ? editingTransaction.budget_offset_type : 'none',
        target_budget_offset_category_id: selectedEditCategoryType === 'income' ? editingTransaction.budget_offset_category_id : null,
        correction_reason: normalizedReason,
      });

      if (error) {
        alert(userErrorMessage('訂正', error));
        return;
      }
      closeTransactionEditor();
      notify('訂正履歴を保存しました');
      refreshDashboardData();
      router.refresh();
    } catch {
      alert('訂正に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsUpdatingTransaction(false);
    }
  };

  const handleVoidTransaction = async (id: string) => {
    if (deletingTransactionId || !canEdit) return;
    const normalizedReason = correctionReason.trim();
    if (!normalizedReason) {
      alert('取消理由を入力してください。');
      return;
    }
    if (!await confirmAction('この記録を取消しますか？履歴は保存され、集計から外れます。')) return;

    setDeletingTransactionId(id);
    try {
      const { error } = await supabase.rpc('void_transaction_with_history', {
        target_transaction_id: id,
        correction_reason: normalizedReason,
      });
      if (error) {
        alert(userErrorMessage('取消', error));
        return;
      }
      closeTransactionEditor();
      notify('記録を取消しました');
      refreshDashboardData();
      router.refresh();
    } catch {
      alert('取消に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setDeletingTransactionId(null);
    }
  };

  // 合計値は、選択中の月と画面上のユーザーに属する取引だけを対象にする。
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;
  const hasBudgetInfo = totalBudget !== 0 || totalCarryover !== 0 || totalBudgetOffset !== 0;

  const applyTemplate = (template: Template) => {
    setCategoryId(template.category_id);
    setAmount(String(template.amount));
    setDescription(template.description);
    setDate(todayStr);
    setFormError("");
    document.getElementById('transaction-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const applyLastTransaction = () => {
    if (!reusableLastTransaction) return;
    const category = categories.find((item) => item.id === reusableLastTransaction.category_id);
    if (!category) return;
    setCategoryId(reusableLastTransaction.category_id);
    setAmount(String(reusableLastTransaction.amount));
    setDescription(reusableLastTransaction.description || '');
    setDate(todayStr);
    const previousBudgetOffsetType = reusableLastTransaction.budget_offset_type;
    if (category.type === 'income' && (previousBudgetOffsetType === 'overall' || previousBudgetOffsetType === 'category')) {
      setBudgetOffsetEnabled(true);
      setBudgetOffsetType(previousBudgetOffsetType);
      setBudgetOffsetCategoryId(reusableLastTransaction.budget_offset_category_id || '');
    } else {
      setBudgetOffsetEnabled(false);
      setBudgetOffsetType('overall');
      setBudgetOffsetCategoryId('');
    }
    setFormError("");
    document.getElementById('transaction-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="家計簿を付ける" currentUser={currentUser} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : dataError ? (
        <DataErrorCard message={dataError} onRetry={retryFetch} />
      ) : (
        <>
          {/* 取引入力フォーム */}
          <form id="transaction-form" noValidate onSubmit={handleAddTransaction} className="scroll-mt-4 bg-emerald-50 border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
            <h2 className="font-black text-base text-emerald-950 flex items-center gap-1.5">
              <Plus className="w-5 h-5" strokeWidth={3} /> 今日の支出・収入
            </h2>
            {canEdit && reusableLastTransaction && (
              <button
                type="button"
                onClick={applyLastTransaction}
                disabled={isAddingTransaction}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 text-left shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RotateCcw className="h-5 w-5 shrink-0 text-emerald-700" />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-emerald-900">前回と同じ内容で入力</span>
                    <span className="block truncate text-[11px] font-bold text-slate-500">
                      前回: {reusableLastTransaction.categories?.icon} {reusableLastTransaction.categories?.name || '分類'} ¥{reusableLastTransaction.amount.toLocaleString()}{reusableLastTransaction.description ? ` ${reusableLastTransaction.description}` : ''}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">今日で複製</span>
              </button>
            )}
            {activeTemplates.length > 0 && <section className="flex flex-col gap-2"><h3 className="flex items-center gap-2 text-sm font-black"><Zap className="h-5 w-5 text-amber-500" />テンプレートから入力</h3><div className="flex gap-2 overflow-x-auto pb-1">{activeTemplates.map((template) => <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-800 bg-amber-100 px-3 text-xs font-black">{template.name}<span className="ml-1 text-slate-500">¥{template.amount.toLocaleString()}</span></button>)}</div></section>}
            {recentCategoryIds.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">
              {recentCategoryIds.map((id) => {
                const category = categories.find((item) => item.id === id);
                return category ? <button key={id} type="button" onClick={() => { setCategoryId(id); setFormError(""); }} className={`min-h-11 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${categoryId === id ? 'border-slate-800 bg-amber-200' : 'border-slate-300 bg-white'}`}>{category.icon} {category.name}</button> : null;
              })}
            </div>}

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center justify-between"><label className="text-xs font-black text-emerald-900 pl-1">いつ？</label><button type="button" onClick={() => setDate(todayStr)} className="min-h-11 px-2 text-xs font-black text-emerald-700">今日</button></div>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mobile-date-input min-h-12 min-w-0 max-w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-base font-bold" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-xs font-black text-emerald-900 pl-1">分類</label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    const nextCategory = categories.find((category) => category.id === e.target.value);
                    setCategoryId(e.target.value);
                    setFormError("");
                    if (nextCategory?.type !== 'income') setBudgetOffsetEnabled(false);
                  }}
                  className="min-h-12 min-w-0 max-w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-base font-bold"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon || (c.type === 'expense' ? '💸' : '💰')} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">いくら？</label>
              <div className="flex gap-2"><input type="number" inputMode="numeric" enterKeyHint="next" min="1" step="1" value={amount} onChange={(e) => { setAmount(e.target.value); setFormError(""); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); descriptionInputRef.current?.focus(); } }} placeholder="金額を入力" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-black" /><AmountCalculator value={amount} min={1} onApply={(result) => { setAmount(String(result)); setFormError(""); }} disabled={isAddingTransaction} /></div>
            </div>

            {canApplyBudgetOffset && (
              <div className="flex flex-col gap-3 rounded-2xl border-2 border-emerald-800 bg-white p-3">
                <label className="flex items-start gap-2 text-xs font-black text-emerald-900">
                  <input
                    type="checkbox"
                    checked={budgetOffsetEnabled}
                    onChange={(event) => { setBudgetOffsetEnabled(event.target.checked); setFormError(""); }}
                    className="mt-1 h-5 w-5 rounded border-2 border-slate-800"
                  />
                  <span className="min-w-0">
                    この収入を当月予算に上乗せする
                    <span className="mt-1 block text-[10px] font-bold text-slate-500">給与はチェックしない、臨時収入だけ使う想定です。</span>
                  </span>
                </label>
                {budgetOffsetEnabled && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <select
                      value={budgetOffsetType}
                      onChange={(event) => { setBudgetOffsetType(event.target.value as BudgetOffsetType); setFormError(""); }}
                      className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base font-bold"
                    >
                      <option value="overall">全体予算に上乗せ</option>
                      <option value="category">カテゴリ予算に上乗せ</option>
                    </select>
                    {budgetOffsetType === 'category' && (
                      <select
                        value={budgetOffsetCategoryId}
                        onChange={(event) => { setBudgetOffsetCategoryId(event.target.value); setFormError(""); }}
                        className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base font-bold"
                      >
                        <option value="">上乗せ先を選択</option>
                        {expenseCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.icon || '💸'} {category.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">メモ（何に使った？）</label>
              <input ref={descriptionInputRef} type="text" enterKeyHint="done" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="カフェ、お買い物など（任意）" className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-bold" />
            </div>

            {formError && <p role="alert" className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm font-black text-rose-700">{formError}</p>}

            {!formError && !canEdit && <p className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm font-black text-slate-600">参照中のプロフィールです。記録するには本人プロフィールへ切り替えてください。</p>}
            {!formError && canEdit && categories.length === 0 && <p className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">分類がまだありません。先に「その他」からカテゴリを追加してください。</p>}

            <button type="submit" disabled={isAddingTransaction || !canEdit || categories.length === 0} className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 text-sm mt-1 disabled:opacity-60 flex items-center justify-center gap-2">
              {isAddingTransaction
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 記録中...</>
                : '記録する'}
            </button>
          </form>

          {/* 月選択と選択月の集計 */}
          <div {...monthSwipe} className="bg-emerald-100 border-2 border-slate-800 rounded-3xl p-3 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <button aria-label="前の月" onClick={() => changeMonth(-1)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white active:bg-slate-100">
                <ChevronLeft className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
              </button>
              <span className="font-black text-lg text-emerald-950">
                {jstYear}年{Number(jstMonth)}月
              </span>
              <button aria-label="次の月" onClick={() => changeMonth(1)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white active:bg-slate-100">
                <ChevronRight className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex items-center justify-between border-t-2 border-slate-800 pt-3 px-1">
              <span className="font-black text-sm text-slate-700 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> 収支残高
              </span>
              <span className={`text-xl font-black ${totalBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                ¥{totalBalance.toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-white border-2 border-slate-800 rounded-xl p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-0.5 uppercase tracking-wider">
                  <ArrowUpRight className="w-3 h-3 text-emerald-500" strokeWidth={3} /> 総収入
                </span>
                <span className="text-sm font-black text-emerald-700 mt-1 block">
                  ¥{totalIncome.toLocaleString()}
                </span>
              </div>
              <div className="bg-white border-2 border-slate-800 rounded-xl p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-0.5 uppercase tracking-wider">
                  <ArrowDownRight className="w-3 h-3 text-rose-400" strokeWidth={3} /> 総支出
                </span>
                <span className="text-sm font-black text-rose-600 mt-1 block">
                  ¥{totalExpense.toLocaleString()}
                </span>
              </div>
              {hasBudgetInfo && (
                <div className="col-span-2 grid grid-cols-1 gap-2 rounded-xl border-2 border-slate-800 bg-white/80 p-2 text-left shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] sm:grid-cols-3">
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">支出予算</span>
                    <span className="mt-0.5 block text-sm font-black text-slate-900">¥{totalBudget.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">TOTAL繰越</span>
                    <span className={`mt-0.5 block text-sm font-black ${totalCarryover >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {totalCarryover > 0 ? '+' : ''}¥{totalCarryover.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">臨時収入上乗せ</span>
                    <span className="mt-0.5 block text-sm font-black text-emerald-700">+¥{totalBudgetOffset.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <section ref={focusCategoryId ? focusedRecordListRef : undefined} className="scroll-mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-sm font-black text-slate-800">
                {Number(jstMonth)}月の記録{focusCategory ? `（${focusCategory.name}）` : ''}
              </h2>
              {focusCategoryId && (
                <button
                  type="button"
                  onClick={() => router.replace(`/dashboard?user=${currentUser}`)}
                  className="shrink-0 rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-[10px] font-black text-slate-700"
                >
                  全件表示
                </button>
              )}
            </div>
            {focusCategory && (
              <div className="grid gap-2 rounded-2xl border-2 border-slate-800 bg-sky-50 p-3">
                <p className="text-xs font-bold text-slate-700">
                  ホームの見直しポイントから、{focusCategory.name}の当月明細だけを表示しています。
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0 rounded-xl border border-sky-200 bg-white px-2 py-1.5">
                    <p className="text-[10px] font-black text-slate-500">合計</p>
                    <p className="truncate text-sm font-black text-slate-900">¥{focusTransactionTotal.toLocaleString()}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-sky-200 bg-white px-2 py-1.5">
                    <p className="text-[10px] font-black text-slate-500">件数</p>
                    <p className="truncate text-sm font-black text-slate-900">{visibleTransactions.length}件</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-sky-200 bg-white px-2 py-1.5">
                    <p className="text-[10px] font-black text-slate-500">平均</p>
                    <p className="truncate text-sm font-black text-slate-900">¥{focusTransactionAverage.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
            {visibleTransactions.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center text-sm font-bold text-slate-400">
                {focusCategory ? 'このカテゴリの記録はありません。' : 'この月の記録はありません。'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleTransactions.map((transaction) => (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => canEdit && beginTransactionCorrection(transaction)}
                    disabled={!canEdit}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 text-left shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{transaction.date.slice(5).replace('-', '/')} {transaction.categories?.icon} {transaction.categories?.name || '未分類'}</p>
                      <p className="truncate text-xs font-bold text-slate-500">{transaction.description || 'メモなし'}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-black ${transaction.type === 'expense' ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {transaction.type === 'expense' ? '-' : '+'}¥{transaction.amount.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

        </>
      )}

      {editingTransaction && (
        <div onClick={closeTransactionEditor} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div onClick={(event) => event.stopPropagation()} className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl">
            <div className="flex items-center justify-between border-b-2 border-slate-800 bg-amber-100 p-4">
              <span className="text-base font-black text-slate-800">{editingTransaction.date.slice(5).replace('-', '月')}日 の記録</span>
              <button type="button" onClick={closeTransactionEditor} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white">
                <X className="h-4 w-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            <div className="flex max-h-[calc(90dvh-76px)] flex-col gap-4 overflow-y-auto p-4">
              <form onSubmit={handleUpdateTransaction} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">いつ？</label>
                  <input type="date" value={editingTransaction.date} onChange={(event) => setEditingTransaction({ ...editingTransaction, date: event.target.value })} className="mobile-date-input min-h-12 w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-base font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">分類</label>
                  <select value={editingTransaction.category_id} onChange={(event) => setEditingTransaction({ ...editingTransaction, category_id: event.target.value })} className="min-h-12 w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-base font-bold">
                    {!categories.some((category) => category.id === editingTransaction.category_id) && editingTransaction.categories && (
                      <option value={editingTransaction.category_id}>{editingTransaction.categories.icon || (editingTransaction.categories.type === 'expense' ? '💸' : '💰')} {editingTransaction.categories.name}（削除済み）</option>
                    )}
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.icon || (category.type === 'expense' ? '💸' : '💰')} {category.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">いくら？</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" step="1" value={editingTransaction.amount} onChange={(event) => setEditingTransaction({ ...editingTransaction, amount: Number(event.target.value) })} className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-black" />
                    <AmountCalculator value={editingTransaction.amount} min={1} onApply={(result) => setEditingTransaction({ ...editingTransaction, amount: result })} disabled={isUpdatingTransaction} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">メモ</label>
                  <input type="text" value={editingTransaction.description} maxLength={500} onChange={(event) => setEditingTransaction({ ...editingTransaction, description: event.target.value })} className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-black text-slate-500">訂正・取消理由</label>
                  <textarea value={correctionReason} maxLength={500} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="例: レシート確認で金額が違っていたため" className="min-h-20 w-full resize-none rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-bold" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={closeTransactionEditor} className="min-h-12 flex-1 rounded-xl border-2 border-slate-800 bg-slate-100 py-2.5 text-sm font-black">戻る</button>
                  <button type="submit" disabled={isUpdatingTransaction} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-800 bg-slate-900 py-2.5 text-sm font-black text-white disabled:opacity-60">
                    {isUpdatingTransaction ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中...</> : '訂正を保存する'}
                  </button>
                </div>
                <button type="button" onClick={() => handleVoidTransaction(editingTransaction.id)} disabled={deletingTransactionId !== null || isUpdatingTransaction} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 text-sm font-black text-rose-600 disabled:opacity-50">
                  {deletingTransactionId === editingTransaction.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  この記録を取消する
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParamsは静的レンダリング中にSuspenseを必要とするため、
// ルート境界でフォールバックを表示する。
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  );
}
