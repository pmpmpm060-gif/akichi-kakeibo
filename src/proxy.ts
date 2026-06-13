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
  const protectedResponse = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
  };
  const redirect = (pathname: string, update?: (url: URL) => void) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    update?.(url);
    const redirectResponse = NextResponse.redirect(url);
    // getUser()中に更新されたセッションCookieを、画面遷移時も失わないよう引き継ぐ。
    res.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return protectedResponse(redirectResponse);
  };
  const serviceUnavailable = () => protectedResponse(new NextResponse(
    '認証状態を確認できませんでした。しばらくしてから画面を再読み込みしてください。',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '10',
      },
    }
  ));

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
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/login');
  }
  if (authError) return serviceUnavailable();

  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: approved, error: approvalError } = await supabase.rpc('is_approved_user');
  if (membershipError || approvalError) return serviceUnavailable();
  const isApprovalPage = req.nextUrl.pathname === '/approval-pending';

  if (!approved && !isApprovalPage) {
    return redirect('/approval-pending');
  }
  if (approved && isApprovalPage) {
    return redirect(membership ? '/' : '/setup');
  }
  if (!membership && req.nextUrl.pathname !== '/setup' && !isApprovalPage) {
    return redirect('/setup');
  }
  if (membership && req.nextUrl.pathname === '/setup') {
    return redirect('/');
  }
  if (req.nextUrl.pathname.startsWith('/admin/approvals')) {
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_app_admin');
    if (adminError) return serviceUnavailable();
    if (!isAdmin) return redirect('/');
  }
  if (
    membership
    && !req.nextUrl.searchParams.has('user')
    && req.nextUrl.pathname !== '/admin/approvals'
    && !isApprovalPage
  ) {
    const { data: currentProfileId, error: profileError } = await supabase.rpc('current_profile_id');
    if (profileError) return serviceUnavailable();
    if (currentProfileId) {
      return redirect(req.nextUrl.pathname, (url) => url.searchParams.set('user', currentProfileId));
    }
  }

  return protectedResponse(res);
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
    '/special-expenses/:path*',
    '/more/:path*',
    '/tools/:path*',
    '/setup/:path*',
    '/approval-pending/:path*',
    '/admin/approvals/:path*',
  ],
};
