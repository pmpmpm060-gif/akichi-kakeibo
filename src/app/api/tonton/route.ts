import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GoogleGenAI } from '@google/genai';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
    }

    const { totalBudget, totalExpense, remainingBudget, isOverBudget } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "APIキーがサーバーに設定されていませんぶー！" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
    あなたは家計簿アプリに住む、かわいくてちょっと辛口なアドバイザーの「AIブタのトントン」です。
    ユーザーの今月の家計状況（予算と支出）を元に、楽しくて親しみやすいアドバイスコメントを150文字程度で作成してください。

    【今月の家計状況】
    ・設定された総予算: ${totalBudget} 円
    ・現在の総支出額: ${totalExpense} 円
    ・残りの予算残高: ${remainingBudget} 円 ${isOverBudget ? '(予算オーバーしています)' : '(まだ予算に余裕があります)'}

    【キャラクター設定ルール】
    1. 語尾は必ず「〜だぶー」「〜ぶひ！」「〜だぶひ」にしてください。
    2. 予算に対して使いすぎている場合は優しく諭すか、適度に危機感を持たせてください（例: 「お財布がペッちゃんこだぶー！」など）。逆に節約できている場合は大げさに褒めちぎってください。
    3. 返答にはマークダウンの太字などは使わず、プレーンな文章（改行や絵文字はOK）で出力してください。
    4. 「AIブタのトントン」になりきり、システム的なメタ発言は一切禁止します。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return NextResponse.json({ text: response.text || "お口がもつれたぶー！" });

  } catch (error: unknown) {
    console.error("Gemini API Error in Route:", error);
    const message = error instanceof Error ? error.message : '予期しないエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
