export const MAX_TTS_CHARS = 260;
export type TtsLocale = 'zh' | 'en';
export type TtsSpeaker = 'coach' | 'wang' | 'gu' | 'lin';

const speakerVoiceKeys: Record<TtsSpeaker, string> = {
  coach: 'ELEVENLABS_VOICE_ID_COACH',
  wang: 'ELEVENLABS_VOICE_ID_WANG',
  gu: 'ELEVENLABS_VOICE_ID_GU',
  lin: 'ELEVENLABS_VOICE_ID_LIN',
};

export function normalizeVoiceText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, MAX_TTS_CHARS);
}

export function elevenLabsSpeechUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
}

export function normalizeTtsLocale(value: unknown): TtsLocale {
  return value === 'en' ? 'en' : 'zh';
}

export function resolveVoiceLocale(text: string, requested: TtsLocale): TtsLocale {
  const han=(text.match(/[\p{Script=Han}]/gu)||[]).length,
    latin=(text.match(/[A-Za-z]/gu)||[]).length;
  return han===latin?requested:han>latin?'zh':'en';
}

export function normalizeTtsSpeaker(value: unknown): TtsSpeaker {
  return value === 'wang' || value === 'gu' || value === 'lin' ? value : 'coach';
}

export function ttsSpeakerForSeat(seat: number): TtsSpeaker {
  return seat === 1 ? 'wang' : seat === 2 ? 'gu' : seat === 3 ? 'lin' : 'coach';
}

export function elevenLabsVoiceId(
  env: Record<string, string | undefined>,
  speaker: TtsSpeaker,
): string | null {
  return env[speakerVoiceKeys[speaker]]?.trim() || env.ELEVENLABS_VOICE_ID?.trim() || null;
}

export function elevenLabsModelId(
  env: Record<string, string | undefined>,
  locale: TtsLocale,
): string {
  const localized = locale === 'zh' ? env.ELEVENLABS_MODEL_ID_ZH : env.ELEVENLABS_MODEL_ID_EN;
  return localized?.trim() || env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_flash_v2_5';
}

export type TtsProvider = 'elevenlabs' | 'aliyun';

const aliyunSpeakerVoices: Record<TtsSpeaker, { key: string; fallback: string }> = {
  coach: { key: 'ALIYUN_TTS_VOICE_COACH', fallback: 'Cherry' },
  wang: { key: 'ALIYUN_TTS_VOICE_WANG', fallback: 'Andre' },
  gu: { key: 'ALIYUN_TTS_VOICE_GU', fallback: 'Ethan' },
  lin: { key: 'ALIYUN_TTS_VOICE_LIN', fallback: 'Katerina' },
};
const ALIYUN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const ALIYUN_AUDIO_HOST = /^dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/;

export function ttsProvider(env: Record<string, string | undefined>): TtsProvider {
  return env.TTS_PROVIDER === 'aliyun' ? 'aliyun' : 'elevenlabs';
}

export function aliyunVoice(env: Record<string, string | undefined>, speaker: TtsSpeaker): string {
  const { key, fallback } = aliyunSpeakerVoices[speaker];
  return env[key]?.trim() || fallback;
}

export function aliyunModel(env: Record<string, string | undefined>): string {
  return env.ALIYUN_TTS_MODEL?.trim() || 'qwen3-tts-flash';
}

export function aliyunGenerationUrl(baseUrl: string | undefined): string | null {
  let url: URL;
  try { url = new URL(baseUrl?.trim() || ALIYUN_DEFAULT_BASE_URL); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.aliyuncs.com')) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/services/aigc/multimodal-generation/generation`;
}

/** DashScope returns signed OSS links over plain http; only allowlisted hosts pass, and they are always fetched over https. */
export function aliyunAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !ALIYUN_AUDIO_HOST.test(url.hostname)) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch { return null; }
}
