import { afterEach,describe,expect,it,vi } from 'vitest';
import { claimGoogleAccount,consumeUsageQuota,deleteUserProgress,openProgressDatabase,resetProgressDatabaseForTests,upsertSession } from '../../lib/services/progress-store';
import { createGuestSession } from '../../lib/services/session';

const secret='usage-quota-test-secret-long-enough';
afterEach(()=>{resetProgressDatabaseForTests();vi.unstubAllEnvs()});

describe('durable paid-provider quotas',()=>{
  it('atomically enforces per-user and deployment-wide UTC-day limits',async()=>{
    vi.stubEnv('DATABASE_PATH',':memory:');const database=await openProgressDatabase(),a=await createGuestSession(secret),b=await createGuestSession(secret);upsertSession(database!,a.claims);upsertSession(database!,b.claims);
    const now=new Date('2026-08-22T12:00:00.000Z');
    expect(consumeUsageQuota(database!,a.claims,'ai_daily',2,3,4,now)).toMatchObject({allowed:true,userUsed:2,globalUsed:2});
    expect(consumeUsageQuota(database!,a.claims,'ai_daily',2,3,4,now)).toMatchObject({allowed:false,userUsed:2,globalUsed:2});
    expect(consumeUsageQuota(database!,b.claims,'ai_daily',2,3,4,now)).toMatchObject({allowed:true,userUsed:2,globalUsed:4});
    expect(consumeUsageQuota(database!,b.claims,'ai_daily',1,3,4,now)).toMatchObject({allowed:false,userUsed:2,globalUsed:4});
    deleteUserProgress(database!,a.claims.userId);
    expect(database!.prepare<{used:number}>('SELECT used FROM global_usage_quotas WHERE quota_key=?').get('ai_daily')?.used).toBe(4);
  });

  it('revalidates the session in the same write transaction',async()=>{
    vi.stubEnv('DATABASE_PATH',':memory:');const database=await openProgressDatabase(),issued=await createGuestSession(secret);upsertSession(database!,issued.claims);deleteUserProgress(database!,issued.claims.userId);
    expect(()=>consumeUsageQuota(database!,issued.claims,'tts_daily',10,100,1000,new Date('2026-08-22T12:00:00.000Z'))).toThrow(/no longer active/u);
  });

  it('moves guest usage into a claimed Google identity without changing the global ledger',async()=>{
    vi.stubEnv('DATABASE_PATH',':memory:');const database=await openProgressDatabase(),guest=await createGuestSession(secret);upsertSession(database!,guest.claims);const now=new Date('2026-08-22T12:00:00.000Z');consumeUsageQuota(database!,guest.claims,'paid_provider_daily',2,10,100,now);
    const account=claimGoogleAccount(database!,guest.claims.userId,{subject:'google-budget-subject',email:'budget@example.com',displayName:'Budget User'});
    expect(database!.prepare<{used:number}>('SELECT used FROM usage_quotas WHERE user_id=? AND quota_key=?').get(account.userId,'paid_provider_daily')?.used).toBe(2);
    expect(database!.prepare<{used:number}>('SELECT used FROM global_usage_quotas WHERE quota_key=?').get('paid_provider_daily')?.used).toBe(2);
  });
});
