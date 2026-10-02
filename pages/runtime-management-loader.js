(() => {
  const base = '/runtime-management-component/';
  const expectedScripts = ['computer-usage-view.js','app-runtime-time.js','app-runtime-network.js','app-runtime-clipboard.js','app-runtime-policy.js','app-runtime-knowledge.js','app-runtime-devices.js','app-runtime.js'];
  const expectedStyles = ['app-runtime.css','app-runtime-v2.css','app-runtime-knowledge.css'];
  let assets;
  const leases=new WeakMap();
  const changed = () => Object.assign(new Error('组件上下文已变化'),{code:'COMPONENT_CONTEXT_CHANGED'});
  async function loadAssets() {
    if (!assets) assets = (async () => {
      const response = await fetch(base+'manifest.json',{cache:'no-cache'});
      if (!response.ok) throw new Error('管理组件资源暂不可用，请重试');
      const manifest = await response.json();
      if (manifest.schemaVersion!==1 || JSON.stringify(manifest.scripts)!==JSON.stringify(expectedScripts) || JSON.stringify(manifest.styles)!==JSON.stringify(expectedStyles) || typeof manifest.template!=='string' || /<script\b|\bon\w+\s*=/i.test(manifest.template)) throw new Error('管理组件资源版本无效');
      for (const file of manifest.scripts) {
        // The main console already owns this identical shared view library.
        if (file==='computer-usage-view.js' && globalThis.ComputerUsageView) continue;
        await new Promise((resolve,reject) => {
          const script=document.createElement('script');
          script.src=base+file;script.dataset.runtimeComponent='true';
          script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('管理组件脚本加载失败'));};
          document.head.appendChild(script);
        });
      }
      return manifest;
    })().catch(error=>{assets=null;throw error;});
    return assets;
  }
  async function mount({host,request,children,childId,view,isCurrent=()=>true}) {
    const lease={};leases.set(host,lease);
    const active=()=>leases.get(host)===lease&&isCurrent();
    const manifest=await loadAssets();
    if (!active()) throw changed();
    const root=host.shadowRoot||host.attachShadow({mode:'open'});
    root.replaceChildren();
    await Promise.all(manifest.styles.map(file=>new Promise((resolve,reject)=>{
      const link=document.createElement('link');link.rel='stylesheet';link.href=base+file;
      link.onload=resolve;link.onerror=()=>reject(new Error('管理组件样式加载失败'));
      root.prepend(link);
    })));
    if(!active()){if(leases.get(host)===lease)root.replaceChildren();throw changed();}
    const template=document.createElement('template');template.innerHTML=manifest.template;root.appendChild(template.content.cloneNode(true));
    const style=document.createElement('style');
    style.textContent=':host{display:block;container-type:inline-size;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;color:#1b2535;--green:#178f6a;--green-dark:#087858;--green-soft:#e8f6f0;--border:#dfe7e3;--muted:#68766f;--shadow:0 8px 28px rgba(31,64,50,.07)}.sidebar,#mobile-menu,#child-select,#runtime-logout,.load-empty-actions a{display:none!important}.app-shell{margin-left:0;min-height:0}.topbar{position:static}.computer-view[hidden],[data-independent-app-usage][hidden]{display:none!important}@container(max-width:1100px){.app-directory-toolbar{grid-template-columns:minmax(0,1fr) 170px}.app-directory-toolbar>span{grid-column:1/-1;text-align:left}}@container(max-width:720px){.app-directory-toolbar{grid-template-columns:minmax(0,1fr)}.app-directory-toolbar>span{grid-column:auto}.app-category-nav{max-width:100%}}';
    root.appendChild(style);
    const controller=globalThis.AppRuntimeManagement.mount({root,request,children,childId,view,isCurrent:active});
    return {ready:controller.ready,refresh:controller.refresh,dispose(){controller.dispose();if(leases.get(host)===lease){leases.delete(host);root.replaceChildren();}}};
  }
  globalThis.RuntimeManagementLoader={mount};
})();
