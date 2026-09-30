import { json,verifyAccountToken } from '../db/middleware';
import { readComputerUsage,type ComputerUsageEnv } from '../services/computerUsage';
import { computerUsageReadPage } from '@timeonchrome/app-runtime-contracts/computer-usage';

export async function handleComputerUsage(request:Request,env:ComputerUsageEnv,childId:string):Promise<Response> {
  if(request.method!=='GET')return json({code:'METHOD_NOT_ALLOWED'},405);
  const accountId=await verifyAccountToken(request,env.JWT_SECRET);
  if(!accountId)return json({code:'UNAUTHORIZED'},401);
  const url=new URL(request.url);
  try {
    const expected=url.searchParams.get('revision');
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return json({code:'INVALID_CURSOR'},400);
    const detail=url.searchParams.get('detail')||'summary';
    if(!['summary','timeline','products'].includes(detail)||detail!=='summary'&&!expected||offset>0&&!expected)return json({code:'INVALID_CURSOR'},400);
    const product=url.searchParams.get('product');
    if(expected&&!/^computer-v1:[a-f0-9]{64}$/.test(expected)||product&&detail!=='timeline')return json({code:'INVALID_CURSOR'},400);
    const snapshot=await readComputerUsage(env,accountId,childId,url.searchParams.get('from')||'',url.searchParams.get('to')||'',url.searchParams.get('computer')||undefined);
    if(expected&&expected!==snapshot.revision)return json({code:'COMPUTER_USAGE_VERSION_CHANGED'},409);
    return json(computerUsageReadPage(snapshot,detail as 'summary'|'timeline'|'products',expected||undefined,offset,limit,product||undefined));
  }catch(error){
    const code=error instanceof Error?error.message:'COMPUTER_USAGE_UNAVAILABLE';
    const invalid=['INVALID_RANGE','INVALID_PRODUCT','INVALID_PRODUCT_DETAIL','INVALID_PAGINATION'].includes(code);
    return json({code:invalid||['CHILD_NOT_FOUND','COMPUTER_NOT_FOUND','COMPUTER_USAGE_SOURCE_LIMIT'].includes(code)?code:'COMPUTER_USAGE_UNAVAILABLE'},invalid?400:['CHILD_NOT_FOUND','COMPUTER_NOT_FOUND'].includes(code)?404:503);
  }
}
