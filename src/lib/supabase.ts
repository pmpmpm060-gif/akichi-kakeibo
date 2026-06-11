import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// createBrowserClientはProxy・Server Componentと共有するCookieへセッションを保存する。
// 通常のSupabaseクライアントへ置き換えると、サーバー側との認証共有が失われる。
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
