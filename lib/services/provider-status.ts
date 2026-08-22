import { providerChatCompletionsUrl } from './compatible-agent';
import { isProductionSessionSecret } from './session';
import { MAX_TTS_CHARS } from './tts';

export type AgentProvider='local'|'compatible';
export type VoiceProvider='browser'|'elevenlabs';

export function providerStatus(env:Record<string,string|undefined>):{agentProvider:AgentProvider;voiceProvider:VoiceProvider}{
  const integer=(value:string|undefined,minimum:number,maximum:number)=>Boolean(value&&/^\d+$/u.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=minimum&&Number(value)<=maximum);
  const optional=(key:string,minimum:number,maximum:number)=>!env[key]||integer(env[key],minimum,maximum);
  const paid=env.PAID_PROVIDERS_ENABLED==='1',user=Number(env.PAID_PROVIDER_USER_DAILY_UNITS),global=Number(env.PAID_PROVIDER_GLOBAL_DAILY_UNITS);
  const optionsReady=optional('AI_AGENT_BUDGET_UNITS',1,100_000)&&optional('AI_REVIEW_BUDGET_UNITS',1,100_000)&&optional('ELEVENLABS_TTS_BUDGET_UNITS_PER_100_CHARS',1,100_000)&&optional('PROVIDER_CIRCUIT_FAILURE_THRESHOLD',1,20)&&optional('PROVIDER_CIRCUIT_OPEN_SECONDS',5,3600)&&optional('PAID_PROVIDER_MAX_INFLIGHT',1,100);
  const costsReady=Number(env.AI_AGENT_BUDGET_UNITS||1)<=user&&Number(env.AI_REVIEW_BUDGET_UNITS||2)<=user&&Math.ceil(MAX_TTS_CHARS/100)*Number(env.ELEVENLABS_TTS_BUDGET_UNITS_PER_100_CHARS||1)<=user;
  const guardReady=Boolean(isProductionSessionSecret(env.SESSION_SECRET)&&env.DATABASE_PATH&&integer(env.PAID_PROVIDER_USER_DAILY_UNITS,1,10_000_000)&&integer(env.PAID_PROVIDER_GLOBAL_DAILY_UNITS,1,100_000_000)&&global>=user&&optionsReady&&costsReady);
  const agentReady=paid&&guardReady&&Boolean(env.AI_API_KEY&&env.AI_MODEL&&env.AI_BASE_URL&&providerChatCompletionsUrl(env.AI_BASE_URL,env.AI_ALLOW_PRIVATE_BASE_URL==='1'));
  const voiceReady=paid&&guardReady&&Boolean(env.ELEVENLABS_API_KEY&&env.ELEVENLABS_VOICE_ID);
  return {agentProvider:agentReady?'compatible':'local',voiceProvider:voiceReady?'elevenlabs':'browser'};
}
