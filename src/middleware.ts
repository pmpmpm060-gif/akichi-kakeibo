import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 💡 トップ画面（/）とダッシュボード（/dashboard）以外は一瞬でスルー
  if (pathname !== '/' && !pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  // 最初に応答オブジェクトを作成（ここにクッキーを出し入れします）
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // あなたのSupabaseのURLとキー
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // 👈 ご自身のURLに書き換えてください
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // 👈 ご自身のAnon Keyに書き換えてください

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // 💡 ブラウザとサーバーの両方に確実にクッキーをセットする最新の書き方です
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options });
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // 💡 重要：getUser() を呼ぶことで、ブラウザから届いたクッキーが正しいかSupabaseが厳密にチェックします
  const { data: { user } } = await supabase.auth.getUser();

  // 💡 もしユーザーがいない（クッキーが届いていない）場合はログイン画面へ
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
  ],
};