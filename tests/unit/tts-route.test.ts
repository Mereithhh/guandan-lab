import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { POST,resetTtsCachesForTests } from '../../app/api/tts/route';
import { openProgressDatabase,resetProgressDatabaseForTests,upsertSession } from '../../lib/services/progress-store';
import { resetProviderCircuitsForTests } from '../../lib/services/provider-guard';
import { createGuestSession,SESSION_COOKIE } from '../../lib/services/session';

const sessionSecret='provider-test-session-secret-long-enough';let providerCookie='';
function request(text:string,options:{locale?:unknown;speaker?:unknown}={}){return new Request('https://game.example/api/tts',{method:'POST',headers:{origin:'https://game.example','content-type':'application/json',cookie:providerCookie},body:JSON.stringify({text,...options})})}

beforeEach(async()=>{vi.stubEnv('SESSION_SECRET',sessionSecret);vi.stubEnv('DATABASE_PATH',':memory:');vi.stubEnv('PAID_PROVIDER_USER_DAILY_UNITS','1000');vi.stubEnv('PAID_PROVIDER_GLOBAL_DAILY_UNITS','10000');const issued=await createGuestSession(sessionSecret),database=await openProgressDatabase();upsertSession(database!,issued.claims);providerCookie=`${SESSION_COOKIE}=${issued.token}`});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();resetTtsCachesForTests();resetProviderCircuitsForTests();resetProgressDatabaseForTests()});

describe('ElevenLabs TTS route',()=>{
  it('keeps paid speech opt-in and exposes a browser fallback',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','0');
    const response=await POST(request('王总，这手漂亮。'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({fallback:'browser'});
  });

  it('sends normalized Chinese coaching text to ElevenLabs without exposing its key',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice/a');vi.stubEnv('ELEVENLABS_VOICE_ID_WANG','voice/wang');vi.stubEnv('ELEVENLABS_MODEL_ID_ZH','eleven_flash_v2_5');
    const provider=vi.fn<typeof fetch>(async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}}));vi.stubGlobal('fetch',provider);
    const response=await POST(request('  王总，  这手牌权送得很准。 ',{locale:'zh',speaker:'wang'}));
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(provider).toHaveBeenCalledOnce();const [url,init]=provider.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2Fwang');
    expect(init!.redirect).toBe('error');
    expect((init!.headers as Record<string,string>)['xi-api-key']).toBe('server-secret');
    expect(JSON.parse(String(init!.body))).toEqual({text:'王总， 这手牌权送得很准。',model_id:'eleven_flash_v2_5',language_code:'zh',output_format:'mp3_44100_128'});
    expect(String(init!.body)).not.toContain('server-secret');expect([...response.headers.values()].join(' ')).not.toContain('server-secret');
  });

  it('selects an English model and a different voice for Lin',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice/default');vi.stubEnv('ELEVENLABS_VOICE_ID_LIN','voice/lin');vi.stubEnv('ELEVENLABS_MODEL_ID_EN','eleven_flash_v2_5');
    const provider=vi.fn<typeof fetch>(async()=>new Response(new Uint8Array([7,8,9]),{headers:{'content-type':'audio/mpeg'}}));vi.stubGlobal('fetch',provider);
    expect((await POST(request('Lin takes the lead.',{locale:'en',speaker:'lin'}))).status).toBe(200);
    const [url,init]=provider.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2Flin');
    expect(JSON.parse(String(init!.body))).toMatchObject({model_id:'eleven_flash_v2_5',language_code:'en'});
  });

  it('rejects invalid provider responses and preserves browser fallback',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice-b');
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'quota'},{status:429})));
    const response=await POST(request('语音服务异常测试'));
    expect(response.status).toBe(502);const body=await response.text();expect(body).toContain('browser');expect(body).not.toContain('server-secret');expect(body).not.toContain('quota');
  });

  it('rejects cross-origin calls and missing configuration without contacting ElevenLabs',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');const provider=vi.fn<typeof fetch>();vi.stubGlobal('fetch',provider);
    const crossOrigin=new Request('https://game.example/api/tts',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({text:'跨站测试'})});
    expect((await POST(crossOrigin)).status).toBe(403);
    const missing=await POST(request('未配置测试'));
    expect(missing.status).toBe(503);await expect(missing.json()).resolves.toMatchObject({fallback:'browser'});
    expect(provider).not.toHaveBeenCalled();
  });

  it('aborts a slow ElevenLabs request and preserves browser fallback',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice-timeout');vi.useFakeTimers();
    const provider=vi.fn<typeof fetch>(async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(new DOMException('provider detail','AbortError')));
    }));vi.stubGlobal('fetch',provider);
    const pending=POST(request('超时回退测试'));await vi.waitFor(()=>expect(provider).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(5000);const response=await pending;
    expect(response.status).toBe(504);const body=await response.text();expect(body).toContain('browser');expect(body).not.toContain('provider detail');expect(provider.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('falls back when an audio response body is malformed',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice-broken-body');
    const broken=new ReadableStream<Uint8Array>({start(controller){controller.error(new Error('secret upstream body failure'))}});
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async()=>new Response(broken,{headers:{'content-type':'audio/mpeg'}})));
    const response=await POST(request('音频体异常测试'));
    expect(response.status).toBe(502);const body=await response.text();expect(body).toContain('browser');expect(body).not.toContain('secret upstream body failure');
  });

  it('single-flights identical speech and serves authenticated cache hits without extra budget',async()=>{
    vi.stubEnv('PAID_PROVIDERS_ENABLED','1');vi.stubEnv('ELEVENLABS_API_KEY','server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','voice-singleflight');
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),provider=vi.fn<typeof fetch>(async()=>{await gate;return new Response(new Uint8Array([4,5,6]),{headers:{'content-type':'audio/mpeg'}})});vi.stubGlobal('fetch',provider);
    const first=POST(request('并发语音只应计费一次')),second=POST(request('并发语音只应计费一次'));await vi.waitFor(()=>expect(provider).toHaveBeenCalledOnce());release();
    expect((await first).status).toBe(200);expect((await second).status).toBe(200);expect((await POST(request('并发语音只应计费一次'))).status).toBe(200);expect(provider).toHaveBeenCalledOnce();
    const database=await openProgressDatabase(),usage=database!.prepare<{used:number}>('SELECT used FROM usage_quotas WHERE quota_key=?').get('paid_provider_daily');expect(usage?.used).toBe(1);
    const unsigned=new Request('https://game.example/api/tts',{method:'POST',headers:{origin:'https://game.example','content-type':'application/json'},body:JSON.stringify({text:'并发语音只应计费一次'})});
    expect((await POST(unsigned)).status).toBe(401);expect(provider).toHaveBeenCalledOnce();
  });
});
