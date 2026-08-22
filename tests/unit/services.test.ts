import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, parseAgentMove, providerChatCompletionsUrl } from '../../lib/services/compatible-agent';
import { elevenLabsSpeechUrl, MAX_TTS_CHARS, normalizeVoiceText } from '../../lib/services/tts';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, isSecureRequest, publicRequestOrigin, readJsonBody } from '../../lib/services/http-guard';
import { providerStatus } from '../../lib/services/provider-status';

describe('service boundaries', () => {
  it('normalizes and bounds TTS text', () => {
    expect(normalizeVoiceText('  陈总，  这手漂亮！ ')).toBe('陈总， 这手漂亮！');
    expect(normalizeVoiceText('')).toBeNull();
    expect(normalizeVoiceText('牌'.repeat(400))).toHaveLength(MAX_TTS_CHARS);
    expect(elevenLabsSpeechUrl('voice/a')).toContain('voice%2Fa');
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
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',AI_BASE_URL:'https://models.example/v1',AI_API_KEY:'secret',AI_MODEL:'coach',ELEVENLABS_API_KEY:'secret',ELEVENLABS_VOICE_ID:'voice'})).toEqual({agentProvider:'compatible',voiceProvider:'elevenlabs'});
    expect(providerStatus({PAID_PROVIDERS_ENABLED:'1',AI_BASE_URL:'http://127.0.0.1:11434/v1',AI_API_KEY:'secret',AI_MODEL:'coach'}).agentProvider).toBe('local');
  });
});
