import type {ReactNode} from 'react';
/** Keep a single accessible heading while revealing its visual words. */
export default function LandingHeading({text,id}:{text:string;id?:string}){
 const words:ReactNode[]=text.split(' ').map((word,index)=><span key={index} data-reveal-word aria-hidden="true">{word}{' '}</span>);
 return <h2 id={id} aria-label={text} data-reveal-heading>{words}</h2>;
}
