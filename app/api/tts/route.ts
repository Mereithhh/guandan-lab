import { aliyunAudioUrl,aliyunGenerationUrl,aliyunModel,aliyunVoice,elevenLabsModelId, elevenLabsSpeechUrl, elevenLabsVoiceId, normalizeTtsLocale, normalizeTtsSpeaker, normalizeVoiceText, resolveVoiceLocale,ttsProvider } from '@/lib/services/tts';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, readJsonBody, readResponseBytes,readResponseText,requestClientKey } from '@/lib/services/http-guard';
import { acquireProviderLease,authorizePaidProvider, cancelProviderLease,chargePaidProvider,recordProviderResult } from '@/lib/services/provider-guard';

export const runtime = 'nodejs';
interface SpeechAudio{bytes:ArrayBuffer;contentType:string}
const audioCache = new Map<string, SpeechAudio>();
const audioInflight = new Map<string, Promise<SpeechAudio>>();
export function resetTtsCachesForTests(){audioCache.clear();audioInflight.clear()}
async function audioCacheKey(provider:string,voiceId:string,model:string,locale:string,text:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${provider}\0${voiceId}\0${model}\0${locale}\0${text}`)));return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')}
const audioResponse=(audio:SpeechAudio)=>new Response(audio.bytes.slice(0),{headers:{'content-type':audio.contentType,'cache-control':'private, max-age=3600'}});
async function readAudio(response:Response):Promise<SpeechAudio>{
  const contentType=response.headers.get('content-type')||'';
  if (!response.ok || !contentType.startsWith('audio/')) throw new Error('invalid voice response');
  const bytes=await readResponseBytes(response,3_000_000);if(!bytes.byteLength)throw new Error('invalid voice size');
  return {bytes:Uint8Array.from(bytes).buffer,contentType};
}

export async function POST(request: Request) {
  if(process.env.PAID_PROVIDERS_ENABLED!=='1')return Response.json({ error: '付费语音服务未启用', fallback: 'browser' }, { status: 503 });
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  let body: unknown;
  try { body = await readJsonBody(request,4096); } catch(error) { return Response.json({ error: error instanceof BodyTooLargeError?'请求过大':'请求格式无效' }, { status: error instanceof BodyTooLargeError?413:400 }); }
  const text = normalizeVoiceText((body as {text?: unknown})?.text);
  if (!text) return Response.json({ error: '缺少可朗读文本' }, { status: 400 });
  const locale=resolveVoiceLocale(text,normalizeTtsLocale((body as {locale?:unknown}).locale)),speaker=normalizeTtsSpeaker((body as {speaker?:unknown}).speaker);

  const provider=ttsProvider(process.env),aliyun=provider==='aliyun';
  const apiKey = aliyun?process.env.ALIYUN_TTS_API_KEY:process.env.ELEVENLABS_API_KEY;
  const voiceId = aliyun?aliyunVoice(process.env,speaker):elevenLabsVoiceId(process.env,speaker);
  const speechUrl = aliyun?aliyunGenerationUrl(process.env.ALIYUN_TTS_BASE_URL):voiceId&&elevenLabsSpeechUrl(voiceId);
  if (!apiKey || !voiceId || !speechUrl) return Response.json({ error: aliyun?'阿里云语音尚未配置':'ElevenLabs 尚未配置', fallback: 'browser' }, { status: 503 });
  const model = aliyun?aliyunModel(process.env):elevenLabsModelId(process.env,locale);
  const authorization=await authorizePaidProvider(request,'tts');if(authorization.response)return authorization.response;
  if(!consumeRateLimit(requestClientKey(request,`tts:${authorization.context!.claims.userId}`,process.env.TRUST_PROXY==='1'),30,60_000))return Response.json({error:'语音请求过于频繁',fallback:'browser'},{status:429});
  const cacheKey=await audioCacheKey(provider,voiceId,model,locale,text);
  const cached = audioCache.get(cacheKey);
  if (cached) return audioResponse(cached);
  const existing=audioInflight.get(cacheKey);if(existing){try{return audioResponse(await existing)}catch{return Response.json({error:'语音服务暂时不可用',fallback:'browser'},{status:502})}}
  const capacity=acquireProviderLease('tts');if(capacity.response)return capacity.response;const lease=capacity.lease!;
  const quotaResponse=chargePaidProvider(authorization.context!,'tts',text.length);if(quotaResponse){cancelProviderLease(lease);return quotaResponse}

  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),aliyun?15000:5000),requestAudio=(async()=>{
    if(!aliyun)return readAudio(await fetch(speechUrl, {
      method: 'POST', signal:controller.signal,
      redirect: 'error',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, language_code:locale, output_format: 'mp3_44100_128' }),
    }));
    const generation=await fetch(speechUrl, {
      method: 'POST', signal:controller.signal,
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: { text, voice: voiceId, language_type: locale==='zh'?'Chinese':'English' }, parameters: { response_format: 'mp3' } }),
    });
    if(!generation.ok)throw new Error('invalid voice response');
    const audioUrl=aliyunAudioUrl((JSON.parse(await readResponseText(generation,100_000)) as {output?:{audio?:{url?:unknown}}})?.output?.audio?.url);
    if(!audioUrl)throw new Error('invalid voice url');
    return readAudio(await fetch(audioUrl,{signal:controller.signal,redirect:'error'}));
  })();audioInflight.set(cacheKey,requestAudio);
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
