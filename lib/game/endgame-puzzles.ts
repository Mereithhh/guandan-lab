import { cardLabel, createDeck, RANK_LABEL } from './cards';
import { beats, parseCombo } from './rules';
import type { Card, Combo, Rank, Seat } from './types';

export type PuzzleLocale='zh'|'en';
export type PuzzleText={zh:string;en:string};
export type PuzzleAction={kind:'pass'}|{kind:'play';cardIds:string[]};
export interface PuzzleProgress {schemaVersion:1;index:number;score:number;tried:number[];answer:number|null}
export interface EndgamePuzzleOption { action:PuzzleAction; explanation:PuzzleText }
export interface EndgamePuzzle {
  id:string;seed:number;title:PuzzleText;scene:PuzzleText;prompt:PuzzleText;level:Rank;leader:Seat;
  remaining:[number,number,number,number];publicPasses:number;learnerHand:Card[];lastPlay:{seat:Seat;cards:Card[];combo:Combo}|null;
  options:EndgamePuzzleOption[];best:number;rule:PuzzleText;social:PuzzleText;
}

const deck=new Map(createDeck().map(card=>[card.id,card]));
const cards=(...ids:string[])=>ids.map(id=>{const card=deck.get(id);if(!card)throw new Error(`Unknown puzzle card: ${id}`);return card});
const text=(zh:string,en:string):PuzzleText=>({zh,en});
const play=(cardIds:string[],zh:string,en:string):EndgamePuzzleOption=>({action:{kind:'play',cardIds},explanation:text(zh,en)});
const pass=(zh:string,en:string):EndgamePuzzleOption=>({action:{kind:'pass'},explanation:text(zh,en)});
const last=(seat:Seat,level:Rank,...ids:string[])=>{const hand=cards(...ids),combo=parseCombo(hand,level);if(!combo)throw new Error('Invalid puzzle last play');return{seat,cards:hand,combo}};

