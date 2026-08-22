import { describe,expect,it } from 'vitest';
import { ENDGAME_PUZZLES,isLegalPuzzleAction,parsePuzzleProgress,puzzleActionLabel,serializePuzzleProgress } from '@/lib/game/endgame-puzzles';
import { createDeck } from '@/lib/game/cards';
import { legalPlay,passTurn } from '@/lib/game/engine';
import type { GameState,Seat } from '@/lib/game/types';

function stateFor(puzzle:typeof ENDGAME_PUZZLES[number]):GameState{
  const used=new Set([...puzzle.learnerHand,...(puzzle.lastPlay?.cards??[])].map(card=>card.id)),available=createDeck().filter(card=>!used.has(card.id));let cursor=0;
  const names=['你','王总','小顾','林姐'],roles=['you','boss','partner','opponent'] as const;
  const players=names.map((name,seat)=>({seat:seat as Seat,name,role:roles[seat],hand:seat===0?puzzle.learnerHand:available.slice(cursor,cursor+=puzzle.remaining[seat])}));
  return{schemaVersion:2,ruleVersion:'竞技掼蛋2022-教学版',seed:puzzle.seed,createdAt:0,level:puzzle.level,levelOwner:null,phase:'playing',players,turn:0,leader:puzzle.leader,lastPlay:puzzle.lastPlay?{seat:puzzle.lastPlay.seat,cardIds:puzzle.lastPlay.cards.map(card=>card.id),combo:puzzle.lastPlay.combo}:null,passes:puzzle.publicPasses,finishOrder:[],events:[],trickNo:1,roundNo:1,teamLevels:[puzzle.level,puzzle.level],matchWinner:null};
}

describe('deterministic endgame puzzles',()=>{
  it('ships five unique, reproducible 5–7 card fixtures',()=>{
    expect(ENDGAME_PUZZLES).toHaveLength(5);
    expect(new Set(ENDGAME_PUZZLES.map(puzzle=>puzzle.id)).size).toBe(5);
    expect(new Set(ENDGAME_PUZZLES.map(puzzle=>puzzle.seed)).size).toBe(5);
    for(const puzzle of ENDGAME_PUZZLES){
      expect(puzzle.learnerHand.length).toBeGreaterThanOrEqual(5);
      expect(puzzle.learnerHand.length).toBeLessThanOrEqual(7);
      expect(puzzle.remaining[0]).toBe(puzzle.learnerHand.length);
      expect(new Set([...puzzle.learnerHand,...(puzzle.lastPlay?.cards??[])].map(card=>card.id)).size).toBe(puzzle.learnerHand.length+(puzzle.lastPlay?.cards.length??0));
      expect(puzzle.publicPasses).toBeGreaterThanOrEqual(0);
      expect(puzzle.publicPasses).toBeLessThanOrEqual(2);
      expect(puzzle.options).toHaveLength(3);
      expect(puzzle.best).toBeGreaterThanOrEqual(0);
      expect(puzzle.best).toBeLessThan(puzzle.options.length);
      for(const value of [puzzle.title,puzzle.scene,puzzle.prompt,puzzle.rule,puzzle.social])expect(value.zh&&value.en).toBeTruthy();
      for(const option of puzzle.options)expect(option.explanation.zh&&option.explanation.en).toBeTruthy();
      expect(isLegalPuzzleAction(puzzle,puzzle.options[puzzle.best].action)).toBe(true);
      const state=stateFor(puzzle);
      for(const option of puzzle.options){
        expect(isLegalPuzzleAction(puzzle,option.action)).toBe(true);
        if(option.action.kind==='pass')expect(()=>passTurn(state,0)).not.toThrow();
        else expect(legalPlay(state,0,option.action.cardIds)).toEqual({ok:true});
      }
    }
  });

  it('contains two partnership decisions where passing is best',()=>{
    const passWins=ENDGAME_PUZZLES.filter(puzzle=>puzzle.options[puzzle.best].action.kind==='pass');
    expect(passWins).toHaveLength(2);
    expect(passWins.every(puzzle=>puzzle.lastPlay?.seat===2)).toBe(true);
  });

  it('replays the public pass count through the production turn engine',()=>{
    const partnerCases=ENDGAME_PUZZLES.filter(puzzle=>puzzle.options[puzzle.best].action.kind==='pass');
    for(const puzzle of partnerCases){const next=passTurn(stateFor(puzzle),0);expect(next.turn).toBe(1);expect(next.lastPlay?.seat).toBe(2);expect(next.passes).toBe(2)}
    const final=ENDGAME_PUZZLES.at(-1)!;const reset=passTurn(stateFor(final),0);expect(reset.turn).toBe(1);expect(reset.leader).toBe(1);expect(reset.lastPlay).toBeNull();expect(reset.trickNo).toBe(2);
  });

  it('does not expose opponent hands and labels only learner cards',()=>{
    for(const puzzle of ENDGAME_PUZZLES){
      expect(Object.keys(puzzle)).not.toContain('opponentHands');
      for(const option of puzzle.options){
        const label=puzzleActionLabel(puzzle,option,'zh');
        expect(label.length).toBeGreaterThan(0);
        if(option.action.kind==='play')expect(option.action.cardIds.every(id=>puzzle.learnerHand.some(card=>card.id===id))).toBe(true);
      }
    }
  });

  it('round-trips versioned puzzle progress and rejects corrupt state',()=>{
    const progress={index:2,score:1,tried:[1,0],answer:0};
    expect(parsePuzzleProgress(serializePuzzleProgress(progress))).toEqual({schemaVersion:1,...progress});
    expect(parsePuzzleProgress('{bad')).toBeNull();
    expect(parsePuzzleProgress(JSON.stringify({schemaVersion:1,index:99,score:1,tried:[],answer:null}))).toBeNull();
  });
});
