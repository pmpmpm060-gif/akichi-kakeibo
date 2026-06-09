import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    
    // ユーザー名「akichi」、パスワード「akichi0305」
    if (authValue === 'YWtpY2hpOmFraWNoaTAzMDU=') {
      return NextResponse.next();
    }
  }

  return new NextResponse('認証が必要です', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

// 💡 ここが超重要！
// 画像ファイル（.png等）や、Next.jsの内部通信（_next/static等）、favicon などの時は
// パスワードチェックをスキップさせて、無限ループを回避します。
export const config = {
  matcher: [
    /*
     * 次のパスで始まるもの以外すべてにマッチ：
     * - api (API routes)
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化ファイル)
     * - favicon.ico (ファビコン)
     * - 画像などの拡張子
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};