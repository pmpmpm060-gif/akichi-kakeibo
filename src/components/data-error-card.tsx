"use client";

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DataErrorCardProps {
  message: string;
  onRetry: () => void;
}

export function DataErrorCard({ message, onRetry }: DataErrorCardProps) {
  // DB由来の英語エラー詳細はテーブル名などを含むため、画面には公開しない。
  const displayMessage = /[ぁ-んァ-ヶ一-龠]/.test(message)
    ? message
    : '通信状況を確認して、もう一度お試しください。';

  return (
    <div className="bg-rose-50 border-2 border-rose-500 rounded-3xl p-4 flex flex-col gap-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-rose-700">
        <AlertTriangle className="w-5 h-5" />
        <p className="text-sm font-black">データを読み込めませんでした</p>
      </div>
      <p className="text-xs font-bold text-rose-600 break-words">{displayMessage}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mx-auto flex items-center gap-1.5 bg-white border-2 border-slate-800 rounded-xl px-4 py-2 text-xs font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        もう一度読み込む
      </button>
    </div>
  );
}
