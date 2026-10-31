/* Shared pure selectors: all recruitment dates use Asia/Shanghai, independent of phone zone. */
const MobileModel = (() => {
 const stamp=v=>v?Date.parse(v+'+08:00'):NaN;
 const day=(ms=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
 const due=s=>stamp(s.kind==='start'?s.start:(s.end||s.start));
 const expired=(s,now)=>stamp(s.end||s.start)<now;
 const live=s=>!s.done&&!s.cancelled;
 const onDay=(s,date)=>{if(s.kind==='window')return s.start.slice(0,10)<=date&&(s.end||s.start).slice(0,10)>=date;return (s.kind==='deadline'?(s.end||s.start):s.start).slice(0,10)===date;};
 const sort=items=>[...items].sort((a,b)=>(due(a)||Infinity)-(due(b)||Infinity)||a.id-b.id);
 function tasks(items,filter,query='',now=Date.now()) {return sort(items.filter(s=>{
  if(query&&!`${s.company} ${s.role} ${s.round} ${s.location}`.toLowerCase().includes(query.toLowerCase()))return false;
  return filter==='all'||filter==='done'&&s.done||filter==='overdue'&&live(s)&&expired(s,now)||filter==='upcoming'&&live(s)&&!expired(s,now)||filter==='today'&&live(s)&&onDay(s,day(now));
 }));}
 function month(date){const [year,m]=date.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>new Date(Date.UTC(year,m-1,i-offset+1)).toISOString().slice(0,10));}
 return {stamp,day,due,live,onDay,sort,tasks,month};
})();
if(typeof module!=='undefined')module.exports=MobileModel;
