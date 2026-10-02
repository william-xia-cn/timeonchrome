import { WorkerEntrypoint } from 'cloudflare:workers';
import { readComputerApplicationEvidence } from './computerUsageEvidence';
import { HttpError, jsonResponse, readJsonBody } from './http';
import { sha256Hex } from './crypto';
import { getAppPolicy } from './appPolicy';
import { readPersistentApplicationUsage } from './applicationStatistics';
import { loadUsageCorrections } from './applicationUsageCorrections';
import { CHROME_DISPLAY_RULES } from './specialApplications';
import { readApplicationSharedQuotaContributions } from './applicationSharedQuota';
import { verifySharedWebSourceAssignment } from './sharedWebSourceBinding';

/** Capability-bound entrypoint; this is never exposed by the public fetch router. */
export class RuntimeComputerUsageService extends WorkerEntrypoint<Env> {
  private async requireChildScope(accountId:string,childId:string):Promise<void> {
    // Guardian owns the child lifecycle; v2 never populates the legacy registry.
    let owned:boolean;
    try {
      const response=await this.env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/verifyChildAccess',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId})
      }));
      const value=await response.json() as {owned?:unknown};
      if(!response.ok||typeof value.owned!=='boolean')throw new Error('scope unavailable');
      owned=value.owned;
    }catch{throw new HttpError(503,'APPLICATION_SCOPE_UNAVAILABLE','Child ownership verification is unavailable.');}
    if(!owned)throw new HttpError(404,'CHILD_NOT_FOUND','Child was not found.');
  }
  // Only this named service capability exposes the transport, never the public
  // default fetch router. A bounded JSON response owns its request lifetime.
  async fetch(request:Request):Promise<Response> {
    const operation=new URL(request.url).pathname.slice(1);
    if(request.method!=='POST'||!['applicationEvidenceRevision','readApplicationEvidence','getApplicationUsage',
      'readApplicationSharedQuotaContributions','verifySharedWebSourceAssignment'].includes(operation))
      return jsonResponse({code:'METHOD_NOT_ALLOWED'},{status:405});
    try {
      const input=await readJsonBody(request,2048) as Record<string,unknown>;
      if(operation==='verifySharedWebSourceAssignment')return jsonResponse({owned:await verifySharedWebSourceAssignment(this.env.RUNTIME_DB,input)});
      if(!input||['accountId','childId','fromDate','toDate'].some(key=>typeof input[key]!=='string'||String(input[key]).length>200))
        throw new HttpError(400,'INVALID_SCOPE','Read scope is invalid.');
      const args=[input.accountId,input.childId,input.fromDate,input.toDate] as [string,string,string,string];
      const value=operation==='applicationEvidenceRevision'?await this.applicationEvidenceRevision(...args)
        :operation==='readApplicationEvidence'?await this.readApplicationEvidence(...args)
          :operation==='readApplicationSharedQuotaContributions'?await this.readSharedQuotaApplicationContributions(...args)
            :await this.getApplicationUsage(...args);
      return jsonResponse(value);
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const code=error instanceof HttpError?error.code
        :/SQLITE_NOMEM|out of memory/i.test(message)?'APPLICATION_DATABASE_MEMORY_LIMIT'
        :/no such (table|column)/i.test(message)?'APPLICATION_SCHEMA_UNAVAILABLE':'APPLICATION_SOURCE_UNAVAILABLE';
      console.error(JSON.stringify({event:'computer_application_capability_failed',code}));
      return jsonResponse({code},{status:error instanceof HttpError?error.status:503});
    }
  }
  async getApplicationUsage(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>7*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to-86400000+8*3600000).toISOString().slice(0,10)!==toDate)throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    const {value:result,statistics}=await readPersistentApplicationUsage(this.env.RUNTIME_DB,accountId,childId,from,to,{},work=>this.ctx.waitUntil(work));
    const value=result as {
      totalDurationMs:number;categories:Array<{classification:string;durationMs:number}>;
      buckets:Array<{startAtMs:number;durationMs:number}>;
      applications:Array<{displayName:string|null;classification:string;durationMs:number}>};
    return {source:'application',fromDate,toDate,totalDurationMs:value.totalDurationMs,statistics,
      categories:value.categories.map(({classification,durationMs})=>({classification,durationMs})),
      buckets:value.buckets.map(({startAtMs,durationMs})=>({startAtMs,durationMs})),
      applications:value.applications.map(({displayName,classification,durationMs})=>({displayName,classification,durationMs}))};
  }
  async applicationEvidenceRevision(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>7*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to-86400000+8*3600000).toISOString().slice(0,10)!==toDate)throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    const headRead=this.env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS count,MAX(s.uploaded_at_ms) AS latestUpload,MAX(s.end_at_ms) AS lastEnd
      FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE m.account_id=?1 AND s.child_id=?2
      AND s.diagnostic=0 AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4 AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3`)
      .bind(accountId,childId,from,to).first();
    const machinesRead=this.env.RUNTIME_DB.prepare('SELECT id,display_name,default_child_id FROM runtime_machines_v2 WHERE account_id=? ORDER BY id LIMIT 101').bind(accountId).all();
    const inventoryRead=this.env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS count,MAX(i.last_seen_at_ms) AS latest
      FROM runtime_application_inventory_v1 i JOIN runtime_machines_v2 m ON m.id=i.machine_id
      WHERE m.account_id=?1 AND EXISTS (SELECT 1 FROM runtime_user_assignments_v2 a WHERE a.machine_id=i.machine_id
        AND a.local_user_id=i.local_user_id AND a.child_id=?2 AND a.protected=1)`)
      .bind(accountId,childId).first();
    const policyRead=getAppPolicy(this.env.RUNTIME_DB,accountId,childId);
    const legacyRead=(async()=>{try { return (await this.env.RUNTIME_DB.prepare(`SELECT d.id,d.display_name,d.revoked_at_ms,COUNT(s.id) AS count,MAX(s.uploaded_at_ms) AS latest
      FROM runtime_devices d LEFT JOIN runtime_usage_segments s ON s.device_id=d.id AND s.start_at_ms<?4 AND s.end_at_ms>?3
      WHERE d.account_id=?1 AND d.child_id=?2 GROUP BY d.id HAVING d.revoked_at_ms IS NULL OR COUNT(s.id)>0 ORDER BY d.id LIMIT 101`)
      .bind(accountId,childId,from,to).all()).results; }catch{return {status:'unavailable'}; /* Legacy failure remains isolated. */ }})();
    const correctionsRead=loadUsageCorrections(this.env.RUNTIME_DB,accountId,childId,from,to);
    const statisticsRead=this.env.RUNTIME_DB.prepare(`SELECT scope_key,date,source_revision,computed_at_ms FROM runtime_application_statistics_days_v1
      WHERE account_id=?1 AND child_id=?2 AND date>=?3 AND date<=?4
        AND json_extract(filters_json,'$.localUserId') IS NULL AND json_extract(filters_json,'$.platform') IS NULL
        AND (from_ms+28800000)%86400000=0 AND to_ms-from_ms=86400000
      ORDER BY scope_key,date LIMIT 708`).bind(accountId,childId,fromDate,toDate).all();
    const [head,machines,inventory,policy,legacy,corrections,statistics]=await Promise.all([
      headRead,machinesRead,inventoryRead,policyRead,legacyRead,correctionsRead,statisticsRead,
    ]);
    if(statistics.results.length>707)throw new HttpError(422,'COMPUTER_USAGE_SOURCE_LIMIT','统计来源范围过多。');
    return sha256Hex(JSON.stringify({model:'readable-history-v3-persistent',head,machines:machines.results,legacy,inventory,statistics:statistics.results,
      displayRules:CHROME_DISPLAY_RULES,policyVersion:policy.version,projection:policy.productIdentityProjection?.version,corrections}));
  }
  async readApplicationEvidence(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)
      ||!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>6*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to+8*3600000).toISOString().slice(0,10)!==toDate)
      throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    return readComputerApplicationEvidence(this.env.RUNTIME_DB,accountId,childId,fromDate,toDate,work=>this.ctx.waitUntil(work));
  }
  async readSharedQuotaApplicationContributions(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    if(fromDate!==toDate)throw new HttpError(400,'INVALID_RANGE','共享配额来源只读单日。');
    return readApplicationSharedQuotaContributions(this.env.RUNTIME_DB,accountId,childId,fromDate);
  }
}
