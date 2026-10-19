import styles from './technology-signature.module.css';

export default function TechnologySignature(){
 return <span className={styles.signature} role="img" aria-label="Impulsado por tecnología Nexo">
  <span className={styles.caption} aria-hidden="true">Impulsado por tecnología</span>
  <span className={styles.divider} aria-hidden="true"/>
  <span className={styles.wordmark} aria-hidden="true">nexo<span className={styles.dot}>.</span></span>
 </span>;
}
