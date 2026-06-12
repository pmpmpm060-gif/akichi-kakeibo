"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight, X, Wallet, ArrowDownRight, ArrowUpRight, CalendarClock, Search, RotateCcw, Camera, Bookmark, Tag, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import { DataErrorCard } from '../../components/data-error-card';
import { AppHeader, useConfirm, useHorizontalSwipe, useToast } from '../../components/mobile-ui';
import {
  type Category,
  type TransactionWithCategory,
} from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';

type TagRow = Database['public']['Tables']['tags']['Row'];
type Template = Database['public']['Tables']['transaction_templates']['Row'];
type SavedFilter = Database['public']['Tables']['saved_filters']['Row'];

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const notify = useToast();
  const confirmAction = useConfirm();
  const descriptionInputRef = useRef<HTMLInputElement>(null);

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
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isUpdatingTransaction, setIsUpdatingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [transactionTagMap, setTransactionTagMap] = useState<Record<string, string[]>>({});
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [filterTagId, setFilterTagId] = useState('all');
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);

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

      const generateResult = await supabase.rpc('generate_recurring_transactions', {
        target_user_id: currentUser,
        target_month: startOfMonth,
      });
      if (ignore) return;
      if (generateResult.error) {
        setDataError(generateResult.error.message);
        setLoading(false);
        return;
      }

      const [categoryResult, transactionResult, tagResult, transactionTagResult, templateResult, savedFilterResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order').order('created_at'),
        supabase
          .from('transactions')
          .select('*, categories(name, type, icon)')
          .eq('user_id', currentUser)
          .gte('date', startOfMonth)
          .lte('date', safeEndOfMonth)
          .order('date', { ascending: false }),
        supabase.from('tags').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('transaction_tags').select('transaction_id, tag_id'),
        supabase.from('transaction_templates').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('saved_filters').select('*').eq('user_id', currentUser).eq('filter_type', 'transactions').order('created_at'),
      ]);

      if (ignore) return;

      const error = categoryResult.error || transactionResult.error || tagResult.error || transactionTagResult.error || templateResult.error || savedFilterResult.error;
      if (error) {
        setDataError(error.message);
        setLoading(false);
        return;
      }

      const catData = categoryResult.data;
      const transData = transactionResult.data;

      if (catData) {
        setCategories(catData);
        setCategoryId((current) =>
          catData.some((category) => category.id === current)
            ? current
            : catData[0]?.id || ""
        );
      }

      setTransactions(transData || []);
      setTags(tagResult.data || []);
      setTemplates(templateResult.data || []);
      setSavedFilters(savedFilterResult.data || []);
      setTransactionTagMap((transactionTagResult.data || []).reduce<Record<string, string[]>>((map, item) => {
        map[item.transaction_id] = [...(map[item.transaction_id] || []), item.tag_id];
        return map;
      }, {}));
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
  }, [currentDate, currentUser, jstYear, retryKey, yearMonth]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingTransaction || !amount || !categoryId) return;

    const selectedCategory = categories.find(c => c.id === categoryId);
    if (!selectedCategory) return;

    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      alert('金額は1円以上の整数で入力してください。');
      return;
    }

    setIsAddingTransaction(true);
    try {
      // 取引とタグはRPC内の1トランザクションで保存し、片方だけ残る状態を防ぐ。
      const { data: transactionId, error } = await supabase.rpc('create_transaction_with_tags', {
        target_user_id: currentUser,
        target_category_id: categoryId,
        target_amount: parsedAmount,
        target_date: date,
        target_description: description,
        target_tag_ids: selectedTagIds,
      });
      if (error) {
        alert('登録に失敗しました：' + error.message);
        return;
      }
      const { data: createdData, error: fetchError } = await supabase.from('transactions').select('*, categories(name, type, icon)').eq('id', transactionId).single();
      if (fetchError) {
        alert('登録しましたが、画面への反映に失敗しました。再読み込みしてください。');
        return;
      }
      let created = createdData;
      setTransactionTagMap((current) => ({ ...current, [created.id]: selectedTagIds }));
      if (receiptFile) {
        const { data: householdId } = await supabase.rpc('current_household_id');
        if (!householdId) throw new Error('所属世帯を確認できませんでした。');
        const extension = receiptFile.name.split('.').pop() || 'jpg';
        const path = `${householdId}/${created.id}.${extension}`;
        const upload = await supabase.storage.from('receipts').upload(path, receiptFile);
        if (!upload.error) {
          const update = await supabase.from('transactions').update({ receipt_path: path }).eq('id', created.id).select('*, categories(name, type, icon)').single();
          if (update.data) created = update.data;
        } else alert('取引は登録しましたが、レシート画像の保存に失敗しました：' + upload.error.message);
      }
      setTransactions((current) => [created, ...current]);
      setAmount("");
      setDescription("");
      setReceiptFile(null);
      setSelectedTagIds([]);
      setRecentCategoryIds((current) => [categoryId, ...current.filter((id) => id !== categoryId)].slice(0, 4));
      notify('家計簿に記録しました');
      router.refresh();
    } catch {
      alert('登録処理中に通信エラーが発生しました。画面を再読み込みして登録状況を確認してください。');
    } finally {
      setIsAddingTransaction(false);
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpdatingTransaction || !editingTransaction) return;

    const targetCategory = categories.find(c => c.id === editingTransaction.category_id);
    if (!targetCategory) return;

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
          type: targetCategory.type,
        })
        .eq('id', editingTransaction.id);

      if (error) alert('修正に失敗しました：' + error.message);
      else {
        setTransactions((current) => current.map(t => t.id === editingTransaction.id ? {
          ...editingTransaction,
          type: targetCategory.type,
          categories: { name: targetCategory.name, type: targetCategory.type, icon: targetCategory.icon }
        } : t));
        setEditingTransaction(null);
        router.refresh();
      }
    } catch {
      alert('修正に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsUpdatingTransaction(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (deletingTransactionId) return;
    if (!await confirmAction('この記録を削除しますか？')) return;

    setDeletingTransactionId(id);
    try {
      const target = transactions.find((transaction) => transaction.id === id);
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) alert('削除に失敗しました：' + error.message);
      else {
        if (target?.receipt_path) {
          const { error: receiptError } = await supabase.storage.from('receipts').remove([target.receipt_path]);
          if (receiptError) alert('取引は削除しましたが、レシート画像の削除に失敗しました：' + receiptError.message);
        }
        setTransactions((current) => current.filter(t => t.id !== id));
        setEditingTransaction(null);
        router.refresh();
      }
    } catch {
      alert('削除に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setDeletingTransactionId(null);
    }
  };

  // 合計値は、選択中の月と画面上のユーザーに属する取引だけを対象にする。
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;
  const normalizedKeyword = keyword.trim().toLocaleLowerCase('ja');
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesKeyword = !normalizedKeyword
      || transaction.description.toLocaleLowerCase('ja').includes(normalizedKeyword)
      || transaction.categories?.name.toLocaleLowerCase('ja').includes(normalizedKeyword);
    const matchesType = filterType === 'all' || transaction.type === filterType;
    const matchesCategory = filterCategoryId === 'all' || transaction.category_id === filterCategoryId;
    const matchesTag = filterTagId === 'all' || (transactionTagMap[transaction.id] || []).includes(filterTagId);
    return matchesKeyword && matchesType && matchesCategory && matchesTag;
  });

  const applyTemplate = (template: Template) => {
    setCategoryId(template.category_id);
    setAmount(String(template.amount));
    setDescription(template.description);
    document.getElementById('transaction-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const saveCurrentFilter = async () => {
    const name = window.prompt('検索条件の名前を入力してください');
    if (!name?.trim()) return;
    const { data, error } = await supabase.from('saved_filters').insert({
      user_id: currentUser, name: name.trim(), filter_type: 'transactions',
      conditions: { keyword, filterType, filterCategoryId, filterTagId },
    }).select().single();
    if (error) alert('検索条件の保存に失敗しました：' + error.message);
    else { setSavedFilters((current) => [...current, data]); notify('検索条件を保存しました'); }
  };

  const applySavedFilter = (filter: SavedFilter) => {
    const conditions = filter.conditions as { keyword?: string; filterType?: typeof filterType; filterCategoryId?: string; filterTagId?: string };
    setKeyword(conditions.keyword || '');
    setFilterType(conditions.filterType || 'all');
    setFilterCategoryId(conditions.filterCategoryId || 'all');
    setFilterTagId(conditions.filterTagId || 'all');
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
    if (error) alert('レシート画像を開けませんでした：' + error.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const getCalendarDays = () => {
    const start = new Date(jstYear, currentDate.getMonth(), 1);
    const end = new Date(jstYear, currentDate.getMonth() + 1, 0);
    const days = [];
    
    const startDayOfWeek = start.getDay();
    for (let i = 0; i < startDayOfWeek; i++) { days.push(null); }
    for (let i = 1; i <= end.getDate(); i++) { days.push(i); }
    return days;
  };

  const calendarDays = getCalendarDays();

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="家計簿を付ける" currentUser={currentUser} />

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
          {loading ? (
            <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
          ) : (
            <span className={`text-xl font-black ${totalBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              ¥{totalBalance.toLocaleString()}
            </span>
          )}
        </div>
        {!loading && (
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
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : dataError ? (
        <DataErrorCard message={dataError} onRetry={retryFetch} />
      ) : (
        <>
          {templates.length > 0 && <section className="flex flex-col gap-2"><h2 className="flex items-center gap-2 text-sm font-black"><Zap className="h-5 w-5 text-amber-500" />テンプレートから入力</h2><div className="flex gap-2 overflow-x-auto pb-1">{templates.map((template) => <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="min-h-12 shrink-0 rounded-xl border-2 border-slate-800 bg-amber-100 px-3 text-xs font-black">{template.name}<span className="ml-1 text-slate-500">¥{template.amount.toLocaleString()}</span></button>)}</div></section>}
          {/* 取引入力フォーム */}
          <form id="transaction-form" onSubmit={handleAddTransaction} className="scroll-mt-4 bg-emerald-50 border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
            <h2 className="font-black text-base text-emerald-950 flex items-center gap-1.5">
              <Plus className="w-5 h-5" strokeWidth={3} /> 今日の支出・収入
            </h2>
            {recentCategoryIds.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">
              {recentCategoryIds.map((id) => {
                const category = categories.find((item) => item.id === id);
                return category ? <button key={id} type="button" onClick={() => setCategoryId(id)} className={`min-h-11 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${categoryId === id ? 'border-slate-800 bg-amber-200' : 'border-slate-300 bg-white'}`}>{category.icon} {category.name}</button> : null;
              })}
            </div>}

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center justify-between"><label className="text-xs font-black text-emerald-900 pl-1">いつ？</label><button type="button" onClick={() => setDate(todayStr)} className="min-h-11 px-2 text-xs font-black text-emerald-700">今日</button></div>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mobile-date-input min-h-12 min-w-0 max-w-full rounded-xl border-2 border-slate-800 px-3 py-2 text-base font-bold" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-xs font-black text-emerald-900 pl-1">分類</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="min-h-12 min-w-0 max-w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-base font-bold">
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon || (c.type === 'expense' ? '💸' : '💰')} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">いくら？</label>
              <input type="number" inputMode="numeric" enterKeyHint="next" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); descriptionInputRef.current?.focus(); } }} placeholder="金額を入力" className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-black" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-emerald-900 pl-1">メモ（何に使った？）</label>
              <input ref={descriptionInputRef} type="text" enterKeyHint="done" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="カフェ、お買い物など（任意）" className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-bold" />
            </div>

            {tags.length > 0 && <div className="flex flex-col gap-2"><label className="flex items-center gap-1 text-xs font-black text-emerald-900"><Tag className="h-4 w-4" />タグ（複数選択可）</label><div className="flex flex-wrap gap-2">{tags.map((tag) => <button key={tag.id} type="button" onClick={() => setSelectedTagIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`min-h-11 rounded-xl border-2 px-3 text-xs font-black ${selectedTagIds.includes(tag.id) ? 'border-slate-800 bg-amber-200' : 'border-slate-300 bg-white'}`}># {tag.name}</button>)}</div></div>}

            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-500 bg-white text-sm font-black"><Camera className="h-5 w-5" />{receiptFile ? receiptFile.name : 'レシート画像を添付'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} className="sr-only" /></label>

            <button type="submit" disabled={isAddingTransaction} className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 text-sm mt-1 disabled:opacity-60 flex items-center justify-center gap-2">
              {isAddingTransaction
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 記録中...</>
                : '記録する！ ✨'}
            </button>
          </form>

          <section id="transaction-history" className="scroll-mt-4 flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-black"><Search className="h-4 w-4" />記録を検索・絞り込み</h2>
              <button
                type="button"
                onClick={() => { setKeyword(''); setFilterType('all'); setFilterCategoryId('all'); setFilterTagId('all'); }}
                className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-black text-slate-500"
              >
                <RotateCcw className="h-4 w-4" />リセット
              </button>
            </div>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="メモ・カテゴリ名で検索"
              className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select value={filterType} onChange={(event) => setFilterType(event.target.value as typeof filterType)} className="min-h-12 min-w-0 rounded-xl border-2 border-slate-800 bg-white px-3 text-base font-bold">
                <option value="all">収入・支出すべて</option>
                <option value="expense">支出のみ</option>
                <option value="income">収入のみ</option>
              </select>
              <select value={filterCategoryId} onChange={(event) => setFilterCategoryId(event.target.value)} className="min-h-12 min-w-0 rounded-xl border-2 border-slate-800 bg-white px-3 text-base font-bold">
                <option value="all">すべてのカテゴリ</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
              </select>
            </div>
            <select value={filterTagId} onChange={(event) => setFilterTagId(event.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base font-bold"><option value="all">すべてのタグ</option>{tags.map((tag) => <option key={tag.id} value={tag.id}># {tag.name}</option>)}</select>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={saveCurrentFilter} className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-slate-800 bg-indigo-100 px-3 text-xs font-black"><Bookmark className="h-4 w-4" />現在の条件を保存</button>{savedFilters.map((filter) => <button key={filter.id} type="button" onClick={() => applySavedFilter(filter)} className="min-h-11 rounded-xl border border-slate-400 px-3 text-xs font-black">{filter.name}</button>)}</div>
            <p className="text-right text-xs font-black text-slate-500">{filteredTransactions.length}件を表示</p>
          </section>

          {/* カレンダー形式の取引履歴 */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">今月の記録カレンダー 📅</p>
            
            <div className="bg-white border-2 border-slate-800 rounded-3xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-black mb-2">
                <span className="text-rose-500 bg-rose-50 py-0.5 rounded-md">日</span>
                <span className="text-slate-500">月</span>
                <span className="text-slate-500">火</span>
                <span className="text-slate-500">水</span>
                <span className="text-slate-500">木</span>
                <span className="text-slate-500">金</span>
                <span className="text-sky-500 bg-sky-50 py-0.5 rounded-md">土</span>
              </div>
              
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((day, index) => {
                  if (day === null) return <div key={`empty-${index}`} />;
                  
                  const formattedDay = String(day).padStart(2, '0');
                  const targetDateStr = `${yearMonth}-${formattedDay}`;
                  
                  const isToday = targetDateStr === todayStr;
                  const dayOfWeek = new Date(jstYear, currentDate.getMonth(), day).getDay();

                  const dayTransactions = filteredTransactions.filter(t => t.date === targetDateStr);
                  const dayExpense = dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                  const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

                  return (
                    <button
                      type="button"
                      key={`day-${day}`}
                      onClick={() => { setSelectedDate(targetDateStr); setEditingTransaction(null); }}
                      aria-label={`${day}日、記録${dayTransactions.length}件`}
                      className={`aspect-square min-h-11 border-2 rounded-xl flex flex-col items-center justify-center gap-1 p-1 active:bg-amber-100 transition-all relative
                        ${isToday ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-300 ring-offset-1' : 'border-slate-200'}
                        ${selectedDate === targetDateStr ? 'bg-amber-200 border-slate-800' : ''}
                        ${!isToday && dayOfWeek === 0 ? 'bg-rose-50/30' : ''}
                        ${!isToday && dayOfWeek === 6 ? 'bg-sky-50/30' : ''}
                      `}
                    >
                      <span className={`text-xs font-black 
                        ${dayOfWeek === 0 ? 'text-rose-600' : dayOfWeek === 6 ? 'text-sky-600' : 'text-slate-700'}
                        ${isToday ? 'bg-amber-400 text-slate-900 px-1 rounded-md text-[10px]' : ''}
                      `}>
                        {day}
                      </span>
                      
                      <div className="flex h-2 items-center justify-center gap-1">
                        {dayExpense > 0 && <span className="h-2 w-2 rounded-full bg-rose-400" />}
                        {dayIncome > 0 && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDate && (
              <div className="flex flex-col gap-2 rounded-3xl border-2 border-slate-800 bg-amber-50 p-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <p className="px-1 text-sm font-black text-slate-800">
                  {selectedDate.slice(5).replace('-', '月')}日 の記録
                </p>
                {filteredTransactions.filter((transaction) => transaction.date === selectedDate).length === 0 ? (
                  <p className="py-4 text-center text-sm font-bold text-slate-400">この日の記録はありません</p>
                ) : (
                  filteredTransactions.filter((transaction) => transaction.date === selectedDate).map((transaction) => (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => setEditingTransaction(transaction)}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-500">{transaction.categories?.name || '未分類'}</span>
                        <span className="block truncate text-sm font-bold text-slate-800">{transaction.description || 'メモなし'}</span>
                        {(transactionTagMap[transaction.id] || []).length > 0 && <span className="block truncate text-xs font-bold text-amber-700">{(transactionTagMap[transaction.id] || []).map((id) => `#${tags.find((tag) => tag.id === id)?.name || ''}`).join(' ')}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">{transaction.receipt_path && <Camera className="h-4 w-4 text-sky-600" />}<span className={`text-sm font-black ${transaction.type === 'expense' ? 'text-rose-500' : 'text-emerald-600'}`}>
                        {transaction.type === 'expense' ? '-' : '+'}¥{transaction.amount.toLocaleString()}
                      </span></span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 選択日の取引編集モーダル */}
      {selectedDate && editingTransaction && (
        <div onClick={() => setEditingTransaction(null)} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div onClick={(event) => event.stopPropagation()} className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl">
            <div className="bg-amber-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <span className="font-black text-base text-slate-800">
                {selectedDate.slice(5).replace('-', '月')}日 の記録
              </span>
              <button type="button" onClick={() => setEditingTransaction(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white">
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            <div className="flex max-h-[calc(90dvh-76px)] flex-col gap-4 overflow-y-auto p-4">
              {editingTransaction ? (
                <form onSubmit={handleUpdateTransaction} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">分類</label>
                    <select 
                      value={editingTransaction.category_id} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, category_id: e.target.value})} 
                      className="min-h-12 w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-base font-bold"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon || (c.type === 'expense' ? '💸' : '💰')} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">いくら？</label>
                    <input 
                      type="number" 
                      min="1"
                      step="1"
                      value={editingTransaction.amount} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, amount: Number(e.target.value)})}
                      className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-black"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-500">メモ</label>
                    <input 
                      type="text" 
                      value={editingTransaction.description} 
                      onChange={(e) => setEditingTransaction({...editingTransaction, description: e.target.value})} 
                      className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2 text-base font-bold"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setEditingTransaction(null)} className="min-h-12 flex-1 rounded-xl border-2 border-slate-800 bg-slate-100 py-2.5 text-sm font-black">
                      戻る
                    </button>
                    <button type="submit" disabled={isUpdatingTransaction} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-800 bg-slate-900 py-2.5 text-sm font-black text-white disabled:opacity-60">
                      {isUpdatingTransaction
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                        : '変更を保存する！'}
                    </button>
                  </div>
                  {editingTransaction.receipt_path && <button type="button" onClick={() => openReceipt(editingTransaction.receipt_path!)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 text-sm font-black text-sky-700"><Camera className="h-5 w-5" />レシート画像を見る</button>}
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
              ) : (
                <div className="flex flex-col gap-2">
                  {transactions.filter(t => t.date === selectedDate).length === 0 ? (
                    <p className="text-center text-sm font-bold text-slate-400 py-6">この日の記録はありません 🍃</p>
                  ) : (
                    transactions.filter(t => t.date === selectedDate).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3.5 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-lg shrink-0">
                            {t.categories?.icon || (t.type === 'expense' ? '💸' : '💰')}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-xs text-slate-400">{t.categories?.name || '未分類'}</span>
                            <span className="font-bold text-sm text-slate-700 mt-0.5">{t.description || 'メモなし'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-sm mr-1 ${t.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {t.type === 'expense' ? '-' : '+'}¥{t.amount.toLocaleString()}
                          </span>
                          <button type="button" onClick={() => setEditingTransaction(t)} className="text-xs bg-white border border-slate-400 font-bold px-2 py-1 rounded-md text-slate-600 active:bg-slate-100">
                            編集
                          </button>
                          <button type="button" onClick={() => handleDeleteTransaction(t.id)} disabled={deletingTransactionId !== null} className="text-slate-400 hover:text-rose-500 p-1 disabled:opacity-50">
                            {deletingTransactionId === t.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <Link href={`/recurring?user=${currentUser}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-indigo-100 text-sm font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
        <CalendarClock className="h-5 w-5" />固定費・定期取引を管理
      </Link>
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
