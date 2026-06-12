"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, Bookmark, Loader2, Plus, Tag, Trash2, Zap } from 'lucide-react';
import { AppHeader, useConfirm, useToast } from '../../components/mobile-ui';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category } from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';

type TagRow = Database['public']['Tables']['tags']['Row'];
type Template = Database['public']['Tables']['transaction_templates']['Row'];
type SavedFilter = Database['public']['Tables']['saved_filters']['Row'];

function ToolsPageContent() {
  const currentUser = parseHouseholdUser(useSearchParams().get('user'));
  const notify = useToast();
  const confirmAction = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [tagName, setTagName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategoryId, setTemplateCategoryId] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState('20');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [categoryResult, tagResult, templateResult, filterResult, notificationResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order'),
        supabase.from('tags').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('transaction_templates').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('saved_filters').select('*').eq('user_id', currentUser).order('created_at'),
        supabase.from('notification_preferences').select('*').eq('user_id', currentUser).maybeSingle(),
      ]);
      const error = categoryResult.error || tagResult.error || templateResult.error || filterResult.error || notificationResult.error;
      if (error) alert('設定の取得に失敗しました：' + error.message);
      setCategories(categoryResult.data || []);
      setTemplateCategoryId(categoryResult.data?.[0]?.id || '');
      setTags(tagResult.data || []);
      setTemplates(templateResult.data || []);
      setFilters(filterResult.data || []);
      setNotificationEnabled(notificationResult.data?.enabled || false);
      setReminderHour(String(notificationResult.data?.reminder_hour ?? 20));
      setLoading(false);
    };
    void fetchData().catch(() => {
      alert('設定の取得に失敗しました。通信状況を確認して、もう一度お試しください。');
      setLoading(false);
    });
  }, [currentUser]);

  const addTag = async () => {
    if (!tagName.trim()) return;
    const { data, error } = await supabase.from('tags').insert({ user_id: currentUser, name: tagName.trim() }).select().single();
    if (error) alert('タグの追加に失敗しました：' + error.message);
    else { setTags((current) => [...current, data]); setTagName(''); notify('タグを追加しました'); }
  };

  const addTemplate = async () => {
    const amount = Number(templateAmount);
    if (!templateName.trim() || !templateCategoryId || !Number.isSafeInteger(amount) || amount <= 0) return;
    const { data, error } = await supabase.from('transaction_templates').insert({
      user_id: currentUser, name: templateName.trim(), category_id: templateCategoryId, amount, description: templateDescription.trim(),
    }).select().single();
    if (error) alert('テンプレートの追加に失敗しました：' + error.message);
    else {
      setTemplates((current) => [...current, data]);
      setTemplateName(''); setTemplateAmount(''); setTemplateDescription('');
      notify('取引テンプレートを追加しました');
    }
  };

  const remove = async (table: 'tags' | 'transaction_templates' | 'saved_filters', id: string, label: string) => {
    if (!await confirmAction(`${label}を削除しますか？`)) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) alert('削除に失敗しました：' + error.message);
    else {
      if (table === 'tags') setTags((current) => current.filter((item) => item.id !== id));
      if (table === 'transaction_templates') setTemplates((current) => current.filter((item) => item.id !== id));
      if (table === 'saved_filters') setFilters((current) => current.filter((item) => item.id !== id));
    }
  };

  const saveNotifications = async () => {
    setSaving(true);
    let enabled = notificationEnabled;
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
      enabled = (await Notification.requestPermission()) === 'granted';
      setNotificationEnabled(enabled);
    }
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: currentUser, enabled, reminder_hour: Number(reminderHour),
    }, { onConflict: 'household_id,user_id' });
    if (error) alert('通知設定の保存に失敗しました：' + error.message);
    else notify(enabled ? '記録リマインダーを有効にしました' : '通知設定を保存しました');
    setSaving(false);
  };

  if (loading) return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />;
  return <div className="flex flex-col gap-6 px-4 py-5">
    <AppHeader title="便利機能設定" currentUser={currentUser} />
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-amber-50 p-4"><h2 className="flex items-center gap-2 font-black"><Tag className="h-5 w-5" />タグ</h2><div className="flex gap-2"><input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="旅行、医療費など" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-3 text-base" /><button onClick={addTag} className="min-h-12 rounded-xl border-2 border-slate-800 bg-amber-300 px-4"><Plus /></button></div>{tags.map((tag) => <div key={tag.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-black"><span># {tag.name}</span><button onClick={() => remove('tags', tag.id, `タグ「${tag.name}」`)} className="min-h-11 min-w-11"><Trash2 className="mx-auto h-4 w-4 text-rose-500" /></button></div>)}</section>
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-sky-50 p-4"><h2 className="flex items-center gap-2 font-black"><Zap className="h-5 w-5" />取引テンプレート</h2><input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="テンプレート名" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /><select value={templateCategoryId} onChange={(e) => setTemplateCategoryId(e.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select><input type="number" value={templateAmount} onChange={(e) => setTemplateAmount(e.target.value)} placeholder="金額" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /><input value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="メモ（任意）" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /><button onClick={addTemplate} className="min-h-12 rounded-xl border-2 border-slate-800 bg-sky-300 text-sm font-black">テンプレートを追加</button>{templates.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2"><span className="text-sm font-black">{item.name}<span className="block text-xs text-slate-500">¥{item.amount.toLocaleString()}</span></span><button onClick={() => remove('transaction_templates', item.id, `テンプレート「${item.name}」`)} className="min-h-11 min-w-11"><Trash2 className="mx-auto h-4 w-4 text-rose-500" /></button></div>)}</section>
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-indigo-50 p-4"><h2 className="flex items-center gap-2 font-black"><Bookmark className="h-5 w-5" />保存した検索条件</h2>{filters.length === 0 ? <p className="text-xs font-bold text-slate-500">家計簿画面から検索条件を保存できます。</p> : filters.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-black"><span>{item.name}</span><button onClick={() => remove('saved_filters', item.id, `保存条件「${item.name}」`)} className="min-h-11 min-w-11"><Trash2 className="mx-auto h-4 w-4 text-rose-500" /></button></div>)}</section>
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-pink-50 p-4"><h2 className="flex items-center gap-2 font-black"><Bell className="h-5 w-5" />PWA・通知</h2><p className="text-xs font-bold text-slate-500">ブラウザのメニューからホーム画面へ追加できます。アプリを開いている日に、指定時刻を過ぎると記録を促します。</p><label className="flex min-h-12 items-center justify-between rounded-xl bg-white px-3 text-sm font-black">記録リマインダー<input type="checkbox" checked={notificationEnabled} onChange={(e) => setNotificationEnabled(e.target.checked)} className="h-6 w-6" /></label><select value={reminderHour} onChange={(e) => setReminderHour(e.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}</select><button onClick={saveNotifications} disabled={saving} className="min-h-12 rounded-xl border-2 border-slate-800 bg-pink-300 text-sm font-black disabled:opacity-50">{saving ? '保存中...' : '通知設定を保存'}</button></section>
  </div>;
}

export default function ToolsPage() {
  return <Suspense fallback={<Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />}><ToolsPageContent /></Suspense>;
}
