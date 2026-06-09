"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// 💡 ユーザーが選べるポップな絵文字パレットの候補
const ICON_PALETTE = ["🍔", "🛍️", "🚗", "🏠", "✨", "☕", "🍿", "🎮", "🐱", "💪", "💴", "🎁"];

interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string; // 💡 DBに追加したiconカラム用
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  
  // 💡 選択中のアイコン状態（初期値はパレットの先頭）
  const [selectedIcon, setSelectedIcon] = useState("🍔");

  // --- 1. データの読み込み (iconカラムも一緒に取得) ---
  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      alert('データの取得に失敗しました：' + error.message);
    } else if (data) {
      setCategories(data as Category[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // --- 2. データの追加 (選んだiconを一緒にINSERT) ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const { data, error } = await supabase
      .from('categories')
      .insert([{ 
        name, 
        type, 
        icon: selectedIcon // 💡 ここで選んだ絵文字をDBに送る！
      }])
      .select();

    if (error) {
      alert('追加に失敗しました：' + error.message);
    } else if (data) {
      setCategories([data[0] as Category, ...categories]);
      setName("");
      // 次に入力しやすいようにデフォルトアイコンを戻すか、そのままにする
    }
  };

  // --- 3. データの削除 ---
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('本当にこのカテゴリを削除しますか？')) return;

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      alert('削除に失敗しました：' + error.message);
    } else {
      setCategories(categories.filter(cat => cat.id !== id));
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

        {/* 💡 アイコン（絵文字）パレットの選択セクション */}
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

        {/* 追加ボタン */}
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
                    {/* 💡 DBから持ってきた固有のアイコン（cat.icon）を表示！ */}
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

                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="w-9 h-9 text-rose-500 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}