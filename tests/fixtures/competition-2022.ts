import type { Card, ComboKind, Rank, Seat, Suit } from '../../lib/game/types';

export const COMPETITION_2022_SOURCE = {
  edition: '《竞技掼蛋竞赛规则（试行）》2022 版',
  authority: '国家体育总局棋牌运动管理中心审定，人民体育出版社，ISBN 978-7-5009-6225-0',
  adoption: '国家体育总局棋牌运动管理中心《掼牌（掼蛋）赛事办赛指南（试行）》',
  adoptionUrl: 'https://www.sport.gov.cn/qpzx/n27319064/n27319058/c27429584/content.html',
  sections: {
    ranks: '第一章「定义」：牌、牌点、级牌与配牌（逢人配）',
    combinations: '第一章「定义」：牌型、牌型比较与 A 的顺序边界',
    play: '第五章「牌桌上的规定」：出牌、过牌与一圈结束',
    tribute: '第五章「牌桌上的规定」：进贡、还贡与抗贡',
  },
} as const;

export type RuleSection = keyof typeof COMPETITION_2022_SOURCE.sections;

let nextCardId = 0;
export function card(rank: Rank, suit: Suit = 'S', deck: 0 | 1 = 0): Card {
  return { id: `fixture-${++nextCardId}-${deck}-${suit}-${rank}`, rank, suit, deck };
}

export interface ComboFixture {
  name: string;
  section: RuleSection;
  level: Rank;
  cards: Card[];
  kind: ComboKind | null;
  mainRank?: number;
  wildCount?: number;
}

export const WILD_AND_SEQUENCE_FIXTURES: ComboFixture[] = [
  {
    name: '红桃级牌单出时仍是级牌而非配牌', section: 'ranks', level: 2,
    cards: [card(2, 'H')], kind: 'single', mainRank: 15, wildCount: 0,
  },
  {
    name: '红桃级牌可补成三张', section: 'ranks', level: 2,
    cards: [card(9, 'S'), card(9, 'C'), card(2, 'H')], kind: 'triple', mainRank: 9, wildCount: 1,
  },
  {
    name: '非红桃级牌仍按自然牌点使用', section: 'ranks', level: 2,
    cards: [card(9, 'S'), card(9, 'C'), card(2, 'D')], kind: null,
  },
  {
    name: '逢人配不能代替大小王', section: 'ranks', level: 2,
    cards: [card(15, 'J'), card(2, 'H')], kind: null,
  },
  {
    name: '两张小王构成对子', section: 'ranks', level: 2,
    cards: [card(15, 'J'), card(15, 'J', 1)], kind: 'pair', mainRank: 16,
  },
  {
    name: '两张大王构成对子', section: 'ranks', level: 2,
    cards: [card(16, 'J'), card(16, 'J', 1)], kind: 'pair', mainRank: 17,
  },
  {
    name: '一大王一小王不是对子', section: 'ranks', level: 2,
    cards: [card(15, 'J'), card(16, 'J')], kind: null,
  },
  {
    name: '逢人配按可组成的较大同花顺解释', section: 'combinations', level: 2,
    cards: [card(3, 'H'), card(4, 'H'), card(5, 'H'), card(6, 'H'), card(2, 'H')], kind: 'straightFlush', mainRank: 7, wildCount: 1,
  },
  {
    name: 'A2345 是最小顺子', section: 'combinations', level: 6,
    cards: [card(14), card(2, 'H'), card(3, 'C'), card(4, 'D'), card(5)], kind: 'straight', mainRank: 5,
  },
  {
    name: '10JQKA 是最大顺子', section: 'combinations', level: 6,
    cards: [card(10), card(11, 'H'), card(12, 'C'), card(13, 'D'), card(14)], kind: 'straight', mainRank: 14,
  },
  {
    name: 'JQKA2 不能首尾环接', section: 'combinations', level: 6,
    cards: [card(11), card(12, 'H'), card(13, 'C'), card(14, 'D'), card(2)], kind: null,
  },
  {
    name: 'AA2233 是合法三连对', section: 'combinations', level: 6,
    cards: [card(14), card(14, 'C'), card(2), card(2, 'C'), card(3), card(3, 'C')], kind: 'tube', mainRank: 3,
  },
  {
    name: 'QQKKAA 是合法三连对', section: 'combinations', level: 6,
    cards: [card(12), card(12, 'C'), card(13), card(13, 'C'), card(14), card(14, 'C')], kind: 'tube', mainRank: 14,
  },
  {
    name: 'KKAA22 不能首尾环接', section: 'combinations', level: 6,
    cards: [card(13), card(13, 'C'), card(14), card(14, 'C'), card(2), card(2, 'C')], kind: null,
  },
  {
    name: 'AAA222 是合法钢板', section: 'combinations', level: 6,
    cards: [card(14), card(14, 'C'), card(14, 'D'), card(2), card(2, 'C'), card(2, 'D')], kind: 'plate', mainRank: 2,
  },
  {
    name: 'KKKAAA 是合法钢板', section: 'combinations', level: 6,
    cards: [card(13), card(13, 'C'), card(13, 'D'), card(14), card(14, 'C'), card(14, 'D')], kind: 'plate', mainRank: 14,
  },
];

