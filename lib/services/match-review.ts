import { cardLabel,createDeck } from '@/lib/game/cards';
import { resultLabel } from '@/lib/game/engine';
import type { GameState,StyleMetrics } from '@/lib/game/types';

export interface PublicReviewEvent {sequence:number;type:'play'|'pass'|'trick'|'finish'|'round';actor:string|null;cards:string[];note:string|null}
export interface PublicMatchReview {
  schemaVersion:1;ruleVersion:string;level:number;roundNo:number;result:string;finishOrder:string[];
  metrics:Omit<StyleMetrics,'bombsHeld'>;score:number;socialScore:number;localTitle:string;localAdvice:string[];events:PublicReviewEvent[];
}
export interface RemoteMatchReview {title:string;advice:string[]}
type LocalMatchAnalysis={metrics:StyleMetrics;title:string;advice:string[];socialScore:number};
export type MergedMatchAnalysis=LocalMatchAnalysis&{score:number};

/** Builds the only payload allowed to leave the browser: public events and deterministic local metrics, never player hands. */
export function buildPublicMatchReview(state:GameState,local:{metrics:StyleMetrics;score?:number;socialScore:number;title:string;advice:string[]}):PublicMatchReview{
  const deck=new Map(createDeck().map(card=>[card.id,card]));
  const events=state.events.filter(event=>event.type!=='deal').map((event,index):PublicReviewEvent=>({
    sequence:index+1,type:event.type as PublicReviewEvent['type'],actor:event.seat===undefined?null:state.players[event.seat]?.name??null,
    cards:(event.cardIds??[]).map(id=>deck.get(id)).filter(Boolean).map(card=>cardLabel(card!)),note:event.note?.slice(0,120)??null,
  }));
  const {bombsHeld:_hiddenDerived,...publicMetrics}=local.metrics;void _hiddenDerived;
  return{schemaVersion:1,ruleVersion:state.ruleVersion,level:state.level,roundNo:state.roundNo,result:resultLabel(state),finishOrder:state.finishOrder.map(seat=>state.players[seat].name),metrics:publicMetrics,score:local.metrics.score,socialScore:local.socialScore,localTitle:local.title,localAdvice:local.advice.slice(0,6),events};
}

export function validPublicMatchReview(value:unknown):value is PublicMatchReview{
  if(!value||typeof value!=='object')return false;const input=value as Partial<PublicMatchReview>;
  const metrics=input.metrics,metricValues=metrics&&typeof metrics==='object'?[metrics.opportunities,metrics.presses,metrics.bombsSpent,metrics.partnerYields,metrics.riskyLeads,metrics.score]:[];
  return input.schemaVersion===1&&typeof input.ruleVersion==='string'&&input.ruleVersion.length<=80&&Number.isInteger(input.level)&&Number.isInteger(input.roundNo)&&typeof input.result==='string'&&input.result.length<=120&&Array.isArray(input.finishOrder)&&input.finishOrder.length===4&&input.finishOrder.every(name=>typeof name==='string'&&name.length<=40)&&Number.isFinite(input.score)&&input.score!>=0&&input.score!<=100&&Number.isFinite(input.socialScore)&&input.socialScore!>=0&&input.socialScore!<=100&&typeof input.localTitle==='string'&&input.localTitle.length<=120&&Array.isArray(input.localAdvice)&&input.localAdvice.length<=6&&input.localAdvice.every(item=>typeof item==='string'&&item.length<=500)&&metricValues.length===6&&metricValues.every(Number.isFinite)&&Array.isArray(input.events)&&input.events.length<=500&&input.events.every(event=>Number.isInteger(event.sequence)&&['play','pass','trick','finish','round'].includes(event.type)&&(event.actor===null||typeof event.actor==='string'&&event.actor.length<=40)&&Array.isArray(event.cards)&&event.cards.length<=12&&event.cards.every(card=>typeof card==='string'&&card.length<=12)&&(event.note===null||typeof event.note==='string'&&event.note.length<=120));
}

