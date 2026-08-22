export type Suit = 'S' | 'H' | 'C' | 'D' | 'J';
export type Rank = 2|3|4|5|6|7|8|9|10|11|12|13|14|15|16;
export type Seat = 0|1|2|3;

export interface Card { id:string; suit:Suit; rank:Rank; deck:0|1 }
export type ComboKind = 'single'|'pair'|'triple'|'triplePair'|'straight'|'tube'|'plate'|'bomb'|'straightFlush'|'jokerBomb';
export interface Combo { kind:ComboKind; size:number; mainRank:number; cards:Card[]; wildIds:string[] }
export interface TrickPlay { seat:Seat; cardIds:string[]; combo:Combo }
export interface GameEvent { id:string; type:'deal'|'play'|'pass'|'trick'|'finish'|'round'; seat?:Seat; cardIds?:string[]; at:number; note?:string }
export interface Player { seat:Seat; name:string; role:'you'|'boss'|'partner'|'opponent'; hand:Card[]; finished?:number }
export interface GameState {
  schemaVersion:2; ruleVersion:'竞技掼蛋2022-教学版'; seed:number; createdAt:number; level:Rank; levelOwner:0|1|null; phase:'playing'|'finished';
  players:Player[]; turn:Seat; leader:Seat; lastPlay:TrickPlay|null; passes:number; finishOrder:Seat[]; events:GameEvent[]; trickNo:number;
  roundNo:number; teamLevels:[Rank,Rank]; matchWinner:0|1|null;
}
export interface StyleMetrics { opportunities:number; presses:number; bombsHeld:number; bombsSpent:number; partnerYields:number; riskyLeads:number; score:number }
