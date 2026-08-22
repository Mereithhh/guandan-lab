import type { Card, Rank, Suit } from './types';

export const RANK_LABEL:Record<number,string>={2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'小王',16:'大王'};
export const SUIT_LABEL:Record<Suit,string>={S:'♠',H:'♥',C:'♣',D:'♦',J:''};

export function createDeck():Card[]{
  const deck:Card[]=[];
  for(let d=0;d<2;d++){
    for(const suit of ['S','H','C','D'] as Suit[]) for(let rank=2;rank<=14;rank++) deck.push({id:`${d}-${suit}-${rank}`,suit,rank:rank as Rank,deck:d as 0|1});
    deck.push({id:`${d}-J-15`,suit:'J',rank:15,deck:d as 0|1},{id:`${d}-J-16`,suit:'J',rank:16,deck:d as 0|1});
  }
  return deck;
}

export function mulberry32(seed:number){ return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}; }
export function shuffle<T>(items:T[],seed:number):T[]{ const a=[...items],rnd=mulberry32(seed); for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; }
export function rankPower(rank:Rank,level:Rank){ if(rank===16)return 17;if(rank===15)return 16;if(rank===level)return 15;return rank; }
export function sortCards(cards:Card[],level:Rank){return [...cards].sort((a,b)=>rankPower(a.rank,level)-rankPower(b.rank,level)||a.suit.localeCompare(b.suit)||a.deck-b.deck)}
export function cardLabel(card:Card){return `${SUIT_LABEL[card.suit]}${RANK_LABEL[card.rank]}`}
