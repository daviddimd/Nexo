"use client";
import {useEffect,useImperativeHandle,useRef,useState,type CSSProperties,type InputHTMLAttributes,type Ref} from 'react';
import styles from './animated-access-input.module.css';

type Props=InputHTMLAttributes<HTMLInputElement>&{ref?:Ref<HTMLInputElement>};

/** The native input owns editing, validation and clipboard behavior.
 * The decorative mirror animates only newly typed, visible characters. */
export default function AnimatedAccessInput({ref,type='text',...props}:Props){
 const input=useRef<HTMLInputElement>(null);
 useImperativeHandle(ref,()=>input.current!,[]);
 const previous=useRef(''),sequence=useRef(0);
 const [view,setView]=useState({text:'',start:0,end:0,revision:0});
 const [editing,setEditing]=useState(false),[selected,setSelected]=useState(false),[composing,setComposing]=useState(false);
 const [geometry,setGeometry]=useState<CSSProperties>({});
 const [offset,setOffset]=useState(0);
 useEffect(()=>{
  // Never retain a decorative plaintext copy when the password is masked.
  setEditing(false);previous.current='';setView({text:'',start:0,end:0,revision:0});
 },[type]);
 function sync(field:HTMLInputElement,animate:boolean){
  if(type==='password')return;
  const text=field.value,old=previous.current;
  let start=0,end=0;
  if(animate&&text.length>old.length){
   while(start<old.length&&old[start]===text[start])start++;
   let suffix=0;
   while(suffix<old.length-start&&old[old.length-1-suffix]===text[text.length-1-suffix])suffix++;
   end=text.length-suffix;
  }
  const css=getComputedStyle(field);
  setGeometry({font:css.font,letterSpacing:css.letterSpacing,paddingLeft:css.paddingLeft,paddingRight:css.paddingRight,color:'var(--nexo-ink,#241c32)',direction:css.direction==='rtl'?'rtl':'ltr'});
  previous.current=text;
  setView({text,start,end,revision:++sequence.current});
  setSelected(field.selectionStart!==field.selectionEnd);
  setOffset(field.scrollLeft);setEditing(true);
 }
 const mirror=editing&&!selected&&!composing&&type!=='password'&&view.text.length>0;
 return <span className={styles.field}>
  <input {...props} ref={input} type={type} data-animated-ink={mirror||undefined}
   onInput={event=>{
    const native=event.nativeEvent as InputEvent;
    sync(event.currentTarget,!native.isComposing&&native.inputType==='insertText');
    props.onInput?.(event);
   }}
   onPointerDown={event=>{setEditing(false);props.onPointerDown?.(event);}}
   onKeyDown={event=>{if(event.key.startsWith('Arrow')||event.key==='Home'||event.key==='End'||event.shiftKey||event.ctrlKey||event.metaKey)setEditing(false);props.onKeyDown?.(event);}}
   onBlur={event=>{setEditing(false);props.onBlur?.(event);}}
   onSelect={event=>{setSelected(event.currentTarget.selectionStart!==event.currentTarget.selectionEnd);setOffset(event.currentTarget.scrollLeft);props.onSelect?.(event);}}
   onScroll={event=>{setOffset(event.currentTarget.scrollLeft);props.onScroll?.(event);}}
   onCompositionStart={event=>{setComposing(true);props.onCompositionStart?.(event);}}
   onCompositionEnd={event=>{setComposing(false);sync(event.currentTarget,false);props.onCompositionEnd?.(event);}}
  />
  {mirror&&<span className={styles.mirror} style={geometry} aria-hidden="true">
   <span className={styles.text} style={{transform:'translateX('+(-offset)+'px)'}}>
    {Array.from(view.text).map((character,index,characters)=>{
     const position=characters.slice(0,index).join('').length;
     const fresh=position>=view.start&&position<view.end;
     return <span key={index+':'+(fresh?view.revision:'stable')} className={fresh?styles.character:undefined}>{character}</span>;
    })}
   </span>
  </span>}
 </span>;
}
