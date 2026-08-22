import { cardLabel, RANK_LABEL } from './cards';
import { resultSummary } from './engine';
import { comboName } from './rules';
import type { Card, Combo, GameEvent, GameState, Rank } from './types';

/** Builds beginner-facing hint copy and makes every red-heart level substitution explicit. */
export function explainHintSelection(cards: Card[], combo: Combo): string {
  const base=`已替你选中一手合法的${comboName(combo)}`;
  const wild=cards.filter(card=>combo.wildIds.includes(card.id));
  if(!wild.length)return`${base}：先看清牌，再决定是否出。`;
  const natural=cards.filter(card=>!combo.wildIds.includes(card.id));
  const sameNaturalRank=natural.length>0&&natural.every(card=>card.rank===natural[0].rank);
  const subject=wild.length===1?cardLabel(wild[0]):`${wild.length} 张${cardLabel(wild[0])}`;
  const substitution=sameNaturalRank?`此处${wild.length===1?'代作':'都代作'} ${RANK_LABEL[natural[0].rank]}`:`在这组${comboName(combo)}里补位`;
  const composition=sameNaturalRank?`，和 ${natural.length} 张 ${RANK_LABEL[natural[0].rank]} 组成${comboName(combo)}`:'';
  return`${base}：${subject} 是当前红桃级牌（逢人配），${substitution}${composition}。先看清替代关系，再决定是否出。`;
}

export function isWildLevelCard(card: Card, level: Rank): boolean {
  return card.suit==='H'&&card.rank===level;
}

export function finishedCoach(state: GameState): string {
  return`本副已结束：${resultSummary(state)}。下面查看牌技分、社交分和下一步建议。`;
}

/** Hides legacy implementation metadata while keeping it available in evidence details. */
export function beginnerEventNote(event: GameEvent): string {
  if(event.type==='deal'&&event.note?.startsWith('seed:'))return'本副牌序已生成';
  return event.note||'该动作已通过规则引擎校验';
}