/** Five deterministic, public-information-only bridges between the course and a 108-card deal. */
export const ENDGAME_PUZZLES:EndgamePuzzle[]=[
  {id:'protect-partner-pair',seed:2026082201,title:text('搭档报单，先别抢','Partner has one card — do not steal control'),scene:text('小顾只剩 1 张。他刚出一对 8，林姐已过牌；现在轮到你。','Gu has one card left and just played a pair of eights. Lin passed; it is your turn.'),prompt:text('哪手既不盖住搭档当前的对子，又保留你全部硬牌？','Which choice avoids covering your partner’s pair and keeps all your strong cards?'),level:2,leader:2,remaining:[6,2,1,3],publicPasses:1,learnerHand:cards('0-S-9','0-H-9','0-S-5','0-H-5','0-C-5','0-D-5'),lastPlay:last(2,2,'0-S-8','1-H-8'),options:[pass('符合目标：不主动盖住搭档的对子，同时保留对子 9 和炸弹。','Matches the stated goal: do not cover the pair, and keep both your nines and bomb.'),play(['0-S-9','0-H-9'],'规则合法，但会主动盖住搭档的对子。','Rules-legal, but it covers your partner’s pair.'),play(['0-S-5','0-H-5','0-C-5','0-D-5'],'规则合法，但既盖住搭档，又交掉炸弹。','Rules-legal, but it both covers your partner and spends the bomb.')],best:0,rule:text('对子 9、四张炸弹和过牌都合法。本题只判断题面明确写出的“让牌权并保留硬牌”目标，不预测陈总暗牌。','The nines, the bomb and passing are all legal. This puzzle scores only the stated goal—yield and preserve strength—without predicting Chen’s hidden card.'),social:text('基于小顾公开的 1 张余牌选择让路，是一种可解释的合作建议，不保证对手随后一定过牌。','Yielding based on Gu’s public one-card count is an explainable teamwork recommendation, not a guarantee that the opponent will pass next.')},
  {id:'pair-before-bomb',seed:2026082202,title:text('够用就好，别先交炸','Use only the strength you need'),scene:text('陈总出了一对 Q，小顾还剩 2 张。你手里既有一对 A，也有四张 5。','Chen played a pair of queens. Gu has two cards left; you hold aces and four fives.'),prompt:text('如果要拿到牌权，哪手使用的牌力最低？','If you want control, which winning play spends the least strength?'),level:2,leader:1,remaining:[6,4,2,3],publicPasses:0,learnerHand:cards('0-S-14','0-H-14','0-S-5','0-H-5','0-C-5','0-D-5'),lastPlay:last(1,2,'0-S-12','1-H-12'),options:[play(['0-S-14','0-H-14'],'正确：同型更大的 AA 已经够用，四张 5 可以留作保险。','Correct: the higher pair of aces is enough, so the four fives remain insurance.'),play(['0-S-5','0-H-5','0-C-5','0-D-5'],'合法但代价过高：普通对子用更大对子就能解决。','Legal, but too expensive: a higher ordinary pair already solves the problem.'),pass('合法，但没有完成题面“拿到牌权”的目标。','Legal, but it does not achieve the stated goal of taking control.')],best:0,rule:text('普通对子只能由更大的对子或炸弹压制；AA 大于 QQ。','An ordinary pair is beaten by a higher pair or a bomb; aces beat queens.'),social:text('压陈总的牌不等于不给面子。动作干净、解释具体，比故意放水更尊重牌局。','Beating Chen is not disrespectful. Clean, honest play is better table manners than deliberately losing.')},
  {id:'shed-the-straight',seed:2026082203,title:text('领出先练一次减五张','Practise shedding five cards at once'),scene:text('新一圈由你领出。你有一条 3—7 顺子和一对 A，共 7 张。','You lead a new trick with a 3–7 straight and a pair of aces: seven cards total.'),prompt:text('如果目标是这一手走掉最多张，应该出什么？','If the goal is to shed the most cards in this play, what should you lead?'),level:2,leader:0,remaining:[7,5,4,6],publicPasses:0,learnerHand:cards('0-S-3','0-H-4','0-C-5','0-D-6','0-S-7','0-S-14','1-H-14'),lastPlay:null,options:[play(['0-S-3','0-H-4','0-C-5','0-D-6','0-S-7'],'符合目标：合法顺子一次走 5 张。','Matches the goal: the legal straight sheds five cards at once.'),play(['0-S-14','1-H-14'],'对子 A 合法，但这一手只走 2 张；这不代表实战中它必然更差。','The aces are legal but shed only two cards now; that does not make them universally worse in real play.'),play(['0-S-3'],'单张 3 合法，但这一手只走 1 张。','The single three is legal but sheds only one card now.')],best:0,rule:text('领出时三种选择都合法；本题只比较这一手的张数，不把未知对手牌包装成确定胜负。','All three leads are legal. This puzzle compares only cards shed now and does not turn unknown opponent cards into a certain outcome.'),social:text('轮到自己领出时先说清训练目标，再果断行动；不要边出边透露后续牌。','State the training objective, act promptly, and do not reveal what you plan to keep.')},
  {id:'protect-partner-ace',seed:2026082204,title:text('搭档报单，别主动盖 A','Partner has one card — do not cover the ace'),scene:text('小顾只剩 1 张，刚出 A，林姐已过牌；现在轮到你，陈总尚未行动。','Gu has one card left and played an ace. Lin passed; it is your turn, and Chen has not acted yet.'),prompt:text('哪手既不盖住搭档当前的 A，又保留你的级牌和大王？','Which choice avoids covering your partner’s ace and keeps both your level card and big joker?'),level:7,leader:2,remaining:[6,2,1,3],publicPasses:1,learnerHand:cards('0-H-7','0-J-16','0-S-4','0-H-4','0-C-9','0-D-9'),lastPlay:last(2,7,'0-S-14'),options:[pass('符合目标：不盖住 A，同时保留级牌和大王。','Matches the goal: do not cover the ace, and keep both the level card and big joker.'),play(['0-H-7'],'规则合法，但会盖住搭档的 A 并用掉级牌。','Rules-legal, but it covers your partner’s ace and spends the level card.'),play(['0-J-16'],'规则合法，但会盖住搭档的 A 并用掉大王。','Rules-legal, but it covers your partner’s ace and spends the big joker.')],best:0,rule:text('级牌的单张点数高于 A、低于小王和大王。本题按明确的“让牌权并保留两张硬牌”目标评分，不预测陈总是否能压。','The level card ranks above ace and below the jokers. This puzzle scores the explicit goal of yielding and keeping both strong cards, without predicting Chen’s response.'),social:text('不主动抢搭档牌权是可讨论的合作建议，不是暗号，也不是对手一定过牌的保证。','Not stealing control is a discussable teamwork recommendation, not a signal or a guarantee that the opponent will pass.')},
  {id:'level-over-ace',seed:2026082205,title:text('级牌压 A，王留后手','Use the level card; keep the joker'),scene:text('当前打 7。陈总出单张 A，小顾和林姐都已过牌，现在轮到你。','Sevens are level. Chen played a single ace; Gu and Lin passed, and it is your turn.'),prompt:text('如果要拿牌权，哪张是刚好够大的单牌？','If you want control, which single is just large enough?'),level:7,leader:1,remaining:[6,3,2,2],publicPasses:2,learnerHand:cards('0-S-7','0-J-16','0-S-4','0-H-4','0-C-9','0-D-9'),lastPlay:last(1,7,'1-S-14'),options:[play(['0-S-7'],'正确：任意花色的级牌作单张都大于 A，已经足够。','Correct: any level seven played as a single beats an ace, so this is enough.'),play(['0-J-16'],'合法但过度：大王能赢，却不是“刚好够大”。','Legal, but excessive: the big joker wins and is not the smallest winning single.'),pass('合法，但没有完成题面“拿到牌权”的目标。','Legal, but it does not achieve the stated goal of taking control.')],best:0,rule:text('当前级牌作单张时高于 A；只有小王、大王更大。红桃级牌的“逢人配”只在多张组合里生效。','The current level card beats an ace as a single; only the jokers are higher. The heart level card is wild only inside multi-card combinations.'),social:text('用刚好够大的牌回应陈总，既认真竞技，也给后续配合留余地。','Using exactly enough strength against Chen shows honest competition and preserves options for later teamwork.')},
];

