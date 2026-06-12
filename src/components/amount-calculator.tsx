"use client";

import { Calculator, Delete } from 'lucide-react';
import { useState } from 'react';
import { MobileSheet } from './mobile-ui';

type Operator = '+' | '-' | '×' | '÷';

interface AmountCalculatorProps {
  value: string | number;
  onApply: (amount: number) => void;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
}

const MAX_AMOUNT = 1_000_000_000;

function calculate(left: number, right: number, operator: Operator) {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '×') return left * right;
  if (right === 0) return Number.NaN;
  return left / right;
}

export function AmountCalculator({
  value,
  onApply,
  allowNegative = false,
  min = 0,
  max = MAX_AMOUNT,
  disabled = false,
}: AmountCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [replaceDisplay, setReplaceDisplay] = useState(false);
  const [error, setError] = useState('');

  const openCalculator = () => {
    const initial = Number(value);
    setDisplay(Number.isFinite(initial) ? String(initial) : '0');
    setStoredValue(null);
    setOperator(null);
    setReplaceDisplay(false);
    setError('');
    setOpen(true);
  };

  const inputDigit = (digit: string) => {
    setError('');
    setDisplay((current) => {
      if (replaceDisplay || current === '0') return digit;
      if (current.replace('-', '').length >= 12) return current;
      return `${current}${digit}`;
    });
    setReplaceDisplay(false);
  };

  const selectOperator = (nextOperator: Operator) => {
    const current = Number(display);
    if (!Number.isFinite(current)) return;
    if (storedValue !== null && operator && !replaceDisplay) {
      const result = calculate(storedValue, current, operator);
      if (!Number.isFinite(result)) {
        setError('0では割れません。');
        return;
      }
      setStoredValue(result);
      setDisplay(String(result));
    } else {
      setStoredValue(current);
    }
    setOperator(nextOperator);
    setReplaceDisplay(true);
  };

  const showResult = () => {
    if (storedValue === null || !operator) return;
    const result = calculate(storedValue, Number(display), operator);
    if (!Number.isFinite(result)) {
      setError('0では割れません。');
      return;
    }
    setDisplay(String(result));
    setStoredValue(null);
    setOperator(null);
    setReplaceDisplay(true);
  };

  const applyResult = () => {
    const rounded = Math.round(Number(display));
    if (!Number.isSafeInteger(rounded) || rounded < min || rounded > max || (!allowNegative && rounded < 0)) {
      setError(`${min.toLocaleString()}円から${max.toLocaleString()}円の範囲で計算してください。`);
      return;
    }
    onApply(rounded);
    setOpen(false);
  };

  const buttons: Array<string | Operator> = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '00', '=', '+'];

  return <>
    <button
      type="button"
      onClick={openCalculator}
      disabled={disabled}
      aria-label="電卓で金額を入力"
      className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border-2 border-slate-800 bg-amber-200 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-50"
    >
      <Calculator className="h-5 w-5" />
    </button>
    {open && <MobileSheet title="金額を計算" onClose={() => setOpen(false)}>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-2xl border-2 border-slate-800 bg-slate-50 p-3 text-right">
          <p className="h-5 text-xs font-bold text-slate-400">{storedValue !== null && operator ? `${storedValue.toLocaleString()} ${operator}` : '計算結果'}</p>
          <p className="break-all text-3xl font-black">¥{Number(display).toLocaleString()}</p>
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-2 text-center text-xs font-black text-rose-600">{error}</p>}
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => button === '=' ? showResult() : ['+', '-', '×', '÷'].includes(button) ? selectOperator(button as Operator) : inputDigit(button)}
              className={`min-h-12 rounded-xl border-2 border-slate-800 text-lg font-black ${['+', '-', '×', '÷', '='].includes(button) ? 'bg-sky-200' : 'bg-white'}`}
            >
              {button}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => { setDisplay('0'); setStoredValue(null); setOperator(null); setError(''); }} className="min-h-12 rounded-xl border-2 border-slate-800 bg-rose-100 text-sm font-black">クリア</button>
          <button type="button" onClick={() => setDisplay((current) => current.length <= 1 || (current.startsWith('-') && current.length === 2) ? '0' : current.slice(0, -1))} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-800 bg-slate-100"><Delete className="h-5 w-5" /></button>
          <button type="button" onClick={applyResult} className="min-h-12 rounded-xl border-2 border-slate-800 bg-emerald-300 text-sm font-black">金額へ反映</button>
        </div>
      </div>
    </MobileSheet>}
  </>;
}
