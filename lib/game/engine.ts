import { createDeck, rankPower, shuffle, sortCards } from './cards';
import { beats, parseCombo } from './rules';
import type { Card, GameEvent, GameState, Rank, Seat } from './types';

const nextSeat=(state:GameState,from:Seat):Seat=>{for(let i=1;i<=4;i++){const s=((from+i)%4) as Seat;if(!state.players[s].finished)return s}return from};
const event=(state:GameState,type:GameEvent['type'],seat?:Seat,cardIds?:string[],note?:string):GameEvent=>({id:`e${state.events.length+1}`,type,seat,cardIds,at:state.events.length,note});

export function newGame(seed=Date.now(),level:Rank=2):GameState{
  const deck=shuffle(createDeck(),seed),names=['你','王总','小顾','林姐'],roles=['you','boss','partner','opponent'] as const;
  const players=names.map((name,seat)=>({seat:seat as Seat,name,role:roles[seat],hand:sortCards(deck.slice(seat*27,seat*27+27),level)}));
  const first=(Math.abs(seed)%4) as Seat;
  return{schemaVersion:2,ruleVersion:'竞技掼蛋2022-教学版',seed,createdAt:Date.now(),level,levelOwner:null,phase:'playing',players,turn:first,leader:first,lastPlay:null,passes:0,finishOrder:[],events:[{id:'e1',type:'deal',at:0,note:`本副牌序已生成 · ${names[first]}首出`}],trickNo:1,roundNo:1,teamLevels:[level,level],matchWinner:null};
}

export function legalPlay(state:GameState,seat:Seat,cardIds:string[]):{ok:true}|{ok:false;reason:string}{
  if(state.phase!=='playing')return{ok:false,reason:'本副牌已经结束'};if(state.turn!==seat)return{ok:false,reason:'还没轮到你'};if(!cardIds.length)return{ok:false,reason:'请先选择要出的牌'};
  const hand=state.players[seat].hand,cards=cardIds.map(id=>hand.find(c=>c.id===id)).filter(Boolean) as Card[];
  if(cards.length!==new Set(cardIds).size)return{ok:false,reason:'选牌与手牌不一致'};
  const parsed=parseCombo(cards,state.level);if(!parsed)return{ok:false,reason:'这些牌不能组成合法牌型'};
  if(!beats(parsed,state.lastPlay?.combo??null))return{ok:false,reason:'牌型或点数压不过上一手'};return{ok:true};
}

export function playCards(state:GameState,seat:Seat,cardIds:string[]):GameState{
  const valid=legalPlay(state,seat,cardIds);if(!valid.ok)throw new Error(valid.reason);
  const players=state.players.map(p=>({...p,hand:[...p.hand]})),cards=cardIds.map(id=>players[seat].hand.find(c=>c.id===id)!) as Card[],parsed=parseCombo(cards,state.level)!;
  players[seat].hand=players[seat].hand.filter(c=>!cardIds.includes(c.id));
  const finishOrder=[...state.finishOrder];if(!players[seat].hand.length&&!finishOrder.includes(seat)){finishOrder.push(seat);players[seat].finished=finishOrder.length}
  const doubleUp=finishOrder.length===2&&finishOrder[0]%2===finishOrder[1]%2,finished=doubleUp||finishOrder.length>=3;
  if(finished){for(const last of players.filter(p=>!finishOrder.includes(p.seat))){finishOrder.push(last.seat);last.finished=finishOrder.length}}
  const winnerTeam=(finishOrder[0]%2) as 0|1,partner=((finishOrder[0]+2)%4) as Seat,partnerPlace=finishOrder.indexOf(partner);
  const matchWinner=finished&&state.level===14&&state.levelOwner===winnerTeam&&partnerPlace>=0&&partnerPlace<3?winnerTeam:null;
  const out={...state,players,finishOrder,lastPlay:{seat,cardIds,combo:parsed},passes:0,turn:finished?seat:nextSeat({...state,players} as GameState,seat),phase:finished?'finished':'playing',events:[...state.events,event(state,'play',seat,cardIds)],matchWinner} as GameState;
  if(players[seat].finished)out.events.push(event(out,'finish',seat,undefined,`第${players[seat].finished}名`));if(finished){for(const autoSeat of finishOrder.filter(s=>s!==seat&&state.players[s].finished===undefined))out.events.push(event(out,'finish',autoSeat,undefined,`第${players[autoSeat].finished}名（自然结束）`))}return out;
}

export function passTurn(state:GameState,seat:Seat):GameState{
  if(state.phase!=='playing')throw new Error('本副牌已经结束');if(state.players[seat].finished)throw new Error('已出完的玩家不能行动');if(state.turn!==seat)throw new Error('还没轮到你');if(!state.lastPlay)throw new Error('你是领出，不能过牌');
  const active=state.players.filter(p=>!p.finished).length,passes=state.passes+1;
  const needed=active-(state.players[state.lastPlay.seat].finished?0:1);
  if(passes>=Math.max(1,needed)){
    const winner=state.lastPlay.seat;let leader=state.players[winner].finished?(((winner+2)%4) as Seat):winner;if(state.players[leader].finished)leader=nextSeat(state,leader);
    const passEvent=event(state,'pass',seat);const base={...state,events:[...state.events,passEvent]};
    return{...base,turn:leader,leader,lastPlay:null,passes:0,trickNo:state.trickNo+1,events:[...base.events,event(base,'trick',leader,undefined,'接风/新一圈')]};
  }
  return{...state,turn:nextSeat(state,seat),passes,events:[...state.events,event(state,'pass',seat)]};
}