export function puzzleActionLabel(puzzle:EndgamePuzzle,option:EndgamePuzzleOption,locale:PuzzleLocale){
  if(option.action.kind==='pass')return locale==='zh'?'过牌':'Pass';
  const selected=option.action.cardIds.map(id=>puzzle.learnerHand.find(card=>card.id===id)).filter(Boolean) as Card[];
  return `${locale==='zh'?'出':'Play'} ${selected.map(cardLabel).join(' ')}`;
}

export function isLegalPuzzleAction(puzzle:EndgamePuzzle,action:PuzzleAction){
  if(action.kind==='pass')return Boolean(puzzle.lastPlay);
  const unique=[...new Set(action.cardIds)],selected=unique.map(id=>puzzle.learnerHand.find(card=>card.id===id)).filter(Boolean) as Card[];
  if(!unique.length||selected.length!==unique.length)return false;
  const combo=parseCombo(selected,puzzle.level);return Boolean(combo&&beats(combo,puzzle.lastPlay?.combo??null));
}

export function puzzleSummary(puzzle:EndgamePuzzle,locale:PuzzleLocale){
  const names=locale==='zh'?['你','陈总','小顾','林姐']:['You','Chen','Gu','Lin'];
  return `${locale==='zh'?'打':'Level'} ${RANK_LABEL[puzzle.level]} · ${locale==='zh'?'领出':'Leader'} ${names[puzzle.leader]} · ${names.map((name,index)=>`${name} ${puzzle.remaining[index]}`).join(' / ')}`;
}

export function parsePuzzleProgress(raw:string|null):PuzzleProgress|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Partial<PuzzleProgress>,index=value.index,score=value.score,answer=value.answer;
    if(value.schemaVersion!==1||typeof index!=='number'||!Number.isInteger(index)||index<0||index>=ENDGAME_PUZZLES.length||typeof score!=='number'||!Number.isInteger(score)||score<0||score>ENDGAME_PUZZLES.length||!Array.isArray(value.tried))return null;
    const tried=[...new Set(value.tried)];if(tried.some(choice=>!Number.isInteger(choice)||choice<0||choice>=ENDGAME_PUZZLES[index].options.length))return null;
    if(answer!==null&&(typeof answer!=='number'||!Number.isInteger(answer)||!tried.includes(answer)))return null;
    return{schemaVersion:1,index,score,tried,answer:answer??null};
  }catch{return null}
}

export function serializePuzzleProgress(progress:Omit<PuzzleProgress,'schemaVersion'>){return JSON.stringify({schemaVersion:1,...progress})}
