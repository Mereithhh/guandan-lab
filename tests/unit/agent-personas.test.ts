import { describe,expect,it } from 'vitest';
import { agentPersona,chooseAiMove,explainAgentMove,observe,safeAgentMove,type Observation } from '@/lib/game/ai';
import { newGame } from '@/lib/game/engine';
import { parseCombo } from '@/lib/game/rules';
import type { Card,Seat } from '@/lib/game/types';

const card=(id:string,rank:Card['rank'],suit:Card['suit']='S'):Card=>({id,rank,suit,deck:0});
const hand=[card('three',3),card('four-s',4),card('four-c',4,'C'),card('five-s',5),card('five-h',5,'H'),card('five-c',5,'C')];
function observation(seat:Seat):Observation{return{...observe(newGame(8),seat),seat,turn:seat,persona:agentPersona(seat).id,hand,lastPlay:null,counts:[9,9,9,9]}}

describe('character-specific deterministic agents',()=>{
  it('assigns a stable public style to each table character',()=>{expect(agentPersona(1)).toMatchObject({id:'control',label:'稳健控场'});expect(agentPersona(2)).toMatchObject({id:'partnerFirst',label:'搭档优先'});expect(agentPersona(3)).toMatchObject({id:'tempo',label:'效率突围'})});
  it('makes the three characters choose distinct legal leads from the same hand',()=>{const kinds=([1,2,3] as Seat[]).map(seat=>{const o=observation(seat),move=chooseAiMove(o);expect(move).not.toBeNull();return parseCombo(move!.map(id=>hand.find(item=>item.id===id)!),o.level)?.kind});expect(kinds).toEqual(['pair','single','triplePair'])});
  it('makes Xiaogu yield earlier to a nearly-out partner and explains the real pass reason',()=>{const o=observation(2),lead=card('lead',3),lastPlay={seat:0 as Seat,cardIds:[lead.id],combo:parseCombo([lead],o.level)!},yielding={...o,lastPlay,counts:[4,9,9,9]};expect(chooseAiMove(yielding)).toBeNull();expect(explainAgentMove(yielding,null)).toContain('搭档只剩 4 张、接近出完');const joker=card('big-joker',16,'J'),blocked={...o,lastPlay:{seat:1 as Seat,cardIds:[joker.id],combo:parseCombo([joker],o.level)!}};expect(explainAgentMove(blocked,null)).toContain('没有同型更大的合法牌')});
  it('keeps learner explanations aligned with the learner persona',()=>{const o=observation(0),move=chooseAiMove(o);expect(move).not.toBeNull();expect(explainAgentMove(o,move)).toContain('训练建议')});
  it('uses neutral truthful wording when the decision source cannot prove the persona reason',()=>{const o=observation(3),move=[hand[0].id];expect(explainAgentMove(o,move,false)).toContain('本轮选择合法出 1 张牌');expect(explainAgentMove(o,null,false)).toContain('本轮选择合法过牌')});
  it('falls back to a local legal response when a policy times out',async()=>{const o=observation(3),lead=card('lead-timeout',3),responding={...o,lastPlay:{seat:2 as Seat,cardIds:[lead.id],combo:parseCombo([lead],o.level)!}};const move=await safeAgentMove({name:'slow',choose:async()=>await new Promise<string[]|null>(()=>{})},responding,1);expect(move).not.toBeNull()});
});
