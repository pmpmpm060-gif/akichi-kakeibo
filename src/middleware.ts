import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    
    // 💡 ユーザー名「akichi」、パスワード「akichi0305」でロックをかけます
    // (これは「akichi:akichi0305」をBase64形式に変換した文字列です)
    if (authValue === 'YWtpY2hpOmFraWNoaTAzMDU=') {
      return NextResponse.next();
    }
  }

  // パスワードが違う、または入力されていない場合はブラウザのログイン画面を出す
  return new NextResponse('認証が必要です', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

// アプリの全画面にこのロックを適用する設定
export const config = {
  matcher: '/:path*',
};