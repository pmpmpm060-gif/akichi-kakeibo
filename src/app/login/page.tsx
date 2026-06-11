"use client";

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2, Lock, Mail, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // あなたのSupabaseのURLとキー
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // 👈 ご自身のURLに書き換えてください
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // 👈 ご自身のAnon Keyに書き換えてください
  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // 📝 【ログ1】ボタンが押されたことを記録
    console.log("=== 🎫 ログイン処理を開始します ===");
    console.log("入力されたメールアドレス:", email);

    try {
      // Supabaseにログインを要請
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // 📝 【ログ2】Supabase側からエラーが返ってきた場合
        console.error("❌ Supabase認証エラー発生:", error.status, error.message);
        setErrorMsg(`エラー: ${error.message} 😭`);
        setLoading(false);
      } else {
        // 📝 【ログ3】認証自体は成功した場合
        console.log("✅ Supabase認証成功！ユーザーID:", data.user?.id);
        console.log("セッション情報:", data.session ? "クッキー保存OK" : "セッション空っぽ？");

        // 確実にクッキーがブラウザに書き込まれるのを少し待ってリダイレクト
setTimeout(() => {
  console.log("🚀 画面をトップ（/）に強制遷移（リロード型）します...");
  window.location.href = '/';
}, 500);
      }
    } catch (err) {
      // 📝 【ログ4】予期せぬクラッシュが起きた場合
      console.error("🚨 システム的なエラーが発生しました:", err);
      setErrorMsg("通信エラーが発生しました 😭");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 min-h-screen flex flex-col justify-center bg-amber-50/50 gap-8">
      <div className="text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Welcome Back!
        </span>
        <h1 className="text-4xl font-black mt-2 tracking-tight text-slate-800">
          ぽっぷ<span className="text-emerald-500">家計簿</span>
        </h1>
        <p className="text-xs font-bold text-slate-400 mt-2">一度ログインすれば次からは自動で開くよ！ 🐷</p>
      </div>

      <form onSubmit={handleLogin} className="bg-white border-4 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] flex flex-col gap-4">
        {errorMsg && (
          <p className="text-xs font-black text-rose-500 bg-rose-50 border-2 border-rose-500 p-2.5 rounded-xl text-center whitespace-pre-wrap">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-slate-600 pl-1 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> メールアドレス
          </label>
          <input 
            type="email" 
            required
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@mail.com" 
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-bold text-sm" 
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-slate-600 pl-1 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> パスワード
          </label>
          <input 
            type="password" 
            required
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="••••••••" 
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-800 font-bold text-sm" 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-slate-900 text-white font-black py-3.5 rounded-2xl border-2 border-slate-800 text-sm mt-2 flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'ログインする！ ✨'
          )}
        </button>
      </form>
    </div>
  );
}
