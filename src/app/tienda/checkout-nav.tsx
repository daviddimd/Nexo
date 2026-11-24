'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {startTransition, type MouseEvent, type ReactNode} from 'react';

export type CheckoutDirection = 'forward' | 'back';
type Transitioner = Document & {startViewTransition?: (update: () => Promise<void>) => {finished: Promise<unknown>}};

/**
 * Navega entre los pasos de la compra con una transición de vista: la pantalla actual sale hacia un lado y la nueva
 * entra desde el otro. Se espera a que la nueva ruta tenga su estructura en pantalla antes de animar. Si el navegador
 * no la soporta o se pidió menos movimiento, navega de inmediato.
 */
export function useCheckoutNavigation() {
 const router = useRouter();
 return (href: string, direction: CheckoutDirection, method: 'push' | 'replace' = 'push', before?: () => void) => {
  const run = () => startTransition(() => { before?.(); router[method](href); });
  const doc = document as Transitioner;
  if (!doc.startViewTransition || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { run(); return; }
  const target = new URL(href, window.location.origin);
  const root = document.documentElement;
  root.dataset.checkoutDir = direction;
  const transition = doc.startViewTransition(() => new Promise<void>(resolve => {
   run();
   const started = performance.now();
   const poll = () => {
    const arrived = window.location.pathname === target.pathname && window.location.search === target.search && Boolean(document.querySelector('#carrito, #pedido'));
    if (arrived || performance.now() - started > 1800) resolve(); else setTimeout(poll, 30);
   };
   poll();
  }));
  const clear = () => { delete root.dataset.checkoutDir; };
  transition.finished.then(clear, clear);
 };
}

/** Enlace que navega con la transición de pasos; respeta clics con teclas modificadoras y nuevas pestañas. */
export function CheckoutLink({href, direction, className, children, ...rest}: {href: string; direction: CheckoutDirection; className?: string; children: ReactNode; 'aria-label'?: string}) {
 const navigate = useCheckoutNavigation();
 const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href, direction);
 };
 return <Link href={href} className={className} onClick={onClick} {...rest}>{children}</Link>;
}
