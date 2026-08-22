import { describe,expect,it } from 'vitest';
import { beats,parseCombo } from '../../lib/game/rules';
import type { Card,Rank,Suit } from '../../lib/game/types';
const c=(rank:Rank,suit:Suit='S',n=0):Card=>({id:`${suit}-${rank}-${n}-${Math.random()}`,rank,suit,deck:n as 0|1});

describe('combo parser',()=>{
  it.each([
    [[c(3)],'single'],[[c(4),c(4,'H',1)],'pair'],[[c(6),c(6,'C'),c(6,'D')],'triple'],
    [[c(7),c(7,'C'),c(7,'D'),c(9),c(9,'H')],'triplePair'],
    [[c(3,'S'),c(4,'H'),c(5,'C'),c(6,'D'),c(7,'S',1)],'straight'],
    [[c(3,'H'),c(4,'H'),c(5,'H'),c(6,'H'),c(7,'H')],'straightFlush'],
    [[c(3),c(3,'C'),c(4),c(4,'C'),c(5),c(5,'C')],'tube'],
    [[c(8),c(8,'C'),c(8,'D'),c(9),c(9,'C'),c(9,'D')],'plate'],
    [[c(10),c(10,'H'),c(10,'C'),c(10,'D')],'bomb'],
    [[c(15,'J'),c(15,'J',1),c(16,'J'),c(16,'J',1)],'jokerBomb'],
  ])('recognizes %s as %s',(cards,kind)=>expect(parseCombo(cards as Card[],2)?.kind).toBe(kind));
  it('uses the red-heart level card as a wildcard',()=>{expect(parseCombo([c(9),c(9,'C'),c(2,'H')],2)?.kind).toBe('triple')});
  it('rejects invalid mixtures and jokers in a straight',()=>{expect(parseCombo([c(3),c(4),c(6)],2)).toBeNull();expect(parseCombo([c(3),c(4),c(5),c(6),c(15,'J')],2)).toBeNull()});
  it('rejects jokers in consecutive pairs and triples',()=>{expect(parseCombo([c(13),c(13,'C'),c(14),c(14,'C'),c(15,'J'),c(15,'J',1)],2)).toBeNull();expect(parseCombo([c(14),c(14,'C'),c(14,'D'),c(15,'J'),c(15,'J',1),c(15,'J')],2)).toBeNull()});
  it('orders bombs, straight flushes and ordinary combinations',()=>{const pair=parseCombo([c(9),c(9,'C')],2)!;const bomb4=parseCombo([c(3),c(3,'C'),c(3,'D'),c(3,'H')],2)!;const sf=parseCombo([c(3,'H'),c(4,'H'),c(5,'H'),c(6,'H'),c(7,'H')],2)!;const bomb6=parseCombo([c(3),c(3,'C'),c(3,'D'),c(3,'H'),c(2,'H'),c(2,'H',1)],2)!;expect(beats(bomb4,pair)).toBe(true);expect(beats(sf,bomb4)).toBe(true);expect(beats(bomb6,sf)).toBe(true)});
});
