"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Trash2, Zap } from 'lucide-react';
import { AppHeader, useConfirm, useToast } from '../../components/mobile-ui';
import { supabase } from '../../lib/supabase';
import { parseHouseholdUser } from '../../lib/household-users';
import type { Category } from '../../lib/database-helpers';
import type { Database } from '../../lib/database.types';
import { userErrorMessage } from '../../lib/user-errors';
import { AmountCalculator } from '../../components/amount-calculator';

type Template = Database['public']['Tables']['transaction_templates']['Row'];

function ToolsPageContent() {
  const currentUser = parseHouseholdUser(useSearchParams().get('user'));
  const notify = useToast();
  const confirmAction = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategoryId, setTemplateCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [categoryResult, templateResult] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', currentUser).order('sort_order'),
        supabase.from('transaction_templates').select('*').eq('user_id', currentUser).order('created_at'),
      ]);
      const error = categoryResult.error || templateResult.error;
      if (error) alert(userErrorMessage('設定の取得', error));
      setCategories(categoryResult.data || []);
      setTemplateCategoryId(categoryResult.data?.[0]?.id || '');
      setTemplates(templateResult.data || []);
      setLoading(false);
    };
    void fetchData().catch(() => {
      alert('設定の取得に失敗しました。通信状況を確認して、もう一度お試しください。');
      setLoading(false);
    });
  }, [currentUser]);

  const addTemplate = async () => {
    const amount = Number(templateAmount);
    if (mutating || !templateName.trim() || !templateCategoryId || !Number.isSafeInteger(amount) || amount <= 0) return;
    setMutating(true);
    try {
      const { data, error } = await supabase.from('transaction_templates').insert({
        user_id: currentUser, name: templateName.trim(), category_id: templateCategoryId, amount, description: templateDescription.trim(),
      }).select().single();
      if (error) alert(userErrorMessage('テンプレートの追加', error));
      else {
        setTemplates((current) => [...current, data]);
        setTemplateName(''); setTemplateAmount(''); setTemplateDescription('');
        notify('取引テンプレートを追加しました');
      }
    } catch {
      alert('テンプレートの追加に失敗しました。通信状況を確認してください。');
    } finally {
      setMutating(false);
    }
  };

  const remove = async (table: 'transaction_templates', id: string, label: string) => {
    if (mutating || !await confirmAction(`${label}を削除しますか？`)) return;
    setMutating(true);
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) alert(userErrorMessage('削除', error));
      else {
        if (table === 'transaction_templates') setTemplates((current) => current.filter((item) => item.id !== id));
      }
    } catch {
      alert('削除に失敗しました。通信状況を確認してください。');
    } finally {
      setMutating(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />;
  return <div className="flex flex-col gap-6 px-4 py-5">
    <AppHeader title="便利機能設定" currentUser={currentUser} />
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-slate-800 bg-sky-50 p-4"><h2 className="flex items-center gap-2 font-black"><Zap className="h-5 w-5" />取引テンプレート <span className="ml-auto text-xs text-slate-500">{templates.length}/100</span></h2><input value={templateName} maxLength={50} onChange={(e) => setTemplateName(e.target.value)} placeholder="テンプレート名" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /><select value={templateCategoryId} onChange={(e) => setTemplateCategoryId(e.target.value)} className="min-h-12 rounded-xl border-2 border-slate-800 bg-white px-3 text-base">{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select><div className="flex gap-2"><input type="number" value={templateAmount} onChange={(e) => setTemplateAmount(e.target.value)} placeholder="金額" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-800 px-3 text-base" /><AmountCalculator value={templateAmount} min={1} onApply={(result) => setTemplateAmount(String(result))} disabled={mutating} /></div><input value={templateDescription} maxLength={500} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="メモ（任意）" className="min-h-12 rounded-xl border-2 border-slate-800 px-3 text-base" /><button onClick={addTemplate} disabled={mutating || templates.length >= 100} className="min-h-12 rounded-xl border-2 border-slate-800 bg-sky-300 text-sm font-black disabled:opacity-50">テンプレートを追加</button>{templates.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2"><span className="text-sm font-black">{item.name}<span className="block text-xs text-slate-500">¥{item.amount.toLocaleString()}</span></span><button onClick={() => remove('transaction_templates', item.id, `テンプレート「${item.name}」`)} disabled={mutating} className="min-h-11 min-w-11 disabled:opacity-50"><Trash2 className="mx-auto h-4 w-4 text-rose-500" /></button></div>)}</section>
  </div>;
}

export default function ToolsPage() {
  return <Suspense fallback={<Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin" />}><ToolsPageContent /></Suspense>;
}
