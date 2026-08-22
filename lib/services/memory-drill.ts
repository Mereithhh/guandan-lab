import { RANK_LABEL,createDeck,shuffle } from '../game/cards';
import type { Card,Rank } from '../game/types';

export type CountKind='jokers'|'ace'|'two'|'level';
export interface CountDrill{kind:CountKind;level:Rank;label:string;total:number;seen:number;remaining:number;plays:Card[][];options:number[]}
export interface CountAttempt{round:number;kind:CountKind;seen:number;remaining:number;answer:number;correct:boolean}
export interface GridAttempt{round:number;score:number}

const KINDS:CountKind[]=['jokers','ace','two','level'];
const LEVELS:Rank[]=[2,3,4,5,6,7,8,9,10,11,12,13,14];
const isKind=(value:unknown):value is CountKind=>typeof value==='string'&&KINDS.includes(value as CountKind);

export function createCountDrill(seed:number,round:number,focus?:CountKind):CountDrill{
  const level=LEVELS[Math.abs(seed+round)%LEVELS.length],kind=focus??KINDS[Math.abs(seed+round)%KINDS.length],rank=kind==='ace'?14:kind==='two'?2:kind==='level'?level:null;
  const matches=(card:Card)=>kind==='jokers'?card.rank>=15:card.rank===rank,total=kind==='jokers'?4:8,label=kind==='jokers'?'王':kind==='ace'?'A':kind==='two'?'2':`级牌 ${RANK_LABEL[level]}`;
  const deck=createDeck(),targets=shuffle(deck.filter(matches),seed+round*31),decoys=shuffle(deck.filter(card=>!matches(card)),seed^round*101),seen=1+Math.abs(seed*7+round*3)%Math.min(4,total),publicCards=shuffle([...targets.slice(0,seen),...decoys.slice(0,7)],seed+round*211),plays=[publicCards.slice(0,3),publicCards.slice(3,6),publicCards.slice(6)],remaining=total-seen;
  const options=shuffle([...new Set([Math.max(0,remaining-1),remaining,Math.min(total,remaining+1)])],seed+round*503);
  return {kind,level,label,total,seen,remaining,plays,options};
}

export function parseCountAttempts(raw:string|null):CountAttempt[]{
  if(!raw)return [];
  try{const value=JSON.parse(raw) as {schemaVersion?:unknown;attempts?:unknown};if(value.schemaVersion!==1||!Array.isArray(value.attempts))return [];return value.attempts.filter((item):item is CountAttempt=>{if(!item||typeof item!=='object')return false;const attempt=item as Partial<CountAttempt>,{round,kind,seen,remaining,answer,correct}=attempt;if(!isKind(kind)||typeof round!=='number'||typeof seen!=='number'||typeof remaining!=='number'||typeof answer!=='number'||typeof correct!=='boolean')return false;const total=kind==='jokers'?4:8;return Number.isInteger(round)&&round>=1&&round<=1_000_000&&Number.isInteger(seen)&&seen>=0&&seen<=total&&Number.isInteger(remaining)&&remaining>=0&&remaining<=total&&seen+remaining===total&&Number.isInteger(answer)&&answer>=0&&answer<=total&&correct===(answer===remaining)}).slice(-50)}catch{return []}
}

export function serializeCountAttempts(attempts:CountAttempt[]):string{return JSON.stringify({schemaVersion:1,attempts:attempts.slice(-50)})}

export function parseGridAttempts(raw:string|null):GridAttempt[]{
  if(!raw)return [];
  try{const value=JSON.parse(raw) as unknown,attempts=Array.isArray(value)?value:value&&typeof value==='object'&&(value as {schemaVersion?:unknown}).schemaVersion===1?(value as {attempts?:unknown}).attempts:null;if(!Array.isArray(attempts))return [];return attempts.filter((item):item is GridAttempt=>{if(!item||typeof item!=='object')return false;const {round,score}=item as Partial<GridAttempt>;return typeof round==='number'&&Number.isInteger(round)&&round>=1&&round<=1_000_000&&typeof score==='number'&&Number.isInteger(score)&&score>=0&&score<=3}).slice(-50)}catch{return []}
}

export function serializeGridAttempts(attempts:GridAttempt[]):string{return JSON.stringify({schemaVersion:1,attempts:attempts.slice(-50)})}
