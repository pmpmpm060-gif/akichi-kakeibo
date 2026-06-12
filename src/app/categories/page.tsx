"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Loader2, Edit2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DataErrorCard } from '../../components/data-error-card';
import type { Category } from '../../lib/database-helpers';
import { parseHouseholdUser } from '../../lib/household-users';
import { AppHeader, useConfirm, useToast } from '../../components/mobile-ui';

// カテゴリカードの見た目を揃えるため、選択可能なアイコンを限定する。
const ICON_PALETTE = [
  "🍔", "🛍️", "🚗", "🏠", "✨", "🍿", "🎮", "🐱", "💪", "💴", "🎁",
  "💧", "⚡", "🔥", "📱", "💻", "🚬"
];
function CategoriesPageContent() {
  const searchParams = useSearchParams();
  const currentUser = parseHouseholdUser(searchParams.get('user'));
  const confirmAction = useConfirm();
  const notify = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [selectedIcon, setSelectedIcon] = useState("🍔");

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    // ユーザー切替前の通信結果が後から返る場合があるため、古い結果は無視する。
    // これにより、別ユーザーのカテゴリが誤表示されることを防ぐ。
    let ignore = false;

    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', currentUser)
        .order('created_at', { ascending: false });

      if (ignore) return;

      if (error) {
        setDataError(error.message);
      } else if (data) {
        setCategories(data);
      }
      setLoading(false);
    };

    void fetchCategories();

    return () => {
      ignore = true;
    };
  }, [currentUser, retryKey]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isAddingCategory) return;

    setIsAddingCategory(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: trimmedName, type, icon: selectedIcon, user_id: currentUser }])
        .select()
        .single();

      if (error) {
        alert('追加に失敗しました：' + error.message);
      } else {
        setCategories((current) => [data, ...current]);
        setName("");
        setIsAddFormOpen(false);
      }
    } catch {
      alert('追加に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || isUpdatingCategory) return;

    const trimmedName = editingCategory.name.trim();
    if (!trimmedName) return;

    setIsUpdatingCategory(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .update({
          name: trimmedName,
          type: editingCategory.type,
          icon: editingCategory.icon
        })
        .eq('id', editingCategory.id)
        .select()
        .single();

      if (error) {
        alert('修正に失敗しました：' + error.message);
      } else {
        setCategories((current) => current.map((cat) => cat.id === data.id ? data : cat));
        setEditingCategory(null);
      }
    } catch {
      alert('修正に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (deletingCategoryId) return;
    if (!await confirmAction(`「${category.name}」を削除しますか？\n関連する予算設定も削除されます。家計簿の記録や定期取引がある場合は削除できません。`)) return;

    setDeletingCategoryId(category.id);
    try {
      // RPC内でカテゴリをロックし、取引履歴がある場合は削除を拒否する。
      // 関連予算の削除も同じトランザクションで実行される。
      const { data: deletedBudgetCount, error } = await supabase
        .rpc('delete_unused_category', { target_category_id: category.id });

      if (error) {
        const message = error.message.includes('transaction records')
          ? 'このカテゴリには家計簿の記録があるため削除できません。先に記録を別カテゴリへ変更してください。'
          : error.message.includes('recurring transactions')
            ? 'このカテゴリは定期取引で使用中のため削除できません。先に定期取引のカテゴリを変更するか、定期取引を削除してください。'
            : '削除に失敗しました：' + error.message;
        alert(message);
      } else {
        setCategories((current) => current.filter((cat) => cat.id !== category.id));
        if (editingCategory?.id === category.id) setEditingCategory(null);
        const budgetMessage = deletedBudgetCount > 0
          ? `関連する予算設定 ${deletedBudgetCount} 件も削除しました。`
          : '関連する予算設定はありませんでした。';
        notify(`カテゴリを削除しました。${budgetMessage}`);
      }
    } catch {
      alert('削除に失敗しました。通信状況を確認して、もう一度お試しください。');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <AppHeader title="カテゴリ設定" currentUser={currentUser} />

      <button type="button" onClick={() => setIsAddFormOpen((current) => !current)} className="flex min-h-12 items-center justify-between rounded-2xl border-2 border-slate-800 bg-pink-100 px-4 text-sm font-black shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
        <span className="flex items-center gap-2"><Plus className="h-5 w-5" />新しいカテゴリを追加</span>{isAddFormOpen ? <ChevronUp /> : <ChevronDown />}
      </button>
      {/* 新規登録カード */}
      {isAddFormOpen && <form
        onSubmit={handleAddCategory}
        className="bg-pink-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4"
      >
        <h2 className="font-black text-base text-pink-950 flex items-center gap-1.5">
          <Plus className="w-5 h-5" strokeWidth={3} /> 新しいカテゴリ
        </h2>

        {/* 収支タイプ切り替え */}
        <div className="grid grid-cols-2 gap-2 bg-white/60 p-1 rounded-2xl border border-slate-300">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`min-h-11 py-2 rounded-xl font-black text-sm transition-all ${type === "expense" ? "bg-rose-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
          >
            💸 支出
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`min-h-11 py-2 rounded-xl font-black text-sm transition-all ${type === "income" ? "bg-emerald-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
          >
            💰 収入
          </button>
        </div>

        {/* アイコンを選ぶ */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black text-pink-900 pl-1">アイコンを選ぶ</label>
          <div className="grid grid-cols-5 gap-2 bg-white/80 p-3 rounded-2xl border-2 border-slate-800">
            {ICON_PALETTE.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setSelectedIcon(icon)}
                className={`aspect-square text-xl flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
                  selectedIcon === icon 
                    ? "bg-amber-200 border-2 border-slate-800 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]" 
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* カテゴリ名入力 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-pink-900 pl-1">カテゴリ名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: カフェ代、副業など"
            className="min-h-12 w-full rounded-2xl border-2 border-slate-800 px-4 py-3 text-base font-bold focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isAddingCategory}
          className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] text-sm mt-1 disabled:opacity-60"
        >
          {isAddingCategory
            ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />追加しています</>
            : 'このカテゴリを追加する ✨'}
        </button>
      </form>}

      {/* カテゴリ一覧 */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">登録されているカテゴリ</p>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : dataError ? (
          <DataErrorCard message={dataError} onRetry={retryFetch} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {categories.length === 0 ? (
              <p className="text-center text-sm font-bold text-slate-400 py-6">まだ登録がありません 🐣</p>
            ) : (
              categories.map((cat) => (
                <div 
                  key={cat.id}
                  className="flex items-center justify-between p-3.5 bg-white border-2 border-slate-800 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 border-2 border-slate-800 rounded-xl flex items-center justify-center text-xl shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]">
                      {cat.icon || "✨"} 
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-slate-800">{cat.name}</h3>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border ${cat.type === "expense" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>
                        {cat.type === "expense" ? "支出" : "収入"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <button
                      onClick={() => setEditingCategory(cat)}
                      disabled={deletingCategoryId !== null || isUpdatingCategory}
                      aria-label={`${cat.name}を編集`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-400 bg-white font-bold text-slate-600 active:bg-slate-100 disabled:opacity-50"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* カテゴリ編集モーダル */}
      {editingCategory && (
        <div onClick={() => setEditingCategory(null)} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div onClick={(event) => event.stopPropagation()} className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl">
            <div className="bg-amber-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <span className="font-black text-base text-slate-800">
                カテゴリの修正 📝
              </span>
              <button 
                type="button"
                onClick={() => setEditingCategory(null)}
                disabled={isUpdatingCategory}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white disabled:opacity-50"
              >
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            <form onSubmit={handleUpdateCategory} className="flex max-h-[calc(90dvh-76px)] flex-col gap-4 overflow-y-auto p-4">
              {/* 収支タイプの修正 */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-300">
                <button
                  type="button"
                  onClick={() => setEditingCategory({ ...editingCategory, type: 'expense' })}
                  className={`min-h-11 py-2 rounded-xl font-black text-sm transition-all ${editingCategory.type === "expense" ? "bg-rose-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
                >
                  💸 支出
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategory({ ...editingCategory, type: 'income' })}
                  className={`min-h-11 py-2 rounded-xl font-black text-sm transition-all ${editingCategory.type === "income" ? "bg-emerald-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
                >
                  💰 収入
                </button>
              </div>

              {/* アイコンの修正 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-500 pl-1">アイコンを変更する</label>
                <div className="grid grid-cols-5 gap-2 bg-slate-50 p-3 rounded-2xl border-2 border-slate-800">
                  {ICON_PALETTE.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setEditingCategory({ ...editingCategory, icon })}
                      className={`aspect-square text-xl flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
                        editingCategory.icon === icon 
                          ? "bg-amber-200 border-2 border-slate-800 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]" 
                          : "bg-white border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* カテゴリ名の修正 */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-500 pl-1">カテゴリ名</label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  className="min-h-12 w-full rounded-2xl border-2 border-slate-800 px-4 py-3 text-base font-bold focus:outline-none"
                />
              </div>

              {/* アクションボタン */}
              <div className="flex gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingCategory(null)}
                  disabled={isUpdatingCategory}
                  className="flex-1 bg-slate-100 border-2 border-slate-800 font-black py-3 rounded-xl text-sm disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  disabled={isUpdatingCategory}
                  className="flex-1 bg-slate-900 text-white border-2 border-slate-800 font-black py-3 rounded-xl text-sm disabled:opacity-60"
                >
                  {isUpdatingCategory
                    ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />保存しています</>
                    : '変更を保存する！ ✨'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteCategory(editingCategory)}
                disabled={deletingCategoryId !== null || isUpdatingCategory}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 text-sm font-black text-rose-600 disabled:opacity-50"
              >
                {deletingCategoryId === editingCategory.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
                このカテゴリを削除する
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    }>
      <CategoriesPageContent />
    </Suspense>
  );
}
