import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscoveredGraph } from '../src/lib/discoveredGraph';
import { articleIdentity, type CanonicalArticle, type LinkEvidence } from '../src/lib/linkSource';
interface Measurements { stepMs:number[];routeLengths:Array<number|null>;reachableCounts:Array<[number,number]> }
export interface GraphBenchmarkRow {
 nodes:number;initialEdges:number;addedEdges:number;initialIndexMs:number;
 reference:Measurements;incremental:Measurements;
}
/** CPU comparison excludes HTTP and graph construction. Each timed step adds a
 * page of edges, reconstructs a route and requests both directed distance sets. */
export function runGraphBenchmark(sizes=[{nodes:10000,edges:120000},{nodes:100000,edges:1100000}],steps=3):GraphBenchmarkRow[]{
 return sizes.map(size=>{
  let seed=20261004;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};
  const articles:CanonicalArticle[]=Array.from({length:size.nodes},(_,i)=>({title:`N${i}`,lang:'en'}));
  const keys=articles.map(articleIdentity),out=new Map<string,Map<string,LinkEvidence>>(),incoming=new Map<string,Map<string,LinkEvidence>>();
  const edges:LinkEvidence[]=[];
  const make=(from:number,to:number)=>({from:articles[from],to:articles[to],rawTarget:articles[to].title,fresh:true});
  const addReference=(edge:LinkEvidence)=>{
   const from=articleIdentity(edge.from),to=articleIdentity(edge.to);
   const left=out.get(from)??new Map();left.set(to,edge);out.set(from,left);
   const right=incoming.get(to)??new Map();right.set(from,edge);incoming.set(to,right);
  };
  for(let from=0;from<size.nodes;from++){
   const count=Math.floor(size.edges/size.nodes)+(from<size.edges%size.nodes?1:0),targets=new Set<number>();
   while(targets.size<count){const to=random(size.nodes);if(to!==from)targets.add(to);}
   for(const to of targets){const edge=make(from,to);edges.push(edge);addReference(edge);}
  }
  const graph=new DiscoveredGraph({edges}),start=articles[0],end=articles.at(-1)!;
  const scan=(root:string,reverse:boolean,depthLimit:number,stopAt?:string)=>{
   const queue=[root],distances=new Map([[root,0]]),adjacency=reverse?incoming:out;
   for(let i=0;i<queue.length;i++){
    const depth=distances.get(queue[i])!;if(depth>=depthLimit)continue;
    for(const next of adjacency.get(queue[i])?.keys()??[]){
     if(distances.has(next))continue;distances.set(next,depth+1);
     if(next===stopAt)return distances;queue.push(next);
    }
   }
   return distances;
  };
  const indexStarted=performance.now();graph.route(start,end,12);graph.reachable(start,'out',12);graph.reachable(end,'in',6);
  const result:GraphBenchmarkRow={nodes:size.nodes,initialEdges:edges.length,addedEdges:0,initialIndexMs:performance.now()-indexStarted,
   reference:{stepMs:[],routeLengths:[],reachableCounts:[]},incremental:{stepMs:[],routeLengths:[],reachableCounts:[]}};
  for(let step=0;step<steps;step++){
   const page:LinkEvidence[]=[],selected=new Set<string>(),pageSize=Math.min(500,Math.floor(size.nodes/5));
   while(page.length<pageSize){
    const from=random(size.nodes),to=random(size.nodes),key=JSON.stringify([from,to]);
    if(from===to||out.get(keys[from])?.has(keys[to])||selected.has(key))continue;
    selected.add(key);page.push(make(from,to));
   }
   result.addedEdges+=page.length;
   const referenceStarted=performance.now();page.forEach(addReference);
   const distance=scan(keys[0],false,12,keys.at(-1)).get(keys.at(-1)!)??null;
   const left=scan(keys[0],false,12),right=scan(keys.at(-1)!,true,6);
   result.reference.stepMs.push(performance.now()-referenceStarted);result.reference.routeLengths.push(distance);result.reference.reachableCounts.push([left.size,right.size]);
   const incrementalStarted=performance.now();graph.add(page);
   const route=graph.route(start,end,12),forward=graph.reachable(start,'out',12),backward=graph.reachable(end,'in',6);
   result.incremental.stepMs.push(performance.now()-incrementalStarted);result.incremental.routeLengths.push(route?.length??null);result.incremental.reachableCounts.push([forward.length,backward.length]);
  }
  return result;
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const records=runGraphBenchmark(),output=process.argv[2]??'docs/anytime-graph-benchmark.json';
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({seed:20261004,scope:'CPU only: page insert, route, two reachability queries; indexes prewarmed; three steps',records},null,2)+'\n');
 console.log(JSON.stringify({output,records},null,2));
}
