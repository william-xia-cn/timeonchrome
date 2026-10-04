const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

test('Rest title summary is unframed, responsive, fixed-period and partial-safe',async({page})=>{
  let html=fs.readFileSync('extension/admin/admin.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  html=html.replace(/src="\.\.\/([^"]+)"/g,(match,file)=>{
    const asset=path.join('extension',file);if(!fs.existsSync(asset))return match;
    return `src="data:${file.endsWith('.svg')?'image/svg+xml':'image/png'};base64,${fs.readFileSync(asset).toString('base64')}"`;
  });
  const source=ts.createSourceFile('admin.js',fs.readFileSync('extension/admin/admin.js','utf8'),ts.ScriptTarget.Latest,true);
  const names=['formatSeconds','renderRestUsageSummary','renderStatsPage'];
  const functions=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
  expect(functions.length).toBe(3);
  await page.setContent(html);
  await page.addScriptTag({content:`
    let restSummaryReadSequence=0,restSummaryDate=null,statsReadSequence=0,applicationStatsReading=false;
    let usageAnalysisLastView=null,config={},usageAnalysisState={ledger:'web',date:null,mode:'day'};
    Date.now=()=>Date.parse('2026-10-04T12:00:00+08:00');
    window.summary={date:'2026-10-04',today:{webSeconds:4200,applicationSeconds:5400,totalSeconds:9600},week:{webSeconds:11400,applicationSeconds:19800,totalSeconds:31200}};
    async function readRestUsageSummary(){return window.summary;}
    async function getAdminUsageAnalysisView(){return {};}
    const getAdminMediaUsageAnalysisView=getAdminUsageAnalysisView,getAdminApplicationUsageAnalysisView=getAdminUsageAnalysisView;
    function renderUsageAnalysisView(){} function setStatsPageError(){} function applicationUsageErrorMessage(){return '未知';}
    ${functions.map(n=>n.getText(source)).join('\n')}
    document.getElementById('login-screen').style.display='none';document.getElementById('main-screen').style.display='block';
    document.getElementById('usage-analysis-sync-label').textContent='原同步状态 · 本机数据';
    window.refreshSummary=renderRestUsageSummary;
    window.switchDetail=async(ledger,date,mode)=>{usageAnalysisState={ledger,date,mode};await renderStatsPage();};
    void renderRestUsageSummary();
  `});
  await expect(page.locator('#usage-rest-today-total')).toHaveText('2小时40分');
  await expect(page.locator('#usage-rest-week-total')).toHaveText('8小时40分');
  await expect(page.locator('#usage-rest-today-parts')).toHaveText('网页1小时10分＋应用1小时30分');
  await expect(page.locator('#usage-rest-week-parts')).toHaveText('网页3小时10分＋应用5小时30分');
  await expect(page.locator('#usage-analysis-sync-label')).toHaveText('原同步状态 · 本机数据');
  expect(await page.locator('.usage-rest-summary').evaluate(n=>n.closest('.card,.usage-analysis-card')===null)).toBe(true);
  for(const ledger of ['web','media','application']){
    await page.evaluate(ledger=>window.switchDetail(ledger,'2026-09-01','week'),ledger);
    await expect(page.locator('#usage-rest-today-total')).toHaveText('2小时40分');
  }
  const directory=fs.mkdtempSync(path.resolve('.tmp/rest-title-summary-'));
  for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});
    const a=await page.locator('.usage-rest-summary-item').nth(0).boundingBox();
    const b=await page.locator('.usage-rest-summary-item').nth(1).boundingBox();
    if(name==='desktop'){
      expect(Math.abs(a.y-b.y)).toBeLessThan(1);
      for(const period of ['today','week']){
        const total=await page.locator(`#usage-rest-${period}-total`).boundingBox();
        const parts=await page.locator(`#usage-rest-${period}-parts`).boundingBox();
        expect(parts.x).toBeGreaterThan(total.x+total.width);
        expect(Math.abs(parts.y-total.y)).toBeLessThan(8);
      }
    }else expect(b.y).toBeGreaterThan(a.y+a.height);
    const typography=await page.locator('#usage-rest-today-parts').evaluate(n=>({size:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight}));
    expect(typography).toEqual({size:'12px',weight:'400'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.evaluate(async()=>{window.summary.week={webSeconds:11400,applicationSeconds:null,totalSeconds:null};await window.refreshSummary();});
  await expect(page.locator('#usage-rest-week-total')).toHaveText('暂不完整');
  await expect(page.locator('#usage-rest-week-parts')).toHaveText('网页3小时10分＋应用未知');
  await expect(page.locator('#usage-rest-today-total')).toHaveText('2小时40分');
  await page.screenshot({path:path.join(directory,'partial-mobile.png'),fullPage:true});
  await page.evaluate(async()=>{Date.now=()=>Date.parse('2026-10-05T00:00:00+08:00');window.summary={date:'2026-10-05',today:{webSeconds:0,applicationSeconds:0,totalSeconds:0},week:{webSeconds:0,applicationSeconds:0,totalSeconds:0}};await window.refreshSummary();});
  await expect(page.locator('#usage-rest-today-total')).toHaveText('0秒');
  await expect(page.locator('#usage-rest-week-total')).toHaveText('0秒');
  console.log('Isolated rest title mock evidence: '+directory);
});
