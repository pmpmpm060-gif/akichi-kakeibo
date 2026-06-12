"use client";

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useProfileDisplay } from '../lib/household-profiles';

type Toast = { id: number; message: string; tone: 'success' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);
const ConfirmContext = createContext<(message: string) => Promise<boolean>>(async () => false);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
  }, []);
  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => setConfirmation({ message, resolve })), []);
  const closeConfirmation = (result: boolean) => {
    confirmation?.resolve(result);
    setConfirmation(null);
  };

  return <>
    <ToastContext.Provider value={notify}><ConfirmContext.Provider value={confirm}>{children}</ConfirmContext.Provider></ToastContext.Provider>
    <div aria-live="polite" className="fixed inset-x-3 bottom-24 z-[70] mx-auto flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={`flex items-center gap-2 rounded-2xl border-2 border-slate-800 px-4 py-3 text-sm font-black shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] ${toast.tone === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {toast.tone === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}{toast.message}
        </div>
      ))}
    </div>
    {confirmation && <MobileSheet title="確認" onClose={() => closeConfirmation(false)}>
      <div className="flex flex-col gap-4 p-4">
        <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed">{confirmation.message}</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => closeConfirmation(false)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-slate-100 text-sm font-black">キャンセル</button>
          <button onClick={() => closeConfirmation(true)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-rose-500 text-sm font-black text-white">実行する</button>
        </div>
      </div>
    </MobileSheet>}
  </>;
}

export const useToast = () => useContext(ToastContext);
export const useConfirm = () => useContext(ConfirmContext);

export function AppHeader({ title, currentUser, subtitle }: { title: string; currentUser: string; subtitle?: string }) {
  const profile = useProfileDisplay(currentUser);
  return (
    <header className="flex items-center justify-between gap-2 pt-2">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={`/?user=${currentUser}`} aria-label="ホームへ戻る" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-800 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          {subtitle && <p className="truncate text-xs font-black text-slate-400">{subtitle}</p>}
          <h1 className="truncate text-2xl font-black">{title}</h1>
        </div>
      </div>
      <span className={`shrink-0 rounded-full border-2 border-slate-800 px-2.5 py-1 text-xs font-black ${currentUser === 'user_a' ? 'bg-amber-200' : 'bg-purple-200'}`}>
        {profile?.icon} {profile?.display_name || (currentUser === 'user_a' ? 'ママ' : 'パパ')}
      </span>
    </header>
  );
}

export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const startY = useRef<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => { startY.current = event.touches[0].clientY; }}
        onTouchEnd={(event) => {
          if (startY.current !== null && event.changedTouches[0].clientY - startY.current > 90) onClose();
          startY.current = null;
        }}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between border-b-2 border-slate-800 bg-amber-100 p-4">
          <h2 className="font-black">{title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useHorizontalSwipe(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: React.TouchEvent) => { start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; },
    onTouchEnd: (event: React.TouchEvent) => {
      if (!start.current) return;
      const dx = event.changedTouches[0].clientX - start.current.x;
      const dy = event.changedTouches[0].clientY - start.current.y;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) onPrevious();
        else onNext();
      }
      start.current = null;
    },
  };
}