/** Returns a known-field copy so caller-supplied extra keys can never reach a paid provider. */
export function sanitizePublicMatchReview(value:unknown):PublicMatchReview|null{
  if(!validPublicMatchReview(value))return null;const metrics=value.metrics;
  return{schemaVersion:1,ruleVersion:value.ruleVersion,level:value.level,roundNo:value.roundNo,result:value.result,finishOrder:[...value.finishOrder],metrics:{opportunities:metrics.opportunities,presses:metrics.presses,bombsSpent:metrics.bombsSpent,partnerYields:metrics.partnerYields,riskyLeads:metrics.riskyLeads,score:metrics.score},score:value.score,socialScore:value.socialScore,localTitle:value.localTitle,localAdvice:[...value.localAdvice],events:value.events.map(event=>({sequence:event.sequence,type:event.type,actor:event.actor,cards:[...event.cards],note:event.note}))};
}

const styleCatalog={balanced:'均衡协作型',observant:'稳健观察型',partnerFirst:'搭档优先型',control:'牌权控制型'} as const;
const adviceCatalog={observeTempo:'先按公开出牌顺序复盘节奏；看清谁取得牌权后，再决定下一圈是否主动压牌。',partnerPriority:'搭档出牌后先看他的公开剩余张数；搭档接近报牌时，优先让他保持牌权。',bombTiming:'炸弹用于对手公开报牌或关键牌权争夺，避免在普通圈次过早消耗。',leadEfficiency:'取得首出权后，优先整理能连续带走的组合，减少用大单张试探造成的牌权浪费。',clearCommunication:'牌桌表达只确认规则、轮次和公开信息；不约暗号、不暗示手牌，也不为了讨好任何人故意输牌。',memoryReview:'回放时按圈记录已见大牌与炸弹，下一副先练“公开事件减法”，不要猜测未出暗牌。'} as const;
type StyleCode=keyof typeof styleCatalog;type AdviceCode=keyof typeof adviceCatalog;

export function parseRemoteMatchReview(content:string):RemoteMatchReview|null{
  const cleaned=content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();let value:unknown;
  try{value=JSON.parse(cleaned)}catch{const match=cleaned.match(/\{[\s\S]*\}/);if(!match)return null;try{value=JSON.parse(match[0])}catch{return null}}
  const review=value as {styleCode?:unknown;adviceCodes?:unknown};if(typeof review?.styleCode!=='string'||!(review.styleCode in styleCatalog)||!Array.isArray(review.adviceCodes)||review.adviceCodes.length<2||review.adviceCodes.length>4)return null;
  const codes=review.adviceCodes;if(!codes.every((code):code is AdviceCode=>typeof code==='string'&&code in adviceCatalog)||new Set(codes).size!==codes.length)return null;
  return{title:styleCatalog[review.styleCode as StyleCode],advice:codes.map(code=>adviceCatalog[code])};
}

export function validRemoteMatchReview(value:unknown):value is RemoteMatchReview{if(!value||typeof value!=='object')return false;const review=value as Partial<RemoteMatchReview>,titles=Object.values(styleCatalog),advice=Object.values(adviceCatalog);return typeof review.title==='string'&&titles.includes(review.title as typeof titles[number])&&Array.isArray(review.advice)&&review.advice.length>=2&&review.advice.length<=4&&review.advice.every(item=>advice.includes(item as typeof advice[number]))}

/** Keeps deterministic scores and evidence authoritative while replacing only the model-written coaching copy. */
export function mergeRemoteMatchReview(local:LocalMatchAnalysis,remote:RemoteMatchReview|null):MergedMatchAnalysis{
  if(!remote)return{...local,score:local.metrics.score};const ethicsAnchor=local.advice.at(-1);
  return{...local,score:local.metrics.score,title:remote.title,advice:ethicsAnchor?[...remote.advice,ethicsAnchor]:[...remote.advice]};
}

/** Browser boundary: a stalled request becomes a local fallback instead of blocking match persistence forever. */
export async function fetchRemoteMatchReview(review:PublicMatchReview,fetcher:typeof fetch=fetch,timeoutMs=8500,signal?:AbortSignal):Promise<RemoteMatchReview|null>{
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
  try{const response=await fetcher('/api/review',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({review})});if(!response.ok)return null;const data=await response.json() as {review?:unknown};return validRemoteMatchReview(data.review)?{title:data.review.title,advice:[...data.review.advice]}:null}catch{return null}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
