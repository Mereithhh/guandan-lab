import { providerChatCompletionsUrl } from './compatible-agent';

export type AgentProvider='local'|'compatible';
export type VoiceProvider='browser'|'elevenlabs';

export function providerStatus(env:Record<string,string|undefined>):{agentProvider:AgentProvider;voiceProvider:VoiceProvider}{
  const paid=env.PAID_PROVIDERS_ENABLED==='1';
  const agentReady=paid&&Boolean(env.AI_API_KEY&&env.AI_MODEL&&env.AI_BASE_URL&&providerChatCompletionsUrl(env.AI_BASE_URL,env.AI_ALLOW_PRIVATE_BASE_URL==='1'));
  const voiceReady=paid&&Boolean(env.ELEVENLABS_API_KEY&&env.ELEVENLABS_VOICE_ID);
  return {agentProvider:agentReady?'compatible':'local',voiceProvider:voiceReady?'elevenlabs':'browser'};
}
