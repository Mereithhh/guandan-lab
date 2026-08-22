export const MAX_TTS_CHARS = 260;

export function normalizeVoiceText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, MAX_TTS_CHARS);
}

export function elevenLabsSpeechUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
}
