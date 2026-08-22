import { elevenLabsSpeechUrl, normalizeVoiceText } from '@/lib/services/tts';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, readJsonBody, requestClientKey } from '@/lib/services/http-guard';

export const runtime = 'edge';
const audioCache = new Map<string, ArrayBuffer>();

export async function POST(request: Request) {
  if(process.env.PAID_PROVIDERS_ENABLED!=='1')return Response.json({ error: '付费语音服务未启用', fallback: 'browser' }, { status: 503 });
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'tts',process.env.TRUST_PROXY==='1'), 30, 60_000)) return Response.json({ error: '语音请求过于频繁' }, { status: 429 });
  let body: unknown;
  try { body = await readJsonBody(request,4096); } catch(error) { return Response.json({ error: error instanceof BodyTooLargeError?'请求过大':'请求格式无效' }, { status: error instanceof BodyTooLargeError?413:400 }); }
  const text = normalizeVoiceText((body as {text?: unknown})?.text);
  if (!text) return Response.json({ error: '缺少可朗读文本' }, { status: 400 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return Response.json({ error: 'ElevenLabs 尚未配置', fallback: 'browser' }, { status: 503 });
  const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const cacheKey = `${voiceId}:${model}:${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return new Response(cached.slice(0), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=3600' } });

  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try { const response = await fetch(elevenLabsSpeechUrl(voiceId), {
      method: 'POST', signal:controller.signal,
      redirect: 'error',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, output_format: 'mp3_44100_128' }),
    });
    const contentType=response.headers.get('content-type')||'';
    if (!response.ok || !contentType.startsWith('audio/')) return Response.json({ error: '语音服务暂时不可用', fallback: 'browser' }, { status: 502 });
    const audio=await response.arrayBuffer();
    if(!audio.byteLength||audio.byteLength>3_000_000)return Response.json({ error: '语音响应大小异常', fallback: 'browser' }, { status: 502 });
    if(audioCache.size>=20)audioCache.delete(audioCache.keys().next().value!);audioCache.set(cacheKey,audio);
    return new Response(audio.slice(0), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=3600' } });
  } catch {
    const timedOut=controller.signal.aborted;
    return Response.json({ error: timedOut?'语音服务请求超时':'语音服务暂时不可用', fallback: 'browser' }, { status: timedOut?504:502 });
  } finally { clearTimeout(timer); }
}
