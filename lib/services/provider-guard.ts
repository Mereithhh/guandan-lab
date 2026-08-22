import { consumeUsageQuota, isSessionActive, openProgressDatabase, type SqliteDatabase } from './progress-store';
import { isProductionSessionSecret,readCookie, SESSION_COOKIE, verifySession, type SessionClaims } from './session';

export type PaidProvider = 'ai' | 'tts';
export type PaidOperation = 'agent' | 'review' | 'tts';
export interface PaidProviderContext { database: SqliteDatabase; claims: SessionClaims; provider: PaidProvider }
export interface ProviderLease { provider: PaidProvider; generation: number; probe: boolean; released: boolean }
interface CircuitState { failures: number; openUntil: number; generation: number; probe: boolean }
const circuits = new Map<PaidProvider, CircuitState>(), inflight = new Map<PaidProvider, number>();

function integer(value: string | undefined, minimum: number, maximum: number): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function configuredLimits(env: NodeJS.ProcessEnv = process.env) {
  const userLimit = integer(env.PAID_PROVIDER_USER_DAILY_UNITS, 1, 10_000_000), globalLimit = integer(env.PAID_PROVIDER_GLOBAL_DAILY_UNITS, 1, 100_000_000);
  return userLimit && globalLimit && globalLimit >= userLimit ? { userLimit, globalLimit } : null;
}

export function providerOperationCost(operation: PaidOperation, textLength = 0, env: NodeJS.ProcessEnv = process.env): number | null {
  if (operation === 'agent') return integer(env.AI_AGENT_BUDGET_UNITS || '1', 1, 100_000);
  if (operation === 'review') return integer(env.AI_REVIEW_BUDGET_UNITS || '2', 1, 100_000);
  const perHundred = integer(env.ELEVENLABS_TTS_BUDGET_UNITS_PER_100_CHARS || '1', 1, 100_000);
  return perHundred ? Math.max(1, Math.ceil(textLength / 100)) * perHundred : null;
}

function generic(provider: PaidProvider, error: string, status: number, retryAfter?: number): Response {
  return Response.json({ error, ...(provider === 'tts' ? { fallback: 'browser' } : { fallback: 'local' }) }, { status, headers: { 'cache-control': 'private, no-store', ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}) } });
}

export async function authorizePaidProvider(request: Request, provider: PaidProvider): Promise<{ context?: PaidProviderContext; response?: Response }> {
  const secret = process.env.SESSION_SECRET;
  if (!isProductionSessionSecret(secret)) return { response: generic(provider, '付费服务需要签名会话', 503) };
  const claims = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  if (!claims) return { response: generic(provider, '请刷新页面后重试', 401) };
  try {
    const database = await openProgressDatabase();
    if (!database || !isSessionActive(database, claims)) return { response: generic(provider, '请刷新页面后重试', 401) };
    return { context: { database, claims, provider } };
  } catch { return { response: generic(provider, '付费服务的安全存档不可用', 503) }; }
}

export function acquireProviderLease(provider: PaidProvider, now = Date.now(), env: NodeJS.ProcessEnv = process.env): { lease?: ProviderLease; response?: Response } {
  const state = circuits.get(provider) ?? { failures: 0, openUntil: 0, generation: 0, probe: false };
  if (state.openUntil > now) return { response: generic(provider, provider === 'tts' ? '语音服务正在安全降级' : '远程 AI 正在安全降级', 503, Math.max(1, Math.ceil((state.openUntil - now) / 1000))) };
  const halfOpen = state.openUntil > 0;
  if (halfOpen && state.probe) return { response: generic(provider, '付费服务正在恢复探测', 503, 1) };
  const maximum = integer(env.PAID_PROVIDER_MAX_INFLIGHT || '8', 1, 100);
  const total=[...inflight.values()].reduce((sum,value)=>sum+value,0);
  if (!maximum || total >= maximum || (inflight.get(provider) ?? 0) >= maximum) return { response: generic(provider, '付费服务当前繁忙', 503, 1) };
  if (halfOpen) { state.probe = true; state.generation += 1; circuits.set(provider, state); }
  inflight.set(provider, (inflight.get(provider) ?? 0) + 1);
  return { lease: { provider, generation: state.generation, probe: halfOpen, released: false } };
}

export function releaseProviderLease(lease: ProviderLease): void {
  if (lease.released) return;
  lease.released = true;
  inflight.set(lease.provider, Math.max(0, (inflight.get(lease.provider) ?? 1) - 1));
}

/** Releases a lease before an upstream attempt, including a half-open probe. */
export function cancelProviderLease(lease: ProviderLease): void {
  releaseProviderLease(lease);
  if(!lease.probe)return;
  const state=circuits.get(lease.provider);
  if(state&&state.generation===lease.generation&&state.probe)circuits.set(lease.provider,{...state,probe:false});
}

export function recordProviderResult(lease: ProviderLease, success: boolean, now = Date.now(), env: NodeJS.ProcessEnv = process.env): void {
  releaseProviderLease(lease);
  const state = circuits.get(lease.provider) ?? { failures: 0, openUntil: 0, generation: lease.generation, probe: false };
  if (lease.generation !== state.generation) return;
  if (success) { circuits.delete(lease.provider); return; }
  const threshold = integer(env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD || '3', 1, 20), cooldown = integer(env.PROVIDER_CIRCUIT_OPEN_SECONDS || '60', 5, 3600);
  if (!threshold || !cooldown) return;
  const failures = lease.probe ? threshold : state.failures + 1, opened = failures >= threshold;
  circuits.set(lease.provider, { failures, openUntil: opened ? now + cooldown * 1000 : 0, generation: opened ? state.generation + 1 : state.generation, probe: false });
}

export function chargePaidProvider(context: PaidProviderContext, operation: PaidOperation, textLength = 0): Response | null {
  try {
    const limits = configuredLimits(), units = providerOperationCost(operation, textLength);
    if (!limits || !units || units > limits.userLimit) throw new Error('invalid provider limits');
    const quota = consumeUsageQuota(context.database, context.claims, 'paid_provider_daily', units, limits.userLimit, limits.globalLimit);
    if (!quota.allowed) {
      const retry = Math.max(1, Math.ceil((Date.parse(quota.resetAt) - Date.now()) / 1000));
      return generic(context.provider, context.provider === 'tts' ? '今日语音额度已用完' : '今日远程 AI 额度已用完', 429, retry);
    }
    return null;
  } catch { return generic(context.provider, '付费服务预算配置或安全存档不可用', 503); }
}

export function resetProviderCircuitsForTests(): void { circuits.clear();inflight.clear(); }
