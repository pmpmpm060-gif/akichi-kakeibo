"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Database } from './database.types';

export type HouseholdProfile = Database['public']['Tables']['household_profiles']['Row'];

export function useHouseholdProfiles() {
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  useEffect(() => {
    void supabase.from('household_profiles').select('*').order('sort_order').then(({ data }) => setProfiles(data || []));
  }, []);
  return profiles;
}

export function useProfileDisplay(profileId: string) {
  const profiles = useHouseholdProfiles();
  return useMemo(() => profiles.find((profile) => profile.profile_id === profileId) || null, [profileId, profiles]);
}
