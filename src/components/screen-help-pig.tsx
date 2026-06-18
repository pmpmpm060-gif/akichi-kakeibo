"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';

type ScreenGuide = {
  title: string;
  introduction: string;
  steps: string[];
  tip?: string;
};

const guides: Record<string, ScreenGuide> = {
  '/': {
    title: 'トップ画面の使い方',
    introduction: '今月の家計状況を、ひと目で確認できる画面だぶー！',
    steps: [
      'ママ・パパボタンで、確認するユーザーを切り替えます。',
      '「今月使ったお金」を押すと、カテゴリ別の予算と実績が開きます。',
      '家計アラートで、変動費の予算到達や予算超過、前月より増えた支出を確認します。確認後は右端の削除ボタンで消せます。',
      '月次レポート・定期取引・貯金目標ボタンから各機能へ移動できます。',
    ],
    tip: 'まずは「あと使えるお金」を確認すると、今日使える目安が分かりやすいぶー！',
  },
  '/dashboard': {
    title: '家計簿を付ける画面の使い方',
    introduction: '毎日の収入・支出を記録して、月ごとの状況を確認する画面だぶー！',
    steps: [
      '日付・分類・金額・メモを入力して記録します。',
      'よく使う内容はテンプレートからワンタップで入力できます。',
      '検索欄と絞り込みを使うと、目的の記録だけを表示できます。',
      'カレンダーの日付を押すと、その日の記録が下に表示されます。',
      '表示された記録を押すと、編集・削除できます。',
    ],
    tip: '固定費は画面下の「固定費・定期取引を管理」から自動登録にすると楽だぶー！',
  },
  '/budgets': {
    title: '予算画面の使い方',
    introduction: 'カテゴリごとの基本予算と、翌月への繰越を設定する画面だぶー！',
    steps: [
      '各カテゴリに毎月の予算額を入力します。',
      '余りや超過を翌月へ反映したいカテゴリは、繰越を有効にします。',
      '最後に「予算と繰越設定を保存する」を押します。',
    ],
    tip: '支出カテゴリの予算が、トップ画面の「あと使えるお金」に使われるぶー！',
  },
  '/categories': {
    title: 'カテゴリ画面の使い方',
    introduction: '収入・支出を分類するカテゴリを管理する画面だぶー！',
    steps: [
      '収入または支出を選び、アイコンとカテゴリ名を設定します。',
      '「このカテゴリを追加する」を押して登録します。',
      '登録済みカテゴリの編集ボタンから、名前・種類・アイコンを変更できます。',
      '上下ボタンで並び替えた後、「並び順を保存」を押すと他の画面にも反映されます。',
      '削除は編集画面の一番下から行います。',
    ],
    tip: '家計簿記録や定期取引で使っているカテゴリは、安全のため削除できないぶー！',
  },
  '/recurring': {
    title: '定期取引画面の使い方',
    introduction: '家賃・給与・サブスクなどを毎月自動登録する画面だぶー！',
    steps: [
      '分類・金額・メモ・毎月の登録日・期間を入力します。',
      '保存すると、対象月の家計簿へ自動登録されます。',
      '登録済みカードの編集ボタンから、次回分以降の内容を変更できます。',
      '一時的に止める場合は「自動登録：有効」を押して停止します。',
    ],
    tip: '月末より大きい登録日は、その月の末日に自動調整されるぶー！',
  },
  '/special-expenses': {
    title: '特別支出予定の使い方',
    introduction: '税金や年払い保険など、不定期な支払いに毎月備える画面だぶー！',
    steps: [
      '名前・カテゴリ・毎月の積立目安・積立開始月を入力します。',
      '納付書などに書かれた支払い予定日と金額を、必要な件数だけ追加します。',
      '支払月を開くと家計簿へ実額が一度だけ自動登録されます。',
      'トップ画面では毎月の積立目安と積立残高を確認できます。',
    ],
    tip: '実績は支払月へ正確に残し、積立目安で毎月の負担感を平準化するぶー！',
  },
  '/reports': {
    title: '家計レポートの使い方',
    introduction: '支出の変化や長期的な家計の流れを確認する画面だぶー！',
    steps: [
      '「月別」と「年間」で、確認したいレポートを切り替えます。',
      '左右の矢印で対象月・対象年を変更します。',
      '月別では前月との差やカテゴリランキングを確認できます。',
      '年間では年間収支・月平均・年間ランキングを確認できます。',
      '月ごとの振り返りメモを保存できます。',
    ],
    tip: '月別と年間を切り替えると、使いすぎの傾向を見つけやすいぶー！',
  },
  '/savings': {
    title: '貯金目標画面の使い方',
    introduction: '旅行や緊急資金など、目的別の貯金を管理する画面だぶー！',
    steps: [
      '目標名・目標金額・任意の目標日を入力して目標を作ります。',
      '各目標の入力欄から積立額を追加します。',
      '取り崩す場合は、マイナスの金額を入力します。',
      '達成率と、目標日までに必要な月々の積立目安を確認します。',
    ],
    tip: '積立残高が0円未満になる取り崩しはできないぶー！',
  },
  '/more': {
    title: 'その他の機能の使い方',
    introduction: '日常操作以外の管理・分析機能をまとめた画面だぶー！',
    steps: [
      'カテゴリ設定では、収入・支出の分類を管理できます。',
      '家計レポートでは、月別・年間の家計傾向を確認できます。',
      '定期取引と貯金目標も、この画面から開けます。',
      'パパには、新規アカウントの利用申請を承認するメニューが表示されます。',
    ],
    tip: '普段の記録は下部中央の「記録する」からすぐ始められるぶー！',
  },
  '/tools': {
    title: '便利機能設定の使い方',
    introduction: '家計簿入力をもっと素早く、見やすくする設定画面だぶー！',
    steps: [
      '取引テンプレートを作ると、家計簿画面からワンタップで入力できます。',
      '保存済み検索条件の確認と削除ができます。',
      '通知を許可すると、指定時刻以降に記録リマインダーを表示します。',
    ],
    tip: 'ホーム画面へ追加すると、スマホアプリのように起動できるぶー！',
  },
  '/login': {
    title: 'ログイン画面の使い方',
    introduction: '登録済みのアカウントで家計簿へ入る画面だぶー！',
    steps: [
      'メールアドレスを入力します。',
      'パスワードを入力します。',
      '「ログインする」を押します。',
      '初めて使う場合はメールアドレスと10文字以上のパスワードを入力し、「新しく利用登録する」を押します。',
      '新規登録後はパパの承認を待ちます。確認メールは使用しません。',
    ],
    tip: '一度ログインすると、次回から自動で家計簿を開けるぶー！',
  },
  '/admin/approvals': {
    title: '利用申請の承認画面の使い方',
    introduction: '新しく登録した人が家計簿を使えるように承認する画面だぶー！',
    steps: [
      '申請者のメールアドレスを確認します。',
      '利用を許可する場合は「承認」を押します。',
      '知らない申請や許可しない申請は「却下」を押します。',
    ],
    tip: '承認した人にも独立した家計簿が作られ、既存の世帯データは見えないぶー！',
  },
};

