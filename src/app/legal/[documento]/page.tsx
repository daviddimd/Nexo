import Link from 'next/link';
import {notFound} from 'next/navigation';
import NexoFooter from '../../nexo-footer';
import PublicHeader from '../../public-header';
import landing from '../../access-landing.module.css';
import {legalDocuments, legalOperator, UPDATED_AT, type Block} from '../legal-content';
import styles from '../legal.module.css';

export const dynamic = 'force-dynamic';

type Params = {params: Promise<{documento: string}>};

function titleOf(documento: string) {
 const docs = legalDocuments(legalOperator());
 return Object.hasOwn(docs, documento) ? docs[documento as keyof typeof docs].title : null;
}
export async function generateMetadata({params}: Params) {
 const title = titleOf((await params).documento);
 return {title: title ? `${title} · Nexo` : 'Documento no encontrado · Nexo'};
}

function Content({block}: {block: Block}) {
 if (typeof block === 'string') return <p>{block}</p>;
 if ('list' in block) return <ul>{block.list.map(item => <li key={item}>{item}</li>)}</ul>;
 const {head, rows} = block.table;
 return <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Tabla de información">
  <table><thead><tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
   <tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index} data-label={head[index]}>{cell}</td>)}</tr>)}</tbody></table>
 </div>;
}

export default async function LegalPage({params}: Params) {
 const {documento} = await params;
 const docs = legalDocuments(legalOperator());
 if (!Object.hasOwn(docs, documento)) notFound();
 const content = docs[documento as keyof typeof docs];
 return <div className={`${landing.page} ${styles.page}`}>
  <PublicHeader panel="/inicio" demoAction={<Link className={landing.demoCta} href="/planes?demo=1">Pedir demo</Link>}/>
  <main className={`${landing.wrap} ${styles.content}`}>
   <div className={styles.grid}>
    <aside className={styles.aside}>
     <span className={styles.badge}>Actualizado el {UPDATED_AT}</span>
     <h1>{content.title}</h1>
     <p className={styles.intro}>{content.intro}</p>
     <nav className={styles.toc} aria-label="Contenido del documento"><h2>Contenido</h2>
      <ol>{content.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
     </nav>
    </aside>
    <div>
     <section className={styles.summary} aria-labelledby="resumen"><h2 id="resumen">En resumen</h2><ul>{content.summary.map(item => <li key={item}>{item}</li>)}</ul></section>
     {content.sections.map((section, index) => <article key={section.id} id={section.id} className={styles.section}>
      <h2><span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{section.title}</h2>
      {section.blocks.map((block, position) => <Content key={position} block={block}/>)}
     </article>)}
    </div>
   </div>
   <NexoFooter className={landing.footer} currentDocument={`/legal/${documento}`}/>
  </main>
 </div>;
}
