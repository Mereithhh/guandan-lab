import { afterEach,describe,expect,it,vi } from 'vitest';
import { POST } from '../../app/api/agent/route';

function request(legalMoves:string[][]=[['card-a']]){
  return new Request('https://game.example/api/agent',{
    method:'POST',
    headers:{origin:'https://game.example','content-type':'application/json'},
    body:JSON.stringify({observation:{events:[]},legalMoves}),
  });
}

function configure(baseUrl='https://models.example/v1'){
  vi.stubEnv('PAID_PROVIDERS_ENABLED','1');
  vi.stubEnv('AI_BASE_URL',baseUrl);
  vi.stubEnv('AI_API_KEY','server-agent-secret');
  vi.stubEnv('AI_MODEL','guandan-coach');
}

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()});

describe('compatible agent route contract',()=>{
  it('uses only a safe chat-completions URL and a server-side bearer credential',async()=>{
    configure('https://models.example/v1/?ignored=yes#fragment');
    const provider=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:'{"move":["card-a"]}'}}]}));
    vi.stubGlobal('fetch',provider);

    const response=await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({move:['card-a']});
    expect(provider).toHaveBeenCalledOnce();
    const [url,init]=provider.mock.calls[0];
    expect(url).toBe('https://models.example/v1/chat/completions');
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string,string>).authorization).toBe('Bearer server-agent-secret');
    expect(String(init?.body)).not.toContain('server-agent-secret');
  });

  it('rejects unsafe provider URLs and cross-origin callers before fetch',async()=>{
    configure('https://127.0.0.1/v1');
    const provider=vi.fn<typeof fetch>();vi.stubGlobal('fetch',provider);
    const unsafe=await POST(request());
    expect(unsafe.status).toBe(500);
    expect(await unsafe.text()).not.toContain('server-agent-secret');
    expect(provider).not.toHaveBeenCalled();

    configure();
    const crossOrigin=new Request('https://game.example/api/agent',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});
    const rejected=await POST(crossOrigin);
    expect(rejected.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });

  it('maps provider non-2xx and malformed responses to generic 502 errors without leaking secrets',async()=>{
    configure();
    const provider=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({error:'server-agent-secret: quota detail'},{status:429}))
      .mockResolvedValueOnce(new Response('not-json',{status:200,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',provider);

    for(let attempt=0;attempt<2;attempt++){
      const response=await POST(request());
      expect(response.status).toBe(502);
      const body=await response.text();
      expect(body).not.toContain('server-agent-secret');
      expect(body).not.toContain('quota detail');
      expect(body).not.toContain('not-json');
    }
  });

  it('returns null instead of accepting a provider move absent from the exact legal set',async()=>{
    configure();
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:'{"move":["a","b"]}'}}]})));
    const response=await POST(request([['a|b']]));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({move:null});
  });

  it('aborts a slow provider and exposes only the timeout contract',async()=>{
    configure();vi.useFakeTimers();
    const provider=vi.fn<typeof fetch>(async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(new DOMException('provider detail','AbortError')));
    }));
    vi.stubGlobal('fetch',provider);
    const pending=POST(request());
    await vi.advanceTimersByTimeAsync(4500);
    const response=await pending;
    expect(response.status).toBe(504);
    const body=await response.text();
    expect(body).toContain('请求超时');
    expect(body).not.toContain('provider detail');
    expect(provider.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('enforces the route body limit before contacting the provider',async()=>{
    configure();const provider=vi.fn<typeof fetch>();vi.stubGlobal('fetch',provider);
    const oversized=new Request('https://game.example/api/agent',{method:'POST',headers:{origin:'https://game.example','content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(200_001)})});
    const response=await POST(oversized);
    expect(response.status).toBe(413);
    expect(provider).not.toHaveBeenCalled();
  });
});
