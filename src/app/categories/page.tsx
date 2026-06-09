"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react';
// さっき作ったSupabaseクライアントをインポート
import { supabase } from '../../lib/supabase';

// 絵文字アイコンのマッピング
const iconMap: { [key: string]: string } = {
  food: "🍔",
  shopping: "🛍️",
  transport: "🚗",
  home: "🏠",
  other: "✨",
};

// TypeScript用の型定義
interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
}

export default function CategoriesPage() {
  // 状態管理
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true); // 読み込み中フラグ
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");

  // --- 1. データの読み込み (SELECT) ---
  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: false }); // 新しい順に並べる

    if (error) {
      alert('データの取得に失敗しました：' + error.message);
    } else if (data) {
      setCategories(data as Category[]);
    }
    setLoading(false);
  };

  // 画面が開いたときに一回だけ実行する
  useEffect(() => {
    fetchCategories();
  }, []);

  // --- 2. データの追加 (INSERT) ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Supabaseにデータを送る
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, type }])
      .select(); // 挿入したデータを取得する

    if (error) {
      alert('追加に失敗しました：' + error.message);
    } else if (data) {
      // 画面の一覧に、追加されたデータを合流させる
      setCategories([data[0] as Category, ...categories]);
      setName(""); // 入力欄をクリア
    }
  };

  // --- 3. データの削除 (DELETE) ---
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('本当にこのカテゴリを削除しますか？')) return;

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id); // 指定したIDの行を消す

    if (error) {
      alert('削除に失敗しました：' + error.message);
    } else {
      // 画面の一覧から消したデータを省く
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
          // 読み込み中のぐるぐるアニメーション
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
                    <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-xl">
                      {cat.type === "expense" ? iconMap.food : iconMap.other}
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