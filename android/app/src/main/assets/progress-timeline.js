/* Local history chart. Gestures only change the viewport; never sync or call AI. */
const progressHidden=new Set();
function progressShift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function renderOverviewTimeline(){
 let host=$('overviewTimeline');if(!host){host=node('section','');host.id='overviewTimeline';host.className='settings-group';$('pipeline').parentElement.after(host);}host.replaceChildren(node('h2',t('进度时间轴','Progress timeline')));
 const redraw=()=>renderOverviewTimeline(),shift=n=>{overviewAnchor=progressShift(overviewAnchor,n);redraw();};
 const controls=node('div','');controls.className='trend-controls';const range=node('select','');range.setAttribute('aria-label',t('时间轴范围','Timeline range'));for(const days of [7,30,90,365])range.append(new Option(days+t(' 天',' days'),days));if(![7,30,90,365].includes(overviewSpan))range.append(new Option(overviewSpan+t(' 天',' days'),overviewSpan));range.value=overviewSpan;range.onchange=()=>{overviewSpan=Number(range.value);redraw();};
 const end=node('input','');end.type='date';end.value=overviewAnchor;end.setAttribute('aria-label',t('时间轴结束日期','Timeline end date'));end.onchange=()=>{if(/^\d{4}-\d{2}-\d{2}$/.test(end.value)){overviewAnchor=end.value;redraw();}};
 controls.append(range,button(t('今天','Today'),()=>{overviewAnchor=MobileModel.day();redraw();}));const more=node('details','');more.className='trend-more';more.append(node('summary',t('日期范围','Date range')),end,button(t('← 更早','← Earlier'),()=>shift(-overviewSpan)),button(t('更晚 →','Later →'),()=>shift(overviewSpan)));host.append(controls,more);
 const groups=[['applied',t('投递','Applied'),'#6588ec'],['interviewed',t('笔试 / 面试','Test / interview'),'#b08cf4'],['offer','Offer','#eead52'],['rejected',t('被拒','Rejected'),'#ea829b']];
 const points=MobileModel.progress(workspaceRecords),start=progressShift(overviewAnchor,1-overviewSpan),days=Array.from({length:overviewSpan},(_,i)=>progressShift(start,i)),buckets=new Map(days.map(d=>[d,{applied:0,interviewed:0,offer:0,rejected:0}]));for(const p of points)if(buckets.has(p.date))buckets.get(p.date)[p.group]++;
 const legend=node('div','');legend.className='chart-legend trend-legend';for(const [key,label,color]of groups){const b=button(label,()=>{progressHidden.has(key)?progressHidden.delete(key):progressHidden.add(key);redraw();});b.setAttribute('aria-pressed',!progressHidden.has(key));b.style.borderLeft='4px solid '+color;legend.append(b);}host.append(legend);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 260');svg.classList.add('progress-plot');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('每日进度趋势，可左右拖动','Daily progress; drag to browse'));
 const el=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;};
 const max=Math.max(1,...[...buckets.values()].flatMap(b=>groups.filter(g=>!progressHidden.has(g[0])).map(g=>b[g[0]]))),x=i=>36+i*308/Math.max(1,days.length-1),y=n=>212-n/max*184;
 for(const v of [...new Set([0,Math.ceil(max/2),max])]){el('line',{x1:32,x2:346,y1:y(v),y2:y(v),stroke:'var(--line)'});el('text',{x:26,y:y(v)+4,'text-anchor':'end',fill:'var(--muted)','font-size':13},v);}
 for(let i=0;i<days.length;i+=Math.max(1,Math.ceil(days.length/4)))el('text',{x:x(i),y:241,'text-anchor':i===0?'start':'middle',fill:'var(--muted)','font-size':13},days[i].slice(5));
 const detail=node('div','');detail.className='trend-detail';const show=i=>{const date=days[Math.max(0,Math.min(days.length-1,i))],rows=points.filter(p=>p.date===date&&!progressHidden.has(p.group));detail.replaceChildren(node('strong',date),...groups.filter(g=>!progressHidden.has(g[0])).map(([key,label])=>button(label+' · '+buckets.get(date)[key],()=>showApplicationCategory(date+' · '+label,[...new Map(rows.filter(p=>p.group===key).map(p=>[p.record.id,p.record])).values()]))));};
 for(const[key,label,color]of groups){if(progressHidden.has(key))continue;el('polyline',{points:days.map((d,i)=>x(i)+','+y(buckets.get(d)[key])).join(' '),fill:'none',stroke:color,'stroke-width':2.5,'vector-effect':'non-scaling-stroke'});for(let i=0;i<days.length;i++)if(buckets.get(days[i])[key]>0){const dot=el('circle',{cx:x(i),cy:y(buckets.get(days[i])[key]),r:4,fill:color});const title=document.createElementNS(ns,'title');title.textContent=days[i]+' '+label+' '+buckets.get(days[i])[key];dot.append(title);}}
 if(!points.some(p=>buckets.has(p.date)))host.append(node('p',t('这段时间没有已保存的进度记录，可向前拖动查看。','No saved progress in this range. Drag to browse earlier dates.')));
 const layer=document.createElementNS(ns,'g');for(const n of [...svg.children])if(['polyline','circle'].includes(n.tagName))layer.append(n);svg.append(layer);
 attachProgressGestures(svg,layer,{pan:dx=>shift(-Math.round(dx/(svg.getBoundingClientRect().width*308/360)*overviewSpan)),zoom:(ratio,center)=>{const old=overviewSpan;overviewSpan=Math.max(7,Math.min(365,Math.round(old/ratio)));const fraction=Math.max(0,Math.min(1,(center/svg.getBoundingClientRect().width*360-36)/308));overviewAnchor=progressShift(overviewAnchor,Math.round((overviewSpan-old)*(1-fraction)));redraw();},tap:px=>show(Math.round((px/svg.getBoundingClientRect().width*360-36)/308*(days.length-1)))});
 host.append(svg,node('small',start+' — '+overviewAnchor),detail);
 host.append(node('p',t('左右拖动 · 双指缩放 · 点图查看申请','Drag to browse · pinch to zoom · tap for applications')));
}

