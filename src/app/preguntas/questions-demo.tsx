'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';
import DemoRequestForm, {type Interest} from '../demo-request-form';
import NexoFooter from '../nexo-footer';
import PublicHeader from '../public-header';
import landing from '../access-landing.module.css';
import story from '../landing-story.module.css';
import disclosure from '../planes/plans-page.module.css';
import layout from './questions.module.css';

export default function QuestionsDemo({children}: {children: ReactNode}) {
 const [open, setOpen] = useState(false);
 const [interest, setInterest] = useState<Interest | ''>('');
 const section = useRef<HTMLElement>(null);
 const form = useRef<HTMLDivElement>(null);
 const scrollToContact = useRef(false);

 useEffect(() => {
  if (!open) return;
  form.current?.focus({preventScroll: true});
  if (scrollToContact.current) {
   scrollToContact.current = false;
   section.current?.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
   });
  }
 }, [open]);

 function openFromHeader() {
  if (open) {
   form.current?.focus({preventScroll: true});
   section.current?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  } else {
   scrollToContact.current = true;
   setOpen(true);
  }
 }

 return <div className={`${landing.page} ${layout.page}`}>
  <PublicHeader panel="/inicio" current="preguntas" demoAction={<button type="button" className={landing.demoCta} aria-expanded={open} aria-controls="pedir-demo" onClick={openFromHeader}>Pedir demo</button>}/>
  <main className={`${landing.wrap} ${story.story} ${landing.routeContent} ${layout.content}`}>
   {children}
   <section id="contacto" ref={section} className={layout.contact} aria-labelledby="questions-contact-heading">
    <div className={layout.contactIntro}>
     <div><h2 id="questions-contact-heading">¿No encuentras tu respuesta?</h2><p>Escríbenos a través del formulario de demo.</p></div>
     <button type="button" className={landing.demoCta} aria-expanded={open} aria-controls="pedir-demo" onClick={() => setOpen(!open)}>{open ? 'Cerrar formulario' : 'Pedir demo'}</button>
    </div>
    <div id="pedir-demo" ref={form} className={disclosure.demoDisclosure} data-open={open} inert={!open} tabIndex={-1}>
     <div className={disclosure.demoDisclosureBody}>
      <div className={`${disclosure.contact} ${layout.contactForm}`}>
       <DemoRequestForm interest={interest} onInterestChange={setInterest}/>
      </div>
     </div>
    </div>
   </section>
   <NexoFooter className={landing.footer}/>
  </main>
 </div>;
}
