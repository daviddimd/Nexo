'use client';
import {useEffect} from 'react';

export default function OpenLinkedQuestion() {
 useEffect(()=>{
  function openQuestion(){
   const question=document.getElementById(location.hash.slice(1));
   if(question instanceof HTMLDetailsElement && question.getAttribute('name')==='nexo-faq'){
    question.open=true;
    question.scrollIntoView({block:'start'});
   }
  }
  openQuestion();
  window.addEventListener('hashchange',openQuestion);
  return ()=>window.removeEventListener('hashchange',openQuestion);
 },[]);
 return null;
}
