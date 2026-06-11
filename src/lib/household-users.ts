export const HOUSEHOLD_USERS = ['user_a', 'user_b'] as const;

export type HouseholdUser = (typeof HOUSEHOLD_USERS)[number];

// HouseholdUserは画面上の「ママ／パパ」を表し、Supabase Authユーザーとは別の概念。
// URLの値が不明または未指定の場合は、既定のuser_aへ戻す。
export function parseHouseholdUser(value: string | null): HouseholdUser {
  return value === 'user_b' ? 'user_b' : 'user_a';
}
