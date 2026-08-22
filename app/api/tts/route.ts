import { elevenLabsModelId, elevenLabsSpeechUrl, elevenLabsVoiceId, normalizeTtsLocale, normalizeTtsSpeaker, normalizeVoiceText, resolveVoiceLocale } from '@/lib/services/tts';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, readJsonBody, readResponseBytes,requestClientKey } from '@/lib/services/http-guard';
import { acquireProviderLease,authorizePaidProvider, cancelProviderLease,chargePaidProvider,recordProviderResult } from '@/lib/services/provider-guard';

export const runtime = 'nodejs';
const audioCache = new Map<string, ArrayBuffer>();
const audioInflight = new Map<string, Promise<ArrayBuffer>>();
export function resetTtsCachesForTests(){audioCache.clear();audioInflight.clear()}
async function audioCacheKey(voiceId:string,model:string,locale:string,text:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${voiceId}\0${model}\0${locale}\0${text}`)));return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')}
const audioResponse=(audio:ArrayBuffer)=>new Response(audio.slice(0),{headers:{'content-type':'audio/mpeg','cache-control':'private, max-age=3600'}});

export async function POST(request: Request) {
  if(process.env.PAID_PROVIDERS_ENABLED!=='1')return Response.json({ error: '付费语音服务未启用', fallback: 'browser' }, { status: 503 });
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  let body: unknown;
  try { body = await readJsonBody(request,4096); } catch(error) { return Response.json({ error: error instanceof BodyTooLargeError?'请求过大':'请求格式无效' }, { status: error instanceof BodyTooLargeError?413:400 }); }
  const text = normalizeVoiceText((body as {text?: unknown})?.text);
  if (!text) return Response.json({ error: '缺少可朗读文本' }, { status: 400 });
  const locale=resolveVoiceLocale(text,normalizeTtsLocale((body as {locale?:unknown}).locale)),speaker=normalizeTtsSpeaker((body as {speaker?:unknown}).speaker);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = elevenLabsVoiceId(process.env,speaker);
  if (!apiKey || !voiceId) return Response.json({ error: 'ElevenLabs 尚未配置', fallback: 'browser' }, { status: 503 });
  const model = elevenLabsModelId(process.env,locale);
  const authorization=await authorizePaidProvider(request,'tts');if(authorization.response)return authorization.response;
  if(!consumeRateLimit(requestClientKey(request,`tts:${authorization.context!.claims.userId}`,process.env.TRUST_PROXY==='1'),30,60_000))return Response.json({error:'语音请求过于频繁',fallback:'browser'},{status:429});
  const cacheKey=await audioCacheKey(voiceId,model,locale,text);
  const cached = audioCache.get(cacheKey);
  if (cached) return audioResponse(cached);
  const existing=audioInflight.get(cacheKey);if(existing){try{return audioResponse(await existing)}catch{return Response.json({error:'语音服务暂时不可用',fallback:'browser'},{status:502})}}
  const capacity=acquireProviderLease('tts');if(capacity.response)return capacity.response;const lease=capacity.lease!;
  const quotaResponse=chargePaidProvider(authorization.context!,'tts',text.length);if(quotaResponse){cancelProviderLease(lease);return quotaResponse}

  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000),requestAudio=(async()=>{const response = await fetch(elevenLabsSpeechUrl(voiceId), {
      method: 'POST', signal:controller.signal,
      redirect: 'error',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, language_code:locale, output_format: 'mp3_44100_128' }),
    });
    const contentType=response.headers.get('content-type')||'';
    if (!response.ok || !contentType.startsWith('audio/')) throw new Error('invalid voice response');
    const bytes=await readResponseBytes(response,3_000_000);if(!bytes.byteLength)throw new Error('invalid voice size');
    return Uint8Array.from(bytes).buffer})();audioInflight.set(cacheKey,requestAudio);
  try { const audio=await requestAudio;
    if(audioCache.size>=20)audioCache.delete(audioCache.keys().next().value!);audioCache.set(cacheKey,audio);
    recordProviderResult(lease,true);
    return audioResponse(audio);
  } catch {
    const timedOut=controller.signal.aborted;
    recordProviderResult(lease,false);
    return Response.json({ error: timedOut?'语音服务请求超时':'语音服务暂时不可用', fallback: 'browser' }, { status: timedOut?504:502 });
  } finally { clearTimeout(timer);if(audioInflight.get(cacheKey)===requestAudio)audioInflight.delete(cacheKey) }
}
