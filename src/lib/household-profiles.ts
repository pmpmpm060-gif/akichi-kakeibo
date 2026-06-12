"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Database } from './database.types';

export type HouseholdProfile = Database['public']['Tables']['household_profiles']['Row'];

export function useHouseholdProfiles() {
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  useEffect(() => {
    let ignore = false;
    const fetchProfiles = async () => {
      try {
        const { data, error } = await supabase.from('household_profiles').select('*').order('sort_order');
        if (!ignore && !error) setProfiles(data || []);
      } catch {
        // プロフィール表示失敗時も、各画面は既定ラベルで継続表示する。
      }
    };
    void fetchProfiles();
    return () => { ignore = true; };
  }, []);
  return profiles;
}

export function useProfileDisplay(profileId: string) {
  const profiles = useHouseholdProfiles();
  return useMemo(() => profiles.find((profile) => profile.profile_id === profileId) || null, [profileId, profiles]);
}
