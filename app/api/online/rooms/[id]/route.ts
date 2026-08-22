import { BodyTooLargeError, consumeRateLimit, isSameOrigin, readJsonBody, requestClientKey } from '@/lib/services/http-guard';
import { applyOnlineAction, cancelOnlineRoom, OnlineActionError, projectOnlineRoom } from '@/lib/services/online-store';
import { isSessionActive, openProgressDatabase } from '@/lib/services/progress-store';
import { readCookie, SESSION_COOKIE, verifySession } from '@/lib/services/session';

export const runtime = 'edge';

async function onlineContext(request: Request) {
  if (process.env.ONLINE_MATCHING_ENABLED !== '1') return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const claims = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  if (!claims) return null;
  try { const database = await openProgressDatabase(); return database && isSessionActive(database, claims) ? { claims, database } : null; }
  catch { return null; }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  const { id } = await context.params;
  const room = id.length <= 80 ? projectOnlineRoom(current.database, id, current.claims.userId) : null;
  return room ? Response.json(room, { headers: { 'cache-control': 'private, no-store' } }) : Response.json({ error: '房间不存在或无权访问' }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'online-action', process.env.TRUST_PROXY === '1'), 120, 60_000)) return Response.json({ error: '牌局操作过于频繁' }, { status: 429 });
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  let input: { actionId: string; expectedVersion: number; type: 'play'|'pass'; cardIds?: string[] };
  try { input = await readJsonBody(request, 20_000); }
  catch (error) { return Response.json({ error: error instanceof BodyTooLargeError ? '操作数据过大' : '操作格式无效' }, { status: error instanceof BodyTooLargeError ? 413 : 400 }); }
  const { id } = await context.params;
  if (id.length > 80) return Response.json({ error: '房间标识无效' }, { status: 400 });
  try { return Response.json(applyOnlineAction(current.database, id, current.claims, input)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: error instanceof OnlineActionError ? error.status : 500 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'online-cancel', process.env.TRUST_PROXY === '1'), 4, 60 * 60_000)) return Response.json({ error: '取消牌局过于频繁，请稍后再试' }, { status: 429 });
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  const { id } = await context.params;
  if (id.length > 80) return Response.json({ error: '房间标识无效' }, { status: 400 });
  try { cancelOnlineRoom(current.database, id, current.claims.userId); return Response.json({ cancelled: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : '取消失败' }, { status: error instanceof OnlineActionError ? error.status : 500 }); }
}
