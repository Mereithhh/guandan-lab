import { afterEach,describe,expect,it,vi } from 'vitest';
import { acquireProviderLease,cancelProviderLease,recordProviderResult,releaseProviderLease,resetProviderCircuitsForTests } from '../../lib/services/provider-guard';

afterEach(()=>{vi.unstubAllEnvs();resetProviderCircuitsForTests()});

describe('paid-provider circuit and capacity guard',()=>{
  it('admits only one half-open probe and closes after that probe succeeds',async()=>{
    vi.stubEnv('PROVIDER_CIRCUIT_FAILURE_THRESHOLD','1');vi.stubEnv('PROVIDER_CIRCUIT_OPEN_SECONDS','5');
    const first=acquireProviderLease('ai',0).lease!;recordProviderResult(first,false,0);
    expect(acquireProviderLease('ai',4_999).response?.status).toBe(503);
    const probe=acquireProviderLease('ai',5_000).lease!;expect(probe.probe).toBe(true);
    expect(acquireProviderLease('ai',5_000).response?.status).toBe(503);
    recordProviderResult(probe,true,5_000);
    const recovered=acquireProviderLease('ai',5_001).lease!;expect(recovered.probe).toBe(false);releaseProviderLease(recovered);
  });

  it('does not let a stale concurrent success close a newer circuit generation',()=>{
    vi.stubEnv('PROVIDER_CIRCUIT_FAILURE_THRESHOLD','2');vi.stubEnv('PROVIDER_CIRCUIT_OPEN_SECONDS','30');
    const first=acquireProviderLease('ai',0).lease!,second=acquireProviderLease('ai',0).lease!;
    recordProviderResult(first,false,0);recordProviderResult(second,false,0);
    recordProviderResult(first,true,1);
    expect(acquireProviderLease('ai',1).response?.headers.get('retry-after')).toBe('30');
  });

  it('applies the concurrency ceiling across both paid providers',()=>{
    vi.stubEnv('PAID_PROVIDER_MAX_INFLIGHT','1');
    const ai=acquireProviderLease('ai').lease!;
    expect(acquireProviderLease('tts').response?.status).toBe(503);
    releaseProviderLease(ai);
    const tts=acquireProviderLease('tts').lease!;expect(tts.provider).toBe('tts');releaseProviderLease(tts);
  });

  it('lets another half-open probe compete after a preflight cancellation',()=>{
    vi.stubEnv('PROVIDER_CIRCUIT_FAILURE_THRESHOLD','1');vi.stubEnv('PROVIDER_CIRCUIT_OPEN_SECONDS','5');
    const failed=acquireProviderLease('tts',0).lease!;recordProviderResult(failed,false,0);
    const cancelled=acquireProviderLease('tts',5_000).lease!;expect(cancelled.probe).toBe(true);cancelProviderLease(cancelled);
    const replacement=acquireProviderLease('tts',999_999).lease!;expect(replacement.probe).toBe(true);recordProviderResult(replacement,true,999_999);
  });
});
