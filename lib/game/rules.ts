import { rankPower } from './cards';
import type { Card, Combo, ComboKind, Rank } from './types';

const sequenceHigh=(counts:Map<number,number>,n:number)=>{const ks=[...counts.keys()].sort((a,b)=>a-b);if(ks.length!==n)return null;if(ks.every((v,i)=>i===0||v===ks[i-1]+1))return ks.at(-1)!;const aceLow=ks.map(v=>v===14?1:v).sort((a,b)=>a-b);return aceLow.every((v,i)=>i===0||v===aceLow[i-1]+1)?aceLow.at(-1)!:null};
const main=(counts:Map<number,number>,need:number)=>[...counts.entries()].find(([,n])=>n===need)?.[0]??0;

/** Red-heart level cards are wild in multi-card combinations, never as jokers. */
export function parseCombo(cards:Card[],level:Rank):Combo|null{
  if(!cards.length)return null;
  if(cards.length===4&&cards.every(c=>c.suit==='J'))return combo('jokerBomb',cards,18,[]);
  if(cards.length===1)return combo('single',cards,rankPower(cards[0].rank,level),[]);
  const wild=cards.filter(c=>c.suit==='H'&&c.rank===level);
  const natural=cards.filter(c=>!wild.includes(c));
  const candidates:Combo[]=[];
  for(const assigned of assignments(natural,wild.length)){
    const counts=countRanks(assigned), ranks=[...counts.keys()];
    const add=(kind:ComboKind,mainRank:number)=>candidates.push(combo(kind,cards,mainRank,wild.map(c=>c.id)));
    if(cards.length===2&&counts.size===1)add('pair',rankPower(ranks[0] as Rank,level));
    if(cards.length===3&&counts.size===1)add('triple',rankPower(ranks[0] as Rank,level));
    if(cards.length===5){
      if([...counts.values()].sort().join()==='2,3')add('triplePair',rankPower(main(counts,3) as Rank,level));
      const high=sequenceHigh(counts,5);
      if(high&&ranks.every(r=>r>=2&&r<=14)){
        const flush=cards.every(c=>c.suit!=='J'&&(c.suit===cards.find(x=>x.suit!=='J'&&!(x.suit==='H'&&x.rank===level))?.suit||c.suit==='H'&&c.rank===level));
        add(flush?'straightFlush':'straight',high);
      }
    }
    if(cards.length===6&&ranks.every(r=>r<=14)&&counts.size===3&&[...counts.values()].every(n=>n===2)&&sequenceHigh(counts,3))add('tube',sequenceHigh(counts,3)!);
    if(cards.length===6&&ranks.every(r=>r<=14)&&counts.size===2&&[...counts.values()].every(n=>n===3)&&sequenceHigh(counts,2))add('plate',sequenceHigh(counts,2)!);
    if(cards.length>=4&&cards.length<=10&&counts.size===1)add('bomb',rankPower(ranks[0] as Rank,level));
  }
  return candidates.sort((a,b)=>comboPower(b)-comboPower(a)||b.mainRank-a.mainRank)[0]??null;
}

function assignments(natural:Card[],wildCount:number):Card[][]{
  if(!wildCount)return [natural];
  const out:Card[][]=[];
  const recur=(arr:Card[],n:number)=>{if(!n){out.push(arr);return}for(let rank=2;rank<=14;rank++)recur([...arr,{id:`wild-${n}-${rank}`,suit:'H',rank:rank as Rank,deck:0}],n-1)};
  recur(natural,wildCount);return out;
}
function countRanks(cards:Card[]){const m=new Map<number,number>();for(const c of cards)m.set(c.rank,(m.get(c.rank)||0)+1);return m}
function combo(kind:ComboKind,cards:Card[],mainRank:number,wildIds:string[]):Combo{return{kind,size:cards.length,mainRank,cards,wildIds}}
export function comboPower(c:Combo){if(c.kind==='jokerBomb')return 1000;if(c.kind==='bomb')return 680+c.size*20;if(c.kind==='straightFlush')return 790;return 100}
export function beats(next:Combo,previous:Combo|null){if(!previous)return true;const a=comboPower(next),b=comboPower(previous);if(a!==b)return a>b;if(next.kind!==previous.kind||next.size!==previous.size)return false;return next.mainRank>previous.mainRank}
export function comboName(c:Combo){return({single:'单张',pair:'对子',triple:'三张',triplePair:'三带二',straight:'顺子',tube:'三连对（木板）',plate:'二连三（钢板）',bomb:`${c.size}张炸弹`,straightFlush:'同花顺',jokerBomb:'四王炸'})[c.kind]}
