import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from './lib/database.types';

export async function proxy(req: NextRequest) {
  // リクエスト検証中にSupabaseが期限切れセッションを更新する場合がある。
  // 更新Cookieを後続処理とブラウザの両方へ渡すため、レスポンスを差し替え可能にしておく。
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 更新Cookieを後続のServer Componentから参照できるようリクエストへ反映し、
          // ブラウザへ返すレスポンスにも同じCookieを設定する。
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser()はSupabase側でアクセストークンを検証する。
  // Cookieの内容を信頼するgetSession()だけでは保護ルートの認証確認として不十分。
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership && req.nextUrl.pathname !== '/setup') {
    const url = req.nextUrl.clone();
    url.pathname = '/setup';
    return NextResponse.redirect(url);
  }
  if (membership && req.nextUrl.pathname === '/setup') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // /loginや静的ファイルなどの公開ルートはリダイレクト対象に含めない。
  matcher: [
    '/',
    '/dashboard/:path*',
    '/budgets/:path*',
    '/categories/:path*',
    '/recurring/:path*',
    '/reports/:path*',
    '/savings/:path*',
    '/more/:path*',
    '/tools/:path*',
    '/setup/:path*',
  ],
};
