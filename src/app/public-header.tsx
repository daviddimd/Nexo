import Link from 'next/link';
import styles from './access-landing.module.css';

export default function PublicHeader({panel, current, compact = false, demoAction}: {panel?: string; demoAction?: React.ReactNode; compact?: boolean; current?: 'planes' | 'preguntas'}) {
 return <header className={styles.stickyHeader}>
  <div className={`${styles.wrap} ${styles.header} ${styles.homeHeader}`}>
   <Link className={styles.logo} href="/" aria-label="Nexo, inicio">nexo<span>.</span></Link>
   {!compact && <nav className={styles.landingNav} aria-label="Navegación principal">
    <Link href="/planes" aria-current={current === 'planes' ? 'page' : undefined}>Planes</Link>
    <Link href="/preguntas" aria-current={current === 'preguntas' ? 'page' : undefined}>Preguntas</Link>
   </nav>}
   {panel && <div className={styles.headerActions}><Link className={styles.navCta} href={panel}>Entrar</Link>{demoAction}</div>}
  </div>
 </header>;
}
