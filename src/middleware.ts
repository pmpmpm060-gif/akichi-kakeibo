import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 💡 【重要】トップ画面かダッシュボード以外のページ（ログイン画面など）は、チェックせずに一瞬でスルー！
  if (pathname !== '/' && !pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // あなたのSupabaseのURLとキーをここに貼り付けてください
  const SUPABASE_URL = 'https://xxxx.supabase.co'; // 👈 ご自身のURL
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1Ni...'; // 👈 ご自身のAnon Key

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
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

  // ログイン状態をチェック
  const { data: { user } } = await supabase.auth.getUser();

  // ログインしていない場合は、強制的にログイン画面へ
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

// 💡 確実に「/」と「/dashboard」の時だけこのミドルウェアを起動する
export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
  ],
};