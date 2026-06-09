import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // 💡 確実に動かすために、URLとキーを直接指定します
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // 👈 あなたのSupabaseのURLに書き換えてください
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  // 現在ログインしているユーザーの情報を取得
  const { data: { user } } = await supabase.auth.getUser();

  // 💡 ログインしていない ＆ ログイン画面以外にアクセスしようとしたら、強制的にログイン画面へ
  if (!user && !req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 💡 逆にすでにログインしているのにログイン画面を開こうとしたら、トップ画面へ戻す
  if (user && req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

// （上のコードはそのまま触らず、一番下のここだけを書き換えます）

export const config = {
  matcher: [
    /*
     * 💡 見張る対象を「トップ画面（/）」と「家計簿入力（/dashboard）」だけに限定します！
     * これにより、ログイン画面自体や、裏側の細かいファイル読み込みの時は
     * Supabaseへの通信を完全にスキップして爆速になります。
     */
    '/',
    '/dashboard/:path*',
  ],
};