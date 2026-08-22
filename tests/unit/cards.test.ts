import { describe,expect,it } from 'vitest';
import { createDeck, shuffle } from '../../lib/game/cards';

describe('double deck',()=>{
  it('contains 108 uniquely identified cards',()=>{const d=createDeck();expect(d).toHaveLength(108);expect(new Set(d.map(c=>c.id)).size).toBe(108);expect(d.filter(c=>c.rank===16)).toHaveLength(2)});
  it('shuffles deterministically without losing a card',()=>{const a=shuffle(createDeck(),42),b=shuffle(createDeck(),42);expect(a.map(c=>c.id)).toEqual(b.map(c=>c.id));expect(new Set(a.map(c=>c.id)).size).toBe(108)});
});
