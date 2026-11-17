import Link from 'next/link';
import styles from './nexo-footer.module.css';

const documents = [
 ['/legal/privacidad', 'Privacidad'],
 ['/legal/cookies', 'Cookies'],
 ['/legal/terminos', 'Términos y condiciones'],
] as const;

export default function NexoFooter({className, currentDocument, extra}: {
 className?: string;
 currentDocument?: string;
 extra?: React.ReactNode;
}) {
 return <footer className={[className, styles.footer].filter(Boolean).join(' ')}>
  <nav className={styles.links} aria-label="Documentos de Nexo">
   {documents.map(([href, title]) => <Link key={href} href={href} aria-current={href === currentDocument ? 'page' : undefined}>{title}</Link>)}
  </nav>
  {extra}
 </footer>;
}
