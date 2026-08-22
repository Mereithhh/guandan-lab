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