export interface BeatsFixture {
  name: string;
  section: RuleSection;
  level: Rank;
  lower: Card[];
  higher: Card[];
}

const rankSet = (rank: Rank, count: number): Card[] => {
  const suits: Suit[] = ['S', 'H', 'C', 'D'];
  return Array.from({ length: count }, (_, index) => card(rank, suits[index % 4], index >= 4 ? 1 : 0));
};

const straightFlush = () => [card(10, 'H'), card(11, 'H'), card(12, 'H'), card(13, 'H'), card(14, 'H')];

export const ORDERING_FIXTURES: BeatsFixture[] = [
  {
    name: '级牌单张高于 A', section: 'ranks', level: 2,
    lower: [card(14)], higher: [card(2, 'S')],
  },
  {
    name: '小王高于级牌', section: 'ranks', level: 2,
    lower: [card(2, 'D')], higher: [card(15, 'J')],
  },
  {
    name: '大王高于小王', section: 'ranks', level: 2,
    lower: [card(15, 'J', 1)], higher: [card(16, 'J')],
  },
  {
    name: '一对大王高于一对小王', section: 'ranks', level: 2,
    lower: [card(15, 'J'), card(15, 'J', 1)], higher: [card(16, 'J'), card(16, 'J', 1)],
  },
  {
    name: '四张炸弹高于普通牌型', section: 'combinations', level: 2,
    lower: [card(14), card(14, 'C')], higher: rankSet(3, 4),
  },
  {
    name: '同花顺高于五张炸弹', section: 'combinations', level: 2,
    lower: rankSet(14, 5), higher: straightFlush(),
  },
  {
    name: '六张炸弹高于同花顺', section: 'combinations', level: 2,
    lower: straightFlush(), higher: rankSet(3, 6),
  },
  {
    name: '炸弹先比较张数而非牌点', section: 'combinations', level: 2,
    lower: rankSet(14, 5), higher: rankSet(3, 6),
  },
  {
    name: '同张数炸弹按牌点比较且级牌高于 A', section: 'combinations', level: 2,
    lower: rankSet(14, 4), higher: rankSet(2, 4),
  },
  {
    name: '四王炸高于十张炸弹', section: 'combinations', level: 2,
    lower: [...rankSet(7, 8), card(2, 'H'), card(2, 'H', 1)],
    higher: [card(15, 'J'), card(15, 'J', 1), card(16, 'J'), card(16, 'J', 1)],
  },
];

export const TRIBUTE_FIXTURES: Array<{
  name: string;
  section: RuleSection;
  finishOrder: Seat[];
  seed: number;
  expected: 'tribute' | 'resistance';
}> = [
  { name: '单贡', section: 'tribute', finishOrder: [0, 1, 2, 3], seed: 1, expected: 'tribute' },
  { name: '单贡方持两张大王抗贡', section: 'tribute', finishOrder: [0, 1, 2, 3], seed: 11, expected: 'resistance' },
  { name: '双下双贡', section: 'tribute', finishOrder: [0, 2, 1, 3], seed: 1, expected: 'tribute' },
  { name: '双下两家合计两张大王抗贡', section: 'tribute', finishOrder: [0, 2, 1, 3], seed: 11, expected: 'resistance' },
];
