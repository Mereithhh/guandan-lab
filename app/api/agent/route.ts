import { parseAgentMove, providerChatCompletionsUrl, type CompatibleAgentRequest } from '@/lib/services/compatible-agent';
import { BodyTooLargeError, consumeRateLimit, isSameOrigin, readJsonBody, requestClientKey } from '@/lib/services/http-guard';

export const runtime = 'edge';

export async function POST(request: Request) {
  if(process.env.PAID_PROVIDERS_ENABLED!=='1')return Response.json({ error: '远程 AI 服务未启用' }, { status: 503 });
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'agent',process.env.TRUST_PROXY==='1'), 40, 60_000)) return Response.json({ error: 'AI 请求过于频繁' }, { status: 429 });
  const baseUrl = process.env.AI_BASE_URL, apiKey = process.env.AI_API_KEY, model = process.env.AI_MODEL;
  if (!baseUrl || !apiKey || !model) return Response.json({ error: '远程 AI 尚未配置' }, { status: 503 });
  const endpoint = providerChatCompletionsUrl(baseUrl, process.env.AI_ALLOW_PRIVATE_BASE_URL === '1');
  if (!endpoint) return Response.json({ error: 'AI Base URL 不符合安全策略' }, { status: 500 });
  let input: CompatibleAgentRequest;
  try { input = await readJsonBody<CompatibleAgentRequest>(request,200_000); } catch(error) { return Response.json({ error: error instanceof BodyTooLargeError?'请求过大':'请求格式无效' }, { status: error instanceof BodyTooLargeError?413:400 }); }
  if (!input?.observation || !Array.isArray(input.legalMoves) || input.legalMoves.length > 500 || input.legalMoves.some(move=>!Array.isArray(move)||move.length>12||move.some(id=>typeof id!=='string'||id.length>40)) || input.observation.events?.length>300) return Response.json({ error: '牌局数据无效' }, { status: 400 });

  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', signal: controller.signal, redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.25, max_tokens: 120,
        messages: [
          { role: 'system', content: '你是遵守竞技掼蛋规则的牌局 Agent。只能从 legalMoves 原样选择一项；需要过牌时返回 null。只输出 JSON：{"move":["card-id"]} 或 {"move":null}。优先配合搭档，避免无谓炸弹。' },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) return Response.json({ error: '远程 AI 暂时不可用' }, { status: 502 });
    const raw=await response.text();
    if(raw.length>100_000)return Response.json({ error: '远程 AI 响应过大' }, { status: 502 });
    const data = JSON.parse(raw) as {choices?: Array<{message?: {content?: string}}>};
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return Response.json({ error: '远程 AI 返回为空' }, { status: 502 });
    return Response.json({ move: parseAgentMove(content, input.legalMoves) });
  } catch {
    const timedOut=controller.signal.aborted;
    return Response.json({ error: timedOut?'远程 AI 请求超时':'远程 AI 响应无效' }, { status: timedOut?504:502 });
  } finally { clearTimeout(timer); }
}
