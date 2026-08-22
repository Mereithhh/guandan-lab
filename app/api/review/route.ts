import { parseRemoteMatchReview,sanitizePublicMatchReview,type PublicMatchReview } from '@/lib/services/match-review';
import { providerChatCompletionsUrl } from '@/lib/services/compatible-agent';
import { BodyTooLargeError,consumeRateLimit,isSameOrigin,readJsonBody,readResponseText,requestClientKey } from '@/lib/services/http-guard';
import { acquireProviderLease,authorizePaidProvider,cancelProviderLease,chargePaidProvider,recordProviderResult } from '@/lib/services/provider-guard';

export const runtime='nodejs';

export async function POST(request:Request){
  if(process.env.PAID_PROVIDERS_ENABLED!=='1')return Response.json({error:'远程 AI 服务未启用'},{status:503});
  if(!isSameOrigin(request))return Response.json({error:'跨站请求被拒绝'},{status:403});
  const baseUrl=process.env.AI_BASE_URL,apiKey=process.env.AI_API_KEY,model=process.env.AI_MODEL;if(!baseUrl||!apiKey||!model)return Response.json({error:'远程 AI 尚未配置'},{status:503});
  const endpoint=providerChatCompletionsUrl(baseUrl,process.env.AI_ALLOW_PRIVATE_BASE_URL==='1');if(!endpoint)return Response.json({error:'AI Base URL 不符合安全策略'},{status:500});
  let input:{review?:PublicMatchReview};try{input=await readJsonBody(request,250_000)}catch(error){return Response.json({error:error instanceof BodyTooLargeError?'请求过大':'请求格式无效'},{status:error instanceof BodyTooLargeError?413:400})}
  const safeReview=sanitizePublicMatchReview(input?.review);if(!safeReview)return Response.json({error:'公开复盘数据无效'},{status:400});
  const authorization=await authorizePaidProvider(request,'ai');if(authorization.response)return authorization.response;
  if(!consumeRateLimit(requestClientKey(request,`review:${authorization.context!.claims.userId}`,process.env.TRUST_PROXY==='1'),10,60_000))return Response.json({error:'复盘请求过于频繁'},{status:429});
  const capacity=acquireProviderLease('ai');if(capacity.response)return capacity.response;const lease=capacity.lease!;
  const quotaResponse=chargePaidProvider(authorization.context!,'review');if(quotaResponse){cancelProviderLease(lease);return quotaResponse}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(endpoint,{method:'POST',signal:controller.signal,redirect:'error',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:.1,max_tokens:180,messages:[{role:'system',content:'你是竞技掼蛋赛后分类器。输入只含公开出牌事件与不含暗牌的本地统计。禁止猜测隐藏手牌，禁止故意输牌、讨好、奉承、暗号或串通。只输出严格 JSON，不能输出自由文本：{"styleCode":"balanced|observant|partnerFirst|control","adviceCodes":["observeTempo|partnerPriority|bombTiming|leadEfficiency|clearCommunication|memoryReview"]}。adviceCodes 必须选 2 到 4 个且不重复，至少一个牌技代码和一个搭档/节奏代码。'},{role:'user',content:JSON.stringify(safeReview)}]})});
    if(!response.ok){recordProviderResult(lease,false);return Response.json({error:'远程 AI 暂时不可用'},{status:502})}const raw=await readResponseText(response,120_000);
    const data=JSON.parse(raw) as {choices?:Array<{message?:{content?:string}}>},content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim()){recordProviderResult(lease,false);return Response.json({error:'远程 AI 返回为空'},{status:502})}
    const review=parseRemoteMatchReview(content);if(!review){recordProviderResult(lease,false);return Response.json({error:'远程 AI 复盘格式无效'},{status:502})}recordProviderResult(lease,true);return Response.json({review,provider:'compatible'});
  }catch{recordProviderResult(lease,false);return Response.json({error:controller.signal.aborted?'远程 AI 请求超时':'远程 AI 响应无效'},{status:controller.signal.aborted?504:502})}finally{clearTimeout(timer)}
}
