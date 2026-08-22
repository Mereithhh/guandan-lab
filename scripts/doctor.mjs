#!/usr/bin/env node

import { posix as path } from 'node:path';

const PASS='pass',WARN='warn',FAIL='fail';
const value=(env,key)=>(env[key]||'').trim();
const raw=(env,key)=>env[key]??'';
const enabled=(env,key)=>raw(env,key)==='1';
const placeholder=/(replace[-_ ]?me|change[-_ ]?me|your[-_ ]|example|password|generate|使用密码管理器|至少.*随机)/iu;

function item(id,label,status,message){return{id,label,status,message}}
function url(value){try{return new URL(value)}catch{return null}}
// Keep this denylist aligned with providerChatCompletionsUrl in compatible-agent.ts.
function privateHost(hostname){const host=hostname.toLowerCase().replace(/^\[|\]$/gu,'').replace(/\.$/u,'');return host==='localhost'||host==='::'||host==='::1'||host.endsWith('.local')||/^0\./u.test(host)||/^127\./u.test(host)||/^10\./u.test(host)||/^192\.168\./u.test(host)||/^192\.0\.0\./u.test(host)||/^198\.(18|19)\./u.test(host)||/^169\.254\./u.test(host)||/^172\.(1[6-9]|2\d|3[01])\./u.test(host)||/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u.test(host)||(host.includes(':')&&/^(fc|fd|fe[89ab])/u.test(host))||host.includes('::ffff:')||/^(22[4-9]|2[3-5]\d)\./u.test(host)}
function exampleHost(hostname){const host=hostname.toLowerCase().replace(/\.$/u,'');return ['example.com','example.net','example.org'].some(domain=>host===domain||host.endsWith(`.${domain}`))||['.example','.invalid','.test','.localhost'].some(suffix=>host.endsWith(suffix))}
function complete(env,keys){return keys.every(key=>Boolean(value(env,key)))}
function partial(env,keys){const present=keys.filter(key=>Boolean(value(env,key))).length;return present>0&&present<keys.length}

const EN={
  site_url:['Public URL','SITE_URL uses public HTTPS.','Set SITE_URL to a real public HTTPS URL without embedded credentials.'],session:['Session and cloud saves','The session secret passed length and placeholder checks; verify it came from a random generator.','Generate a random SESSION_SECRET with at least 24 characters.'],database:['SQLite','SQLite is stored in the persistent /data volume.','Set DATABASE_PATH to a file under /data, for example /data/guandan.sqlite.'],google:['Google OAuth','Fields are present but not network-verified; register /api/auth/google/callback.','Leave both Google fields empty, or set a real client ID and secret together.'],online:['Live matching','Server-authoritative four-player matching is enabled.','Matching is disabled, or its session/SQLite dependency is invalid.'],paid:['Paid-provider gate','Paid providers are enabled behind durable safety controls.','Keep the gate off, or configure at least one complete provider group.'],budget:['Paid-provider budget','Durable per-user and deployment-wide daily budgets are configured.','Set valid positive daily unit budgets and bounded circuit/concurrency options.'],ai:['Compatible-model Agent','The model endpoint shape is valid.','Set all three AI fields with a real public HTTPS endpoint, or explicitly allow a trusted private endpoint.'],tts:['ElevenLabs TTS','The voice fields are complete.','Set both ElevenLabs fields to real values, or leave both empty.'],support:['Support QR','The public support-link shape is valid.','Use a real public HTTPS SUPPORT_URL, or leave it empty.']
};
function englishReport(report){return{...report,checks:report.checks.map(check=>{const translated=EN[check.id];if(check.id==='tts'&&check.message.includes('三位牌友'))return{...check,label:translated[0],message:check.status==='pass'?'Chinese/English language following and three distinct player voices are configured.':'Speech works, but the three AI players do not yet have three distinct voices.'};if(translated)return{...check,label:translated[0],message:check.status==='pass'?translated[1]:translated[2]};if(check.id.includes('_enabled')||check.id==='trust_proxy'||check.id==='ai_allow_private_base_url')return{...check,message:`${check.label} must be exactly 0 or 1 with no surrounding spaces.`};return check})}}

