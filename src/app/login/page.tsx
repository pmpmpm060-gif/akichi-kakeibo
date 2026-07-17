"use client";

import { useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');

  const validateSignUpInput = () => {
    if (!email.trim()) {
      setErrorMsg('メールアドレスを入力してください。');
      return false;
    }
    if (password.length < 10) {
      setErrorMsg('新規登録には10文字以上のパスワードを入力してください。');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setNoticeMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg('メールアドレスまたはパスワードを確認してください。');
      } else {
        // フルナビゲーションにより、新しく保存された認証CookieをProxyで検証してから
        // 保護対象のトップ画面を表示する。
        window.location.href = '/';
      }
    } catch (err) {
      console.error("Login failed unexpectedly:", err);
      setErrorMsg("通信エラーが発生しました 😭");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (loading || !validateSignUpInput()) return;
    setLoading(true);
    setErrorMsg('');
    setNoticeMsg('');
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setErrorMsg('利用登録を開始できませんでした。入力内容を確認し、時間を置いてもう一度お試しください。');
      } else {
        if (!data.session) {
          setErrorMsg('登録は完了しましたが、ログインを開始できませんでした。パパへ連絡してください。');
          return;
        }
        const request = await supabase.rpc('request_app_approval');
        if (request.error) throw request.error;
        window.location.href = request.data === 'approved' ? '/setup' : '/approval-pending';
      }
    } catch (error: unknown) {
      console.error('Sign up failed unexpectedly:', error);
      setErrorMsg('登録処理中に通信エラーが発生しました。時間を置いてもう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center gap-8 bg-amber-50/50 px-4 py-5">
      <div className="text-center">
        <h1 className="text-4xl font-black mt-2 tracking-tight text-slate-800">
          ぽっぷ<span className="text-emerald-500">家計簿</span>
        </h1>
        <p className="text-xs font-bold text-slate-400 mt-2">登録済みのアカウントでログインしてください。</p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4 rounded-3xl border-4 border-slate-800 bg-white p-5 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
        {errorMsg && (
          <p className="text-xs font-black text-rose-500 bg-rose-50 border-2 border-rose-500 p-2.5 rounded-xl text-center whitespace-pre-wrap">
            {errorMsg}
          </p>
        )}
        {noticeMsg && (
          <p className="whitespace-pre-wrap rounded-xl border-2 border-emerald-600 bg-emerald-50 p-2.5 text-center text-xs font-black text-emerald-700">
            {noticeMsg}
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
            className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-bold"
          />
          <p className="pl-1 text-[11px] font-bold text-slate-400">新規登録時は10文字以上で入力してください。</p>
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
            className="min-h-12 w-full rounded-xl border-2 border-slate-800 px-4 py-2.5 text-base font-bold"
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
            'ログインする'
          )}
        </button>
        <button type="button" onClick={handleSignUp} disabled={loading} className="min-h-12 rounded-2xl border-2 border-slate-800 bg-emerald-100 text-sm font-black disabled:opacity-50">新しく利用登録する</button>
        <p className="text-center text-[11px] font-bold leading-relaxed text-slate-400">新規登録後はパパの承認を待ちます。確認メールは使用しません。</p>
      </form>
    </div>
  );
}
