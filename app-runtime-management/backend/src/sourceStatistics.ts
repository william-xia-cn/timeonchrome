import { sourceStatisticsDates } from '@timeonchrome/app-runtime-contracts/source-statistics';
import { HttpError } from './http';
import {readNativeApplicationStatisticsSeconds} from './applicationStatisticsNative';
import {applicationQuotaBucketsSeconds,validateQuotaBucketsSnapshot,validateQuotaBucketsSources,type QuotaBucketsQuery,type QuotaBucketsSnapshot,type QuotaBucketsSources} from '@timeonchrome/app-runtime-contracts/source-statistics';

type ApplicationQuotaSource={machineId:string;localUserId:string;assignmentVersion:number};
type ApplicationQuotaReadOptions={onlySource?:ApplicationQuotaSource};

/** 新共享只委托已验收的统计读取器；不复制publication/manifest/chunks查询。 */
export async function readApplicationQuotaBuckets(db:D1Database,accountId:string,childId:string,query:QuotaBucketsQuery,
  ownSource?:ApplicationQuotaSource,now=Date.now(),options:ApplicationQuotaReadOptions={}):Promise<QuotaBucketsSnapshot>{
  if(query.source!=='application'||query.scope==='other'&&!ownSource)throw new HttpError(400,'SOURCE_STATISTICS_INVALID','配额读取范围无效。');
  const days:QuotaBucketsSnapshot['days'][number][]=[];
  let failedDays=0;let firstFailure:unknown;
  for(const date of sourceStatisticsDates(query.fromDate,query.toDate)){
    let value:Awaited<ReturnType<typeof readNativeApplicationStatisticsSeconds>>;
    try { value=await readNativeApplicationStatisticsSeconds(db,accountId,childId,date,
      {quotaRead:true,fixedIdentityOnly:true,...(query.scope==='other'?{excludeSources:[ownSource!]}:{}),...options});
    } catch(error) {
      if(error instanceof HttpError&&(/CHILD_SCOPE_MISMATCH$/.test(error.code)
        ||/_(SOURCE_LIMIT|ROW_LIMIT|DURATION_OVERFLOW)$/.test(error.code)))throw error;
      failedDays++;firstFailure??=error;
      days.push({date,bucketsSeconds:{study:0,composite:0,rest:0},settledThroughMs:null,complete:false,
        reasonCodes:[error instanceof HttpError?error.code:'APPLICATION_STATISTICS_SOURCE_UNAVAILABLE']});
      continue;
    }
    const usage=value?.applicationUsage;
    const reasons=[...new Set([...(value?.reasonCodes??[]),...(usage?.reasonCodes??[]),
      ...(!value?['APPLICATION_STATISTICS_NOT_AVAILABLE']:[]),
      ...(value&&!value.complete?['APPLICATION_STATISTICS_INCOMPLETE']:[]),
      ...(!usage||!usage.complete?['APPLICATION_QUOTA_USAGE_INCOMPLETE']:[])])].sort();
    days.push({date,bucketsSeconds:usage?applicationQuotaBucketsSeconds(usage.nonSpecialCategories):{study:0,composite:0,rest:0},
      settledThroughMs:value?.references.length&&value.references.every(ref=>ref.settledThroughMs!==null)
        ?Math.min(...value.references.map(ref=>ref.settledThroughMs!)):null,
      complete:reasons.length===0,reasonCodes:reasons});
  }
  if(failedDays===days.length)throw firstFailure;
  return validateQuotaBucketsSnapshot({schemaVersion:2,durationUnit:'seconds',source:'application',childId,
    fromDate:query.fromDate,toDate:query.toDate,readAtMs:now,days},
    {source:'application',childId,fromDate:query.fromDate,toDate:query.toDate});
}

/** 成功读取的空统计仍可用；登记分配不是每天必须上报零账的证明要求。 */
export async function readApplicationQuotaBucketsWithState(db:D1Database,accountId:string,childId:string,query:QuotaBucketsQuery,
  ownSource?:ApplicationQuotaSource,now=Date.now(),options:ApplicationQuotaReadOptions={}) {
  const snapshot=await readApplicationQuotaBuckets(db,accountId,childId,query,ownSource,now,options);
  return {snapshot,sourceState:'available' as const};
}

/** 本机云账仅供核对；两个分项各自读取，不用合计减其他来源反拆。 */
export async function readApplicationQuotaBucketsSources(db:D1Database,accountId:string,childId:string,query:QuotaBucketsQuery,
  ownSource:ApplicationQuotaSource,now=Date.now()):Promise<QuotaBucketsSources>{
  const local=await readApplicationQuotaBuckets(db,accountId,childId,{...query,scope:'all'},undefined,now,{onlySource:ownSource});
  const other=await readApplicationQuotaBucketsWithState(db,accountId,childId,{...query,scope:'other'},ownSource,now);
  return validateQuotaBucketsSources({local,other:other.sourceState==='available'?other.snapshot:null,otherState:other.sourceState},
    {childId,fromDate:query.fromDate,toDate:query.toDate});
}
