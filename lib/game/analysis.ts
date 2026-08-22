import { createDeck, shuffle } from './cards';
import { parseCombo } from './rules';
import type { GameState, Seat, StyleMetrics } from './types';

export function analyzeStyle(state:GameState,seat:Seat=0):{metrics:StyleMetrics;title:string;advice:string[];socialScore:number}{
  const deck=new Map(createDeck().map(c=>[c.id,c])),plays=state.events.filter(e=>e.type==='play'&&e.seat===seat);
  const parsed=plays.map(e=>parseCombo((e.cardIds||[]).map(id=>deck.get(id)!).filter(Boolean),state.level)).filter(Boolean);
  const bombsSpent=parsed.filter(c=>c&&['bomb','straightFlush','jokerBomb'].includes(c.kind)).length;
  const partner=((seat+2)%4) as Seat;let lastSeat:Seat|null=null,partnerYields=0,riskyLeads=0,opportunities=0,presses=0;
  for(const e of state.events){if((e.type==='play'||e.type==='pass')&&e.seat===seat){opportunities++;if(e.type==='play'){presses++;const cards=(e.cardIds||[]).map(id=>deck.get(id)!).filter(Boolean);if(lastSeat===null&&cards.length===1&&cards[0].rank>=14)riskyLeads++}else if(lastSeat===partner)partnerYields++}if(e.type==='play')lastSeat=e.seat??null;if(e.type==='trick')lastSeat=null}
  const handAtStart=shuffle(createDeck(),state.seed).slice(seat*27,seat*27+27);
  const rankCounts=new Map<number,number>();for(const c of handAtStart)rankCounts.set(c.rank,(rankCounts.get(c.rank)||0)+1);const bombsHeld=[...rankCounts.values()].filter(n=>n>=4).length;
  const pressureRate=opportunities?presses/opportunities:.5,score=Math.max(0,Math.min(100,Math.round(68+pressureRate*18-bombsSpent*3-riskyLeads*6+partnerYields*3)));
  const socialScore=Math.max(0,Math.min(100,Math.round(72+partnerYields*5-riskyLeads*8)));
  const metrics={opportunities,presses,bombsHeld,bombsSpent,partnerYields,riskyLeads,score};
  const title=bombsSpent>=2?'控制权进攻型':partnerYields>=2?'搭档优先型':pressureRate<.4?'稳健观察型':'均衡协作型';
  const advice=[opportunities?`你在 ${opportunities} 次行动机会中选择出牌 ${presses} 次；判断风格时已按机会数归一化。`:'先完成一副牌，系统会按实际机会分析。',bombsSpent?`本副动用 ${bombsSpent} 次炸弹级牌型；把它们留到对手报牌或争夺牌权时通常更值。`:'暂未发现炸弹级牌型的过早消耗。',partnerYields?`你有 ${partnerYields} 次在搭档取得牌权后让路，配合意识不错。`:'搭档出牌后，先看他的剩余张数，再决定是否抢回牌权。','老板局建议来自合法动作和公开信息：不暗示、不喂牌，把牌技分与社交分分开看。'];
  return{metrics,title,advice,socialScore};
}
