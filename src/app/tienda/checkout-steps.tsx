'use client';
import type {CSSProperties, ReactNode} from 'react';
import {CheckoutLink} from './checkout-nav';
import styles from './checkout-flow.module.css';

const steps = ['Carrito', 'Pago', 'Confirmación'] as const;
const check = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>;

/**
 * Progreso de la compra. Con `complete`, el último paso también figura como hecho.
 * Los pasos anteriores con enlace en `back` permiten retroceder con un clic.
 */
export function CheckoutSteps({current, complete = false, back = {}}: {current: 1 | 2 | 3; complete?: boolean; back?: Partial<Record<1 | 2, string>>}) {
 const progress = complete ? 1 : (current - 1) / 2;
 const style = {'--progress': progress, '--from': Math.max(0, progress - 0.5)} as CSSProperties;
 return <ol className={styles.steps} style={style} aria-label="Progreso de la compra">
   {steps.map((label, index) => {
    const number = index + 1;
    const state = number < current || (complete && number === current) ? 'done' : number === current ? 'current' : 'todo';
    const href = number < current && number < 3 ? back[number as 1 | 2] : undefined;
    const content = <><span className={styles.dot}>{state === 'done' ? check : number}</span><span className={styles.label}>{label}</span></>;
    return <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
     {href ? <CheckoutLink href={href} direction="back" className={styles.stepLink} aria-label={`Volver a ${label.toLowerCase()}`}>{content}</CheckoutLink> : content}
    </li>;
   })}
  </ol>;
}

/** Envoltorio de cada pantalla del recorrido; las transiciones se aplican al navegar (ver checkout-nav). */
export function CheckoutPage({children}: {children: ReactNode}) {
 return <>{children}</>;
}

/** Enlace para retroceder un paso, con la flecha y la transición hacia atrás. */
export function CheckoutBackLink({href, children}: {href: string; children: ReactNode}) {
 return <CheckoutLink href={href} direction="back" className={styles.backLink}><span aria-hidden="true">←</span> {children}</CheckoutLink>;
}
