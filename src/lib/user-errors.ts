type PublicError = { code?: string | null; message?: string | null } | null | undefined;

// DBの制約名や内部構造を画面へ露出せず、利用者が取れる行動だけを案内する。
export function userErrorMessage(action: string, error?: PublicError) {
  if (error?.code === '23505') {
    return `${action}できませんでした。同じ内容がすでに登録されています。`;
  }
  if (error?.code === '23514' || error?.code === 'P0001') {
    return `${action}できませんでした。入力内容または登録上限を確認してください。`;
  }
  return `${action}に失敗しました。通信状況を確認して、もう一度お試しください。`;
}
