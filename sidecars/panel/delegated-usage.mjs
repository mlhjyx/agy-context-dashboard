// Background task accounting. Every source remains an independent conversation;
// only numeric request projections are combined, never timing or context windows.
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {delegatedIds,isSwarmOwner,normalizeConversationId} from './delegation.mjs';
import {taskRecords,mergeTaskRecords,aggregateTaskUsage,safeTaskUsage} from './task-usage.mjs';
import {readSwarmMembers,agentDescriptor} from './swarm.mjs';

const settledChildStatus = s => /IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/.test(String(s || ''));

export class DelegatedUsage {
  constructor(client,{onSource=async()=>{},onUpdate=async()=>{},owns=()=>true,now=Date.now,
    budgetBytes=8*1024*1024,maxAgents=128,maxEntries=4,refreshMs=5000,settledChildRefreshMs=60000,brainRoot=null}={}) {
    Object.assign(this,{client,onSource,onUpdate,owns,now,budgetBytes,maxAgents,maxEntries,refreshMs,settledChildRefreshMs});
    this.brainRoot=typeof brainRoot==='string'&&brainRoot?brainRoot:null;
    // A Promise is truthy but is never proof of ownership. Callers must supply
    // the synchronous cached predicate, not the asynchronous marker verifier.
    this.owns=()=>owns()===true;
  }
  tasks=new Map();swarmNegative=new Map();swarmProbes=new Map();epoch=0;scope=null;running=null;bytes=0;disposed=false;
  reset(){this.epoch++;this.tasks.clear();this.swarmNegative.clear();this.swarmProbes.clear();this.bytes=0;this.scope=null;}
  dispose(){this.disposed=true;this.reset();}
  links(id,raw,swarmMembers=null){return delegatedIds(id,raw,this.client.reader?.summaries||{},swarmMembers);}
  probeSwarm(scope,id,raw,saved,isCurrent){
    if(!this.brainRoot||this.swarmProbes.has(id))return;
    const negAt=this.swarmNegative.get(id);
    if(negAt!==undefined&&this.now()-negAt<15000)return;
    const summaries=this.client.reader?.summaries||{};
    const rootSum=summaries[id]||Object.entries(summaries).find(([k])=>k.toLowerCase()===id)?.[1];
    const meta=rootSum?.trajectoryMetadata;
    if(meta?.parentConversationId||meta?.subagentSpec||Number(meta?.nestingDepth)>0){
      this.swarmNegative.set(id,this.now());
      while(this.swarmNegative.size>64)this.swarmNegative.delete(this.swarmNegative.keys().next().value);
      return;
    }
    const epoch=this.epoch;
    let settled=false,job=null;
    job=(async()=>{
      try{
        const rootId=normalizeConversationId(meta?.rootConversationId)||
          normalizeConversationId(meta?.sourceMetadata?.rootConversationId)||id;
        let swarm=await readSwarmMembers(this.brainRoot,rootId);
        if(!swarm&&rootId!==id)swarm=await readSwarmMembers(this.brainRoot,id);
        if(this.disposed||!this.owns()||epoch!==this.epoch||scope!==this.scope||isCurrent()!==true)return;
        const valid=isSwarmOwner(swarm,id)?swarm:null;
        if(!valid||!valid.ids.some(cid=>cid!==id)){
          this.swarmNegative.set(id,this.now());
          while(this.swarmNegative.size>64)this.swarmNegative.delete(this.swarmNegative.keys().next().value);
          return;
        }
        const refreshed=this.request(scope,id,raw,{saved,knownIds:valid.ids,force:false,isCurrent,swarmMembers:valid});
        if(refreshed)await this.onUpdate(scope,id,refreshed,valid.ids.filter(cid=>cid!==id));
      }catch{}finally{settled=true;if(this.swarmProbes.get(id)===job)this.swarmProbes.delete(id);}
    })();
    if(!settled)this.swarmProbes.set(id,job);
  }
  request(scope,id,raw,{saved=null,knownIds=[],force=false,isCurrent=()=>true,swarmMembers=null}={}) {
    if(this.disposed||!scope||!this.owns())return safeTaskUsage(saved);
    id=normalizeConversationId(id);if(!id)return null;
    if(scope!==this.scope){this.reset();this.scope=scope;}
    let task=this.tasks.get(id);
    const activeSwarm=swarmMembers||task?.swarmMembers||null;
    const ids=[...new Set([...this.links(id,raw,activeSwarm),...knownIds.map(normalizeConversationId).filter(Boolean)])].filter(child=>child!==id);
    if(!ids.length&&!task){this.probeSwarm(scope,id,raw,saved,isCurrent);return safeTaskUsage(saved);}
    if(!task){
      while(this.tasks.size>=this.maxEntries){const oldest=this.tasks.keys().next().value;this.bytes-=this.tasks.get(oldest).bytes;this.tasks.delete(oldest);}
      task={id,scope,children:new Set(),sources:new Map(),childMarks:new Map(),failures:new Map(),staleSources:new Set(),attempted:new Map(),order:0,bytes:0,lastAt:-Infinity,requested:false,force:false,result:safeTaskUsage(saved),truncated:false,swarmMembers:activeSwarm};
      this.tasks.set(id,task);
    }else if(swarmMembers)task.swarmMembers=swarmMembers;
    this.tasks.delete(id);this.tasks.set(id,task);
    task.isCurrent=isCurrent;
    const oldSize=task.children.size;
    this.addChildren(task,ids);
    if(task.raw?.deref()!==raw){
      task.raw=new WeakRef(raw);
      const rows=taskRecords(raw,id);
      if(!this.put(task,id,rows))task.truncated=true;
      task.result=this.result(task,task.lastAt===-Infinity?'loading':task.result?.state||'loading');
    }
    if(force||!task.collecting&&(oldSize!==task.children.size||this.now()-task.lastAt>=this.refreshMs)){task.requested=true;task.force||=force;this.schedule();}
    return task.result||this.result(task,'loading');
  }
  addChildren(task,ids){
    for(const id of ids){
      if(id===task.id||task.children.has(id))continue;
      if(task.children.size>=this.maxAgents){task.truncated=true;break;}
      task.children.add(id);
    }
  }
  put(task,id,rows){
    const merged=mergeTaskRecords(task.sources.get(id)?.rows||[],rows);rows=merged.rows;
    if(merged.restored)task.staleSources.add(id);else task.staleSources.delete(id);
    const size=Buffer.byteLength(JSON.stringify(rows)),old=task.sources.get(id)?.bytes||0;
    if(this.bytes-old+size>this.budgetBytes){
      for(const [key,other] of this.tasks){if(other===task)continue;this.bytes-=other.bytes;this.tasks.delete(key);if(this.bytes-old+size<=this.budgetBytes)break;}
    }
    if(this.bytes-old+size>this.budgetBytes)return false;
    this.bytes+=size-old;task.bytes+=size-old;task.sources.set(id,{rows,bytes:size});return true;
  }
  result(task,state){
    const summaries=this.client.reader?.summaries||{};
    const selfSum=summaries[task.id]||Object.entries(summaries).find(([k])=>k.toLowerCase()===task.id)?.[1]||null;
    const selfMeta=selfSum?.trajectoryMetadata;
    const selfMember=task.swarmMembers?.byId?.get(task.id)||task.selfSwarmMember||null;
    const selfIsSub=Boolean(selfMeta?.parentConversationId||selfMeta?.subagentSpec||Number(selfMeta?.nestingDepth)>0);
    const rootDesc=agentDescriptor(task.id,{isRoot:!selfIsSub,isSubagent:selfIsSub,selfMember,summaries,swarmMembers:task.swarmMembers});
    const childSets=[...task.children].filter(id=>task.sources.has(id)).map((id,idx)=>{
      const desc=agentDescriptor(id,{isRoot:false,summaries,swarmMembers:task.swarmMembers});
      const label=desc.label==='Worker'?`Worker #${idx+1}`:desc.label;
      const member=task.swarmMembers?.byId?.get(id)||null;
      return {rows:task.sources.get(id).rows,role:desc.role,label,modelHint:desc.modelHint,
        ...(member?{workspaceMode:member.workspaceMode??null,killed:member.killed===true}:{})};
    });
    const result=aggregateTaskUsage(task.sources.get(task.id)?.rows||[],childSets,{
      subagents:task.children.size,loadedSubagents:childSets.length,state:task.truncated||task.staleSources.size?'partial':state,
      rootRole:rootDesc.role,rootLabel:rootDesc.label,rootModelHint:rootDesc.modelHint,
      ...(selfMember?{rootWorkspaceMode:selfMember.workspaceMode??null,rootKilled:selfMember.killed===true}:{}),
      ...(task.swarmMembers?{isSwarm:true}:{}),
    });
    // On restart, numeric saved task totals remain visible until the first pass
    // can account for every known child. They are never treated as fresh/complete.
    const savedTotal=task.result?.tokens?.totalTokens;
    if(Number.isSafeInteger(savedTotal)&&(result.tokens?.totalTokens===null||savedTotal>result.tokens?.totalTokens))
      return {...task.result,tokens:{...task.result.tokens,complete:false},cache:{...task.result.cache,complete:false},subagents:Math.max(task.children.size,task.result.subagents),state:state==='loading'?'loading':'partial',complete:false};
    return result;
  }
  schedule(){
    if(this.running||this.disposed)return;
    this.running=Promise.resolve().then(async()=>{
      for(;;){
        const task=[...this.tasks.values()].find(t=>t.requested);if(!task||this.disposed||!this.owns())break;
        task.requested=false;const force=task.force;task.force=false;
        const epoch=this.epoch,current=()=>!this.disposed&&this.owns()&&epoch===this.epoch&&task.scope===this.scope&&this.tasks.get(task.id)===task&&task.isCurrent();
        task.collecting=true;try{await this.collect(task,force,current);}finally{task.collecting=false;}
      }
    }).finally(()=>{this.running=null;});
  }
  async collect(task,force,current){
    const deadline=this.now()+30000;let failed=false;
    try{
      if(this.brainRoot){
        const summaries=this.client.reader?.summaries||{};
        const rootSum=summaries[task.id]||Object.entries(summaries).find(([k])=>k.toLowerCase()===task.id)?.[1];
        const swarmRootId=normalizeConversationId(rootSum?.trajectoryMetadata?.rootConversationId)||
          normalizeConversationId(rootSum?.trajectoryMetadata?.sourceMetadata?.rootConversationId)||task.id;
        let swarm=await readSwarmMembers(this.brainRoot,swarmRootId);
        if(!swarm&&swarmRootId!==task.id)swarm=await readSwarmMembers(this.brainRoot,task.id);
        if(!current())return;
        if(isSwarmOwner(swarm,task.id)){
          task.swarmMembers=swarm;
          this.addChildren(task,swarm.ids);
        }else if(swarm?.byId?.has(task.id)){
          task.selfSwarmMember=swarm.byId.get(task.id);
        }
      }
      // Resume oldest/unread sources first after a bounded pass. Starting from
      // the same first child every time can starve late children in a large task.
      const prevResult=task.result;
      const hadCompletedPass=task.lastAt!==-Infinity;
      let dirty=false;
      const queue=[...task.children].sort((a,b)=>(task.attempted.get(a)||0)-(task.attempted.get(b)||0)),queued=new Set(queue);
      for(const id of queue){
        if(!current())return;
        if(this.now()>deadline){failed=true;break;}
        const failure=task.failures.get(id);
        if(!force&&failure?.retryAt>this.now()){failed=true;continue;}
        const summaries=this.client.reader?.summaries||{};
        const summary=summaries[id]||Object.entries(summaries).find(([key])=>key.toLowerCase()===id)?.[1]||{};
        const summaryMark=settledChildStatus(summary?.status)&&summary?.lastModifiedTime
          ? JSON.stringify([summary.stepCount??null,summary.lastModifiedTime,summary.status,summary.lastUserInputStepIndex??null])
          : null;
        const prevMark=task.childMarks?.get(id);
        if(!force&&summaryMark&&task.sources.has(id)&&!failure&&prevMark&&prevMark.mark===summaryMark&&this.now()-prevMark.checkedAt<this.settledChildRefreshMs){
          continue;
        }
        task.attempted.set(id,++task.order);
        try{
          const raw=await this.client.trajectory(id,{summary,force,isCurrent:current});
          if(!current())return;
          if(!raw?.trajectory||!Array.isArray(raw.trajectory.generatorMetadata)||
            !raw.trajectory.generatorMetadata.length&&!raw.trajectory.steps?.length&&!Object.keys(summary).length)throw Error('Delegated statistics unavailable');
          const stepsLen=raw.trajectory.steps?.length??0,gensLen=raw.trajectory.generatorMetadata.length;
          const unchangedRef=!force&&prevMark&&prevMark.raw===raw&&prevMark.stepsLen===stepsLen&&prevMark.gensLen===gensLen&&task.sources.has(id)&&!task.staleSources.has(id);
          if(unchangedRef){
            prevMark.checkedAt=this.now();
            if(summaryMark)prevMark.mark=summaryMark;
            task.failures.delete(id);
            await yieldLoop();
            continue;
          }
          this.addChildren(task,this.links(id,raw));
          for(const child of task.children)if(!queued.has(child)){queued.add(child);queue.push(child);}
          if(!this.put(task,id,taskRecords(raw,id))){task.truncated=true;failed=true;dirty=true;break;}
          await this.onSource(task.scope,id,raw,{isCurrent:current,guardKey:task});
          if(!current())return;
          dirty=true;
          task.failures.delete(id);
          task.childMarks?.set(id,{mark:summaryMark,checkedAt:this.now(),raw,stepsLen,gensLen});
        }catch{
          if(!current())return;failed=true;dirty=true;
          const failures=(failure?.failures||0)+1;
          task.failures.set(id,{failures,retryAt:this.now()+Math.min(300000,5000*2**Math.min(failures-1,6))});
        }
        await yieldLoop();
      }
      if(!current())return;
      task.lastAt=this.now();
      const nextResult=this.result(task,failed?'partial':'ready');
      task.result=nextResult;
      const resultChanged=!hadCompletedPass||dirty||nextResult?.state!==prevResult?.state||nextResult?.tokens?.totalTokens!==prevResult?.tokens?.totalTokens||nextResult?.loadedSubagents!==prevResult?.loadedSubagents||nextResult?.subagents!==prevResult?.subagents;
      if(resultChanged)await this.onUpdate(task.scope,task.id,task.result,[...task.children]);
    }catch{if(current()){task.lastAt=this.now();task.result=this.result(task,'partial');}}
  }
  async idle(){while(this.running||this.swarmProbes.size){if(this.swarmProbes.size)await Promise.allSettled([...this.swarmProbes.values()]);if(this.running)await this.running;}}
}
