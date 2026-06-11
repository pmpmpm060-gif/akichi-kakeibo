import type { Database } from './database.types';

export type Category = Database['public']['Tables']['categories']['Row'];
export type Budget = Database['public']['Tables']['budgets']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];

export type TransactionWithCategory = Transaction & {
  categories: Pick<Category, 'name' | 'type' | 'icon'> | null;
};
