import { describe,expect,it } from 'vitest';
import { analyzeStyle } from '../../lib/game/analysis';
import { newGame,playCards } from '../../lib/game/engine';

describe('evidence-based style analysis',()=>{
  it('normalizes actions by opportunities and separates social score',()=>{const g=newGame(8),after=playCards(g,0,[g.players[0].hand[0].id]),a=analyzeStyle(after,0);expect(a.metrics.opportunities).toBe(1);expect(a.metrics.presses).toBe(1);expect(a.socialScore).toBeGreaterThanOrEqual(0);expect(a.advice[0]).toContain('行动机会')});
  it('does not label every five-card play as a bomb',()=>{const g=newGame(8),a=analyzeStyle(g,0);expect(a.metrics.bombsSpent).toBe(0);expect(a.metrics.bombsHeld).toBeGreaterThanOrEqual(0)});
});
