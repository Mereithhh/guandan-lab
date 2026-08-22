import type { GameState } from '@/lib/game/types';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, isSecureRequest, readJsonBody, requestClientKey } from '@/lib/services/http-guard';
import { deleteUserProgress, exportUserProgress, getTrainingProfile, hasOnlinePresence, isSessionActive, listMatchSummaries, listStoredGames, openProgressDatabase, saveCompletedMatch, saveTrainingProfile, TrainingRevisionConflictError, type MatchAnalysisInput } from '@/lib/services/progress-store';
import { expiredSessionCookie, readCookie, SESSION_COOKIE, verifySession } from '@/lib/services/session';
import { parseTrainingProfile } from '@/lib/services/training-profile';

export const runtime = 'edge';

async function context(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) return null;
  const claims = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  if (!claims) return null;
  try {
    const database = await openProgressDatabase();
    return database && isSessionActive(database, claims) ? { claims, database } : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const current = await context(request);
  if (!current) return Response.json({ persistent: false, matches: [] });
  if (new URL(request.url).searchParams.get('export') === '1') {
    return Response.json(exportUserProgress(current.database, current.claims.userId), { headers: { 'content-disposition': 'attachment; filename="guandan-progress.json"', 'cache-control': 'private, no-store' } });
  }
  const includeReplays = new URL(request.url).searchParams.get('replays') === '1';
  return Response.json({ persistent: true, training: getTrainingProfile(current.database, current.claims.userId), matches: listMatchSummaries(current.database, current.claims.userId), replays: includeReplays ? listStoredGames(current.database, current.claims.userId) : undefined }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
  if (!isSameOrigin(request)) return json({ error: '跨站请求被拒绝' }, 403);
  const current = await context(request);
  if (!current) return json({ error: '云端存档未启用' }, 503);
  if (!consumeRateLimit(requestClientKey(request, `training-progress:${current.claims.userId}`, process.env.TRUST_PROXY === '1'), 30, 60_000)) return json({ error: '训练同步过于频繁' }, 429);
  let input: { training?: unknown; baseRevision?: unknown };
  try { input = await readJsonBody(request, 65_536); }
  catch (error) { return json({ error: error instanceof BodyTooLargeError ? '训练档案过大' : '训练档案格式无效' }, error instanceof BodyTooLargeError ? 413 : 400); }
  const training = parseTrainingProfile(input.training), baseRevision = input.baseRevision;
  if (!training || !Number.isSafeInteger(baseRevision) || (baseRevision as number) < 0) return json({ error: '训练档案格式无效' }, 400);
  try {
    const stored = saveTrainingProfile(current.database, current.claims, training, baseRevision as number);
    return json({ training: stored, merged: false });
  } catch (error) {
    if (error instanceof TrainingRevisionConflictError) return json({ error: '训练档案已在其他设备更新', training: error.latest }, 409);
    return json({ error: '训练档案写入失败' }, 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'progress', process.env.TRUST_PROXY === '1'), 60, 60_000)) return Response.json({ error: '存档请求过于频繁' }, { status: 429 });
  const current = await context(request);
  if (!current) return Response.json({ error: '云端存档未启用' }, { status: 503 });
  let input: { game?: GameState; analysis?: MatchAnalysisInput };
  try { input = await readJsonBody(request, 1_000_000); }
  catch (error) { return Response.json({ error: error instanceof BodyTooLargeError ? '牌局记录过大' : '牌局记录格式无效' }, { status: error instanceof BodyTooLargeError ? 413 : 400 }); }
  const { game, analysis } = input;
  const validAnalysis = analysis && Number.isFinite(analysis.score) && analysis.score >= 0 && analysis.score <= 100 && Number.isFinite(analysis.socialScore) && analysis.socialScore >= 0 && analysis.socialScore <= 100 && typeof analysis.title === 'string' && analysis.title.length <= 120 && Array.isArray(analysis.advice) && analysis.advice.length <= 12 && analysis.advice.every(item => typeof item === 'string' && item.length <= 500) && analysis.metrics && typeof analysis.metrics === 'object' && Object.keys(analysis.metrics).length <= 30 && Object.values(analysis.metrics).every(value => Number.isFinite(value));
  if (!game || game.schemaVersion !== 2 || game.phase !== 'finished' || !Number.isSafeInteger(game.seed) || !validAnalysis || game.players?.length !== 4) return Response.json({ error: '只接受完整且有效的训练记录' }, { status: 400 });
  try { return Response.json({ stored: saveCompletedMatch(current.database, current.claims, game, analysis) }); }
  catch { return Response.json({ error: '存档写入失败' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'progress-delete', process.env.TRUST_PROXY === '1'), 5, 60 * 60_000)) return Response.json({ error: '删除请求过于频繁' }, { status: 429 });
  const current = await context(request);
  if (!current) return Response.json({ error: '云端存档未启用' }, { status: 503 });
  if (hasOnlinePresence(current.database, current.claims.userId)) return Response.json({ error: '请先离开匹配或当前真人牌局，再删除资料' }, { status: 409 });
  deleteUserProgress(current.database, current.claims.userId);
  const response = Response.json({ deleted: true });
  response.headers.append('set-cookie', expiredSessionCookie(isSecureRequest(request)));
  return response;
}
