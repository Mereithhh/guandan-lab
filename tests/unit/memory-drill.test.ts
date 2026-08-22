import { describe,expect,it } from 'vitest';
import { createDeck } from '../../lib/game/cards';
import { createCountDrill,parseCountAttempts,parseGridAttempts,serializeCountAttempts,serializeGridAttempts,type CountAttempt } from '../../lib/services/memory-drill';

describe('live-event subtraction drill',()=>{
  it('uses unique real deck IDs and derives the remaining count exactly',()=>{
    const ids=new Set(createDeck().map(card=>card.id));
    for(let round=1;round<=12;round++){
      const drill=createCountDrill(20260822,round),cards=drill.plays.flat(),seen=cards.filter(card=>drill.kind==='jokers'?card.rank>=15:drill.kind==='ace'?card.rank===14:drill.kind==='two'?card.rank===2:card.rank===drill.level).length;
      expect(cards.every(card=>ids.has(card.id))).toBe(true);expect(new Set(cards.map(card=>card.id)).size).toBe(cards.length);expect(seen).toBe(drill.seen);expect(drill.total-drill.seen).toBe(drill.remaining);expect(drill.options).toContain(drill.remaining);
    }
  });

  it('repeats a missed category with a new valid sequence',()=>{
    const first=createCountDrill(7,1,'jokers'),retry=createCountDrill(7,2,'jokers');
    expect(first.kind).toBe('jokers');expect(retry.kind).toBe('jokers');expect(retry.plays.flat().map(card=>card.id)).not.toEqual(first.plays.flat().map(card=>card.id));
  });

  it('trains every legal non-joker level from 2 through A',()=>{
    const levels=new Set(Array.from({length:13},(_,index)=>createCountDrill(0,index+1,'level').level));
    expect([...levels].sort((a,b)=>a-b)).toEqual([2,3,4,5,6,7,8,9,10,11,12,13,14]);
  });

  it('stores only bounded, versioned attempt evidence',()=>{
    const attempt:CountAttempt={round:1,kind:'level',seen:2,remaining:6,answer:6,correct:true};
    expect(parseCountAttempts(serializeCountAttempts([attempt]))).toEqual([attempt]);
    expect(parseCountAttempts('{"schemaVersion":0,"attempts":[]}')).toEqual([]);expect(parseCountAttempts('broken')).toEqual([]);
    expect(parseCountAttempts(JSON.stringify({schemaVersion:1,attempts:[{...attempt,remaining:99},null]}))).toEqual([]);
    expect(parseCountAttempts(JSON.stringify({schemaVersion:1,attempts:[{...attempt,answer:5,correct:true}]}))).toEqual([]);
  });

  it('bounds and validates legacy nine-grid attempt history',()=>{
    const attempts=Array.from({length:60},(_,index)=>({round:index+1,score:index%4}));
    expect(parseGridAttempts(serializeGridAttempts(attempts))).toEqual(attempts.slice(-50));
    expect(parseGridAttempts(JSON.stringify([{round:'oops',score:99},{round:2,score:3}]))).toEqual([{round:2,score:3}]);
    expect(parseGridAttempts(JSON.stringify({schemaVersion:0,attempts:[{round:2,score:3}]}))).toEqual([]);
    expect(parseGridAttempts('broken')).toEqual([]);
  });
});
