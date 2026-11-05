/* Shared pure selectors: all recruitment dates use Asia/Shanghai, independent of phone zone. */
const MobileModel = (() => {
 const stamp=v=>v?Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(v)?v:v+'+08:00'):NaN;
 const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
 const day=(ms=Date.now())=>dayFormatter.format(new Date(ms));
 const due=s=>stamp(s.kind==='start'?s.start:(s.end||s.start));
 const expired=(s,now)=>stamp(s.end||s.start)<now;
 const live=s=>!s.done&&!s.cancelled;
 const onDay=(s,date)=>{if(s.kind==='window')return s.start.slice(0,10)<=date&&(s.end||s.start).slice(0,10)>=date;return (s.kind==='deadline'?(s.end||s.start):s.start).slice(0,10)===date;};
 const sort=items=>items.map(item=>({item,at:due(item)||Infinity})).sort((a,b)=>a.at-b.at||a.item.id-b.item.id).map(x=>x.item);
 function tasks(items,filter,query='',now=Date.now()) {const today=filter==='today'?day(now):'';return sort(items.filter(s=>{
  if(query&&!`${s.company} ${s.role} ${s.round} ${s.location}`.toLowerCase().includes(query.toLowerCase()))return false;
  return filter==='all'||filter==='done'&&s.done||filter==='overdue'&&live(s)&&expired(s,now)||filter==='upcoming'&&live(s)&&!expired(s,now)||filter==='today'&&live(s)&&onDay(s,today);
 }));}
 function month(date){const [year,m]=date.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>new Date(Date.UTC(year,m-1,i-offset+1)).toISOString().slice(0,10));}
 function applicationGroups(records){
 const apps=records.filter(r=>r.kind==='application'),statuses=new Map();
 const stages={applied:[],interviewed:[],offer:[]};
 for(const r of apps){const status=r.data.status||'WISHLIST';if(!statuses.has(status))statuses.set(status,[]);statuses.get(status).push(r);
 const seen=new Set([status,...(r.stageHistory||[])]);
 const offered=[...seen].some(x=>['OFFER','SIGNED'].includes(x));
 const interviewed=offered||[...seen].some(x=>/^INTERVIEW_|^HR_INTERVIEW$/.test(x));
 if([...seen].some(x=>['APPLIED','SCREENING','WRITTEN_TEST','OFFER','SIGNED'].includes(x))||interviewed||r.data.appliedAt)stages.applied.push(r);
 if(interviewed)stages.interviewed.push(r);if(offered)stages.offer.push(r);
 }
 return {apps,statuses,stages};
 }
 return {applicationGroups,stamp,day,due,live,onDay,sort,tasks,month};
})();
if(typeof module!=='undefined')module.exports=MobileModel;
