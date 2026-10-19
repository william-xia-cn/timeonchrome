import { HttpError } from './http';
const DAY=86400000,OFFSET=8*3600000;
/** 已退出schema3实例统计；不能把应用身份统计伪装成实例级观察。扫描、安装及登记仍独立可用。 */
export async function readRecentProgramInstanceUsage(_db:D1Database,_account:string,_child:string,nowMs:number) {
  if(!Number.isSafeInteger(nowMs)||nowMs<29*DAY)throw new HttpError(400,'INVALID_RANGE','无效目录日期。');
  const today=Math.floor((nowMs+OFFSET)/DAY)*DAY-OFFSET;
  return {state:'unavailable' as const,reasonCode:'APPLICATION_DIRECTORY_USAGE_UNAVAILABLE',
    fromDate:new Date(today-29*DAY+OFFSET).toISOString().slice(0,10),
    toDate:new Date(today+OFFSET).toISOString().slice(0,10),
    subjects:[] as {subjectKey:string;lastUsedDate:string}[]};
}
