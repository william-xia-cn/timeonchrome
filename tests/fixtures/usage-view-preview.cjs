// Local-only visual fixture: actual renderers and Runtime page, no authenticated API.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),samples=require('./usage-view-samples');
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>使用页面隔离预览</title><style>body{font:16px system-ui;margin:0;background:#f0faf7}main{max-width:1180px;margin:auto;padding:24px}nav{display:flex;gap:16px;margin:16px 0}a{color:#087d69}</style>
    <main><p>隔离示例 · 非真实家庭数据</p><nav><a href="/?view=application">应用使用</a><a href="/?view=computer">电脑使用</a><a href="/app-runtime-management/console/index.html?mock=1">独立 Runtime</a></nav><div id="view" class="computer-view"></div></main>
    <script src="/app-runtime-management/console/web-usage-buckets.js"></script><script src="/pages/computer-usage-view.js"></script>
    <script>const samples=${JSON.stringify(samples)};const computer=${JSON.stringify(url.searchParams.get('view')==='computer')};
    const fixture=computer?samples.computer:samples.application;
    if(${JSON.stringify(url.searchParams.has('missing'))}){fixture.complete=false;if(!computer)fixture.buckets[3].duration=null;}
    const reader=computer?ComputerUsageView.create(document.querySelector('#view'),async()=>fixture):ComputerUsageView.createIndependent(document.querySelector('#view'),async()=>fixture);
    reader.load();</script>`);
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');
  let text=fs.readFileSync(file,'utf8');
  if(file.endsWith(path.join('console','app-runtime.js'))){
    text=text.replace('if (mock) return;','if(mock){state.usage=AppRuntimeTime.applicationIdentityView('+JSON.stringify(samples.application)+');renderUsage();return;}')
      .replace("if(mock){return window.__computerUsageMock||","if(mock){return "+JSON.stringify(samples.computer)+"||");
  }
  res.end(text);
}).listen(64337,'127.0.0.1',()=>console.log('Isolated usage preview: http://127.0.0.1:64337/'));
