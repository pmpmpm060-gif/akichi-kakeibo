"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2, Edit2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DataErrorCard } from '../../components/data-error-card';

// ユーザーが選べるポップな絵文字パレットの候補
// ユーザーが選べるポップな絵文字パレットの候補（インフラ・通信・たばこを追加！）
const ICON_PALETTE = [
  "🍔", "🛍️", "🚗", "🏠", "✨", "🍿", "🎮", "🐱", "💪", "💴", "🎁",
  "💧", // 水道
  "⚡", // 電気
  "🔥", // ガス
  "📱", // 携帯 (既存のものをこちらに整理)
  "💻", // ネット
  "🚬"  // たばこ
];
interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
}

export default function CategoriesPage() {
  // 状態管理
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  
  // 新規登録用の状態
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [selectedIcon, setSelectedIcon] = useState("🍔");

  // 💡 修正モード（モーダル）用の状態管理
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    let ignore = false;

    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: false });

      if (ignore) return;

      if (error) {
        setDataError(error.message);
      } else if (data) {
        setCategories(data as Category[]);
      }
      setLoading(false);
    };

    void fetchCategories();

    return () => {
      ignore = true;
    };
  }, [retryKey]);

  const retryFetch = () => {
    setLoading(true);
    setDataError(null);
    setRetryKey((current) => current + 1);
  };

  // --- 2. データの追加 (INSERT) ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, type, icon: selectedIcon }])
      .select();

    if (error) {
      alert('追加に失敗しました：' + error.message);
    } else if (data) {
      setCategories([data[0] as Category, ...categories]);
      setName("");
    }
  };

  // --- 3. 💡 データの更新 (UPDATE) ---
  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editingCategory.name.trim()) return;

    const { error } = await supabase
      .from('categories')
      .update({
        name: editingCategory.name,
        type: editingCategory.type,
        icon: editingCategory.icon
      })
      .eq('id', editingCategory.id);

    if (error) {
      alert('修正に失敗しました：' + error.message);
    } else {
      // 画面上のステートを更新して即時反映
      setCategories(categories.map(cat => cat.id === editingCategory.id ? editingCategory : cat));
      setEditingCategory(null); // モーダルを閉じる
    }
  };

  // --- 4. データの削除 (DELETE) ---
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('本当にこのカテゴリを削除しますか？\n※このカテゴリを紐づけている家計簿の記録がある場合、表示に影響が出る可能性があります。')) return;

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      alert('削除に失敗しました：' + error.message);
    } else {
      setCategories(categories.filter(cat => cat.id !== id));
      if (editingCategory?.id === id) setEditingCategory(null); // 編集中のものを消したらモーダルも閉じる
    }
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 pt-2">
        <Link 
          href="/" 
          className="w-10 h-10 bg-white border-2 border-slate-800 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
        >
          <ArrowLeft className="w-5 h-5 text-slate-800" strokeWidth={2.5} />
        </Link>
        <h1 className="text-2xl font-black tracking-tight">カテゴリ設定</h1>
      </div>

      {/* 新規登録カード */}
      <form 
        onSubmit={handleAddCategory}
        className="bg-pink-100 border-2 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4"
      >
        <h2 className="font-black text-base text-pink-950 flex items-center gap-1.5">
          <Plus className="w-5 h-5" strokeWidth={3} /> あたらしいカテゴリ
        </h2>

        {/* 収支タイプ切り替え */}
        <div className="grid grid-cols-2 gap-2 bg-white/60 p-1 rounded-2xl border border-slate-300">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`py-2 rounded-xl font-black text-sm transition-all ${type === "expense" ? "bg-rose-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
          >
            💸 支出
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`py-2 rounded-xl font-black text-sm transition-all ${type === "income" ? "bg-emerald-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
          >
            💰 収入
          </button>
        </div>

        {/* アイコンをえらぶ */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black text-pink-900 pl-1">アイコンをえらぶ</label>
          <div className="grid grid-cols-6 gap-2 bg-white/80 p-3 rounded-2xl border-2 border-slate-800">
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
            className="w-full px-4 py-3 rounded-2xl border-2 border-slate-800 focus:outline-none font-bold text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 text-white font-black py-3 rounded-2xl border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] text-sm mt-1"
        >
          このカテゴリを追加する ✨
        </button>
      </form>

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

                  {/* 💡 ボタンエリア：直すボタンを追加 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCategory(cat)}
                      className="w-9 h-9 text-slate-600 bg-white border border-slate-400 font-bold rounded-xl flex items-center justify-center active:bg-slate-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="w-9 h-9 text-rose-500 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 💡 【新機能】カテゴリ修正用のポップアップ（モーダル） */}
      {editingCategory && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* ポップアップヘッダー */}
            <div className="bg-amber-100 border-b-2 border-slate-800 p-4 flex justify-between items-center">
              <span className="font-black text-base text-slate-800">
                カテゴリの修正 📝
              </span>
              <button 
                type="button"
                onClick={() => setEditingCategory(null)} 
                className="w-8 h-8 bg-white border-2 border-slate-800 rounded-xl flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-800" strokeWidth={3} />
              </button>
            </div>

            {/* ポップアップメインコンテンツ */}
            <form onSubmit={handleUpdateCategory} className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {/* 収支タイプの修正 */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-300">
                <button
                  type="button"
                  onClick={() => setEditingCategory({ ...editingCategory, type: 'expense' })}
                  className={`py-2 rounded-xl font-black text-sm transition-all ${editingCategory.type === "expense" ? "bg-rose-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
                >
                  💸 支出
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategory({ ...editingCategory, type: 'income' })}
                  className={`py-2 rounded-xl font-black text-sm transition-all ${editingCategory.type === "income" ? "bg-emerald-400 text-white border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" : "text-slate-600"}`}
                >
                  💰 収入
                </button>
              </div>

              {/* アイコンの修正 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-500 pl-1">アイコンを変更する</label>
                <div className="grid grid-cols-6 gap-2 bg-slate-50 p-3 rounded-2xl border-2 border-slate-800">
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
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-800 focus:outline-none font-bold text-sm"
                />
              </div>

              {/* アクションボタン */}
              <div className="flex gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingCategory(null)} 
                  className="flex-1 bg-slate-100 border-2 border-slate-800 font-black py-3 rounded-xl text-sm"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-slate-900 text-white border-2 border-slate-800 font-black py-3 rounded-xl text-sm"
                >
                  変更を保存する！ ✨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
