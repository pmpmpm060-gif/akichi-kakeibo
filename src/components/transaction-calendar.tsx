import type { TransactionWithCategory } from '../lib/database-helpers';

type TransactionCalendarProps = {
  currentDate: Date;
  transactions: TransactionWithCategory[];
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onTransactionClick?: (transaction: TransactionWithCategory) => void;
};

function getCalendarDays(currentDate: Date) {
  const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const days: Array<number | null> = [];

  const startDayOfWeek = start.getDay();
  for (let i = 0; i < startDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= end.getDate(); i++) days.push(i);
  return days;
}

function formatCalendarAmount(amount: number) {
  if (amount >= 10000) {
    const value = Math.floor(amount / 1000) / 10;
    return `${String(value).replace(/\.0$/, '')}万`;
  }
  return String(amount);
}

export function TransactionCalendar({
  currentDate,
  transactions,
  todayStr,
  selectedDate,
  onSelectDate,
  onTransactionClick,
}: TransactionCalendarProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const calendarDays = getCalendarDays(currentDate);
  const selectedTransactions = selectedDate
    ? transactions.filter((transaction) => transaction.date === selectedDate)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-xs font-black uppercase tracking-widest text-slate-400">今月の記録カレンダー 📅</p>

      <div className="rounded-3xl border-2 border-slate-800 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-black">
          <span className="rounded-md bg-rose-50 py-0.5 text-rose-500">日</span>
          <span className="text-slate-500">月</span>
          <span className="text-slate-500">火</span>
          <span className="text-slate-500">水</span>
          <span className="text-slate-500">木</span>
          <span className="text-slate-500">金</span>
          <span className="rounded-md bg-sky-50 py-0.5 text-sky-500">土</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} className="h-14" />;

            const formattedDay = String(day).padStart(2, '0');
            const targetDateStr = `${yearMonth}-${formattedDay}`;
            const isToday = targetDateStr === todayStr;
            const dayOfWeek = new Date(year, month, day).getDay();
            const dayTransactions = transactions.filter((transaction) => transaction.date === targetDateStr);
            const dayExpense = dayTransactions
              .filter((transaction) => transaction.type === 'expense')
              .reduce((sum, transaction) => sum + transaction.amount, 0);
            const dayIncome = dayTransactions
              .filter((transaction) => transaction.type === 'income')
              .reduce((sum, transaction) => sum + transaction.amount, 0);

            return (
              <button
                type="button"
                key={`day-${day}`}
                onClick={() => onSelectDate(targetDateStr)}
                aria-label={`${day}日、記録${dayTransactions.length}件、支出${dayExpense}円、収入${dayIncome}円`}
                className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-0.5 py-1 transition-all active:bg-amber-100
                  ${isToday ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-300 ring-offset-1' : 'border-slate-200'}
                  ${selectedDate === targetDateStr ? 'border-slate-800 bg-amber-200' : ''}
                  ${!isToday && dayOfWeek === 0 ? 'bg-rose-50/30' : ''}
                  ${!isToday && dayOfWeek === 6 ? 'bg-sky-50/30' : ''}
                `}
              >
                <span className={`text-xs font-black
                  ${dayOfWeek === 0 ? 'text-rose-600' : dayOfWeek === 6 ? 'text-sky-600' : 'text-slate-700'}
                  ${isToday ? 'rounded-md bg-amber-400 px-1 text-[10px] text-slate-900' : ''}
                `}>
                  {day}
                </span>

                <div className="flex min-h-6 w-full flex-col items-center justify-center leading-none">
                  {dayExpense > 0 && (
                    <span className="max-w-full truncate text-[9px] font-black text-rose-500">
                      -{formatCalendarAmount(dayExpense)}
                    </span>
                  )}
                  {dayIncome > 0 && (
                    <span className="max-w-full truncate text-[9px] font-black text-emerald-600">
                      +{formatCalendarAmount(dayIncome)}
                    </span>
                  )}
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
          {selectedTransactions.length === 0 ? (
            <p className="py-4 text-center text-sm font-bold text-slate-400">この日の記録はありません</p>
          ) : (
            selectedTransactions.map((transaction) => {
              const content = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-slate-500">{transaction.categories?.name || '未分類'}</span>
                    <span className="block truncate text-sm font-bold text-slate-800">{transaction.description || 'メモなし'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={`text-sm font-black ${transaction.type === 'expense' ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {transaction.type === 'expense' ? '-' : '+'}¥{transaction.amount.toLocaleString()}
                    </span>
                  </span>
                </>
              );

              if (!onTransactionClick) {
                return (
                  <div key={transaction.id} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 text-left">
                    {content}
                  </div>
                );
              }

              return (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => onTransactionClick(transaction)}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-800 bg-white p-3 text-left"
                >
                  {content}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
