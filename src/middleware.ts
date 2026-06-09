import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 💡 【超重要】トップ画面（/）とダッシュボード（/dashboard）以外は一瞬でスルー
  // ログイン画面（/login）自体もここで完全にスルーされるため、絶対にループしません
  if (pathname !== '/' && !pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // あなたのSupabaseのURLとキー
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

  // ログインユーザーの取得
  const { data: { user } } = await supabase.auth.getUser();

  // 💡 ログインしていない場合はログイン画面（/login）へ安全に転送
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