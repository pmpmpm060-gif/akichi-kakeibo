"use client";

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { parseHouseholdUser } from '../lib/household-users';

export function PwaManager() {
  const currentUser = parseHouseholdUser(useSearchParams().get('user'));
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js');

    const checkReminder = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const { data } = await supabase.from('notification_preferences').select('enabled, reminder_hour').eq('user_id', currentUser).eq('enabled', true);
      if (!data?.length) return;
      const now = new Date();
      if (!data.some((item) => now.getHours() >= item.reminder_hour)) return;
      const key = `kakeibo-reminder-${now.toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('今日の家計簿を記録しましょう', {
        body: '今日使ったお金を、忘れないうちに記録しておきましょう。',
        icon: '/window.svg',
      });
      localStorage.setItem(key, 'shown');
    };
    void checkReminder();
  }, [currentUser]);
  return null;
}