export function resultLabel(state:GameState){if(state.phase!=='finished')return'';if(state.matchWinner!=null)return `${state.matchWinner===0?'你方':'对方'}过 A · 赢得比赛`;const [first,second]=state.finishOrder;return first%2===second%2?'双上 · 升 3 级':state.finishOrder[2]%2===first%2?'头游三游 · 升 2 级':'头游末游 · 升 1 级'}

export function resultSummary(state:GameState){
  if(state.phase!=='finished'||state.finishOrder.length<4)return'';
  const winnerTeam=(state.finishOrder[0]%2) as 0|1,team=winnerTeam===0?'你 / 小顾队':'王总 / 林姐队';
  if(state.matchWinner!==null)return`${team} · 过 A · ${winnerTeam===0?'你方赢得比赛':'你方本场告负'}`;
  const pattern=state.finishOrder[1]%2===winnerTeam?'双上':state.finishOrder[2]%2===winnerTeam?'头游三游':'头游末游',steps=upgradeSteps(state.finishOrder);
  return`${team} · ${pattern} · 升 ${steps} 级 · ${winnerTeam===0?'你方升级':'你方本副未升级'}`;
}

export function upgradeSteps(order:Seat[]){if(order.length<4)return 0;return order[0]%2===order[1]%2?3:order[0]%2===order[2]%2?2:1}
export function advanceLevel(level:Rank,steps:number):Rank{return Math.min(14,level+steps) as Rank}

/** Starts the next deal and resolves the common single/double tribute automatically for training. */
export function nextRound(previous:GameState,seed=Date.now()):GameState{
  if(previous.phase!=='finished')throw new Error('本副尚未结束');
  if(previous.matchWinner!==null)throw new Error('比赛已经结束');
  const winnerTeam=(previous.finishOrder[0]%2) as 0|1,levels:[Rank,Rank]=[...previous.teamLevels];
  levels[winnerTeam]=advanceLevel(levels[winnerTeam],upgradeSteps(previous.finishOrder));
  const state=newGame(seed,levels[winnerTeam]);state.roundNo=previous.roundNo+1;state.teamLevels=levels;state.levelOwner=winnerTeam;
  const first=previous.finishOrder[0],last=previous.finishOrder[3],doubleDown=previous.finishOrder[0]%2===previous.finishOrder[1]%2;
  let transfers:Array<[Seat,Seat]>=doubleDown?[[previous.finishOrder[3],previous.finishOrder[0]],[previous.finishOrder[2],previous.finishOrder[1]]]:[[last,first]];
  const anti=doubleDown?transfers.flatMap(([from])=>state.players[from].hand.filter(c=>c.rank===16)).length===2:state.players[last].hand.filter(c=>c.rank===16).length===2;
  if(anti){state.events.push(event(state,'round',undefined,undefined,'两张大王抗贡'));state.turn=first;return state}
  const tributeFor=(from:Seat)=>[...state.players[from].hand].filter(c=>!(c.suit==='H'&&c.rank===state.level)).sort((a,b)=>rankPower(b.rank,state.level)-rankPower(a.rank,state.level)||b.rank-a.rank)[0];
  if(doubleDown){const ranked=transfers.map(([from])=>({from,card:tributeFor(from)})).sort((a,b)=>rankPower(b.card.rank,state.level)-rankPower(a.card.rank,state.level));transfers=[[ranked[0].from,previous.finishOrder[0]],[ranked[1].from,previous.finishOrder[1]]]}
  const firstOut=transfers[0][0];
  for(const [from,to] of transfers){const giver=state.players[from],receiver=state.players[to];const tribute=tributeFor(from);giver.hand=giver.hand.filter(c=>c.id!==tribute.id);receiver.hand.push(tribute);const returned=[...receiver.hand].filter(c=>c.id!==tribute.id&&rankPower(c.rank,state.level)<=10).sort((a,b)=>rankPower(a.rank,state.level)-rankPower(b.rank,state.level))[0]??[...receiver.hand].filter(c=>c.id!==tribute.id).sort((a,b)=>rankPower(a.rank,state.level)-rankPower(b.rank,state.level))[0];receiver.hand=receiver.hand.filter(c=>c.id!==returned.id);giver.hand.push(returned);giver.hand=sortCards(giver.hand,state.level);receiver.hand=sortCards(receiver.hand,state.level);state.events.push(event(state,'round',from,[tribute.id,returned.id],`向${to}号位进贡并还贡`))}
  state.turn=firstOut;state.leader=state.turn;return state;
}