export function assessDeployment(env,options={}){
  const checks=[];
  const site=value(env,'SITE_URL'),siteUrl=url(site);
  if(!site)checks.push(item('site_url','公开地址',FAIL,'SITE_URL 未设置。'));
  else if(!siteUrl||!['http:','https:'].includes(siteUrl.protocol)||siteUrl.username||siteUrl.password)checks.push(item('site_url','公开地址',FAIL,'SITE_URL 必须是无内嵌凭据的完整 HTTP(S) URL。'));
  else if(exampleHost(siteUrl.hostname)||privateHost(siteUrl.hostname))checks.push(item('site_url','公开地址',FAIL,'SITE_URL 必须是公网可访问的真实域名。'));
  else if(siteUrl.protocol==='https:')checks.push(item('site_url','公开地址',PASS,'已使用 HTTPS 公开地址。'));
  else checks.push(item('site_url','公开地址',FAIL,'公网 SITE_URL 必须使用 HTTPS。'));

  const secret=value(env,'SESSION_SECRET');
  if(secret.length<24)checks.push(item('session','会话与云存档',FAIL,'SESSION_SECRET 至少需要 24 个字符。'));
  else if(placeholder.test(secret)||new Set(secret).size<10)checks.push(item('session','会话与云存档',FAIL,'SESSION_SECRET 仍像示例或低熵值，请换成随机密钥。'));
  else checks.push(item('session','会话与云存档',PASS,'长度与占位值检查通过；请确认密钥来自随机生成器。'));

  const database=value(env,'DATABASE_PATH');
  if(!database)checks.push(item('database','SQLite',FAIL,'DATABASE_PATH 未设置。'));
  else if(!database.startsWith('/data/')||database.endsWith('/')||path.normalize(database)!==database)checks.push(item('database','SQLite',FAIL,'Docker 生产数据库必须是 /data/ 下的规范文件路径，例如 /data/guandan.sqlite。'));
  else checks.push(item('database','SQLite',PASS,'SQLite 位于持久化的 /data 卷。'));

  for(const key of ['ONLINE_MATCHING_ENABLED','PAID_PROVIDERS_ENABLED','TRUST_PROXY','AI_ALLOW_PRIVATE_BASE_URL'])if(raw(env,key)&&!['0','1'].includes(raw(env,key)))checks.push(item(key.toLowerCase(),key,FAIL,`${key} 必须精确设置为 0 或 1，不能包含空格。`));

  const googleKeys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'];
  if(partial(env,googleKeys))checks.push(item('google','Google OAuth',FAIL,'GOOGLE_CLIENT_ID 与 GOOGLE_CLIENT_SECRET 必须同时设置。'));
  else if(complete(env,googleKeys)&&googleKeys.some(key=>placeholder.test(value(env,key))))checks.push(item('google','Google OAuth',FAIL,'Google OAuth 仍包含示例值。'));
  else if(complete(env,googleKeys)&&siteUrl)checks.push(item('google','Google OAuth',PASS,'字段齐全但未联网验证；请注册 /api/auth/google/callback 回调。'));
  else checks.push(item('google','Google OAuth',WARN,'未启用；游客模式仍可使用。'));

  if(enabled(env,'ONLINE_MATCHING_ENABLED')){
    const coreReady=secret.length>=24&&Boolean(database);
    checks.push(item('online','真人匹配',coreReady?PASS:FAIL,coreReady?'已启用服务端权威四人匹配。':'真人匹配需要有效会话密钥和 SQLite。'));
  }else checks.push(item('online','真人匹配',WARN,'未启用；AI 单机训练仍可使用。'));

  const aiKeys=['AI_BASE_URL','AI_API_KEY','AI_MODEL'],voiceKeys=['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID'],characterVoiceKeys=['ELEVENLABS_VOICE_ID_WANG','ELEVENLABS_VOICE_ID_GU','ELEVENLABS_VOICE_ID_LIN'];
  if(!enabled(env,'PAID_PROVIDERS_ENABLED'))checks.push(item('paid','付费服务总开关',WARN,'未启用；兼容模型与 ElevenLabs 会安全回退到本地 AI 和设备语音。'));
  else{
    if(!complete(env,aiKeys)&&!complete(env,voiceKeys)&&!partial(env,aiKeys)&&!partial(env,voiceKeys))checks.push(item('paid','付费服务总开关',FAIL,'已开启付费服务，但没有配置兼容模型或 ElevenLabs。'));
    else checks.push(item('paid','付费服务总开关',PASS,'已开启，并由持久预算、并发上限和熔断器保护。'));
  }
  const positiveInteger=key=>/^\d+$/u.test(raw(env,key))&&Number.isSafeInteger(Number(raw(env,key)))&&Number(raw(env,key))>0;
  if(enabled(env,'PAID_PROVIDERS_ENABLED')){
    const user=Number(raw(env,'PAID_PROVIDER_USER_DAILY_UNITS')),global=Number(raw(env,'PAID_PROVIDER_GLOBAL_DAILY_UNITS')),required=positiveInteger('PAID_PROVIDER_USER_DAILY_UNITS')&&user<=10000000&&positiveInteger('PAID_PROVIDER_GLOBAL_DAILY_UNITS')&&global<=100000000&&global>=user;
    const optional=[['AI_AGENT_BUDGET_UNITS',1,100000],['AI_REVIEW_BUDGET_UNITS',1,100000],['ELEVENLABS_TTS_BUDGET_UNITS_PER_100_CHARS',1,100000],['PROVIDER_CIRCUIT_FAILURE_THRESHOLD',1,20],['PROVIDER_CIRCUIT_OPEN_SECONDS',5,3600],['PAID_PROVIDER_MAX_INFLIGHT',1,100]];
    const optionalValid=optional.every(([key,min,max])=>!raw(env,key)||(positiveInteger(key)&&Number(raw(env,key))>=min&&Number(raw(env,key))<=max));
    const costs=Number(raw(env,'AI_AGENT_BUDGET_UNITS')||1)<=user&&Number(raw(env,'AI_REVIEW_BUDGET_UNITS')||2)<=user&&Math.ceil(260/100)*Number(raw(env,'ELEVENLABS_TTS_BUDGET_UNITS_PER_100_CHARS')||1)<=user;
    checks.push(item('budget','付费服务预算',required&&optionalValid&&costs?PASS:FAIL,required&&optionalValid&&costs?'已配置持久化的单用户与全站每日预算。':'启用付费服务时，必须设置正整数的单用户/全站日预算；全站不得小于单用户，成本与熔断/并发参数必须在安全范围内。'));
  }else checks.push(item('budget','付费服务预算',WARN,'总开关关闭，不会产生远程 Provider 费用。'));

  if(partial(env,aiKeys))checks.push(item('ai','兼容模型 Agent',FAIL,'AI_BASE_URL、AI_API_KEY 与 AI_MODEL 必须成组设置。'));
  else if(complete(env,aiKeys)){
    const endpoint=url(value(env,'AI_BASE_URL')),allowPrivate=enabled(env,'AI_ALLOW_PRIVATE_BASE_URL');
    if(placeholder.test(value(env,'AI_API_KEY'))||placeholder.test(value(env,'AI_MODEL')))checks.push(item('ai','兼容模型 Agent',FAIL,'兼容模型配置仍包含示例值。'));
    else if(!endpoint||endpoint.username||endpoint.password)checks.push(item('ai','兼容模型 Agent',FAIL,'AI_BASE_URL 格式无效或包含凭据。'));
    else if(exampleHost(endpoint.hostname))checks.push(item('ai','兼容模型 Agent',FAIL,'AI_BASE_URL 仍是示例域名。'));
    else if(endpoint.protocol==='https:'&&!privateHost(endpoint.hostname))checks.push(item('ai','兼容模型 Agent',enabled(env,'PAID_PROVIDERS_ENABLED')?PASS:WARN,'模型端点格式有效；开启付费服务总开关后生效。'));
    else if(allowPrivate&&['http:','https:'].includes(endpoint.protocol)&&privateHost(endpoint.hostname))checks.push(item('ai','兼容模型 Agent',WARN,'允许访问私网模型；仅应在可信局域网使用。'));
    else checks.push(item('ai','兼容模型 Agent',FAIL,'模型端点应为公网 HTTPS；私网 HTTP 需显式允许。'));
  }else checks.push(item('ai','兼容模型 Agent',WARN,'未配置；确定性本地 Agent 仍可使用。'));

  const configuredVoiceKeys=[...voiceKeys,...characterVoiceKeys].filter(key=>value(env,key));
  if(partial(env,voiceKeys))checks.push(item('tts','ElevenLabs TTS',FAIL,'ELEVENLABS_API_KEY 与 ELEVENLABS_VOICE_ID 必须同时设置。'));
  else if(configuredVoiceKeys.some(key=>placeholder.test(value(env,key))))checks.push(item('tts','ElevenLabs TTS',FAIL,'ElevenLabs 配置仍包含示例值。'));
  else if(complete(env,voiceKeys)){
    const fallback=value(env,'ELEVENLABS_VOICE_ID'),characterVoices=characterVoiceKeys.map(key=>value(env,key)||fallback),distinctVoices=new Set(characterVoices).size;
    checks.push(item('tts','ElevenLabs TTS',enabled(env,'PAID_PROVIDERS_ENABLED')&&distinctVoices===3?PASS:WARN,distinctVoices===3?'中英文语言跟随与三位牌友独立音色已配置。':'语音可用，但三位牌友尚未配置三种不同音色。'));
  }
  else checks.push(item('tts','ElevenLabs TTS',WARN,'未配置；字幕和设备语音仍可使用。'));

  const support=value(env,'SUPPORT_URL'),supportUrl=url(support);
  if(!support)checks.push(item('support','打赏二维码',WARN,'未配置；页脚不会显示打赏入口。'));
  else if(!supportUrl||supportUrl.protocol!=='https:'||supportUrl.username||supportUrl.password||exampleHost(supportUrl.hostname)||privateHost(supportUrl.hostname))checks.push(item('support','打赏二维码',FAIL,'SUPPORT_URL 必须是真实、无内嵌凭据的 HTTPS 公开链接。'));
  else checks.push(item('support','打赏二维码',PASS,'公开赞助链接格式有效。'));

  const summary={pass:checks.filter(check=>check.status===PASS).length,warn:checks.filter(check=>check.status===WARN).length,fail:checks.filter(check=>check.status===FAIL).length};
  const report={ready:summary.fail===0,checks,summary};
  return options.locale==='en'?englishReport(report):report;
}

export function formatDeploymentReport(report,locale='zh'){const icon={pass:'✓',warn:'!',fail:'×'};return locale==='en'?['GuanDan Lab · production configuration doctor',...report.checks.map(check=>`${icon[check.status]} ${check.label}: ${check.message}`),`Result: ${report.summary.pass} passed / ${report.summary.warn} warnings / ${report.summary.fail} failed`,report.ready?'Ready to start; review the warnings.':'Not ready for production.'].join('\n'):['GuanDan Lab · 生产配置体检',...report.checks.map(check=>`${icon[check.status]} ${check.label}: ${check.message}`),`结果：${report.summary.pass} 通过 / ${report.summary.warn} 提醒 / ${report.summary.fail} 失败`,report.ready?'可以启动；仍请处理提醒项。':'尚未达到生产启动条件。'].join('\n')}

if(import.meta.url===`file://${process.argv[1]}`){const locale=process.argv.includes('--lang=en')?'en':'zh',report=assessDeployment(process.env,{locale});if(process.argv.includes('--json'))process.stdout.write(`${JSON.stringify(report,null,2)}\n`);else process.stdout.write(`${formatDeploymentReport(report,locale)}\n`);process.exitCode=report.ready?0:1}
