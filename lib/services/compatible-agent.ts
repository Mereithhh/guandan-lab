import type { Observation } from '@/lib/game/ai';

export interface CompatibleAgentRequest {
  observation: Observation;
  legalMoves: string[][];
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function providerChatCompletionsUrl(value: string, allowPrivate = false): string | null {
  try {
    const url = new URL(normalizeBaseUrl(value));
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    const privateHost = hostname === 'localhost' || hostname === '::' || hostname === '::1' || hostname.endsWith('.local') ||
      /^0\./.test(hostname) || /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
      /^192\.0\.0\./.test(hostname) || /^198\.(18|19)\./.test(hostname) || /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname) ||
      /^(fc|fd|fe[89ab])/.test(hostname) || hostname.includes('::ffff:') || /^(22[4-9]|2[3-5]\d)\./.test(hostname);
    if (url.username || url.password || (!allowPrivate && privateHost) || (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:'))) return null;
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

export type ParsedAgentDecision={valid:true;move:string[]|null}|{valid:false};

export function parseAgentDecision(content: string, legalMoves: string[][]):ParsedAgentDecision {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {valid:false};
    try { value = JSON.parse(match[0]); } catch { return {valid:false}; }
  }
  const move = (value as {move?: unknown})?.move;
  if (move === null) return {valid:true,move:null};
  if (!Array.isArray(move) || move.some(id => typeof id !== 'string')) return {valid:false};
  const selected = [...move].sort();
  const valid=legalMoves.some(candidate => {
    const legal = [...candidate].sort();
    return legal.length === selected.length && legal.every((id, index) => id === selected[index]);
  });
  return valid?{valid:true,move:move as string[]}:{valid:false};
}

export function parseAgentMove(content: string, legalMoves: string[][]): string[] | null {
  const decision=parseAgentDecision(content,legalMoves);
  return decision.valid?decision.move:null;
}
