type Node={id:string;kind:string};
type Edge={source:string;target:string;relation:string};
export function layoutWorkGraph(nodes:Node[],allEdges:Edge[]){
  const column=(n:Node)=>n.kind==='company'?0:n.kind==='application'?1:['email','sms'].includes(n.kind)?3:2;
  let groups=[0,1,2,3].map(c=>nodes.filter(n=>column(n)===c).map(n=>n.id));
  const columns=new Map(nodes.map(n=>[n.id,column(n)]));
  // The source-to-application shortcut adds visual clutter when the full path exists.
  const edges=allEdges.filter(e=>e.relation!=='notifies'||!allEdges.some(s=>s.source===e.source&&s.relation==='supports'&&allEdges.some(a=>a.source===e.target&&a.target===s.target&&a.relation==='participates')));
  const index=()=>new Map(groups.flatMap(g=>g.map((id,i)=>[id,i] as const)));
  const crossings=()=>{const at=index();let count=0;for(let i=0;i<edges.length;i++)for(const b of edges.slice(i+1)){const a=edges[i];let [as,atg]=[a.source,a.target], [bs,bt]=[b.source,b.target];if(columns.get(as)!>columns.get(atg)!)[as,atg]=[atg,as];if(columns.get(bs)!>columns.get(bt)!)[bs,bt]=[bt,bs];if(columns.get(as)===columns.get(bs)&&columns.get(atg)===columns.get(bt)&&columns.get(as)!==columns.get(atg)&&(at.get(as)!-at.get(bs)!)*(at.get(atg)!-at.get(bt)!)<0)count++;}return count;};
  let best=groups.map(g=>[...g]),score=crossings();
  for(let pass=0;pass<8;pass++)for(const c of (pass%2?[2,1,0]:[1,2,3])){
    const at=index(),side=pass%2?1:-1;
    const weight=(id:string)=>{const peers=edges.flatMap(e=>e.source===id?[e.target]:e.target===id?[e.source]:[]).filter(p=>columns.get(p)===c+side);return peers.length?peers.reduce((sum,p)=>sum+(at.get(p)??0),0)/peers.length:(at.get(id)??0);};
    groups[c].sort((a,b)=>weight(a)-weight(b)||(at.get(a)!-at.get(b)!));
    const next=crossings();if(next<score){score=next;best=groups.map(g=>[...g]);}
  }
  groups=best;
  const positions=new Map<string,{x:number;y:number;column:number}>();groups.forEach((g,c)=>g.forEach((id,i)=>positions.set(id,{x:20+c*270,y:55+i*82,column:c})));
  const path=(e:Edge)=>{let a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)return '';
    if(a.column>b.column)[a,b]=[b,a];
    if(a.column===b.column){const x=a.x+230,gutter=x+15;return `M ${x} ${a.y+31} C ${gutter} ${a.y+31}, ${gutter} ${b.y+31}, ${x} ${b.y+31}`;}
    return `M ${a.x+230} ${a.y+31} C ${a.x+250} ${a.y+31}, ${b.x-20} ${b.y+31}, ${b.x} ${b.y+31}`;
  };
  return {positions,edges,path,crossings:score,height:Math.max(240,...groups.map(g=>g.length*82+70))};
}
