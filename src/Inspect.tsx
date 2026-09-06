import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {Photo,Inspection} from './types'

export default function Inspect({photo,zoom,zoomRevision=0}:{photo:Photo;zoom:boolean;zoomRevision?:number}){
 const [data,setData]=useState<Inspection|null>(null),[error,setError]=useState('')
 const [bounds,setBounds]=useState({width:1,height:1}),[natural,setNatural]=useState({width:photo.width||1,height:photo.height||1})
 const [scale,setScale]=useState<number|null>(null),[offset,setOffset]=useState({x:0,y:0})
 const box=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null)
 useEffect(()=>{let alive=true;setData(null);setError('');window.photoAPI.inspect(photo.id,photo.viewingProfile).then(d=>{if(alive)setData(d)},e=>{if(alive)setError(String(e.message))});return()=>{alive=false}},[photo.id,photo.viewingProfile])
 useLayoutEffect(()=>{const el=box.current!;const measure=()=>setBounds({width:Math.max(1,el.clientWidth),height:Math.max(1,el.clientHeight)});measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[])
 useEffect(()=>{setScale(zoom?1/(window.devicePixelRatio||1):null);setOffset({x:0,y:0})},[zoom,photo.id,zoomRevision])
 const fit=Math.min(bounds.width/natural.width,bounds.height/natural.height),actual=scale??fit
 // Add half an image of padding on each side (a twice-image-sized pan area).
 // Keep a small portion visible so a long drag cannot lose the photo entirely.
 const limit=(x:number,y:number,s=actual)=>{
  const axis=(value:number,image:number,viewport:number)=>{const padding=image/2,visible=Math.min(32,image/4,viewport/4),max=Math.min(Math.max(0,(image-viewport)/2)+padding,(image+viewport)/2-visible);return Math.max(-max,Math.min(max,value))}
  return {x:axis(x,natural.width*s,bounds.width),y:axis(y,natural.height*s,bounds.height)}
 }
 const position=limit(offset.x,offset.y)
 useEffect(()=>{const el=box.current!;const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?bounds.height:1),next=Math.max(Math.min(fit,.05),Math.min(8,actual*Math.exp(-Math.max(-200,Math.min(200,delta))*.002)));const x=e.clientX-rect.left-bounds.width/2,y=e.clientY-rect.top-bounds.height/2;setOffset(limit(x-(x-position.x)*next/actual,y-(y-position.y)*next/actual,next));setScale(next)};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[actual,fit,bounds,natural,position.x,position.y])
 return <section className="inspect-pane"><div className="inspect-label"><b>{photo.stem}</b><span>{data?.kind||'Loading full image…'}</span></div>{error&&<p role="alert">{error}</p>}{data?.warning&&<p>{data.warning}</p>}
 <div className="inspect-canvas measured-view" ref={box} onDoubleClick={()=>{setScale(null);setOffset({x:0,y:0})}} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,left:position.x,top:position.y}}} onPointerMove={e=>{if(drag.current)setOffset(limit(drag.current.left+e.clientX-drag.current.x,drag.current.top+e.clientY-drag.current.y))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}>
 <img alt={photo.stem} draggable={false} src={data?.url||photo.fullPreviewUrl||photo.previewUrl} onLoad={e=>setNatural({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} style={{width:natural.width*actual,height:natural.height*actual,transform:`translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`}}/>
 </div><small>{data?`${data.width} × ${data.height}`:'Decoding locally'} · {Math.round(actual*(window.devicePixelRatio||1)*100)}%{scale===null?' · Fit':''} · Scroll to zoom · Drag to pan · Double-click to fit</small></section>
}

export function Filmstrip({photos,active,label,onChoose}:{photos:Photo[];active:string;label:string;onChoose:(photo:Photo)=>void}){
 const strip=useRef<HTMLDivElement>(null)
 useEffect(()=>{strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest',inline:'center'})},[active,photos])
 return <details open className="filmstrip-section" aria-label={label}><summary className="filmstrip-heading">{label}<span>{photos.length} frames</span></summary><div className="filmstrip" ref={strip} onWheel={e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX))e.currentTarget.scrollLeft+=e.deltaY}}>{photos.map(p=><button key={p.id} aria-current={p.id===active?'true':undefined} className={'film-frame '+(p.flag==='reject'?'rejected':'')} onClick={()=>onChoose(p)} title={p.stem}><img loading="lazy" src={p.previewUrl} alt={p.stem}/><span style={{borderBottom:p.colorLabel&&p.colorLabel!=='none'?`3px solid ${p.colorLabel}`:undefined}}>{p.flag==='pick'?'✓ ':p.flag==='reject'?'× ':''}{p.bookmarked?'◆ ':''}{p.review?'? ':''}{p.stem}</span></button>)}</div></details>
}
