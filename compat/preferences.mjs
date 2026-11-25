// App-independent preferences: no renderer origin, account or conversation data.
import { readFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platformPaths } from './platform.mjs';

export function validateUsageScope(value) {
  if(!['local','account'].includes(value))throw new Error('Invalid usage scope preference');
  return value;
}
function storedUsageScope(value) {
  return ['local','account'].includes(value)?value:undefined;
}
export function validateAutoRelaunchDebug(value) {
  if(typeof value!=='boolean')throw new Error('Invalid auto relaunch preference');
  return value;
}
function storedAutoRelaunchDebug(value) {
  return typeof value==='boolean'?value:undefined;
}
export const BAR_CARDS=['speed','cache','quota','context'];
export const CONTEXT_CHIP_MODES=['rounds','label','compact'];
export const STRIP_MODES=['full','minimal'];
export function validateStripMode(value) {
  if(!STRIP_MODES.includes(value))throw new Error('Invalid strip mode preference');
  return value;
}
function storedStripMode(value) {
  return STRIP_MODES.includes(value)?value:undefined;
}
export function validateBarOrder(value) {
  if(!Array.isArray(value)||value.length!==BAR_CARDS.length||new Set(value).size!==BAR_CARDS.length||value.some(k=>!BAR_CARDS.includes(k)))throw new Error('Invalid bar order preference');
  return [...value];
}
function storedBarOrder(value) {
  try{return validateBarOrder(value);}catch{return undefined;}
}
export function validateBarHidden(value) {
  if(!Array.isArray(value)||value.length>=BAR_CARDS.length||new Set(value).size!==value.length||value.some(k=>!BAR_CARDS.includes(k)))throw new Error('Invalid bar hidden preference');
  return [...value];
}
function storedBarHidden(value) {
  try{return validateBarHidden(value);}catch{return undefined;}
}
export function validateContextChipMode(value) {
  if(!CONTEXT_CHIP_MODES.includes(value))throw new Error('Invalid context chip mode preference');
  return value;
}
function storedContextChipMode(value) {
  return CONTEXT_CHIP_MODES.includes(value)?value:undefined;
}
export const BAR_COLOR_KEYS=['speed','token','quota','context'];
export const THEME_MODES=['auto','light','dark'];
export const CACHE_HIT_TONES=['accent','semantic'];
function normalizeHexColor(value) {
  if(typeof value!=='string')return null;
  const m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if(!m)return null;
  const h=m[1].length===3?Array.from(m[1],c=>c+c).join(''):m[1];
  return `#${h.toLowerCase()}`;
}
export function validateBarColors(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid bar colors preference');
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(!BAR_COLOR_KEYS.includes(k))throw new Error('Invalid bar colors preference');
    if(v===null||v===undefined||v==='')continue;
    const clean=normalizeHexColor(v);
    if(!clean)throw new Error('Invalid bar colors preference');
    out[k]=clean;
  }
  return out;
}
function storedBarColors(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(!BAR_COLOR_KEYS.includes(k))continue;
    const clean=normalizeHexColor(v);
    if(clean)out[k]=clean;
  }
  return out;
}
export function validateThemeMode(value) {
  if(!THEME_MODES.includes(value))throw new Error('Invalid theme mode preference');
  return value;
}
function storedThemeMode(value) {
  return THEME_MODES.includes(value)?value:undefined;
}
export function validateCacheHitTone(value) {
  if(!CACHE_HIT_TONES.includes(value))throw new Error('Invalid cache hit tone preference');
  return value;
}
function storedCacheHitTone(value) {
  return CACHE_HIT_TONES.includes(value)?value:undefined;
}
export function validateHostUiLocalization(value) {
  if(typeof value!=='boolean')throw new Error('Invalid host UI localization preference');
  return value;
}
function storedHostUiLocalization(value) {
  return typeof value==='boolean'?value:undefined;
}
export function validateInlineCacheHit(value) {
  if(typeof value!=='boolean')throw new Error('Invalid inline cache hit preference');
  return value;
}
function storedInlineCacheHit(value) {
  return typeof value==='boolean'?value:undefined;
}
export function validateLanguage(value) {
  if (value!=='en'&&value!=='zh-CN'&&value!=='zh-TW') throw new Error('Invalid language preference');
  return value;
}

export function validateSpeedStyle(value) {
  if (value!=='minimal'&&value!=='cat') throw new Error('Invalid speed style preference');
  return value;
}
const storedSpeedStyle=value=>value==='minimal'||value==='cat'?value:null;
export function validateQuotaDisplay(value) {
  if (value!=='both'&&value!=='auto'&&value!=='compact') throw new Error('Invalid quota display preference');
  return value;
}
const storedQuotaDisplay=value=>value==='both'||value==='auto'||value==='compact'?value:null;

