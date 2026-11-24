'use client';
import {useEffect, useRef, useState} from 'react';
import {interpolateAmount} from '../../catalog/amount-motion';
import flow from './checkout-flow.module.css';

const currency = new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0});
const reduced = () => document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
type View = {kind: 'amount'; value: bigint} | {kind: 'text'; text: string};

/** Un texto que cambia con un fundido corto en vez de saltar. */
export function SwapText({text}: {text: string}) {
 const [shown, setShown] = useState(text);
 const [out, setOut] = useState(false);
 useEffect(() => {
  if (text === shown) { setOut(false); return; }
  if (reduced()) { setShown(text); setOut(false); return; }
  setOut(true);
  const timer = setTimeout(() => { setShown(text); setOut(false); }, 160);
  return () => clearTimeout(timer);
 }, [text]);
 return <span className={flow.swap} data-out={out || undefined}>{shown}</span>;
}

/** Un importe que cuenta con suavidad entre valores; si pasa a un texto (o al revés), se funde. */
export default function SmoothMoney({value, text = '—'}: {value: bigint | null; text?: string}) {
 const target: View = value === null ? {kind: 'text', text} : {kind: 'amount', value};
 const [view, setView] = useState<View>(target);
 const [out, setOut] = useState(false);
 const [entering, setEntering] = useState(false);
 const current = useRef<View>(target);
 const frame = useRef(0);
 const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
 const apply = (next: View, fade = false) => { current.current = next; setView(next); setEntering(fade); };
 useEffect(() => {
  cancelAnimationFrame(frame.current);
  clearTimeout(timer.current);
  const from = current.current;
  // Si se interrumpió un fundido, siempre se vuelve a mostrar el contenido: nunca debe quedar invisible.
  const show = () => setOut(false);
  if (from.kind === 'amount' && target.kind === 'amount') {
   show();
   if (from.value === target.value) return;
   if (reduced()) { apply(target); return; }
   const start = performance.now(), duration = 800, origin = from.value, end = target.value;
   const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    apply({kind: 'amount', value: interpolateAmount(origin, end, eased)});
    if (t < 1) frame.current = requestAnimationFrame(tick);
   };
   frame.current = requestAnimationFrame(tick);
   return () => cancelAnimationFrame(frame.current);
  }
  if (from.kind === 'text' && target.kind === 'text' && from.text === target.text) { show(); return; }
  if (reduced()) { apply(target); show(); return; }
  setOut(true);
  setEntering(false);
  timer.current = setTimeout(() => { apply(target, true); setOut(false); }, 160);
  return () => clearTimeout(timer.current);
 }, [value, text]);
 return <span className={entering ? flow.swapIn : flow.swap} data-out={out || undefined}>{view.kind === 'amount' ? currency.format(view.value) : view.text}</span>;
}
