// 只读本地静态文件＋内存合成配置；绝不连接真实家庭或云端。
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const injection=`<script>
let policy=AppRuntimePolicy.defaultPolicy();
const objects=[{target:{machineId:'fixture-machine',nativeId:'scan-app'},presentations:[{name:'扫描发现的应用',origin:'scan',status:null,evidence:[]}]},
{target:{machineId:'fixture-machine',nativeId:'dynamic-local:editor'},presentations:[{name:'运行发现的编辑器',origin:'runtime',status:'dynamic-process',evidence:['PROCESS_NAME_FALLBACK']}]},
{target:{machineId:'fixture-machine',nativeId:'pwa-app'},presentations:[{name:'同宿主独立应用',origin:'runtime',status:'identified',evidence:['explicit-window-aumid']}]}];
window.__writes=[];
window.__controller=AppRuntimeManagement.mount({root:document,view:'apps',children:[{id:'fixture-child',name:'隔离测试孩子'}],childId:'fixture-child',
request:async(url,options={})=>{
if(url.startsWith('/v2/module/app-policy')){if(options.method==='PUT'){const body=JSON.parse(options.body);window.__writes.push(body);policy={...policy,...body,version:policy.version+1};}return structuredClone(policy);}
if(url.startsWith('/v2/module/applications?'))return {schemaVersion:1,state:'available',childId:'fixture-child',policyVersion:policy.version,items:objects,nextOffset:null};
throw Error('禁止的fixture请求:'+url);
}});window.__controller.ready.then(()=>window.__fixtureReady=true);
</script>`;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://fixture.test').pathname;
 const file=path.resolve(__dirname,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(__dirname+path.sep)){res.writeHead(403).end();return;}
 try{let value=fs.readFileSync(file);
 if(path.basename(file)==='index.html')value=Buffer.from(value.toString().replace('src="app-runtime.js"','data-runtime-component="true" src="app-runtime.js"').replace('</body>',injection+'</body>'));
 const ext=path.extname(file);res.setHeader('content-type',ext==='.js'?'application/javascript':ext==='.css'?'text/css':'text/html; charset=utf-8');res.end(value);
 }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