export class PreferencesStore {
  constructor({file=join(dirname(platformPaths().settings),'preferences.json')}={}) {
    this.file=file;this.queue=Promise.resolve();
  }
  async get() {
    await this.queue;
    try {
      const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));
      if(value.schema!==1)throw new Error('Invalid preferences schema');
      const usageScope=storedUsageScope(value.usageScope);
      const autoRelaunchDebug=storedAutoRelaunchDebug(value.autoRelaunchDebug);
      const hostUiLocalization=storedHostUiLocalization(value.hostUiLocalization);
      const inlineCacheHit=storedInlineCacheHit(value.inlineCacheHit);
      const barColors=storedBarColors(value.barColors);
      const themeMode=storedThemeMode(value.themeMode);
      const cacheHitTone=storedCacheHitTone(value.cacheHitTone);
      const barOrder=storedBarOrder(value.barOrder);
      const barHidden=storedBarHidden(value.barHidden);
      const contextChipMode=storedContextChipMode(value.contextChipMode);
      const stripMode=storedStripMode(value.stripMode);
      return {language:value.language===null?null:validateLanguage(value.language),languageGuideDismissed:value.languageGuideDismissed===true,usageGuideDismissed:value.usageGuideDismissed===true,speedStyle:storedSpeedStyle(value.speedStyle),quotaDisplay:storedQuotaDisplay(value.quotaDisplay),...(usageScope?{usageScope}:{}),...(typeof autoRelaunchDebug==='boolean'?{autoRelaunchDebug}:{}),...(typeof hostUiLocalization==='boolean'?{hostUiLocalization}:{}),...(typeof inlineCacheHit==='boolean'?{inlineCacheHit}:{}),...(barColors?{barColors}:{}),...(themeMode?{themeMode}:{}),...(cacheHitTone?{cacheHitTone}:{}),...(barOrder?{barOrder}:{}),...(barHidden?{barHidden}:{}),...(contextChipMode?{contextChipMode}:{}),...(stripMode?{stripMode}:{}),revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0};
    } catch(error) {
      if(error.code==='ENOENT')return {language:null,languageGuideDismissed:false,usageGuideDismissed:false,speedStyle:null,quotaDisplay:null,revision:0};
      throw new Error('Language preference could not be read');
    }
  }
  async set(input) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(key=>!['language','languageGuideDismissed','usageGuideDismissed','speedStyle','quotaDisplay','usageScope','autoRelaunchDebug','hostUiLocalization','inlineCacheHit','barColors','themeMode','cacheHitTone','barOrder','barHidden','contextChipMode','stripMode'].includes(key)))throw new Error('Invalid preferences request');
    if(Object.hasOwn(input,'language'))validateLanguage(input.language);
    if(Object.hasOwn(input,'speedStyle'))validateSpeedStyle(input.speedStyle);
    if(Object.hasOwn(input,'quotaDisplay'))validateQuotaDisplay(input.quotaDisplay);
    if(Object.hasOwn(input,'usageScope'))validateUsageScope(input.usageScope);
    if(Object.hasOwn(input,'autoRelaunchDebug'))validateAutoRelaunchDebug(input.autoRelaunchDebug);
    if(Object.hasOwn(input,'hostUiLocalization'))validateHostUiLocalization(input.hostUiLocalization);
    if(Object.hasOwn(input,'inlineCacheHit'))validateInlineCacheHit(input.inlineCacheHit);
    if(Object.hasOwn(input,'barColors'))input={...input,barColors:validateBarColors(input.barColors)};
    if(Object.hasOwn(input,'themeMode'))validateThemeMode(input.themeMode);
    if(Object.hasOwn(input,'cacheHitTone'))validateCacheHitTone(input.cacheHitTone);
    if(Object.hasOwn(input,'barOrder'))validateBarOrder(input.barOrder);
    if(Object.hasOwn(input,'barHidden'))validateBarHidden(input.barHidden);
    if(Object.hasOwn(input,'contextChipMode'))validateContextChipMode(input.contextChipMode);
    if(Object.hasOwn(input,'stripMode'))validateStripMode(input.stripMode);
    if(Object.hasOwn(input,'languageGuideDismissed')&&input.languageGuideDismissed!==true)throw new Error('Invalid guide preference');
    if(Object.hasOwn(input,'usageGuideDismissed')&&input.usageGuideDismissed!==true)throw new Error('Invalid usage guide preference');
    const operation=this.queue.then(async()=>{
      await mkdir(dirname(this.file),{recursive:true});
      let prior=0,previous={language:null,languageGuideDismissed:false,usageGuideDismissed:false,speedStyle:null,quotaDisplay:null,usageScope:undefined,autoRelaunchDebug:undefined,hostUiLocalization:undefined,inlineCacheHit:undefined,barColors:undefined,themeMode:undefined,cacheHitTone:undefined,barOrder:undefined,barHidden:undefined,contextChipMode:undefined,stripMode:undefined};
      try {const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));if(Number.isSafeInteger(value.revision))prior=value.revision;previous={language:['en','zh-CN','zh-TW'].includes(value.language)?value.language:null,languageGuideDismissed:value.languageGuideDismissed===true,usageGuideDismissed:value.usageGuideDismissed===true,speedStyle:storedSpeedStyle(value.speedStyle),quotaDisplay:storedQuotaDisplay(value.quotaDisplay),usageScope:storedUsageScope(value.usageScope),autoRelaunchDebug:storedAutoRelaunchDebug(value.autoRelaunchDebug),hostUiLocalization:storedHostUiLocalization(value.hostUiLocalization),inlineCacheHit:storedInlineCacheHit(value.inlineCacheHit),barColors:storedBarColors(value.barColors),themeMode:storedThemeMode(value.themeMode),cacheHitTone:storedCacheHitTone(value.cacheHitTone),barOrder:storedBarOrder(value.barOrder),barHidden:storedBarHidden(value.barHidden),contextChipMode:storedContextChipMode(value.contextChipMode),stripMode:storedStripMode(value.stripMode)};}catch{}
      const language=Object.hasOwn(input,'language')?input.language:previous.language;
      const languageGuideDismissed=previous.languageGuideDismissed||Object.hasOwn(input,'language')||input.languageGuideDismissed===true;
      const usageGuideDismissed=previous.usageGuideDismissed||input.usageGuideDismissed===true;
      const speedStyle=Object.hasOwn(input,'speedStyle')?input.speedStyle:previous.speedStyle;
      const quotaDisplay=Object.hasOwn(input,'quotaDisplay')?input.quotaDisplay:previous.quotaDisplay;
      const usageScope=Object.hasOwn(input,'usageScope')?input.usageScope:previous.usageScope;
      const autoRelaunchDebug=Object.hasOwn(input,'autoRelaunchDebug')?input.autoRelaunchDebug:previous.autoRelaunchDebug;
      const hostUiLocalization=Object.hasOwn(input,'hostUiLocalization')?input.hostUiLocalization:previous.hostUiLocalization;
      const inlineCacheHit=Object.hasOwn(input,'inlineCacheHit')?input.inlineCacheHit:previous.inlineCacheHit;
      const barColors=Object.hasOwn(input,'barColors')?input.barColors:previous.barColors;
      const themeMode=Object.hasOwn(input,'themeMode')?input.themeMode:previous.themeMode;
      const cacheHitTone=Object.hasOwn(input,'cacheHitTone')?input.cacheHitTone:previous.cacheHitTone;
      const barOrder=Object.hasOwn(input,'barOrder')?validateBarOrder(input.barOrder):previous.barOrder;
      const barHidden=Object.hasOwn(input,'barHidden')?validateBarHidden(input.barHidden):previous.barHidden;
      const contextChipMode=Object.hasOwn(input,'contextChipMode')?validateContextChipMode(input.contextChipMode):previous.contextChipMode;
      const stripMode=Object.hasOwn(input,'stripMode')?input.stripMode:previous.stripMode;
      const revision=Math.max(Date.now(),prior+1);
      const extra={...(usageScope?{usageScope}:{}),...(typeof autoRelaunchDebug==='boolean'?{autoRelaunchDebug}:{}),...(typeof hostUiLocalization==='boolean'?{hostUiLocalization}:{}),...(typeof inlineCacheHit==='boolean'?{inlineCacheHit}:{}),...(barColors?{barColors}:{}),...(themeMode?{themeMode}:{}),...(cacheHitTone?{cacheHitTone}:{}),...(barOrder?{barOrder}:{}),...(barHidden?{barHidden}:{}),...(contextChipMode?{contextChipMode}:{}),...(stripMode?{stripMode}:{})};
      const temporary=this.file+'.'+process.pid+'.'+randomUUID()+'.tmp';
      try {
        const handle=await open(temporary,'wx',0o600);
        try {await handle.writeFile(JSON.stringify({schema:1,language,languageGuideDismissed,usageGuideDismissed,speedStyle,quotaDisplay,...extra,revision})+'\n','utf8');await handle.sync();}
        finally {await handle.close();}
        await rename(temporary,this.file);
      } finally {await rm(temporary,{force:true});}
      return {language,languageGuideDismissed,usageGuideDismissed,speedStyle,quotaDisplay,...extra,revision};
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async snapshot() {
    try {return await this.get();}catch{return {error:'Language preference could not be read'};}
  }
}
