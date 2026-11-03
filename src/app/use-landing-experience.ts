"use client";
import {useEffect,useRef} from 'react';

export const LANDING_MOTION={intro:0.9,reveal:0.72,stagger:0.035,smooth:0.95,pinScreens:1.8,magnet:5} as const;

export default function useLandingExperience(){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerViewport=window.matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)');
  let disposed=false,revision=0;
  let teardown=()=>{};
  // The page remains readable without JS, and reduced motion loads no animation engine.
  const configure=async()=>{
   const current=++revision;teardown();teardown=()=>{};
   if(preference.matches)return;
   const [{gsap},{ScrollTrigger},{default:Lenis}]=await Promise.all([import('gsap'),import('gsap/ScrollTrigger'),import('lenis')]);
   if(disposed||current!==revision)return;
   gsap.registerPlugin(ScrollTrigger);
   const media=gsap.matchMedia();
   const cleanups:(()=>void)[]=[];
   const desktop=pointerViewport.matches;
   const lenis=desktop?new Lenis({autoRaf:false,duration:LANDING_MOTION.smooth,smoothWheel:true,syncTouch:false,anchors:false}):null;
   const tick=(time:number)=>lenis?.raf(time*1000);
   if(lenis){lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(tick);}
   const anchor=(event:MouseEvent)=>{
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if(!lenis||!link||event.defaultPrevented||event.button!==0||event.detail===0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=document.getElementById(link.hash.slice(1));if(!target)return;
    event.preventDefault();history.pushState(null,'',link.hash);lenis.scrollTo(target,{offset:-32});
   };
   element.addEventListener('click',anchor);
   const ctx=gsap.context(()=>{
    const progress=element.querySelector('[data-scroll-progress]');
    if(progress)gsap.fromTo(progress,{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:0.15}});
    gsap.from('[data-hero-line]',{yPercent:110,opacity:0,duration:LANDING_MOTION.intro,stagger:0.12,ease:'power3.out',delay:0.18});
    gsap.from('[data-hero-detail]',{y:20,opacity:0,duration:0.7,stagger:0.09,ease:'power3.out',delay:0.45});
    gsap.utils.toArray<HTMLElement>('[data-reveal-heading]').forEach(heading=>{
     gsap.from(heading.querySelectorAll('[data-reveal-word]'),{yPercent:75,opacity:0,stagger:LANDING_MOTION.stagger,duration:LANDING_MOTION.reveal,ease:'power3.out',scrollTrigger:{trigger:heading,start:'top 88%',once:true}});
    });
    gsap.utils.toArray<HTMLElement>('[data-story-reveal]').filter(block=>!block.querySelector('[data-reveal-heading]')).forEach((block,index)=>{
     gsap.from(block,{y:28,opacity:0,duration:LANDING_MOTION.reveal,ease:'power3.out',scrollTrigger:{trigger:block,start:'top 94%',once:true},delay:index%3*0.035});
    });
    media.add('(min-width: 1000px) and (min-height: 800px)',()=>{
     const showcase=element.querySelector('[data-hero-art]');
     if(showcase)gsap.to(showcase,{y:95,rotation:-3,scale:0.96,ease:'none',scrollTrigger:{trigger:'[data-hero]',start:'top top',end:'bottom top',scrub:0.7}});
     const pin=element.querySelector<HTMLElement>('[data-story-pin]');
     const demo=pin?.querySelector<HTMLElement>('[data-product-demo]');
     if(pin&&demo){
      demo.dataset.scrollDriven='true';
      let previous=-1;
      ScrollTrigger.create({trigger:pin,start:'top 24px',end:()=>`+=${window.innerHeight*LANDING_MOTION.pinScreens}`,pin:true,pinSpacing:true,anticipatePin:1,invalidateOnRefresh:true,onUpdate:self=>{
       if(demo.dataset.scrollManual==='true')return;
       const frame=Math.min(8,Math.floor(self.progress*9));
       if(frame!==previous){previous=frame;demo.dispatchEvent(new CustomEvent('nexo-story-progress',{detail:frame}));}
      }});
      gsap.fromTo(pin.querySelector('[data-demo-screen]'),{rotationY:-9,rotationZ:2,scale:0.94},{rotationY:0,rotationZ:0,scale:1,ease:'none',scrollTrigger:{trigger:pin,start:'top bottom',end:'top 24px',scrub:0.6}});
      return()=>{delete demo.dataset.scrollDriven;delete demo.dataset.scrollManual;};
     }
    });
    gsap.utils.toArray<HTMLElement>('[data-feature]').forEach((feature,index)=>{
     gsap.from(feature,{x:index%2?45:-45,opacity:0,duration:0.9,ease:'power3.out',scrollTrigger:{trigger:feature,start:'top 85%',once:true}});
    });
   },element);
   if(desktop){
    element.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(button=>{
     const move=(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;const rect=button.getBoundingClientRect();gsap.to(button,{x:(event.clientX-rect.left-rect.width/2)/rect.width*LANDING_MOTION.magnet,y:(event.clientY-rect.top-rect.height/2)/rect.height*LANDING_MOTION.magnet,duration:0.3,ease:'power3.out',overwrite:true});};
     const reset=()=>gsap.to(button,{x:0,y:0,duration:0.3,ease:'power3.out',overwrite:true});
     button.addEventListener('pointermove',move);button.addEventListener('pointerleave',reset);button.addEventListener('blur',reset);
     cleanups.push(()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerleave',reset);button.removeEventListener('blur',reset);gsap.killTweensOf(button);gsap.set(button,{clearProps:'transform'});});
    });
   }
   const keyboard=(event:KeyboardEvent)=>{
    if(event.key==='Tab'||event.key==='Home'||event.key==='End'||event.key.startsWith('Arrow')||event.key.startsWith('Page')||event.key===' '){
     lenis?.stop();lenis?.start();
     // Never leave a keyboard target behind an in-progress entrance.
     element.querySelectorAll<HTMLElement>('[data-story-reveal],[data-reveal-word],[data-hero-line],[data-hero-detail],[data-feature]').forEach(block=>{gsap.killTweensOf(block);gsap.set(block,{clearProps:'opacity,transform'});});
    }
   };
   document.addEventListener('keydown',keyboard,true);
   const refresh=()=>{if(!disposed&&current===revision)ScrollTrigger.refresh();};
   void document.fonts.ready.then(refresh);
   const resize=new ResizeObserver(()=>{lenis?.resize();});resize.observe(element);
   teardown=()=>{resize.disconnect();document.removeEventListener('keydown',keyboard,true);element.removeEventListener('click',anchor);cleanups.forEach(cleanup=>cleanup());media.revert();ctx.revert();if(lenis){gsap.ticker.remove(tick);lenis.destroy();}};
   refresh();
  };
  void configure().catch(()=>{/* Native scrolling and the complete content remain available. */});
  const change=()=>{void configure().catch(()=>{});};
  preference.addEventListener('change',change);pointerViewport.addEventListener('change',change);
  return()=>{disposed=true;revision++;preference.removeEventListener('change',change);pointerViewport.removeEventListener('change',change);teardown();};
 },[]);
 return root;
}