// One compositor update per frame; commit data only at gesture end.
function attachProgressGestures(svg,layer,actions){
 let gesture=null,frame=0,preview={scale:1,dx:0,center:0};
 const draw=()=>{frame=0;if(!svg.isConnected)return;const p=preview,k=360/svg.getBoundingClientRect().width;layer.setAttribute('transform',`translate(${p.dx*k+p.center*k*(1-p.scale)} 0) scale(${p.scale} 1)`);};
 const queue=p=>{preview=p;if(!frame)frame=requestAnimationFrame(draw);};
 const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;layer.removeAttribute('transform');gesture=null;};
 const start=(x,y)=>{gesture={x,y,lastX:x,lastY:y};};
 const move=(x,y)=>{if(!gesture||gesture.distance)return;gesture.lastX=x;gesture.lastY=y;const dx=x-gesture.x,dy=y-gesture.y;if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.3){gesture.drag=true;queue({scale:1,dx,center:0});}};
 const finish=()=>{if(!gesture)return;const g=gesture;reset();if(g.distance){if(g.ratio)actions.zoom(g.ratio,g.center);return;}const dx=g.lastX-g.x,dy=g.lastY-g.y;if(g.drag)actions.pan(dx);else if(Math.abs(dx)<8&&Math.abs(dy)<8)actions.tap(g.x-svg.getBoundingClientRect().left);};
 svg.onpointerdown=e=>{if(e.pointerType==='touch')return;start(e.clientX,e.clientY);try{svg.setPointerCapture(e.pointerId);}catch(_){}};
 svg.onpointermove=e=>{if(e.pointerType!=='touch')move(e.clientX,e.clientY);};svg.onpointerup=e=>{if(e.pointerType!=='touch'){move(e.clientX,e.clientY);finish();}};svg.onpointercancel=reset;
 svg.addEventListener('touchstart',e=>{if(e.touches.length===2){const [a,b]=e.touches;gesture={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),center:(a.clientX+b.clientX)/2-svg.getBoundingClientRect().left};}else if(e.touches.length===1)start(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
 svg.addEventListener('touchmove',e=>{if(gesture?.distance&&e.touches.length===2){const[a,b]=e.touches;gesture.ratio=Math.max(.1,Math.min(10,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/Math.max(1,gesture.distance)));queue({scale:gesture.ratio,dx:0,center:gesture.center});}else if(e.touches.length===1)move(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
 svg.addEventListener('touchend',e=>{if(gesture&&!gesture.distance&&e.changedTouches.length)move(e.changedTouches[0].clientX,e.changedTouches[0].clientY);finish();},{passive:true});svg.addEventListener('touchcancel',reset,{passive:true});
}
