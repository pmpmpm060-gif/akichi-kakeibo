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
        const { data, error } = await supabase.from('household_profiles')
          .select('household_id, profile_id, display_name, icon, sort_order, created_at')
          .order('sort_order');
        if (!ignore && !error) setProfiles((data || []).map((profile) => ({ ...profile, auth_user_id: null })));
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

export function useCurrentProfileId() {
  const [profileId, setProfileId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let ignore = false;
    const fetchCurrentProfile = async () => {
      try {
        const { data } = await supabase.rpc('current_profile_id');
        if (!ignore) setProfileId(data || null);
      } catch {
        if (!ignore) setProfileId(null);
      }
    };
    void fetchCurrentProfile();
    return () => { ignore = true; };
  }, []);
  return profileId;
}
