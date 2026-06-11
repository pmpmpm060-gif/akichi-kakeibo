export const HOUSEHOLD_USERS = ['user_a', 'user_b'] as const;

export type HouseholdUser = (typeof HOUSEHOLD_USERS)[number];

export function parseHouseholdUser(value: string | null): HouseholdUser {
  return value === 'user_b' ? 'user_b' : 'user_a';
}
