import type { Database } from './database.types';

export type Category = Database['public']['Tables']['categories']['Row'];
export type Budget = Database['public']['Tables']['budgets']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type RecurringTransaction = Database['public']['Tables']['recurring_transactions']['Row'];
export type EffectiveBudget =
  Database['public']['Functions']['get_effective_budgets']['Returns'][number];

// 取引一覧クエリで指定したカテゴリ項目だけが、関連データとして埋め込まれる。
export type TransactionWithCategory = Transaction & {
  categories: Pick<Category, 'name' | 'type' | 'icon'> | null;
};
