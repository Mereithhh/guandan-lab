import { beats, parseCombo } from './rules';
import type { Card, GameState, Rank, Seat } from './types';

export interface Observation {seat:Seat;role:GameState['players'][number]['role'];hand:Card[];level:Rank;turn:Seat;lastPlay:GameState['lastPlay'];counts:number[];events:GameState['events']}
export interface AgentPolicy {name:string;choose(observation:Observation,legalMoves:string[][]):Promise<string[]|null>}

export function observe(state:GameState,seat:Seat):Observation{
  const events=state.events.filter(e=>e.type!=='deal').map(e=>({...e,note:e.type==='round'?e.note:undefined}));
  return{seat,role:state.players[seat].role,hand:state.players[seat].hand,level:state.level,turn:state.turn,lastPlay:state.lastPlay,counts:state.players.map(p=>p.hand.length),events};
}

export function legalMoves(o:Observation):string[][]{
  const hand=o.hand,wild=hand.filter(c=>c.suit==='H'&&c.rank===o.level),groups=new Map<number,Card[]>();
  for(const c of hand)groups.set(c.rank,[...(groups.get(c.rank)||[]),c]);
  const candidates:Card[][]=hand.map(c=>[c]);
  for(const g of groups.values())for(let n=2;n<=Math.min(g.length,10);n++)candidates.push(g.slice(0,n));
  for(let rank=2;rank<=14;rank++){const base=(groups.get(rank)||[]).filter(c=>!wild.includes(c));for(let size=2;size<=10;size++){const need=size-base.length;if(base.length&&need>=0&&need<=wild.length)candidates.push([...base.slice(0,size-need),...wild.slice(0,need)])}}
  const jokers=hand.filter(c=>c.suit==='J');if(jokers.length===4)candidates.push(jokers);
  const ranks=[...groups.keys()].filter(r=>r<=14);
  for(const tripleRank of ranks)for(const pairRank of ranks){if(tripleRank===pairRank)continue;const a=(groups.get(tripleRank)||[]).filter(c=>!wild.includes(c)).slice(0,3),b=(groups.get(pairRank)||[]).filter(c=>!wild.includes(c)).slice(0,2),need=5-a.length-b.length;if(a.length&&b.length&&need>=0&&need<=wild.length)candidates.push([...a,...b,...wild.slice(0,need)])}
  const windows=[[14,2,3,4,5],...[3,4,5,6,7,8,9,10].map(start=>[0,1,2,3,4].map(i=>start+i))];
  for(const window of windows){const missing=window.filter(r=>!groups.get(r)?.length);if(missing.length<=wild.length){const natural=window.filter(r=>groups.get(r)?.length).map(r=>groups.get(r)!.find(c=>!wild.includes(c))??groups.get(r)![0]);candidates.push([...natural,...wild.slice(0,missing.length)])}for(const suit of ['S','H','C','D'] as const){const suited=window.map(r=>hand.find(c=>c.rank===r&&c.suit===suit)).filter(Boolean) as Card[];const need=5-suited.length;if(need<=wild.length)candidates.push([...suited,...wild.filter(c=>!suited.includes(c)).slice(0,need)])}}
  for(let start=2;start<=13;start++){const pair=[start,start+1,start+2].flatMap(r=>(groups.get(r)||[]).slice(0,2));if(pair.length+wild.length>=6)candidates.push([...pair,...wild.filter(c=>!pair.includes(c)).slice(0,6-pair.length)]);const plate=[start,start+1].flatMap(r=>(groups.get(r)||[]).slice(0,3));if(plate.length+wild.length>=6)candidates.push([...plate,...wild.filter(c=>!plate.includes(c)).slice(0,6-plate.length)])}
  const seen=new Set<string>();return candidates.filter(cs=>{const ids=cs.map(c=>c.id).sort(),key=ids.join('|');if(seen.has(key)||new Set(ids).size!==ids.length)return false;seen.add(key);const combo=parseCombo(cs,o.level);return !!combo&&beats(combo,o.lastPlay?.combo??null)}).map(cs=>cs.map(c=>c.id));
}

export function chooseAiMove(o:Observation):string[]|null{
  const moves=legalMoves(o);if(!moves.length)return null;
  const partner=((o.seat+2)%4) as Seat;if(o.lastPlay?.seat===partner&&o.counts[partner]<=3)return null;
  return moves.sort((a,b)=>{const ca=parseCombo(a.map(id=>o.hand.find(c=>c.id===id)!),o.level)!,cb=parseCombo(b.map(id=>o.hand.find(c=>c.id===id)!),o.level)!;const bombA=['bomb','straightFlush','jokerBomb'].includes(ca.kind)?1:0,bombB=['bomb','straightFlush','jokerBomb'].includes(cb.kind)?1:0;return bombA-bombB||ca.mainRank-cb.mainRank||b.length-a.length})[0];
}

export async function safeAgentMove(policy:AgentPolicy,o:Observation,timeoutMs=1500):Promise<string[]|null>{
  const legal=legalMoves(o),fallback=chooseAiMove(o);try{const move=await Promise.race([policy.choose(o,legal),new Promise<null>(resolve=>setTimeout(()=>resolve(null),timeoutMs))]);if(move===null)return o.lastPlay?null:fallback;const key=[...move].sort().join('|');return legal.some(m=>[...m].sort().join('|')===key)?move:fallback}catch{return fallback}
}

export const localTrainingAgent:AgentPolicy={name:'搭档协作 Agent v1',choose:async(o)=>chooseAiMove(o)};