export function ScreenHelpPig() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  if (pathname === '/approval-pending') return null;
  const guide = guides[pathname] || guides['/'];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`${guide.title}を開く`}
        className="fixed bottom-24 right-[max(0.75rem,calc((100vw-28rem)/2+0.75rem))] z-30 flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-800 bg-pink-200 text-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-[1px] active:translate-y-[1px]"
      >
        🐷
      </button>

      {isOpen && (
        <div onClick={() => setIsOpen(false)} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={guide.title}
            onClick={(event) => event.stopPropagation()}
            className="mobile-sheet w-full max-w-md overflow-hidden rounded-t-3xl border-4 border-slate-800 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] sm:rounded-3xl"
          >
            <header className="flex items-center justify-between border-b-2 border-slate-800 bg-pink-100 p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐷</span>
                <h2 className="font-black">{guide.title}</h2>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="使い方を閉じる" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-white">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex max-h-[calc(90dvh-76px)] flex-col gap-4 overflow-y-auto p-4">
              <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold leading-relaxed text-slate-700">{guide.introduction}</p>
              <ol className="flex flex-col gap-3">
                {guide.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-2xl border-2 border-slate-200 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span>
                    <span className="text-sm font-bold leading-relaxed text-slate-700">{step}</span>
                  </li>
                ))}
              </ol>
              {guide.tip && (
                <p className="flex gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-xs font-black leading-relaxed text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  {guide.tip}
                </p>
              )}
              <button type="button" onClick={() => setIsOpen(false)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-slate-900 text-sm font-black text-white">
                わかったぶー！
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
