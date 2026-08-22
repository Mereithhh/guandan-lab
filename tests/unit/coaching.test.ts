import { describe,expect,it } from 'vitest';
import { beginnerEventNote,explainHintSelection,finishedCoach,isWildLevelCard } from '../../lib/game/coaching';
import { newGame,resultSummary } from '../../lib/game/engine';
import { parseCombo } from '../../lib/game/rules';
import type { Card,GameState,Rank,Suit } from '../../lib/game/types';

const card=(id:string,rank:Rank,suit:Suit,deck:0|1=0):Card=>({id,rank,suit,deck});
const finished=(order:GameState['finishOrder'],matchWinner:0|1|null=null):GameState=>{const game=newGame(8);return{...game,phase:'finished',finishOrder:order,matchWinner,players:game.players.map(player=>({...player,finished:order.indexOf(player.seat)+1}))}};

describe('beginner coaching explanations',()=>{
  it('explains the exact red-heart level substitution in a hinted bomb',()=>{
    const cards=[card('s4',4,'S'),card('h4',4,'H'),card('c4',4,'C'),card('wild',2,'H')],combo=parseCombo(cards,2)!;
    expect(combo.kind).toBe('bomb');expect(combo.wildIds).toEqual(['wild']);
    expect(explainHintSelection(cards,combo)).toBe('已替你选中一手合法的4张炸弹：♥2 是当前红桃级牌（逢人配），此处代作 4，和 3 张 4 组成4张炸弹。先看清替代关系，再决定是否出。');
    expect(isWildLevelCard(cards[3],2)).toBe(true);expect(isWildLevelCard(cards[1],2)).toBe(false);
  });

  it('keeps ordinary hints concise',()=>{const cards=[card('s9',9,'S'),card('h9',9,'H')],combo=parseCombo(cards,2)!;expect(explainHintSelection(cards,combo)).toBe('已替你选中一手合法的对子：先看清牌，再决定是否出。')});

  it('names the winning team, upgrade owner, and learner outcome',()=>{
    expect(resultSummary(finished([0,2,1,3]))).toBe('你 / 小顾队 · 双上 · 升 3 级 · 你方升级');
    expect(resultSummary(finished([3,0,2,1]))).toBe('王总 / 林姐队 · 头游末游 · 升 1 级 · 你方本副未升级');
    expect(resultSummary(finished([1,0,3,2],1))).toBe('王总 / 林姐队 · 过 A · 你方本场告负');
    expect(finishedCoach(finished([0,2,1,3]))).toContain('你 / 小顾队 · 双上');
  });

  it('keeps the reproducible seed out of beginner-facing deal copy',()=>{const game=newGame(7);expect(game.events[0].note).toBe('本副牌序已生成 · 林姐首出');expect(game.events[0].note).not.toContain('seed');expect(beginnerEventNote({...game.events[0],note:'seed:7;首出:3'})).toBe('本副牌序已生成');expect(beginnerEventNote({...game.events[0],type:'pass',note:undefined})).toBe('该动作已通过规则引擎校验')});
});
