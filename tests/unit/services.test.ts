import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, parseAgentMove, providerChatCompletionsUrl } from '../../lib/services/compatible-agent';
import { aliyunAudioUrl,aliyunGenerationUrl,aliyunModel,aliyunVoice,elevenLabsModelId, elevenLabsSpeechUrl, elevenLabsVoiceId, MAX_TTS_CHARS, normalizeTtsLocale, normalizeTtsSpeaker, normalizeVoiceText, resolveVoiceLocale, ttsProvider,ttsSpeakerForSeat } from '../../lib/services/tts';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, isSecureRequest, publicRequestOrigin, readJsonBody,readResponseBytes,ResponseTooLargeError } from '../../lib/services/http-guard';
import { providerStatus } from '../../lib/services/provider-status';

describe('service boundaries', () => {
  it('normalizes and bounds TTS text', () => {
    expect(normalizeVoiceText('  王总，  这手漂亮！ ')).toBe('王总， 这手漂亮！');
    expect(normalizeVoiceText('')).toBeNull();
    expect(normalizeVoiceText('牌'.repeat(400))).toHaveLength(MAX_TTS_CHARS);
    expect(elevenLabsSpeechUrl('voice/a')).toContain('voice%2Fa');
    expect(normalizeTtsLocale('en')).toBe('en');
    expect(normalizeTtsLocale('hacked')).toBe('zh');
    expect(resolveVoiceLocale('这手牌打得漂亮 Agent', 'en')).toBe('zh');
    expect(resolveVoiceLocale('Wang takes the lead 王总', 'zh')).toBe('en');
    expect(normalizeTtsSpeaker('lin')).toBe('lin');
    expect(normalizeTtsSpeaker('../voice')).toBe('coach');
    expect([0,1,2,3].map(ttsSpeakerForSeat)).toEqual(['coach','wang','gu','lin']);
    expect(elevenLabsVoiceId({ELEVENLABS_VOICE_ID:'default',ELEVENLABS_VOICE_ID_GU:'gu'},'gu')).toBe('gu');
    expect(elevenLabsVoiceId({ELEVENLABS_VOICE_ID:'default'},'wang')).toBe('default');
    expect(elevenLabsModelId({ELEVENLABS_MODEL_ID_ZH:'zh-model',ELEVENLABS_MODEL_ID:'base'},'zh')).toBe('zh-model');
    expect(elevenLabsModelId({},'en')).toBe('eleven_flash_v2_5');
  });

  it('selects the Aliyun provider only by explicit switch and validates its endpoints', () => {
    expect(ttsProvider({})).toBe('elevenlabs');
    expect(ttsProvider({TTS_PROVIDER:'other',ALIYUN_TTS_API_KEY:'key'})).toBe('elevenlabs');
    expect(ttsProvider({TTS_PROVIDER:'aliyun'})).toBe('aliyun');
    expect([ 'coach','wang','gu','lin' ].map(speaker=>aliyunVoice({},normalizeTtsSpeaker(speaker)))).toEqual(['Cherry','Andre','Ethan','Katerina']);
    expect(aliyunVoice({ALIYUN_TTS_VOICE_GU:' Serena '},'gu')).toBe('Serena');
    expect(aliyunModel({})).toBe('qwen3-tts-flash');
    expect(aliyunModel({ALIYUN_TTS_MODEL:'qwen3-tts-x'})).toBe('qwen3-tts-x');
    const path='/services/aigc/multimodal-generation/generation';
    expect(aliyunGenerationUrl(undefined)).toBe(`https://dashscope.aliyuncs.com/api/v1${path}`);
    expect(aliyunGenerationUrl('https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1//')).toBe(`https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1${path}`);
    for(const invalid of ['http://dashscope.aliyuncs.com/api/v1','https://user:pw@dashscope.aliyuncs.com/api/v1','https://evil.example/api/v1','https://aliyuncs.com.evil.example/api/v1','not a url'])expect(aliyunGenerationUrl(invalid)).toBeNull();
    expect(aliyunAudioUrl('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3?Signature=x')).toBe('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3?Signature=x');
    expect(aliyunAudioUrl('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3')).toBe('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3');
    for(const invalid of ['ftp://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3','https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:8443/a.mp3','https://evil.example/a.mp3','https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.example/a.mp3','https://user@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.mp3','https://dashscope.aliyuncs.com/a.mp3',undefined,42])expect(aliyunAudioUrl(invalid)).toBeNull();
  });

  it('guards same-origin service calls and fixed-window quotas', () => {
    expect(isSameOrigin(new Request('https://game.example/api/tts', { headers: { origin: 'https://game.example' } }))).toBe(true);
    expect(isSameOrigin(new Request('https://game.example/api/tts', { headers: { origin: 'https://evil.example' } }))).toBe(false);
    expect(isSameOrigin(new Request('https://game.example/api/tts'))).toBe(false);
    expect(publicRequestOrigin(new Request('http://127.0.0.1/api'), 'https://game.example')).toBe('https://game.example');
    expect(isSameOrigin(new Request('http://127.0.0.1/api', { headers: { origin: 'https://game.example' } }))).toBe(false);
    expect(isSameOrigin(new Request('http://127.0.0.1/api', { headers: { origin: 'https://game.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'game.example' } }))).toBe(false);
    expect(publicRequestOrigin(new Request('http://127.0.0.1/api', { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'game.example' } }), undefined, true)).toBe('https://game.example');
    expect(isSecureRequest(new Request('https://game.example/api'))).toBe(true);
    expect(consumeRateLimit('test:one', 2, 1000, 10)).toBe(true);
    expect(consumeRateLimit('test:one', 2, 1000, 11)).toBe(true);
    expect(consumeRateLimit('test:one', 2, 1000, 12)).toBe(false);
    expect(consumeRateLimit('test:one', 2, 1000, 1011)).toBe(true);
  });

  it('bounds streamed JSON bodies even without content-length', async () => {
    await expect(readJsonBody<{ok:boolean}>(new Request('https://game.example',{method:'POST',body:'{"ok":true}'}),32)).resolves.toEqual({ok:true});
    await expect(readJsonBody(new Request('https://game.example',{method:'POST',body:'{"text":"too long"}'}),8)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cancels an upstream response as soon as its streamed byte limit is exceeded',async()=>{
    let cancelled=false;const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6))},cancel(){cancelled=true}});
    await expect(readResponseBytes(new Response(stream),10)).rejects.toBeInstanceOf(ResponseTooLargeError);expect(cancelled).toBe(true);
    let declaredCancelled=false;const declared=new ReadableStream<Uint8Array>({cancel(){declaredCancelled=true}});
    await expect(readResponseBytes(new Response(declared,{headers:{'content-length':'100'}}),10)).rejects.toBeInstanceOf(ResponseTooLargeError);expect(declaredCancelled).toBe(true);
  });

  it('accepts only a move from the supplied legal set', () => {
    const legal = [['a'], ['b', 'c']];
    expect(parseAgentMove('{"move":["c","b"]}', legal)).toEqual(['c', 'b']);
    expect(parseAgentMove('```json\n{"move":null}\n```', legal)).toBeNull();
    expect(parseAgentMove('{"move":["hacked"]}', legal)).toBeNull();
    expect(parseAgentMove('{"move":["a","b"]}', [['a|b']])).toBeNull();
    expect(normalizeBaseUrl(' https://example.com/v1/// ')).toBe('https://example.com/v1');
    expect(providerChatCompletionsUrl('https://example.com/v1')).toBe('https://example.com/v1/chat/completions');
    expect(providerChatCompletionsUrl('http://127.0.0.1:11434/v1')).toBeNull();
    expect(providerChatCompletionsUrl('http://127.0.0.1:11434/v1', true)).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(providerChatCompletionsUrl('https://user:pass@example.com/v1')).toBeNull();
    expect(providerChatCompletionsUrl('https://100.64.0.1/v1')).toBeNull();
    expect(providerChatCompletionsUrl('https://[::ffff:127.0.0.1]/v1')).toBeNull();
  });

  it('reports only provider modes that are fully and safely configured',()=>{
    expect(providerStatus({})).toEqual({agentProvider:'local',voiceProvider:'browser'});
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',SESSION_SECRET:'provider-status-secret-long-enough',DATABASE_PATH:'/data/guandan.sqlite',PAID_PROVIDER_USER_DAILY_UNITS:'250',PAID_PROVIDER_GLOBAL_DAILY_UNITS:'5000',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach',ELEVENLABS_API_KEY:'secret',ELEVENLABS_VOICE_ID:'voice'})).toEqual({agentProvider:'compatible',voiceProvider:'elevenlabs'});
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',SESSION_SECRET:'provider-status-secret-long-enough',DATABASE_PATH:'/data/guandan.sqlite',PAID_PROVIDER_USER_DAILY_UNITS:'250',PAID_PROVIDER_GLOBAL_DAILY_UNITS:'5000',PROVIDER_CIRCUIT_OPEN_SECONDS:'1',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach',ELEVENLABS_API_KEY:'secret',ELEVENLABS_VOICE_ID:'voice'})).toEqual({agentProvider:'local',voiceProvider:'browser'});
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',SESSION_SECRET:'provider-status-secret-long-enough',DATABASE_PATH:'/data/guandan.sqlite',PAID_PROVIDER_USER_DAILY_UNITS:'2',PAID_PROVIDER_GLOBAL_DAILY_UNITS:'2',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach',ELEVENLABS_API_KEY:'secret',ELEVENLABS_VOICE_ID:'voice'})).toEqual({agentProvider:'local',voiceProvider:'browser'});
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',SESSION_SECRET:'aaaaaaaaaaaaaaaaaaaaaaaa',DATABASE_PATH:'/data/guandan.sqlite',PAID_PROVIDER_USER_DAILY_UNITS:'250',PAID_PROVIDER_GLOBAL_DAILY_UNITS:'5000',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach'}).agentProvider).toBe('local');
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach'}).agentProvider).toBe('local');
    const guarded={PAID_PROVIDERS_ENABLED:'1',SESSION_SECRET:'provider-status-secret-long-enough',DATABASE_PATH:'/data/guandan.sqlite',PAID_PROVIDER_USER_DAILY_UNITS:'250',PAID_PROVIDER_GLOBAL_DAILY_UNITS:'5000'};
    expect(providerStatus({...guarded,TTS_PROVIDER:'aliyun',ALIYUN_TTS_API_KEY:'secret'}).voiceProvider).toBe('aliyun');
    expect(providerStatus({...guarded,TTS_PROVIDER:'aliyun',ALIYUN_TTS_API_KEY:'secret',ALIYUN_TTS_BASE_URL:'https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1'}).voiceProvider).toBe('aliyun');
    expect(providerStatus({...guarded,TTS_PROVIDER:'aliyun'}).voiceProvider).toBe('browser');
    expect(providerStatus({...guarded,TTS_PROVIDER:'aliyun',ALIYUN_TTS_API_KEY:'secret',ALIYUN_TTS_BASE_URL:'https://evil.example/api/v1'}).voiceProvider).toBe('browser');
    expect(providerStatus({...guarded,TTS_PROVIDER:'aliyun',ELEVENLABS_API_KEY:'secret',ELEVENLABS_VOICE_ID:'voice'}).voiceProvider).toBe('browser');
    expect(providerStatus({...guarded,ALIYUN_TTS_API_KEY:'secret'}).voiceProvider).toBe('browser');
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',TTS_PROVIDER:'aliyun',ALIYUN_TTS_API_KEY:'secret'}).voiceProvider).toBe('browser');
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',AI_BASE_URL:'http://127.0.0.1:11434/v1',AI_API_KEY:'secret',AI_MODEL:'coach'}).agentProvider).toBe('local');
  });
});
