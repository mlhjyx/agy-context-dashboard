// Production widget and sidecar panel in illustrative host fixtures. No account data is read.
// Stage for review: node tools/render-readme-assets.mjs --output=.data/readme-review
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
import {compositionMetrics,tokenBaseMetrics,hostContextMetrics,attachHostContextUsage,attachTokenBase} from '../sidecars/panel/composition.mjs';
import {panelAppSource,panelPageSource} from '../sidecars/panel/panel-source.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const createTheme=createRequire(import.meta.url)('../compat/theme.cjs');
const version=JSON.parse(await readFile(join(repo,'plugin.json'),'utf8')).version;
const output=resolve(repo,process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'docs/assets');
const light=!process.argv.includes('--theme=dark');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs','usage-ui.cjs'].map(f=>readFile(join(repo,'compat',f),'utf8')));
const extract=s=>{assert.ok(s.includes('module.exports = '));return s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');};
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});window.__agPulseUsageFactory=(${extract(sources[3])});(${extract(sources[2])})();`;
const panelStyles=await readFile(join(repo,'sidecars/panel/styles.css'),'utf8');
const panelThemeCss=createTheme().css(':root');
const panelAppJs=panelAppSource();
const ids={main:'11111111-1111-1111-1111-111111111111',subagent:'22222222-2222-2222-2222-222222222222'};
const now=Date.now(),files=[],diagnostics=[],errors=[];
const today='2026-10-11',models=['Gemini 4 Hydrogen','Claude Sonnet','GPT 6.1 Sol'];
const days=Array.from({length:120},(_,i)=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-119+i);return {date:d.toISOString().slice(0,10),models:Object.fromEntries(models.map((m,j)=>{const n=(i*17+j*3)%11*1200;return [m,{uncached:n,cacheRead:n*2,cacheWrite:0,output:n,total:n*4,requests:n?1:0}];}))};});
const total=ds=>ds.reduce((n,d)=>n+Object.values(d.models).reduce((sum,r)=>sum+r.total,0),0);
const usage={accountKey:'illustrative',today,timeZone:'Asia/Shanghai',models,days,todayTokens:total(days.slice(-1)),weekTokens:total(days.slice(-7)),monthTokens:total(days.filter(d=>d.date.startsWith('2026-10'))),totalTokens:total(days),requests:days.reduce((n,d)=>n+Object.values(d.models).reduce((s,r)=>s+r.requests,0),0),firstDate:days[0].date,syncing:false,unknownRequests:0,partialRequests:0,unreadableFiles:0};
const reset=ms=>new Date(now+ms).toISOString();
const illustrativeHostUsage=hostContextMetrics({
  contextWindowUsage:{
    estimatedTokensUsed:112000,maxContextTokens:256000,
    tokenGroups:[
      {name:'System Prompt',type:'TOKEN_TYPE_SYSTEM_PROMPT',numTokens:5200},
      {name:'Mcp Tools',type:'TOKEN_TYPE_MCP_TOOLS',numTokens:1800},
      {name:'Subagents',type:'TOKEN_TYPE_SUBAGENTS',numTokens:2400},
      {name:'Skills',type:'TOKEN_TYPE_SKILLS',numTokens:6400},
      {name:'Plugins',type:'TOKEN_TYPE_PLUGINS',numTokens:1200},
      {name:'Rules',type:'TOKEN_TYPE_RULES',numTokens:5800},
      {name:'Tools',type:'TOKEN_TYPE_TOOLS',numTokens:14200},
      {name:'Chat Messages',type:'TOKEN_TYPE_CHAT_MESSAGES',numTokens:75000},
    ],
  },
});
const illustrativeTokenBase=tokenBaseMetrics({
  customizationTokenBase:{
    totalTokens:14000,
    groups:[
      {name:'Rules',type:'TOKEN_TYPE_RULES',numTokens:5800,children:[{name:'AGENTS.md',numTokens:2600},{name:'team-resident.md',numTokens:3200}]},
      {name:'Skills',type:'TOKEN_TYPE_SKILLS',numTokens:6400,children:[{name:'tabbit',numTokens:2200},{name:'team-review-governance',numTokens:4200}]},
      {name:'Mcp Tools',type:'TOKEN_TYPE_MCP_TOOLS',numTokens:1800,children:[{name:'codegraph',numTokens:1100},{name:'openviking',numTokens:700}]},
    ],
  },
  customizationBudget:20000,remainingBudget:6000,rulesBudget:20000,remainingRulesBudget:14200,
});
function sample(scope){
 const sub=scope==='subagent';
 const steps=[];
 for(let i=0;i<(sub?2:5);i++){
  steps.push({type:'USER_INPUT'});
  steps.push({type:'READ_FILE',metadata:{startedAt:new Date(now-60000+i*10000).toISOString(),completedAt:new Date(now-60000+i*10000+(sub?1000:1600)).toISOString()}});
  steps.push({type:'ASSISTANT_RESPONSE'});
  if(!sub&&i===2)steps.push({type:'CORTEX_STEP_TYPE_COMPACTION',metadata:{}});
 }
 const reqInputs=[{u:12225,c:46000},{u:16225,c:82000},{u:26225,c:128000},{u:18225,c:100000},{u:21350,c:132000}];
 const generators=Array.from({length:sub?2:5},(_,i)=>({
  stepIndices:[i*3+2+(i>2&&!sub?1:0)],
  chatModel:{
   modelDisplayName:sub?'Claude Sonnet':'Gemini 4 Hydrogen',streamingDuration:sub?'4s':'10s',timeToFirstToken:sub?'0.4s':'0.6s',
   chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:sub?24000:92000+i*5000,maxContextTokens:sub?200000:256000}},
   usage:{inputTokens:sub?3200:reqInputs[i].u,cacheReadTokens:sub?9600:reqInputs[i].c,responseOutputTokens:sub?640:1046,thinkingOutputTokens:sub?0:(i===4?405:406),outputTokens:sub?640:(i===4?1451:1452),apiProvider:sub?'API_PROVIDER_ANTHROPIC':'API_PROVIDER_GOOGLE_GEMINI'},
  },
 }));
 const speed=trajectoryMetrics({trajectory:{cascadeId:ids[scope],steps,generatorMetadata:generators}});
 if(!sub){
  speed.transcriptStats={version:1,status:'ready',complete:true,userTokens:2800,assistantTokens:5400,toolTokens:32000,systemTokens:1800,totalTokens:42000,matchedSteps:steps.length,compactionMarkers:1,imageSteps:0};
  let comp=compositionMetrics({context:speed.context,steps,generators,transcript:speed.transcriptStats});
  comp=attachTokenBase(comp,illustrativeTokenBase);
  comp=attachHostContextUsage(comp,illustrativeHostUsage);
  speed.contextComposition=comp;
  speed.estimatedCost={totalUsd:0.42,hasPriced:true,complete:true,estimated:true};
 }
 return {connection:'live',usage,serverTime:new Date(now).toISOString(),quotaUpdatedAt:new Date(now).toISOString(),speed,groups:[
  {id:'gemini',name:'Gemini',windows:{'5h':{available:true,remaining:.834,resetAt:reset(9978000)},weekly:{available:true,remaining:.617,resetAt:reset(393246000)}}},
  {id:'claude',name:'Claude',windows:{'5h':{available:true,remaining:.742,resetAt:reset(7812000)},weekly:{available:true,remaining:.469,resetAt:reset(327846000)}}},
  {id:'argon',name:'Gemini (Argon)',windows:{weekly:{available:true,remaining:.685,resetAt:reset(327846000)}}},
 ]};
}
const insightsSample={
 version:1,today,timeZone:'Asia/Shanghai',
 accountCredits:{planName:'Pro',tierName:'Google AI Ultra',availablePromptCredits:500,monthlyPromptCredits:50000,availableFlowCredits:100,monthlyFlowCredits:150000},
 kpis:{totalSessions:28,activeSessions:4,archivedSessions:24,totalTokens:8649600,uncachedTokens:1820000,cacheReadTokens:6420000,cacheWriteTokens:0,outputTokens:409600,totalRounds:186,totalModelCalls:328,totalToolCalls:612,totalActiveMs:4920000,avgCacheHitRate:6420000/(6420000+1820000),estimatedCostUsd:12.45,pricedSessions:28,totalSessionsForPricing:28},
 last7Days:Array.from({length:7},(_,i)=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);return {date:d.toISOString().slice(0,10),sessions:2+(i%3),totalTokens:(i+2)*115000,estimatedCostUsd:(i+2)*0.18};}),
 heatmap:days.slice(-112).map((d,i)=>({date:d.date,sessions:1+(i%4),tokens:Object.values(d.models).reduce((s,r)=>s+r.total,0)})),
 composition:{uncached:1820000,cacheRead:6420000,cacheWrite:0,output:409600},
 distributions:{
  projects:[{name:'agy-context-dashboard',sessions:14,tokens:5120000},{name:'agy-project-sidebar',sessions:8,tokens:2410000},{name:'agent-workflows',sessions:6,tokens:1119600}],
  skills:[{name:'team-review-governance',count:18,sessions:9},{name:'tabbit',count:12,sessions:6},{name:'team-diagnosing-bugs',count:9,sessions:5}],
  tools:[{name:'read_file',count:264},{name:'run_command',count:188},{name:'edit_file',count:114},{name:'rg',count:46}],
  commands:[{name:'npm test',count:54},{name:'git status',count:48},{name:'node tools/',count:32}],
  models:[],
 },
 totalMatchingSessions:28,
 sessions:[
  {id:ids.main,title:'v0.9.8 Context Insights & Cache Pills',project:'agy-context-dashboard',model:'Gemini 4 Hydrogen (Medium)',status:'IDLE',archived:false,rounds:12,steps:48,totalTokens:589509,currentContextTokens:112000,cacheHitRate:0.838,estimatedCostUsd:0.42},
  {id:ids.subagent,title:'Subagent Worker Verification',project:'agy-context-dashboard',model:'Claude Sonnet',status:'ARCHIVED',archived:true,rounds:6,steps:22,totalTokens:246800,currentContextTokens:24000,cacheHitRate:0.75,estimatedCostUsd:0.31},
 ],
 cacheInfo:{totalScanned:28,parsedNow:0,cacheHits:28,scanMs:14,shardCount:16},
};
const hostIcon=name=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${{add:'<path d="M12 5v14M5 12h14"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3"/>',send:'<path d="M12 19V5m-6 6 6-6 6 6"/>'}[name]}</svg>`;
function fixture(lang,scope,width,opts={}){
 const zh=lang==='zh',sub=scope==='subagent';
 const dark=opts.theme?opts.theme==='dark':!light;
 const anchor=sub?'<div class="identity" title="layout-reviewer"><svg viewBox="0 0 16 16"><path d="M3 4h10v8H3zM6 1v3m4-3v3M6 12v3m4-3v3"/></svg><span>layout-reviewer</span></div>':'<div class="model-branch"><button data-testid="model-selector-trigger">Gemini 4 Hydrogen <span>⌃</span></button></div>';
 const prefs={language:zh?'zh-CN':'en',languageGuideDismissed:true,quotaDisplayMode:'dual',quotaDisplay:'both',stripMode:opts.stripMode||'full',themeMode:opts.themeMode||'auto',barColors:opts.barColors||{},inlineCacheHit:opts.inlineCacheHit!==false,cacheHitTone:opts.cacheHitTone||'accent',revision:1};
 return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>
 *{box-sizing:border-box}body{margin:0;padding:${opts.padTop??14}px 14px 14px;background:${dark?'#17191d':'#f5f6f8'};color:${dark?'#c7cbd3':'#202631'};font:12px "Segoe UI","Microsoft YaHei",sans-serif}.composer{width:${width}px;max-width:100%;padding:12px;border:1px solid ${dark?'#363b44':'#d7dde8'};border-radius:16px;background:${dark?'#20242a':'#ffffff'};${dark?'':'box-shadow:0 8px 24px rgba(20,35,64,.08);'}margin:${opts.alignLeft?'0':'0 auto'}}.editor{height:44px;padding:2px 4px;outline:none;color:${dark?'#949da9':'#626d7c'};font-size:13px}.actions,.left,.right{display:flex;align-items:center;gap:5px;height:30px}.left{flex:1;min-width:0}.right{flex:none;gap:8px}.model-branch{display:flex;${opts.alignLeft?'flex:0 1 auto;min-width:0':'flex:1 1 200px;min-width:20px;max-width:200px'};overflow:hidden}.model-branch button{${opts.alignLeft?'':'width:100%;'}overflow:hidden;text-align:left}.model-branch span{padding-left:5px}.identity{display:flex;align-items:center;gap:6px;padding:4px 6px;flex:none;font-size:11px}.identity svg{width:14px;height:14px;fill:none;stroke:currentColor}.protected{width:28px;flex:none;display:grid;place-items:center}button{font:inherit;border:0;background:transparent;color:${dark?'#b9c1cd':'#354255'};height:28px;padding:0 4px;white-space:nowrap}.send{border-radius:50%;background:${dark?'#343c49':'#e8edf4'};color:${dark?'#d5dcea':'#202631'}}
 </style><body data-theme="${dark?'dark':'light'}"><section class="composer" data-testid="agent-input-box"><div><div role="textbox" contenteditable="true" class="editor" aria-label="Message input">${zh?'输入消息，@ 提及，/ 选择操作':'Ask anything, @ to mention, / for actions'}</div></div><div class="actions"><div class="left"><button class="protected" aria-label="Add context">${hostIcon('add')}</button>${anchor}</div><div class="right"><button class="protected" aria-label="Record voice memo">${hostIcon('mic')}</button><button class="protected send" data-testid="send-button" aria-label="Send message" disabled>${hostIcon('send')}</button></div></div></section><script>
 history.replaceState({},'', '/c/${ids[scope]}');Date.now=()=>${now};window.__prefs=${JSON.stringify(prefs)};window.agPulseHost={getMetrics:async()=>(${JSON.stringify(sample(scope))}),getPreferences:async()=>window.__prefs,setPreferences:async x=>{window.__prefs={...window.__prefs,...x,revision:window.__prefs.revision+1};return window.__prefs;},report:()=>{}};
 </script><script src="/widget.js"></script></body></html>`;
}
function board(lang,kind){
 const zh=lang==='zh';
 const frame=(scope,width,hero=false)=>`<iframe title="${scope} demo" src="/fixture?lang=${lang}&scope=${scope}&width=${width}" style="width:${hero?'820px':'100%'};height:136px;border:0;display:block;${hero?'transform:scale(1.35);transform-origin:top left':''}"></iframe>`;
 const note=zh?'当前控件源码渲染 · 宿主界面为示意 · 示例数据':'Current widget source · Illustrative host layout and data';
 const css=`*{box-sizing:border-box}body{margin:0;padding:28px 36px;background:${light?'#f5f6f8':'#17191d'};color:${light?'#1f2530':'#f0f3f8'};font:14px "Segoe UI","Microsoft YaHei",sans-serif}.brand{font-size:12px;font-weight:600;letter-spacing:1.4px;color:${light?'#315fc4':'#9fb9ee'}}h1{font-size:38px;font-weight:600;letter-spacing:-.8px;line-height:1.25;margin:16px 0 10px}p{margin:0;color:${light?'#515c6b':'#aab5c6'};font-size:16px;line-height:1.6}footer{font-size:11px;color:${light?'#626d7c':'#7f8c9f'};margin-top:12px}.hero-frame{height:184px;margin:18px -14px 4px}.features{display:flex;gap:28px;color:${light?'#485261':'#c2cee0'};font-size:13px;padding-top:10px;border-top:1px solid ${light?'#dce2ec':'#303846'}}.grid{display:grid;grid-template-columns:440px 1fr;gap:28px;margin-top:20px}h2{font-size:18px;font-weight:600;margin:0 0 5px}.grid p{font-size:13px;margin-bottom:12px}.frame-wrap{margin:0 -14px}.badge{font-size:11px;letter-spacing:.8px;color:${light?'#315fc4':'#9fb9ee'};margin-bottom:8px}`;
 if(kind==='density'){
  const rows=[
   {badge:zh?'01 · Full（850px）':'01 · FULL TIER (850px)',title:zh?'完整指标常驻（含轮次、5h/周额度与直显缓存命中率）':'Full metrics with rounds, 5h/weekly quota & inline cache hit',qs:'width=850&stripMode=full&alignLeft=1'},
   {badge:zh?'02 · Compact-Text（690px）':'02 · COMPACT-TEXT TIER (690px)',title:zh?'中等宽度收敛间距与次要标签，保住全部核心数字与完整模型名':'Tightens spacing/secondary text while keeping numbers & model selector',qs:'width=690&stripMode=full&alignLeft=1'},
   {badge:zh?'03 · Minimal（极简折叠态 · 850px）':'03 · MINIMAL COLLAPSE (850px)',title:zh?'持久极简折叠：< 展开切换 + 四图标，不挤占宽输入栏空间':'Persistent minimal mode: expand chevron + 4 compact icons',qs:'width=850&stripMode=minimal&alignLeft=1'},
   {badge:zh?'04 · Icons-Only（410px）':'04 · ICONS-ONLY TIER (410px)',title:zh?'窄窗口自动退化为四图标，原生模型选择器零截断、按钮零遮挡':'Narrow fallback keeps 4 interactive icons with zero model truncation',qs:'width=410&stripMode=full&alignLeft=1'},
  ];
  return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px 32px;background:#f5f6f8;color:#1f2530;font:14px "Segoe UI","Microsoft YaHei",sans-serif}.brand{font-size:12px;font-weight:600;letter-spacing:1.3px;color:#315fc4;margin-bottom:6px}h1{margin:0 0 14px;font-size:24px;font-weight:600;letter-spacing:-.4px}.rows{display:grid;gap:12px}.row{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px 8px}.meta{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}.badge{font-size:11px;font-weight:600;letter-spacing:.7px;color:#315fc4}.sub{font-size:12px;color:#515c6b}iframe{border:0;display:block;width:100%;height:122px}footer{font-size:11px;color:#626d7c;margin-top:12px}</style><body><div class="brand">ANTIGRATIVE DASHBOARD v${version} · ${zh?'三档密度 + 极简折叠':'ADAPTIVE DENSITY & MINIMAL COLLAPSE'}</div><h1>${zh?'不同窗口宽度与模式下的自适应层级对照':'Three responsive tiers + persistent minimal collapse'}</h1><div class="rows">${rows.map((r,i)=>`<section class="row"><div class="meta"><span class="badge">${r.badge}</span><span class="sub">${r.title}</span></div><iframe name="tier-${i}" src="/fixture?lang=${lang}&scope=main&${r.qs}"></iframe></section>`).join('')}</div><footer>${note}</footer></body></html>`;
 }
 if(kind==='colors'){
  const cards=[
   {badge:zh?'浅色默认（蓝色基调）':'LIGHT · DEFAULT BLUE',theme:'light',themeMode:'light',colors:{},tone:'accent'},
   {badge:zh?'浅色四项自由配色 + 语义命中色':'LIGHT · CUSTOM 4-ITEM COLORS',theme:'light',themeMode:'light',colors:{speed:'#7c3aed',token:'#d97706',quota:'#0284c7',context:'#16a34a'},tone:'semantic'},
   {badge:zh?'深色模式 + 定制配色':'DARK · CUSTOM 4-ITEM COLORS',theme:'dark',themeMode:'dark',colors:{speed:'#c084fc',token:'#fbbf24',quota:'#38bdf8',context:'#4ade80'},tone:'semantic'},
  ];
  return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px 32px;background:#f5f6f8;color:#1f2530;font:14px "Segoe UI","Microsoft YaHei",sans-serif}.brand{font-size:12px;font-weight:600;letter-spacing:1.3px;color:#315fc4;margin-bottom:6px}h1{margin:0 0 14px;font-size:24px;font-weight:600;letter-spacing:-.4px}.cards{display:grid;gap:12px}.card{border:1px solid #d7dde8;border-radius:12px;overflow:hidden;background:#fff}.card.dark{background:#17191d;border-color:#303642;color:#e2e8f0}.bar-head{padding:10px 16px 2px;font-size:11px;font-weight:600;letter-spacing:.7px;color:#315fc4}.card.dark .bar-head{color:#9fb9ee}iframe{border:0;display:block;width:100%;height:122px}footer{font-size:11px;color:#626d7c;margin-top:12px}</style><body><div class="brand">ANTIGRATIVE DASHBOARD v${version} · ${zh?'明暗主题 & 四项独立换色':'THEME MODES & PER-ITEM COLORS'}</div><h1>${zh?'默认纯净蓝调，或按速度 / 用量 / 额度 / 上下文自由配色':'Clean default blue or custom colors per status item'}</h1><div class="cards">${cards.map(c=>`<section class="card ${c.theme}"><div class="bar-head">${c.badge}</div><iframe src="/fixture?lang=${lang}&scope=main&width=850&theme=${c.theme}&themeMode=${c.themeMode}&tone=${c.tone}&barColors=${encodeURIComponent(JSON.stringify(c.colors))}"></iframe></section>`).join('')}</div><footer>${note}</footer></body></html>`;
 }
 const content=kind==='hero'?`<div class="brand">ANTIGRATIVE DASHBOARD · v${version}</div><h1>${zh?'主对话与子代理，统计都在输入框旁。':'Your agent. Your metrics. In view.'}</h1><p>${zh?'生成速度、缓存、额度与上下文常驻；悬停查看详细构成与共享额度。':'Speed, cache, quota and context beside your input. Hover for details.'}</p><div class="hero-frame">${frame('main',790,true)}</div><div class="features"><span>${zh?'主对话 + 子代理':'Main chats + subagents'}</span><span>${zh?'完整数值 ⇄ 四图标':'Full statistics ⇄ four icons'}</span><span>Windows · Linux · macOS</span></div>`:
 `<div class="brand">${zh?'自适应布局 · 子代理独立统计':'RESPONSIVE · SUBAGENT AWARE'}</div><div class="grid"><section><div class="badge">01 · ${zh?'自适应布局':'ADAPTIVE LAYOUT'}</div><h2>${zh?'窗口变窄，入口还在。':'Less room. Same four controls.'}</h2><p>${zh?'保留速度、缓存、额度与上下文图标；悬停或点击查看详情。':'Speed, cache, quota and context stay interactive.'}</p><div class="frame-wrap">${frame('main',440)}</div></section><section><div class="badge">02 · ${zh?'子代理独立统计':'CURRENT SUBAGENT'}</div><h2>${zh?'显示这个子代理自己的数据。':'This child’s metrics, beside its input.'}</h2><p>${zh?'子代理统计与主对话隔离，账号额度共享。':'Child statistics stay separate. Account quotas are shared.'}</p><div class="frame-wrap">${frame('subagent',632)}</div></section></div>`;
 return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>${css}</style><body>${content}<footer>${note}</footer></body></html>`;
}
function panelHtml(lang){
 const zh=lang==='zh';
 const baseHtml=panelPageSource()
  .replace('<head>',`<head><meta charset="utf-8"><style>:root{--background:${light?'#f5f6f8':'#17191d'};--foreground:${light?'#202631':'#e2e4e8'};--primary:${light?'#315fc4':'#9fb9ee'}}body.standalone{background:${light?'#f5f6f8':'#17191d'}!important;padding:0;min-height:auto}</style>`)
  .replace('/preload.js','/panel-preload.js?lang='+(zh?'zh-CN':'en'));
 return baseHtml;
}
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let content,type='text/html; charset=utf-8';
 if(url.pathname==='/widget.js'){content=install;type='text/javascript';}
 else if(url.pathname==='/panel'){content=panelHtml(url.searchParams.get('lang')||'en');}
 else if(url.pathname==='/panel-preload.js'){const lang=url.searchParams.get('lang')==='zh-CN'?'zh-CN':'en';content=`window.sidecar={conversationId:${JSON.stringify(ids.main)},fetch:(p,init)=>fetch(p+(p.includes('?')?'&':'?')+'lang=${lang}',init)};`;type='text/javascript';}
 else if(url.pathname==='/styles.css'){content=panelStyles;type='text/css';}
 else if(url.pathname==='/theme.css'){content=panelThemeCss;type='text/css';}
 else if(url.pathname==='/app.js'){content=panelAppJs;type='text/javascript';}
 else if(url.pathname==='/api/preferences'){const lang=url.searchParams.get('lang')==='zh-CN'?'zh-CN':'en';content=JSON.stringify({language:lang,languageGuideDismissed:true,quotaDisplay:'both',hostUiLocalization:true,revision:1});type='application/json';}
 else if(url.pathname==='/api/metrics'){const lang=url.searchParams.get('lang')==='zh-CN'?'zh-CN':'en';content=JSON.stringify({...sample('main'),preferences:{language:lang,languageGuideDismissed:true,quotaDisplay:'both',hostUiLocalization:true,revision:1}});type='application/json';}
 else if(url.pathname==='/api/insights'){content=JSON.stringify(insightsSample);type='application/json';}
 else if(url.pathname==='/fixture'){
  let barColors={};try{barColors=JSON.parse(url.searchParams.get('barColors')||'{}');}catch{}
  content=fixture(url.searchParams.get('lang')||'en',url.searchParams.get('scope')==='subagent'?'subagent':'main',Number(url.searchParams.get('width'))||940,{
   theme:url.searchParams.get('theme')||undefined,
   themeMode:url.searchParams.get('themeMode')||'auto',
   stripMode:url.searchParams.get('stripMode')||'full',
   cacheHitTone:url.searchParams.get('tone')||'accent',
   barColors,
   alignLeft:url.searchParams.get('alignLeft')==='1',
   padTop:url.searchParams.has('padTop')?Number(url.searchParams.get('padTop')):undefined,
  });
 }
 else if(url.pathname==='/board')content=board(url.searchParams.get('lang')||'en',url.searchParams.get('kind'));
 else{res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':type});res.end(content);
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const launchOpts=process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,headless:true}:(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const browser=await chromium.launch(launchOpts);
await mkdir(output,{recursive:true});
async function ready(frame,scope,density){
 await frame.waitForFunction(()=>{const value=document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps')?.textContent;return Boolean(value)&&value!=='—';});
 await frame.waitForFunction(({scope,density})=>{const w=document.getElementById('ag-pulse-status-bar');return w?.dataset.layout==='ready'&&w.dataset.scope===scope&&(Array.isArray(density)?density.includes(w.dataset.density):w.dataset.density===density)&&!w.dataset.motion;},{scope,density});
 const state=await frame.evaluate(()=>{const w=document.getElementById('ag-pulse-status-bar'),r=w.getBoundingClientRect();return {scope:w.dataset.scope,density:w.dataset.density,context:w.shadowRoot.getElementById('context-percent').textContent,cache:w.shadowRoot.getElementById('cache-detail-rate').textContent,tps:w.shadowRoot.getElementById('tps').textContent,nativeTargetsSafe:[...document.querySelectorAll('.protected')].every(b=>{const q=b.getBoundingClientRect();return Math.min(r.right,q.right)-Math.max(r.left,q.left)<=1||Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)<=1;})};});
 assert.equal(state.nativeTargetsSafe,true);assert.equal(state.context,scope==='subagent'?'12%':'44%');diagnostics.push(state);
 const language=await frame.evaluate(()=>{const root=document.getElementById('ag-pulse-status-bar').shadowRoot,card=root.getElementById('context-card'),quotaCard=root.getElementById('quota-card'),row=card.querySelector('.card-language'),quota=quotaCard.querySelector('.quota-details');return {toolbarRemoved:!root.getElementById('language-toggle'),explicitChoices:!!root.getElementById('card-language-en')&&!!root.getElementById('card-language-zh'),separateQuotaCard:Boolean(quota)&&!card.contains(quota)&&Boolean(row)&&card.contains(row),guideHidden:root.getElementById('language-guide').hidden};});
 assert.deepEqual(language,{toolbarRemoved:true,explicitChoices:true,separateQuotaCard:true,guideHidden:true});
}
async function save(page,name,clip){await page.screenshot({path:join(output,name),...(clip?{clip}:{fullPage:true})});files.push(name);}
try{
 for(const lang of ['en','zh']){
  const suffix=lang==='zh'?'-zh':'';
  for(const kind of ['hero','responsive']){
   if(process.argv.includes('--details-only'))continue;
   const page=await browser.newPage({viewport:{width:1200,height:kind==='hero'?440:286},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/board?lang=${lang}&kind=${kind}`);await page.locator('iframe').first().waitFor();
    const frames=page.frames().filter(f=>f!==page.mainFrame());assert.equal(frames.length,kind==='hero'?1:2);
    if(kind==='hero')await ready(frames[0],'main',['full','compact-text']);
    else{
     const fMain=frames.find(f=>f.url().includes(ids.main))||frames[0];
     const fSub=frames.find(f=>f.url().includes(ids.subagent))||frames[1];
     await ready(fMain,'main',['icons','compact-text','full']);
     await ready(fSub,'subagent',['full','compact-text','icons']);
    }
    await page.evaluate(()=>document.fonts.ready);await save(page,`${kind}${suffix}.png`);
   }finally{await page.close();}
  }
  {
   const page=await browser.newPage({viewport:{width:920,height:760},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/board?lang=${lang}&kind=density`);await page.locator('iframe').nth(3).waitFor();
    const frames=page.frames().filter(f=>f!==page.mainFrame());assert.equal(frames.length,4);
    const expected=['full','compact-text','minimal','icons'];
    for(let i=0;i<4;i++)await ready(frames.find(f=>f.name()===`tier-${i}`),'main',expected[i]);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);await save(page,`density-modes${suffix}.png`);
   }finally{await page.close();}
  }
  {
   const page=await browser.newPage({viewport:{width:920,height:590},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/board?lang=${lang}&kind=colors`);await page.locator('iframe').nth(2).waitFor();
    const frames=page.frames().filter(f=>f!==page.mainFrame());assert.equal(frames.length,3);
    for(const frame of frames)await ready(frame,'main',['full','compact-text']);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);await save(page,`theme-colors${suffix}.png`);
   }finally{await page.close();}
  }
  {
   const page=await browser.newPage({viewport:{width:960,height:680},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    const colors=encodeURIComponent(JSON.stringify({speed:'#7c3aed',token:'#d97706',quota:'#0284c7',context:'#16a34a'}));
    await page.goto(`${base}/fixture?lang=${lang}&scope=main&width=850&padTop=540&theme=light&barColors=${colors}&tone=semantic`);
    await ready(page,'main',['full','compact-text']);
    const host=page.locator('#ag-pulse-status-bar');
    await host.locator('[data-card=context]').click();
    await host.locator('#pulse-settings-toggle').click();
    await host.locator('#pulse-settings-dialog').waitFor({state:'visible'});
    assert.equal(await host.locator('#pulse-settings-dialog').getAttribute('data-open'),'true');
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);await save(page,`settings-dialog${suffix}.png`);
   }finally{await page.close();}
  }
  for(const card of ['speed','cache','quota','context']){
   const page=await browser.newPage({viewport:{width:1000,height:920},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/fixture?lang=${lang}&scope=main&width=940`);await ready(page,'main','full');const host=page.locator('#ag-pulse-status-bar');
    await host.locator(`[data-card=${card}]`).hover();await host.locator(`#${card}-card`).waitFor({state:'visible'});
    await page.addStyleTag({content:'.composer{background:transparent!important;border-color:transparent!important}.editor,.actions button,.identity{opacity:0}'});
    await host.locator('.bar').evaluate((bar,card)=>{for(const e of bar.children)if(e.dataset.card!==card)e.style.visibility='hidden';},card);
    const boxes=await Promise.all([host.locator(`[data-card=${card}]`).boundingBox(),host.locator(`#${card}-card`).boundingBox()]);assert.ok(boxes.every(Boolean));
    const pad=20,left=Math.max(0,Math.min(...boxes.map(b=>b.x))-pad),top=Math.max(0,Math.min(...boxes.map(b=>b.y))-pad),right=Math.min(1000,Math.max(...boxes.map(b=>b.x+b.width))+pad),bottom=Math.min(920,Math.max(...boxes.map(b=>b.y+b.height))+pad);
    await save(page,`${card==='cache'?'widget':card}${suffix}.png`,{x:left,y:top,width:right-left,height:bottom-top});
   }finally{await page.close();}
  }
  for(const kind of ['overview','details','intro']){
   const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/fixture?lang=${lang}&scope=main&width=940`);await ready(page,'main','full');
    await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();
    if(kind!=='intro')await page.locator('#usage-intro-done').click();
    if(kind==='details')await page.locator('#details-tab').click();
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
    await page.locator('#usage-dashboard').screenshot({path:join(output,`usage-${kind}${suffix}.png`)});files.push(`usage-${kind}${suffix}.png`);
   }finally{await page.close();}
  }
  for(const panelKind of ['session','insights']){
   const page=await browser.newPage({viewport:{width:460,height:604},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/panel?lang=${lang}`);
    await page.waitForFunction(()=>{const v=document.getElementById('strip-tps')?.textContent;return Boolean(v)&&v!=='—';});
    if(panelKind==='session'){
     await page.locator('#cache-tab').click();
     await page.locator('#cache-card').waitFor({state:'visible'});
    }else{
     await page.locator('#view-insights-tab').click();
     await page.locator('#insights-kpis .kpi-card').first().waitFor({state:'visible'});
    }
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120);
    await page.locator('.widget').screenshot({path:join(output,`panel-${panelKind}${suffix}.png`)});files.push(`panel-${panelKind}${suffix}.png`);
   }finally{await page.close();}
  }
 }
 assert.deepEqual(errors,[]);
 assert.equal(new Set(files).size,files.length,'Every figure needs its own asset');
 await writeFile(join(output,'capture-manifest.json'),JSON.stringify({version,source:'compat/inline-widget.cjs + sidecars/panel',data:'illustrative',scale:2,files,diagnostics},null,2));
 console.log(JSON.stringify({version,output,files,diagnostics,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
