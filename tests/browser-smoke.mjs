// Dependency-free Chrome DevTools Protocol smoke test. Node.js 24+ and Chrome required.
// Starts a loopback server and uses an isolated temporary browser profile.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const until=async(fn,timeout=25000,label='browser state')=>{
 const deadline=Date.now()+timeout;
 let attempts=0,lastError=null;
 while(Date.now()<deadline){
  attempts++;
  try{const result=await fn();if(result)return result;}
  catch(error){lastError=error;}
  await sleep(250);
 }
 const reason=lastError?'last error: '+String(lastError.stack||lastError).slice(0,550):'predicate remained falsy';
 throw Error('Timed out waiting for '+label+' after '+attempts+' attempts ('+timeout+'ms); '+reason);
};
async function verifyWaitUtility(){
 assert.equal(await until(()=>true,100,'ready-control'),true);
 let attempts=0;
 assert.equal(await until(()=>{if(attempts++===0)throw Error('transient probe');return 'ready';},800,'transient-control'),'ready');
 await assert.rejects(until(()=>false,30,'false-state-control'),/false-state-control.*predicate remained falsy/);
 await assert.rejects(until(()=>{throw Error('CDP_SENTINEL');},30,'error-state-control'),/error-state-control.*CDP_SENTINEL/);
 console.log('BROWSER_WAIT_DIAGNOSTIC_CONTROLS PASS');
}
function chromeBinary(){
 if(process.env.CHROME_BIN&&existsSync(process.env.CHROME_BIN))return process.env.CHROME_BIN;
 if(process.platform==='win32'){
  for(const path of [
   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
   'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ])if(existsSync(path))return path;
 }
 for(const name of ['google-chrome','chromium','chromium-browser','msedge']){
  const result=spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8'});
  if(result.status===0)return result.stdout.split(/\r?\n/)[0].trim();
 }
 throw Error('Chrome/Chromium executable not found');
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=resolve(root,'.'+pathname,(pathname.endsWith('/')?'index.html':''));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end();}
});
let profile,chrome,ws;
let serial=0;
const pending=new Map(),exceptions=[];
function cdp(method,params={}){
 const id=++serial;
 return new Promise((resolveCall,rejectCall)=>{
  const timer=setTimeout(()=>{pending.delete(id);rejectCall(Error('CDP timeout '+method));},20000);
  pending.set(id,{resolve:resolveCall,reject:rejectCall,timer});
  ws.send(JSON.stringify({id,method,params}));
 });
}
function evalJS(expression){
 return cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(result=>{
  if(result.exceptionDetails)throw Error('JS expression failed: '+expression+' '+JSON.stringify(result.exceptionDetails).slice(0,300));
  return result.result?.value;
 });
}
async function key(code,key,virtual){
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:virtual});
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:virtual});
}

async function captureTrackFrame(trackId){
 if(!process.env.CYBER_TRACK_CAPTURE_DIR)return;
 // The live track should be visible, rather than a temporary checkpoint/GO banner.
 await until(()=>evalJS("!document.getElementById('message').classList.contains('show')"),7000,trackId+' clear visual frame');
 await sleep(200);
 const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 const file=join(process.env.CYBER_TRACK_CAPTURE_DIR,'track-'+trackId+'.png');
 writeFileSync(file,Buffer.from(shot.data,'base64'));
 console.log('TRACK_VISUAL_CAPTURE '+trackId+' '+file);
}

async function verifyAuxiliaryHudLane(){
 const viewports=[[1280,720],[1024,768],[900,600],[800,600],[768,844],[390,844],[740,360]];
 for(const [width,height] of viewports){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const layout=JSON.parse(await evalJS(`JSON.stringify((()=>{
   const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,visible:s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};};
   const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
   const performance=rect('hud-performance'),escapeHint=rect('esc-hint');
   const blockers=['right-hud','speed-panel','hud','overtake-series','corner-spotter','pilot-tutorial','sector-timing'];
   return {performance,escapeHint,collisions:[performance,escapeHint].flatMap((r,i)=>r.visible?blockers.filter(id=>{
    const b=rect(id);return b.visible&&overlap(r,b);
   }).map(id=>(i?'esc-hint':'hud-performance')+' / '+id):[]),
    twoLabelsOverlap:performance.visible&&escapeHint.visible&&overlap(performance,escapeHint)};
  })())`));
  if(width<=600||height<=460){
   assert.ok(!layout.performance.visible&&!layout.escapeHint.visible,'small viewport hides auxiliary labels '+JSON.stringify(layout));
   continue;
  }
  assert.ok(layout.performance.visible&&layout.escapeHint.visible,'auxiliary text missing at '+width+'x'+height);
  for(const rect of [layout.performance,layout.escapeHint])assert.ok(rect.left>=0&&rect.right<=width&&rect.top>=0&&rect.bottom<=height,
   'auxiliary text clipped at '+width+'x'+height+' '+JSON.stringify(layout));
  assert.deepEqual(layout.collisions,[],'auxiliary HUD collides at '+width+'x'+height+' '+JSON.stringify(layout));
  assert.equal(layout.twoLabelsOverlap,false,'FPS and pause hint collide at '+width+'x'+height);
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 console.log('AUXILIARY_HUD_LANE_PASS seven viewports, visible labels, no overlap with live weapon/timing panels');
}

async function verifyMobileCockpit(){
 await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const viewports=[[390,844],[360,640],[844,390],[740,360],[768,844]];
 const setViewport=async(width,height)=>{
  await cdp('Emulation.setDeviceMetricsOverride',{
   width,height,deviceScaleFactor:2,mobile:true,screenWidth:width,screenHeight:height,
   screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}
  });
  await sleep(150);
 };
 await setViewport(390,844);
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("document.body.classList.contains('game-session-active')&&!document.body.classList.contains('menu-open')"),25000,'mobile race starts');
 await sleep(3400); // Also inspect the live tutorial/sector HUD after countdown.
 await evalJS("document.querySelector('[data-touch=mirror]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:191,pointerType:'touch',bubbles:true}))");
 await until(()=>evalJS("!document.getElementById('rearview-indicator').hidden"),4000,'touch hold rearview');
 await evalJS("document.querySelector('[data-touch=mirror]').dispatchEvent(new PointerEvent('pointerup',{pointerId:191,pointerType:'touch',bubbles:true}))");
 await until(()=>evalJS("document.getElementById('rearview-indicator').hidden"),4000,'touch release rearview');
 console.log('REARVIEW_TOUCH_BROWSER_PASS hold/release on 390px touch emulation');
 for(const [width,height] of viewports){
  await setViewport(width,height);
  const layout=JSON.parse(await evalJS(`JSON.stringify((()=>{
   const ids=['#touch-controls [data-touch]','#minimap-canvas','#speed-panel','#hud','#sector-timing','#pilot-tutorial','#vehicle-status','#right-hud','#race-contract-hud','#overtake-series','#corner-spotter'];
   const buttons=[...document.querySelectorAll('[data-touch]')];
   const rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
   const visible=node=>{const css=getComputedStyle(node);return css.display!=='none'&&css.visibility!=='hidden'&&node.getBoundingClientRect().width>0;};
   const controlRects=buttons.filter(visible).map(b=>({name:b.dataset.touch,...rect(b)}));
   const objects=Object.fromEntries(ids.slice(1).filter(id=>visible(document.querySelector(id))).map(id=>[id,rect(document.querySelector(id))]));
   const touches=matchMedia('(pointer:coarse)').matches;
   const meta=document.querySelector('meta[name=viewport]').content;
   return {touches,meta,innerWidth,innerHeight,buttons:controlRects,objects,navVisible:visible(document.getElementById('touch-controls'))};
  })())`));
  const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
  console.log('MOBILE_COCKPIT_PROBE '+width+'x'+height+' targets='+layout.buttons.length+' minSize='+Math.min(...layout.buttons.map(button=>Math.min(button.width,button.height)))+' coarse='+layout.touches);
  if(process.env.CYBER_MOBILE_CAPTURE_DIR&&((width===390&&height===844)||(width===844&&height===390))){
   const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   writeFileSync(join(process.env.CYBER_MOBILE_CAPTURE_DIR,'mobile-'+width+'x'+height+'.png'),Buffer.from(screenshot.data,'base64'));
  }
  assert.ok(layout.touches&&layout.navVisible,'touch cockpit visible at '+width+'x'+height);
  assert.equal(layout.buttons.length,11,'11 controls including rear glance at '+width+'x'+height);
  for(const button of layout.buttons){
   assert.ok(button.width>=44&&button.height>=44,'touch target smaller than 44px: '+button.name+' at '+width+'x'+height);
   assert.ok(button.left>=-1&&button.right<=width+1&&button.top>=-1&&button.bottom<=height+1,
    'button outside screen '+button.name+' at '+width+'x'+height);
   for(const [id,object] of Object.entries(layout.objects))
    assert.ok(!overlaps(button,object),'touch button '+button.name+' overlaps '+id+' at '+width+'x'+height);
  }
  for(let i=0;i<layout.buttons.length;i++)
   for(let j=i+1;j<layout.buttons.length;j++)
    assert.ok(!overlaps(layout.buttons[i],layout.buttons[j]),'touch targets intersect at '+width+'x'+height);
  const map=layout.objects['#minimap-canvas'],speed=layout.objects['#speed-panel'],hud=layout.objects['#hud'];
  assert.ok(!overlaps(map,speed)&&!overlaps(map,hud)&&!overlaps(speed,hud),'bottom instruments overlap at '+width+'x'+height);
  for(const id of ['#pilot-tutorial','#sector-timing','#overtake-series']){
   if(!layout.objects[id])continue;
   for(const [otherId,other] of Object.entries(layout.objects)){
    if(id===otherId)continue;
    assert.ok(!overlaps(layout.objects[id],other),id+' overlaps '+otherId+' at '+width+'x'+height);
   }
  }
  assert.ok(layout.meta.includes('viewport-fit=cover'),'safe-area viewport configuration absent');
 }
 await setViewport(740,360);
 const optional=JSON.parse(await evalJS(`JSON.stringify((()=>{
  const panel=document.getElementById('overtake-series'),notice=document.getElementById('overtake-event');
  const wasPanelHidden=panel.hidden,wasNoticeHidden=notice.hidden,oldText=notice.textContent;
  panel.hidden=false;notice.hidden=false;notice.textContent='ЧИСТЫЙ ОБГОН +20';
  const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  const result={overtake:box(panel),sector:box(document.getElementById('sector-timing')),
   laps:box(document.getElementById('hud')),tutorial:box(document.getElementById('pilot-tutorial'))};
  panel.hidden=wasPanelHidden;notice.hidden=wasNoticeHidden;notice.textContent=oldText;
  return result;
 })())`));
 const collides=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
 for(const name of ['sector','laps','tutorial'])assert.ok(!collides(optional.overtake,optional[name]),'expanded overtake popup overlaps '+name+' at 740x360: '+JSON.stringify(optional));
 console.log('MOBILE_OPTIONAL_HUD_PASS '+JSON.stringify(optional));
 await setViewport(390,844);
 const down=(action,id)=>evalJS(`document.querySelector('[data-touch="${action}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:${id},pointerType:'touch',isPrimary:true}))`);
 const end=(action,id,type='pointerup')=>evalJS(`document.querySelector('[data-touch="${action}"]').dispatchEvent(new PointerEvent('${type}',{bubbles:true,pointerId:${id},pointerType:'touch',isPrimary:true}))`);
 await down('forward',101);await down('left',102);
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'true');
 assert.equal(await evalJS("document.querySelector('[data-touch=left]').dataset.active"),'true');
 await end('forward',101,'pointercancel');
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'false');
 await end('left',102);
 await down('gun',103);await down('gun',104);await end('gun',103);
 assert.equal(await evalJS("document.querySelector('[data-touch=gun]').dataset.active"),'true','second pointer continues firing');
 await end('gun',104);
 assert.equal(await evalJS("document.querySelector('[data-touch=gun]').dataset.active"),'false');
 await down('forward',105);
 await setViewport(390,800); // Browser toolbar height changes must not drop the held gas.
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'true','same-orientation resize must preserve touch');
 await setViewport(844,390);
 assert.notEqual(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'true','rotation must cancel stale touch');
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),undefined);
 await down('pause',106);
 assert.ok(await evalJS("document.body.classList.contains('menu-open')"),'pause button works after rotation');
 assert.ok(await evalJS("!document.querySelector('#touch-controls').getClientRects().length"),'buttons hidden during pause');
 await sleep(350); // Existing menu interaction lock must expire before Resume.
 await evalJS("document.getElementById('resume-btn').click()");
 await until(()=>evalJS("!document.body.classList.contains('menu-open')"),5000,'resume after mobile pause');
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),undefined,'old touch must not resume driving');
 await down('forward',107);
 assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'true','controls work after pause/resume');
 await end('forward',107);
 assert.equal(exceptions.length,0,'mobile JS exceptions: '+exceptions.join(' | '));
 console.log('MOBILE_COCKPIT_PASS five viewports, safe area, 44px, nonoverlap, multitouch/cancel/rotate/pause');
}
async function verifyPersistentGhostBrowser(){
 const saved=JSON.parse(await evalJS("JSON.stringify((()=>{const g=CyberRace.game.createLapGhostTracker();g.beginLap(1,{x:0,z:0,heading:0});for(let i=1;i<=180;i++)g.record({lap:1,elapsed:i*.1,x:i*.2,z:i*.05,heading:0});const valid=g.completeLap({lap:1,elapsed:18.1,x:38,z:9,heading:0,valid:true});const outcome=CyberRace.game.createLapGhostStore(localStorage).put('valley','universal:0-0-0',g.exportBest());return {valid,...outcome};})())"));
 assert.deepEqual(saved,{valid:true,improved:true,persisted:true},'synthetic valid ghost stored in the real browser');
 await cdp('Page.enable');
 const before=await evalJS('performance.timeOrigin');
 await cdp('Page.reload',{ignoreCache:true});
 await until(()=>evalJS("performance.timeOrigin>"+before+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000,'ghost reload boot');
 const stored=JSON.parse(await evalJS("JSON.stringify((()=>{const s=CyberRace.game.createLapGhostStore(localStorage),t=s.get('valley','universal:0-0-0');return {time:t?.time,frames:t?.frames.length,wrongRoute:s.get('city','universal:0-0-0')};})())"));
 assert.equal(stored.time,18.1);assert.equal(stored.frames,182);assert.equal(stored.wrongRoute,null);
 await evalJS("document.querySelector('input[name=single-race-mode][value=blitz]').click()");
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("!document.getElementById('lap-ghost-badge').hidden"),12000,'stored ghost visible after blitz countdown');
 assert.match(await evalJS("document.getElementById('lap-ghost-badge').textContent"),/18\.1 с/);
 // This synthetic trace does not match the real road; no fabricated pace delta.
 assert.equal(await evalJS("document.getElementById('lap-ghost-pace').textContent"),'');
 const comparison=JSON.parse(await evalJS("JSON.stringify((()=>{const trace=CyberRace.game.createLapGhostStore(localStorage).get('valley','universal:0-0-0');const tracker=CyberRace.game.createLapGhostTracker();tracker.importBest(trace);return {behind:tracker.paceAt({elapsed:12,x:20,z:5,heading:0}),ahead:tracker.paceAt({elapsed:8,x:20,z:5,heading:0}),far:tracker.paceAt({elapsed:12,x:900,z:900,heading:0})};})())"));
 assert.deepEqual(comparison,{behind:2,ahead:-2,far:null},'Chrome browser pace API against persisted trace');
 const layout=JSON.parse(await evalJS("JSON.stringify((()=>{const r=document.getElementById('lap-ghost-badge').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,width:innerWidth,height:innerHeight};})())"));
 assert.ok(layout.left>=0&&layout.right<=layout.width,'ghost badge fits viewport');
 if(process.env.CYBER_GHOST_CAPTURE_DIR){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const file=join(process.env.CYBER_GHOST_CAPTURE_DIR,'ghost-persistent-blitz.png');
  writeFileSync(file,Buffer.from(shot.data,'base64'));console.log('GHOST_BROWSER_CAPTURE '+file);
 }
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000,'ghost paused');
 await until(()=>evalJS("document.getElementById('lap-ghost-badge').hidden"),5000,'ghost badge hidden on pause');
 await evalJS("document.getElementById('resume-btn').click()");
 await until(()=>evalJS("!document.getElementById('lap-ghost-badge').hidden"),5000,'ghost badge after resume');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 assert.equal(await evalJS("getComputedStyle(document.getElementById('lap-ghost-badge')).display"),'none','ghost badge clears mobile narrow HUD');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await key('KeyR','r',82);
 await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'ghost restart confirmation');
 await evalJS("document.getElementById('restart-confirm-accept').click()");
 await until(()=>evalJS("!document.getElementById('lap-ghost-badge').hidden"),12000,'ghost visible again after restart');
 assert.equal(exceptions.length,0,'no JavaScript exceptions during persisted ghost browser test');
 console.log('PERSISTENT_GHOST_BROWSER_PASS synthetic trace persisted/reloaded, actual Blitz UI, pause/resume/restart, narrow viewport, 0 JS exceptions');
}
async function run(){
 await verifyWaitUtility();
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const address='http://127.0.0.1:'+server.address().port+'/';
 profile=await mkdtemp(join(tmpdir(),'cyber-race-qa-'));
 chrome=spawn(chromeBinary(),[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,address
 ],{stdio:'ignore'});
 const debugPort=await until(()=>{
  const f=join(profile,'DevToolsActivePort');
  return existsSync(f)?Number(readFileSync(f,'utf8').split(/\r?\n/)[0]):null;
 },15000);
 const page=await until(async()=>{
  const list=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  return list.find(item=>item.type==='page'&&item.url.startsWith(address));
 },15000);
 ws=new WebSocket(page.webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{
  const packet=JSON.parse(event.data);
  if(packet.method==='Runtime.exceptionThrown'){const error=packet.params?.exceptionDetails;exceptions.push(error?.exception?.description||error?.text||'runtime exception');}
  if(packet.id&&pending.has(packet.id)){
   const item=pending.get(packet.id);clearTimeout(item.timer);pending.delete(packet.id);
   packet.error?item.reject(Error(JSON.stringify(packet.error))):item.resolve(packet.result||{});
  }
 });
 await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true});});
 await cdp('Runtime.enable');await cdp('Network.enable');
 const version=(await cdp('Browser.getVersion')).product;
 try{await until(()=>evalJS("document.documentElement.dataset.cyberBoot==='ready'"),35000,'initial browser boot');}
 catch(error){
  console.error('BOOT_DIAG '+await evalJS("JSON.stringify({status:document.documentElement.dataset.cyberBoot||'unset',message:document.getElementById('menu-status')?.textContent,loaded:document.readyState,scripts:document.scripts.length})"));
  console.error('BOOT_JS_EXCEPTIONS '+JSON.stringify(exceptions));
  throw error;
 }
 console.log('BROWSER_BOOT PASS',version);
 if(process.argv.includes('--ghost')){await verifyPersistentGhostBrowser();return;}
 if(process.argv.includes('--mobile')){await verifyMobileCockpit();return;}
 if(process.argv.includes('--road')){
  // Real Three.js geometry and shader test for the three routes, isolated from live gameplay.
  const roadRows=JSON.parse(await evalJS(`(async()=>{
   const THREE=await CyberRace.core.loadThree(),CONFIG={...CyberRace.game.CONFIG,NUM_SAMPLES:180,LAMP_COUNT:20,ENVIRONMENT_ATTEMPTS:180};
   const renderer=new THREE.WebGLRenderer({antialias:false});
   renderer.setSize(96,96,false);
   const camera=new THREE.PerspectiveCamera(110,1,0.1,8000);
   camera.position.set(0,1300,0);camera.lookAt(0,0,0);
   const rows=[];
   for(const trackId of ['valley','city','industrial']){
    const world=new THREE.Group(),track=CyberRace.game.createTrackEnvironment({THREE,scene:world,document,CONFIG,trackId});
    const main=world.getObjectByName('road-center-dashes');
    const glow=world.getObjectByName('road-center-glow');
    const reflectors=world.getObjectByName('road-edge-reflectors');
    const visual=world.children.find(node=>node.userData?.trackId===trackId);
    const signs=new Set();
    let flagCount=0,flagsDoubleSided=true,batchesFrontSided=true;
    visual?.traverse(node=>{
      if(node.material?.name?.startsWith('track-sign-'))signs.add(node.material.name);
      if(node.name?.startsWith('roadside-flag-')){
        flagCount++;
        if(node.material?.side!==THREE.DoubleSide)flagsDoubleSided=false;
      }
      if(node.isInstancedMesh&&node.material?.side!==THREE.FrontSide)batchesFrontSided=false;
    });
    const row={trackId,themeGroup:visual?.name,markerCount:visual?.userData.visualMarkers,
      signNames:[...signs],flagCount,flagsDoubleSided,batchesFrontSided,
      main:main?.isInstancedMesh===true,glow:glow?.isInstancedMesh===true,
      reflectors:reflectors?.isInstancedMesh===true,mainCount:main?.count,
      reflectorsCount:reflectors?.count,sharedGeometry:main?.geometry===glow?.geometry&&main?.geometry===reflectors?.geometry};
    if(main&&glow&&reflectors){
     const probe=new THREE.Object3D(),actual=new THREE.Matrix4();
     row.sameLegacyTransforms=[0,Math.floor((main.count-1)/2),main.count-1].every(index=>{
      const sampleIndex=index*9,point=track.samples[sampleIndex],tangent=track.tangents[sampleIndex];
      probe.position.set(point.x,0.06,point.z);
      probe.rotation.set(-Math.PI/2,0,Math.atan2(tangent.x,tangent.z));
      probe.scale.set(0.6,4,1);probe.updateMatrix();main.getMatrixAt(index,actual);
      return actual.elements.every((value,i)=>Math.abs(value-probe.matrix.elements[i])<0.0002);
     });
     track.scenery.setQuality('low');row.lowVisibility=!glow.visible&&main.visible&&reflectors.visible;
     track.scenery.setQuality('high');row.highVisibility=glow.visible&&main.visible&&reflectors.visible;
     const preview=new THREE.Scene(),copies=[main.clone(),glow.clone(),reflectors.clone()];
     copies.forEach(mesh=>{mesh.frustumCulled=false;preview.add(mesh);});
     renderer.render(preview,camera);row.highCalls=renderer.info.render.calls;
     copies[1].visible=false;renderer.render(preview,camera);row.lowCalls=renderer.info.render.calls;
     row.gpuGeometriesDuring=renderer.info.memory.geometries;
     copies.forEach(mesh=>mesh.dispose());preview.clear();
    }
    const geometries=new Set(),materials=new Set(),textures=new Set();
    world.traverse(object=>{
     if(object.geometry)geometries.add(object.geometry);
     for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
     }
     if(object.isInstancedMesh)object.dispose();
    });
    textures.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());geometries.forEach(v=>v.dispose());world.clear();
    row.gpuGeometriesAfter=renderer.info.memory.geometries;
    rows.push(row);
   }
   renderer.dispose();
   return JSON.stringify(rows);
  })()`));
  for(const row of roadRows){
   assert.ok(row.main&&row.glow&&row.reflectors,'instanced road meshes: '+JSON.stringify(row));
   assert.equal(row.mainCount,20,'one dash every 9 samples');
   assert.equal(row.reflectorsCount,16,'two edge reflectors every 24 samples');
   assert.ok(row.sharedGeometry&&row.sameLegacyTransforms,'reuse and old pose: '+JSON.stringify(row));
   assert.ok(row.lowVisibility&&row.highVisibility,'quality switch: '+JSON.stringify(row));
   assert.equal(row.themeGroup,{valley:'neon-valley',city:'neon-quarter',industrial:'steel-express'}[row.trackId]);
   assert.ok(row.signNames.length>=1&&row.signNames.every(name=>name.startsWith('track-sign-'+row.trackId+'-')),
     'track-specific signs: '+JSON.stringify(row));
   assert.equal(row.markerCount===0,row.trackId==='valley','decorative marker ownership: '+JSON.stringify(row));
   assert.ok(row.flagsDoubleSided&&row.batchesFrontSided,
     'flag clones must not turn batched materials double-sided: '+JSON.stringify(row));
   assert.equal(row.highCalls,3,'three batched road draw calls at high quality');
   assert.equal(row.lowCalls,2,'two batched road draw calls at low quality');
   assert.equal(row.gpuGeometriesDuring,1,'shared road geometry is uploaded once');
   assert.equal(row.gpuGeometriesAfter,0,'GPU geometry is freed on scene teardown');
  }
  assert.equal(await evalJS("document.querySelectorAll('canvas').length"),4,'preview must not add persistent DOM canvases');
  console.log('ROAD_INSTANCING_BROWSER_PASS '+JSON.stringify(roadRows));
 }
 const ghostSwitches=JSON.parse(await evalJS("JSON.stringify([...document.querySelectorAll('[data-setting=lapGhost]')].map(e=>({checked:e.checked,role:e.getAttribute('role')})))"));
 assert.equal(ghostSwitches.length,2,'start/pause ghost controls exist');
 assert.ok(ghostSwitches.every(v=>v.checked&&v.role==='switch'),'old settings enable ghost by default');
 await evalJS("document.querySelector('#start-screen [data-setting=lapGhost]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).lapGhost"),false);
 assert.ok(JSON.parse(await evalJS("JSON.stringify([...document.querySelectorAll('[data-setting=lapGhost]')].map(e=>e.checked))")).every(v=>!v));
 await evalJS("document.querySelector('#start-screen [data-setting=lapGhost]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).lapGhost"),true);
 const ghostNative=JSON.parse(await evalJS(`(async()=>{
   const THREE=await CyberRace.core.loadThree(),scene=new THREE.Scene();
   const visual=CyberRace.game.createLapGhostVisual({THREE,scene});
   const children=visual.group.children.length;
   const ownedMaterials=visual.group.children.every(node=>node.material?.transparent&&node.material?.depthWrite===false);
   visual.update({x:12,z:14,heading:1.3},{quality:'high'});
   const visible=visual.group.visible&&visual.group.position.x===12;
   visual.update({x:3,z:4,heading:0.2},{quality:'low'});
   const lowDetailsHidden=visual.group.children.filter(node=>node.renderOrder===2).every(node=>!node.visible);
   visual.update(null,{enabled:true});
   const emptyHidden=!visual.group.visible;
   visual.dispose();
   return JSON.stringify({children,ownedMaterials,visible,lowDetailsHidden,emptyHidden,cleaned:scene.children.length===0});
 })()`));
 assert.ok(ghostNative.children>=7&&ghostNative.ownedMaterials&&ghostNative.visible&&
   ghostNative.lowDetailsHidden&&ghostNative.emptyHidden&&ghostNative.cleaned,
   'native Three.js ghost lifecycle: '+JSON.stringify(ghostNative));
 console.log('LAP_GHOST_BROWSER_PASS settings synced and stored, real Three.js materials and quality lifecycle');
 const tutorialSwitches=JSON.parse(await evalJS("JSON.stringify([...document.querySelectorAll('[data-setting=tutorialEnabled]')].map(e=>({checked:e.checked,role:e.getAttribute('role')})))"));
 assert.equal(tutorialSwitches.length,2,'pilot hint switch present in start and pause');
 assert.ok(tutorialSwitches.every(row=>row.checked&&row.role==='switch'),'legacy saves default to active tutorial');
 assert.equal(await evalJS("document.querySelectorAll('[data-pilot-replay]').length"),2);
 await evalJS("document.querySelector('#start-screen [data-setting=tutorialEnabled]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).tutorialEnabled"),false);
 assert.equal(await evalJS("document.querySelector('#pause-menu [data-setting=tutorialEnabled]').checked"),false);
 await evalJS("document.querySelector('#start-screen [data-setting=tutorialEnabled]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).tutorialEnabled"),true);
 console.log('PILOT_TUTORIAL_SETTINGS_PASS legacy defaults, both synced switches, saved toggle');
 assert.equal(await evalJS("typeof CyberRace.game.createCornerSpotter"),'function','corner planner loaded');
 assert.equal(await evalJS("document.querySelectorAll('[data-setting=cornerSpotter]').length"),2);
 assert.equal(await evalJS("[...document.querySelectorAll('[data-setting=cornerSpotter]')].every(x=>x.checked)"),true,'legacy settings enable spotter');
 await evalJS("document.querySelector('#start-screen [data-setting=cornerSpotter]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).cornerSpotter"),false);
 assert.equal(await evalJS("document.querySelector('#pause-menu [data-setting=cornerSpotter]').checked"),false);
 await evalJS("document.querySelector('#start-screen [data-setting=cornerSpotter]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).cornerSpotter"),true);
 console.log('CORNER_SETTINGS_BROWSER_PASS old saves, dual synced switches and persistence');

 // Presentation fixture: simultaneous real-browser HUD geometry, not a claim of a live turn.
 for(const [width,height] of [[360,844],[390,844],[768,844],[1280,844],[800,600],[390,640],[360,460]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const layout=JSON.parse(await evalJS(`JSON.stringify((()=>{
   const spot=document.getElementById('corner-spotter'),series=document.getElementById('overtake-series'),
     sector=document.getElementById('sector-timing');
   spot.hidden=false;series.hidden=false;sector.hidden=false;
   spot.dataset.severity='sharp';document.getElementById('corner-title').textContent='КРУТОЙ ПОВОРОТ НАПРАВО';
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();
     return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
   const intersects=(a,b)=>a.left<b.right-2&&a.right>b.left+2&&a.top<b.bottom-2&&a.bottom>b.top+2;
   const r=rect('corner-spotter'),ids=['vehicle-status','right-hud','overtake-series','sector-timing','hud','speed-panel','minimap-canvas'];
   const visible=getComputedStyle(spot).display!=='none';
   const collisions=visible?ids.filter(id=>intersects(r,rect(id))):[];
   const clipped=document.getElementById('corner-title').scrollWidth>document.getElementById('corner-title').clientWidth;
   spot.hidden=true;series.hidden=true;sector.hidden=true;
   return {visible,r,collisions,clipped};
  })())`));
  if(layout.visible){
   assert.ok(layout.r.left>=0&&layout.r.right<=width&&layout.r.top>=0&&layout.r.bottom<=height,
     'corner UI outside '+width+'x'+height+': '+JSON.stringify(layout));
   assert.deepEqual(layout.collisions,[],'corner UI overlaps HUD at '+width+'x'+height+': '+JSON.stringify(layout));
   assert.ok(!layout.clipped,'corner title clipped at '+width+'x'+height);
  }
 }
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evalJS("getComputedStyle(document.getElementById('corner-progress')).transitionDuration"),'0s');
 await cdp('Emulation.setEmulatedMedia',{features:[]});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:844,deviceScaleFactor:1,mobile:false});
 console.log('CORNER_HUD_BROWSER_LAYOUT_PASS seven viewports, simultaneous HUD and reduced motion');

 for(const width of [360,390,768,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
  const dimensions=JSON.parse(await evalJS('JSON.stringify({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})'));
  assert.ok(dimensions.scroll<=dimensions.client,'horizontal scrolling in start screen at '+width+'px: '+JSON.stringify(dimensions));
  const modes=JSON.parse(await evalJS(`JSON.stringify((()=>{
    const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};
    return [...document.querySelectorAll('.single-race-options label > span')].map(box);
  })())`));
  assert.equal(modes.length,3,'all race formats visible at '+width+'px');
  assert.ok(modes.every(r=>r.width>=70&&r.height>=44&&r.left>=0&&r.right<=width),
    'mode controls clipped or too small at '+width+'px: '+JSON.stringify(modes));
  assert.ok(modes.every((r,i)=>!i||modes[i-1].right<r.left),
    'mode controls overlap at '+width+'px: '+JSON.stringify(modes));
 }
 console.log('RESPONSIVE_START PASS 360/390/768/1280, three mode controls in bounds');

 // Presentation-only fixture: geometry at real browser sizes, not a claim
 // that a live overtake happened. Gameplay ownership is tested separately.
 for(const [width,height] of [[360,844],[390,844],[768,844],[1280,844],[800,600],[390,640],[360,460]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await evalJS("(()=>{const c=document.getElementById('overtake-series');c.hidden=false;const n=document.getElementById('overtake-event');n.hidden=false;n.textContent='⚡ РИСКОВАННЫЙ ОБГОН +50 · РИСК +20';return true})()");
  const bounds=JSON.parse(await evalJS("JSON.stringify((()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return {series:rect('overtake-series'),hud:rect('right-hud'),speed:rect('speed-panel')}})())"));
  assert.ok(bounds.series.left>=0&&bounds.series.right<=width+1,'overtake HUD horizontal overflow at '+width+' '+JSON.stringify(bounds));
  assert.ok(bounds.series.top>=bounds.hud.bottom+6,'overtake HUD overlaps weapon panel at '+width+'x'+height+' '+JSON.stringify(bounds));
  assert.ok(bounds.series.bottom<=height,'overtake HUD vertical overflow at '+width+'x'+height+' '+JSON.stringify(bounds));
  assert.ok(bounds.series.bottom<=bounds.speed.top||bounds.series.left>=bounds.speed.right,
    'overtake HUD overlaps speedometer at '+width+' '+JSON.stringify(bounds));
  await evalJS("(()=>{document.getElementById('overtake-series').hidden=true;document.getElementById('overtake-event').hidden=true;return true})()");
 }
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evalJS("getComputedStyle(document.getElementById('overtake-bar')).transitionDuration"),'0s','series timer must honor reduced motion');
 await cdp('Emulation.setEmulatedMedia',{features:[]});
 // Keep the established smoke viewport after the extra narrow-screen checks.
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:844,deviceScaleFactor:1,mobile:false});
 console.log('OVERTAKE_HUD_LAYOUT_PASS 360/390/768/1280 + 800x600/390x640/360x460, no collisions; reduced motion');

 // Presentation fixture only: real Chrome layout for simultaneous split,
 // contract and overtake panels. Actual timing is exercised in Node contracts.
 assert.equal(await evalJS('typeof CyberRace.game.createSectorTimer'),'function','sector API loaded before runtime');
 for(const [width,height] of [[360,844],[390,844],[768,844],[1280,844],[800,600],[390,640],[360,460]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await evalJS(`(()=>{
    const sector=document.getElementById('sector-timing'),contract=document.getElementById('race-contract-hud');
    sector.hidden=false;sector.dataset.tone='slower';
    document.getElementById('sector-current').textContent='СЕКТОР 3/3';
    document.getElementById('sector-delta').textContent='+12,34 с';
    document.getElementById('sector-detail').textContent='СЕКТОР 2 · МЕДЛЕННЕЕ';
    contract.hidden=false;
    document.getElementById('race-contract-progress').textContent='ЦЕЛЬ ВЫПОЛНЕНА · ФИНИШИРУЙТЕ';
    document.getElementById('race-contract-notice').textContent='Контракт выполнен! Награда после финиша.';
    document.getElementById('overtake-series').hidden=false;
   })()`);
  const bounds=JSON.parse(await evalJS(`JSON.stringify((()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    const s=rect('sector-timing'),d=document.getElementById('sector-delta');
    const intersects=(a,b)=>a.left<b.right-2&&a.right>b.left+2&&a.top<b.bottom-2&&a.bottom>b.top+2;
    const other=['hud','right-hud','vehicle-status','race-contract-hud','overtake-series','speed-panel','minimap-canvas'];
    return {sector:s,collisions:other.filter(id=>intersects(s,rect(id))),
      overflow:d.scrollWidth>d.clientWidth,detailOverflow:document.getElementById('sector-detail').scrollWidth>document.getElementById('sector-detail').clientWidth};
   })())`));
  assert.ok(bounds.sector.left>=0&&bounds.sector.right<=width+1&&bounds.sector.top>=0&&bounds.sector.bottom<=height+1,
    'sector HUD overflow '+width+'x'+height+' '+JSON.stringify(bounds));
  assert.deepEqual(bounds.collisions,[],'sector HUD overlaps panels '+width+'x'+height+' '+JSON.stringify(bounds));
  assert.ok(!bounds.overflow&&!bounds.detailOverflow,'sector labels overflow '+width+'x'+height+' '+JSON.stringify(bounds));
  await evalJS(`(()=>{
    document.getElementById('sector-timing').hidden=true;
    document.getElementById('race-contract-hud').hidden=true;
    document.getElementById('overtake-series').hidden=true;
    document.getElementById('race-contract-notice').textContent='';
   })()`);
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:844,deviceScaleFactor:1,mobile:false});
 console.log('SECTOR_HUD_BROWSER_LAYOUT_PASS 7 viewports, concurrent panels, readable deltas');

 // Prove a failed optional asset can recover on the same page after the network returns.
 await cdp('Network.setBlockedURLs',{urls:['*assets/garage/cars.js*']});
 await evalJS("document.getElementById('garage-btn').click()");
 await until(()=>evalJS("document.getElementById('garage-preview').dataset.ready==='false'"),15000);
 await evalJS("document.getElementById('garage-close').click()");
 await until(()=>evalJS("!document.getElementById('garage-dialog').open"),5000);
 await cdp('Network.setBlockedURLs',{urls:[]});
 await sleep(400); // allow the dialog close event to finish before reopening
 await evalJS("document.getElementById('garage-btn').click()");
 await until(()=>evalJS("document.getElementById('garage-preview').dataset.ready==='true'"),20000);
 const recovered=JSON.parse(await evalJS("JSON.stringify({classId:document.getElementById('garage-preview').dataset.classId,view:document.getElementById('garage-preview').dataset.view})"));
 assert.equal(recovered.classId,'universal');
 await evalJS("document.querySelector('[data-garage-view=\"side\"]').click()");
 await until(()=>evalJS("document.getElementById('garage-preview').dataset.view==='side'"),8000);
 await evalJS("document.getElementById('garage-close').click()");
 console.log('GARAGE_RECOVERY_AND_VIEW PASS');
 await sleep(300); // wait for the dialog close event/input guard before reopening

 // A same-origin iframe is a separate document: its localStorage writes emit
 // the real cross-document storage event in the running game (isolated profile).
 await evalJS("document.getElementById('garage-btn').click()");
 await until(()=>evalJS("document.getElementById('garage-dialog').open"),5000);
 await evalJS(`(()=>{
  const frame=document.createElement('iframe');frame.id='qa-other-storage-document';frame.hidden=true;document.body.append(frame);
  const s=frame.contentWindow.localStorage;
  if(s.getItem('cyberRaceTuning')!==null)throw Error('Expected isolated fresh tuning');
  s.setItem('cyberRaceTuning',JSON.stringify({wallet:500,levels:{
   universal:{engine:1,tires:1,armor:0},interceptor:{engine:0,tires:0,armor:0},armored:{engine:0,tires:0,armor:0}
  }}));
 })()`);
 await until(()=>evalJS("document.getElementById('garage-credits').textContent.includes('500')"),6000,'external garage balance refresh');
 assert.equal(await evalJS("document.querySelector('[data-upgrade=engine] .garage-upgrade-level').textContent.includes('1 / 3')"),true);
 assert.equal(await evalJS("document.getElementById('garage-purchase-status').textContent.includes('другой вкладки')"),true);
 await evalJS("document.querySelector('[data-buy-upgrade=armor]').click()");
 await until(()=>evalJS("document.getElementById('garage-credits').textContent.includes('150')"),6000,'purchase on refreshed wallet');
 assert.equal(await evalJS("JSON.parse(document.getElementById('qa-other-storage-document').contentWindow.localStorage.getItem('cyberRaceTuning')).levels.universal.engine"),1);
 assert.equal(await evalJS("JSON.parse(document.getElementById('qa-other-storage-document').contentWindow.localStorage.getItem('cyberRaceTuning')).wallet"),150);
 await evalJS("document.getElementById('qa-other-storage-document').contentWindow.localStorage.removeItem('cyberRaceTuning')");
 await until(()=>evalJS("document.getElementById('garage-credits').textContent.includes('1200')"),6000,'external tuning reset');
 await evalJS("document.getElementById('garage-close').click();document.getElementById('qa-other-storage-document').remove()");
 console.log('GARAGE_CROSS_DOCUMENT_SYNC PASS external event, balance, levels, purchase and isolated cleanup');

 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 const initialCanvases=await evalJS("document.querySelectorAll('canvas').length");
 await sleep(350);
 await evalJS("document.querySelector('input[name=race-contract][value=hunter]').click()");
 assert.equal(await evalJS("document.querySelector('input[name=race-contract]:checked').value"),'hunter');
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("document.getElementById('start-screen').classList.contains('hidden')"),10000);
 try{await until(()=>evalJS("!document.getElementById('sector-timing').hidden"),25000,'initial race countdown');}
 catch(error){
  console.error('INITIAL_RACE_DIAG',await evalJS("JSON.stringify({boot:document.documentElement.dataset.cyberBoot,gameActive:document.body.classList.contains('game-session-active'),pause:document.getElementById('pause-menu').classList.contains('open'),message:document.getElementById('message').textContent,clock:document.getElementById('curr-time').textContent,sector:document.getElementById('sector-timing').hidden,rear:document.getElementById('rearview-indicator')?.hidden})"),exceptions.slice(0,3));
  throw error;
 }
 await until(()=>evalJS("!document.getElementById('race-contract-hud').hidden"),7000,'active contract HUD');
 assert.equal(await evalJS("document.getElementById('race-contract-title').textContent"),'Охотник');
 assert.equal(await evalJS("document.getElementById('race-contract-progress').textContent"),'0/2');
 await until(()=>evalJS("!document.getElementById('pilot-tutorial').hidden && document.getElementById('pilot-tutorial-heading').textContent.includes('1/3')"),7000,'pilot first active hint');
 for(const [width,height] of [[360,844],[390,844],[768,844],[1280,720],[800,600],[390,640],[360,460]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const geometry=JSON.parse(await evalJS(`JSON.stringify((()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
    const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    const main=rect('pilot-tutorial'),other=['vehicle-status','race-contract-hud','sector-timing','right-hud','minimap-canvas','speed-panel','hud'];
    return {main,collisions:other.filter(id=>!document.getElementById(id).hidden&&overlaps(main,rect(id))),
      titleOverflow:document.getElementById('pilot-tutorial-title').scrollWidth>document.getElementById('pilot-tutorial-title').clientWidth,
      skipRect:rect('pilot-tutorial-skip')};
  })())`));
  assert.ok(geometry.main.left>=0&&geometry.main.right<=width&&geometry.main.top>=0&&geometry.main.bottom<=height,
    'pilot panel must fit '+width+'x'+height+' '+JSON.stringify(geometry));
  assert.deepEqual(geometry.collisions,[],'pilot HUD overlaps controls at '+width+'x'+height+' '+JSON.stringify(geometry));
  assert.ok(!geometry.titleOverflow,'pilot title clipped at '+width+'x'+height);
  assert.ok(geometry.skipRect.right<=width&&geometry.skipRect.bottom<=height,'pilot skip is not reachable '+width+'x'+height);
 }
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evalJS("getComputedStyle(document.getElementById('pilot-tutorial')).transitionDuration"),'0s');
 await cdp('Emulation.setEmulatedMedia',{features:[]});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 console.log('PILOT_TUTORIAL_LAYOUT_PASS seven viewports, nonoverlap, reduced motion');
 await verifyAuxiliaryHudLane();
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
 await until(()=>evalJS("document.getElementById('pilot-tutorial-heading').textContent.includes('2/3')"),13000,'real pilot drive action');
 await until(()=>evalJS("!document.getElementById('corner-spotter').hidden"),10000,'live corner warning while driving');
 assert.ok(await evalJS("/ПОВОРОТ/.test(document.getElementById('corner-title').textContent)"),'corner warning carries text');
 console.log('CORNER_REAL_DRIVE_BROWSER_PASS actual track, positive speed, visible directional warning');
 if(process.env.CYBER_ROAD_SCREENSHOT){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(process.env.CYBER_ROAD_SCREENSHOT,Buffer.from(shot.data,'base64'));
  console.log('ROAD_VISUAL_CAPTURE '+process.env.CYBER_ROAD_SCREENSHOT);
 }
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:550,y:380,button:'left',clickCount:1});
 await until(()=>evalJS("document.getElementById('pilot-tutorial-heading').textContent.includes('3/3')"),6000,'real gun firing completes pilot step');
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:550,y:380,button:'left',clickCount:1});
 await key('Space',' ',32);
 await until(()=>evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings'))?.tutorialDone===true"),6000,'real nitro completes pilot tutorial');
 console.log('PILOT_TUTORIAL_LIVE_PASS W with speed, real gun fire, successful nitro, persisted completion');
 const speed=await evalJS("document.getElementById('speed-val').textContent");
 const fps=await evalJS("document.getElementById('fps-counter').textContent");
 await until(()=>evalJS("!document.getElementById('rival-gap').hidden && /(?:м|км)/.test(document.getElementById('rival-gap-value').textContent)"),6000,'rival gap visible during race');
 for(const width of [360,390,768,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===1280?720:844,deviceScaleFactor:1,mobile:false});
  const gapLayout=JSON.parse(await evalJS(`JSON.stringify((()=>{
   const gap=document.getElementById('rival-gap'),panel=document.getElementById('right-hud'),
     weapons=document.getElementById('weapon-panel'),label=document.getElementById('rival-gap-label'),
     value=document.getElementById('rival-gap-value'),r=gap.getBoundingClientRect(),
     w=weapons.getBoundingClientRect(),p=panel.getBoundingClientRect();
   return {hidden:gap.hidden,left:r.left,right:r.right,bottom:r.bottom,weaponTop:w.top,panelRight:p.right,
      labelOverflow:label.scrollWidth>label.clientWidth,valueOverflow:value.scrollWidth>value.clientWidth,
      announce:gap.getAttribute('aria-live')};
  })())`));
  assert.ok(!gapLayout.hidden&&gapLayout.left>=0&&gapLayout.right<=width&&gapLayout.panelRight<=width,
    'rival HUD must fit screen width '+width+': '+JSON.stringify(gapLayout));
  assert.ok(gapLayout.bottom<=gapLayout.weaponTop+1,'rival HUD must not overlap weapons '+width);
  assert.ok(!gapLayout.labelOverflow&&!gapLayout.valueOverflow,'rival text must fit '+width+': '+JSON.stringify(gapLayout));
  assert.equal(gapLayout.announce,'off','frequent race telemetry must not spam live announcements');
  const contractRect=JSON.parse(await evalJS("JSON.stringify((()=>{const c=document.getElementById('race-contract-hud').getBoundingClientRect(),h=document.getElementById('vehicle-status').getBoundingClientRect();return {left:c.left,right:c.right,top:c.top,healthBottom:h.bottom,bottom:c.bottom}})())"));
  assert.ok(contractRect.left>=0&&contractRect.right<=width,'contract HUD overflow at '+width);
  assert.ok(contractRect.top>=contractRect.healthBottom-2,'contract HUD overlaps health panel at '+width);
 }
 console.log('RIVAL_GAP_BROWSER PASS active HUD, meters, 360/390/768/1280 fit, no weapon overlap');
 // The new drift lane expands the existing right HUD only while relevant.
 assert.equal(await evalJS("typeof CyberRace.game.createDriftMastery"),'function');
 for(const [width,height] of [[360,844],[390,844],[768,844],[1280,720],[800,600],[390,640],[360,460]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const layout=JSON.parse(await evalJS(`JSON.stringify((()=>{
   const drift=document.getElementById('drift-feedback');
   drift.hidden=false;drift.dataset.active='true';
   document.getElementById('drift-label').textContent='ОТПУСТИ РУЧНИК';
   document.getElementById('drift-points').textContent='+90';
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();
     return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
   const r=rect('drift-feedback'),upper=rect('score-panel'),below=rect('rival-gap'),
     panel=rect('right-hud'),points=document.getElementById('drift-points');
   const pointsOverflow=points.scrollWidth>points.clientWidth;
   drift.hidden=true;
   return {r,upper,below,panel,pointsOverflow};
  })())`));
  assert.ok(layout.r.left>=0&&layout.r.right<=width&&layout.r.top>=0&&layout.r.bottom<=height,
    'drift UI viewport '+width+'x'+height+': '+JSON.stringify(layout));
  assert.ok(layout.r.top>=layout.upper.bottom-2&&layout.r.bottom<=layout.below.top+2,
    'drift UI stays between race heading and gap '+width+': '+JSON.stringify(layout));
  assert.ok(!layout.pointsOverflow&&layout.panel.right<=width,
    'drift points and right panel stay readable '+width+': '+JSON.stringify(layout));
 }
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evalJS("getComputedStyle(document.getElementById('drift-progress')).transitionDuration"),'0s',
   'drift meter obeys reduced motion');
 await cdp('Emulation.setEmulatedMedia',{features:[]});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 console.log('DRIFT_HUD_BROWSER_LAYOUT_PASS seven viewports, banked-score UI and reduced motion');
 for(const width of [360,390,768,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:720,deviceScaleFactor:1,mobile:false});
  const layout=JSON.parse(await evalJS("JSON.stringify((()=>[...document.querySelectorAll('.threat-edge')].map(el=>{const r=el.getBoundingClientRect();return {side:el.dataset.threatDirection,left:r.left,right:r.right,top:r.top,bottom:r.bottom}}))())"));
  assert.equal(layout.length,4,'four combat bearings required');
  for(const r of layout)assert.ok(r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=(width<500?844:720),
    'combat bearing must stay within viewport '+width+': '+JSON.stringify(r));
 }
 const bearingColors=JSON.parse(await evalJS("JSON.stringify((()=>{const el=document.querySelector('[data-threat-direction=left]');el.dataset.signal='damage';const damage=getComputedStyle(el).color;el.dataset.signal='rocket';const rocket=getComputedStyle(el).color;el.dataset.signal='off';return {damage,rocket,decorative:document.getElementById('threat-feedback').getAttribute('aria-hidden')}})())"));
 assert.notEqual(bearingColors.damage,bearingColors.rocket,'impact and missile bearings must differ visually');
 assert.equal(bearingColors.decorative,'true','high-frequency combat markers must not spam screen readers');
 console.log('THREAT_HUD_LAYOUT PASS four edge markers, 360/390/768/1280; distinct damage/rocket colors');
 const cueCases=JSON.parse(await evalJS(`JSON.stringify([
   CyberRace.game.defenseRocketCue({distance:110,radius:90,cooldown:0,charges:3,direction:'СЗАДИ'}),
   CyberRace.game.defenseRocketCue({distance:65,radius:90,cooldown:0,charges:3,direction:'СЗАДИ'}),
   CyberRace.game.defenseRocketCue({distance:30,radius:90,cooldown:0,charges:3,direction:'СЗАДИ'}),
   CyberRace.game.defenseRocketCue({distance:30,radius:90,cooldown:8,charges:3,direction:'СЗАДИ'})
 ])`));
 assert.deepEqual(cueCases.map(c=>c.phase),['prepare','intercept','precision','cooldown'],
   'production browser must expose the correct defense windows');
 for(const [width,height] of [[360,460],[390,844],[768,720],[1280,720]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const bounds=JSON.parse(await evalJS(`JSON.stringify((()=>{
     const el=document.getElementById('incoming-warning'),original=el.textContent,phase=el.dataset.defense,
       shown=el.classList.contains('show');
     const cue=CyberRace.game.defenseRocketCue({distance:30,radius:90,cooldown:0,charges:3,direction:'СЗАДИ'});
     el.textContent=cue.text;el.dataset.defense=cue.phase;el.classList.add('show');
     const rect=el.getBoundingClientRect(),result={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
       color:getComputedStyle(el).color,cssWidth:getComputedStyle(el).width,cssMaxWidth:getComputedStyle(el).maxWidth,viewport:innerWidth,phase:el.dataset.defense,containsNitro:el.textContent.includes('+1 НИТРО')};
     el.textContent=original;
     if(phase===undefined)delete el.dataset.defense;else el.dataset.defense=phase;
     if(!shown)el.classList.remove('show');
     return result;
   })())`));
   assert.ok(bounds.left>=-1&&bounds.right<=width+1&&bounds.top>=0&&bounds.bottom<=height,
     'precision rocket alert must fit '+width+'x'+height+': '+JSON.stringify(bounds));
   assert.ok(bounds.containsNitro,'warning must describe actual precision reward');
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 console.log('DEFENSE_PULSE_BROWSER_PASS prepare/intercept/precision/cooldown prompts and 360/390/768/1280 layouts');
 const contractBounds=JSON.parse(await evalJS("JSON.stringify((()=>{const c=document.getElementById('race-contract-hud').getBoundingClientRect(),h=document.getElementById('vehicle-status').getBoundingClientRect();return {left:c.left,right:c.right,top:c.top,bottom:c.bottom,healthBottom:h.bottom}})())"));
 assert.ok(contractBounds.left>=0&&contractBounds.right<=1280,'contract horizontal bounds');
 assert.ok(contractBounds.top>=contractBounds.healthBottom-2,'contract separate from health panel');
 console.log('RACE_CONTRACT_BROWSER PASS selected/active HUD, layout');
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
 await evalJS("document.querySelector('#pause-menu [data-setting=lapGhost]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).lapGhost"),false,'paused switch must use same setting');
 await evalJS("document.querySelector('#pause-menu [data-setting=lapGhost]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).lapGhost"),true);
 assert.equal(await evalJS("document.getElementById('pause-menu').classList.contains('open')"),true,'ghost toggle must preserve pause');
 console.log('LAP_GHOST_PAUSE_SWITCH_PASS persisted toggle without unpausing');
 await until(()=>evalJS("document.getElementById('corner-spotter').hidden"),4000,'corner hidden while paused');
 await evalJS("document.querySelector('#pause-menu [data-setting=cornerSpotter]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).cornerSpotter"),false);
 assert.equal(await evalJS("document.querySelector('#start-screen [data-setting=cornerSpotter]').checked"),false);
 assert.equal(await evalJS("document.getElementById('pause-menu').classList.contains('open')"),true);
 await evalJS("document.querySelector('#pause-menu [data-setting=cornerSpotter]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).cornerSpotter"),true);
 console.log('CORNER_PAUSE_BROWSER_PASS hidden on pause and settings toggle does not resume');
 await evalJS("document.querySelector('#pause-menu [data-pilot-replay]').click()");
 assert.equal(await evalJS("JSON.parse(localStorage.getItem('cyberRaceSettings')).tutorialDone"),false,'replay re-arms completed tutorial');
 await evalJS("document.getElementById('resume-btn').click()");
 await until(()=>evalJS("document.getElementById('pilot-tutorial-heading').textContent.includes('1/3') && !document.getElementById('pilot-tutorial').hidden"),6000,'pilot replay from pause');
 const ammoBeforeSkip=Number(await evalJS("document.getElementById('gun-ammo').textContent"));
 const nitroBeforeSkip=Number(await evalJS("document.getElementById('nitro-charges').textContent"));
 await evalJS("document.getElementById('pilot-tutorial-skip').focus()");
 await key('Space',' ',32);
 await until(()=>evalJS("document.getElementById('pilot-tutorial').hidden && JSON.parse(localStorage.getItem('cyberRaceSettings')).tutorialDone===true"),5000,'keyboard pilot skip persistence');
 assert.equal(Number(await evalJS("document.getElementById('gun-ammo').textContent")),ammoBeforeSkip,'skip click must not fire');
 assert.equal(Number(await evalJS("document.getElementById('nitro-charges').textContent")),nitroBeforeSkip,'keyboard Skip must not consume nitro');
 console.log('PILOT_TUTORIAL_REPLAY_SKIP_PASS pause replay, active-game skip, no accidental shot');
 await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000);
 await sleep(300);
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
 await evalJS("document.getElementById('restart-btn').click()");
 await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'pause restart confirmation');
 const lapBeforeCancel=await evalJS("document.getElementById('curr-time').textContent");
 await evalJS("document.getElementById('restart-confirm-cancel').click()");
 await until(()=>evalJS("!document.getElementById('restart-confirm').open"),5000,'pause restart canceled');
 assert.equal(await evalJS("document.getElementById('pause-menu').classList.contains('open')"),true,'pause must remain after cancel');
 assert.equal(await evalJS("document.getElementById('curr-time').textContent"),lapBeforeCancel,'cancel preserves lap timer');
 await evalJS("document.getElementById('restart-btn').click()");
 await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'pause restart retry');
 await evalJS("document.getElementById('restart-confirm-accept').click()");
 await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000,'confirmed restart');
 console.log('RESTART_CONFIRM_PAUSED PASS cancel preserves pause/timer, confirm restarts');
 assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases,'restart must reuse render canvases');
 console.log('RACE_DRIVE_PAUSE_RESUME_RESTART PASS speed='+speed+' fpsHUD='+fps+' canvases='+initialCanvases);
 await until(()=>evalJS("!document.getElementById('sector-timing').hidden"),25000,'post-restart countdown');
 // Live input + actual WebGL frames: rear glance must be a held view, not a latched mode.
 assert.equal(await evalJS("document.getElementById('rearview-indicator').hidden"),true);
 if(process.env.CYBER_TRACK_CAPTURE_DIR){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(process.env.CYBER_TRACK_CAPTURE_DIR,'rearview-forward.png'),Buffer.from(shot.data,'base64'));
 }
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyC',key:'с',windowsVirtualKeyCode:67});
 await until(()=>evalJS("!document.getElementById('rearview-indicator').hidden"),4000,'held Cyrillic C rearview');
 await sleep(160);
 if(process.env.CYBER_TRACK_CAPTURE_DIR){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(process.env.CYBER_TRACK_CAPTURE_DIR,'rearview-back.png'),Buffer.from(shot.data,'base64'));
 }
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyC',key:'с',windowsVirtualKeyCode:67});
 await until(()=>evalJS("document.getElementById('rearview-indicator').hidden"),4000,'released C forward view');
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyC',key:'c',windowsVirtualKeyCode:67});
 await until(()=>evalJS("!document.getElementById('rearview-indicator').hidden"),4000,'rearview before pause');
 await key('Escape','Escape',27);
 assert.equal(await evalJS("document.getElementById('rearview-indicator').hidden"),true,'pause clears rear glance');
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyC',key:'c',windowsVirtualKeyCode:67});
 await evalJS("document.getElementById('resume-btn').click()");
 await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000,'rearview resume');
 await sleep(450);
 assert.equal(await evalJS("document.getElementById('rearview-indicator').hidden"),true,'rearview must not latch after pause');
 console.log('REARVIEW_KEYBOARD_BROWSER_PASS Cyrillic KeyC, release, pause/resume, WebGL capture');
 await sleep(700);
 const runClock=await evalJS("document.getElementById('curr-time').textContent");
 await key('KeyR','r',82);
 await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'R confirmation');
 assert.equal(await evalJS("document.getElementById('pause-menu').classList.contains('open')"),true,'R pauses the running race');
 await key('Escape','Escape',27);
 await until(()=>evalJS("!document.getElementById('restart-confirm').open && !document.getElementById('pause-menu').classList.contains('open')"),5000,'Escape cancels and resumes');
 assert.notEqual(await evalJS("document.getElementById('curr-time').textContent"),'00:00.0','R cancel must not reset time');
 assert.ok(runClock.length>0);
 console.log('RESTART_CONFIRM_RUNNING PASS R pauses; Escape cancels and resumes');
 await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:false});
 await sleep(250);
 await key('KeyR','r',82);
 await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'narrow restart modal');
 const narrowDialog=JSON.parse(await evalJS("JSON.stringify((()=>{const r=document.getElementById('restart-confirm').getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,viewport:innerWidth}})())"));
 assert.ok(narrowDialog.left>=0&&narrowDialog.right<=360,'restart confirmation fits 360px: '+JSON.stringify(narrowDialog));
 await evalJS("document.getElementById('restart-confirm-cancel').click()");
 await until(()=>evalJS("!document.getElementById('restart-confirm').open && !document.getElementById('pause-menu').classList.contains('open')"),5000);
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 console.log('RESTART_CONFIRM_MOBILE PASS modal fits 360px and cancel restores running race');
 if(process.argv.includes('--approved')){
  // Synthetic touch/gamepad input in a real isolated browser; no physical controller claimed.
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reduce=JSON.parse(await evalJS("(()=>{const a=document.getElementById('incoming-warning'),b=document.getElementById('wrong-way');a.classList.add('show');b.classList.add('show');const names=[getComputedStyle(a).animationName,getComputedStyle(b).animationName];a.classList.remove('show');b.classList.remove('show');return JSON.stringify(names)})()"));
  assert.deepEqual(reduce,['none','none'],'reduced motion warnings must not blink');
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  await until(()=>evalJS("!document.getElementById('sector-timing').hidden"),25000,'touch test countdown');
  await evalJS("document.querySelector('[data-touch=forward]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:177,pointerType:'touch',bubbles:true}))");
  await until(()=>evalJS("Number(document.getElementById('speed-val').textContent)>2"),9000,'synthetic touch throttle');
  await evalJS("document.querySelector('[data-touch=forward]').dispatchEvent(new PointerEvent('pointerup',{pointerId:177,pointerType:'touch',bubbles:true}))");
  assert.equal(await evalJS("document.querySelector('[data-touch=forward]').dataset.active"),'false');
  await evalJS("(()=>{window.__qaPad={mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__qaPad]});window.__qaPad.buttons[7]={pressed:true,value:0.25};})()");
  const partial=JSON.parse(await evalJS("JSON.stringify(CyberRace.game.readStandardGamepad(window.__qaPad))"));
  assert.equal(partial.throttle,0.25,'real Chrome module must preserve partial trigger pressure');
  const padSpeed=Number(await evalJS("document.getElementById('speed-val').textContent"));
  await until(()=>evalJS("Number(document.getElementById('speed-val').textContent)>"+(padSpeed+2)),8000,'synthetic quarter gamepad accelerate');
  const quarterSpeed=Number(await evalJS("document.getElementById('speed-val').textContent"));
  await evalJS("window.__qaPad.buttons[7].value=1");
  await until(()=>evalJS("Number(document.getElementById('speed-val').textContent)>"+(quarterSpeed+5)),8000,'synthetic full gamepad accelerate');
  await evalJS("window.__qaPad.buttons[7]={pressed:false,value:0};window.__qaPad.buttons[6]={pressed:true,value:0.5}");
  assert.equal(JSON.parse(await evalJS("JSON.stringify(CyberRace.game.readStandardGamepad(window.__qaPad))")).brake,0.5,
    'real Chrome module must preserve partial LT pressure');
  const brakeSpeed=Number(await evalJS("document.getElementById('speed-val').textContent"));
  await until(()=>evalJS("Number(document.getElementById('speed-val').textContent)<"+(brakeSpeed-2)),8000,'synthetic half-trigger braking');
  await evalJS("window.__qaPad.buttons[6]={pressed:false,value:0};window.__qaPad.buttons[9].pressed=true");
  console.log('ANALOG_GAMEPAD_BROWSER PASS Chrome 25% RT, 100% RT, 50% LT plus vehicle acceleration/braking');
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000,'gamepad Start pause');
  await evalJS("window.__qaPad.buttons[9].pressed=false");
  await sleep(100);
  await evalJS("window.__qaPad.buttons[9].pressed=true");
  await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000,'gamepad Start resume');
  await evalJS("window.__qaPad.buttons[9].pressed=false;window.__qaPad.buttons[5].pressed=true");
  await until(()=>evalJS("!document.getElementById('rearview-indicator').hidden"),4000,'RB rearview');
  await evalJS("window.__qaPad.buttons[5].pressed=false");
  await until(()=>evalJS("document.getElementById('rearview-indicator').hidden"),4000,'RB release rearview');
  console.log('REARVIEW_GAMEPAD_BROWSER_PASS RB hold/release on synthetic standard pad');
  await evalJS("delete navigator.getGamepads;delete window.__qaPad");
  console.log('APPROVED_REDUCED_MOTION_TOUCH_GAMEPAD PASS synthetic pointer/standard pad in Chrome');
 }

 // Real Chrome event handlers with a disposable profile: a held fire input must
 // stop on window blur and must not resume firing after the pause is dismissed.
 const ammoBeforeBlur=Number(await evalJS("document.getElementById('gun-ammo').textContent"));
 await evalJS("window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}))");
 await until(()=>evalJS("Number(document.getElementById('gun-ammo').textContent)<"+ammoBeforeBlur),10000,'held-fire precondition');
 await evalJS("window.dispatchEvent(new Event('blur'))");
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000,'window blur opens pause');
 const ammoPaused=Number(await evalJS("document.getElementById('gun-ammo').textContent"));
 await sleep(300);
 assert.equal(Number(await evalJS("document.getElementById('gun-ammo').textContent")),ammoPaused,'paused window must not fire');
 await evalJS("document.getElementById('resume-btn').click()");
 await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000,'resume after blur');
 await sleep(450);
 assert.equal(Number(await evalJS("document.getElementById('gun-ammo').textContent")),ammoPaused,'blur must clear held mouse input before resume');
 await evalJS("window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}))");
 console.log('FOCUS_LOSS_CLEARS_HELD_FIRE PASS pausedAmmo='+ammoPaused);

 // CDP sends an explicit physical KeyM with a Russian-layout character. This
 // is not a change to the Windows keyboard layout or a hardware keyboard test.
 const originalSound=await evalJS("document.querySelector('#start-screen input[data-setting=sound]').checked");
 await key('KeyM','ь',77);
 await until(()=>evalJS("document.querySelector('#start-screen input[data-setting=sound]').checked==="+String(!originalSound)),3500,'Cyrillic KeyM mute');
 await key('KeyM','ь',77);
 await until(()=>evalJS("document.querySelector('#start-screen input[data-setting=sound]').checked==="+String(originalSound)),3500,'Cyrillic KeyM restore');
 console.log('RUSSIAN_KEYCODE_SOUND_TOGGLE PASS restored='+originalSound);

 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
 await evalJS("document.getElementById('menu-btn').click()");
 await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
 assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
 assert.equal(exceptions.length,0,'unexpected browser JS exceptions: '+exceptions.join(' | '));
 console.log('RETURN_TO_MENU_NO_CANVAS_GROWTH PASS');

 // Mode choice is a real radio group: changing it updates the lap count,
 // victory reward and record scope without touching the championship.
 assert.equal(await evalJS("document.querySelector('input[name=single-race-mode][value=classic]').checked"),true);
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=hunter]').nextElementSibling.querySelector('small').textContent"),'2 уничтожения');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=collector]').nextElementSibling.querySelector('small').textContent"),'3 полезных бонуса');
 await evalJS("document.querySelector('input[name=single-race-mode][value=blitz]').click()");
 assert.equal(await evalJS("document.body.dataset.singleRaceMode"),'blitz');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=hunter]').nextElementSibling.querySelector('small').textContent"),'1 уничтожение');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=collector]').nextElementSibling.querySelector('small').textContent"),'2 полезных бонуса');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=podium]').nextElementSibling.querySelector('small').textContent"),'Место в топ-3');
 assert.equal(await evalJS("document.querySelector('#start-screen [data-race-laps]').textContent"),'1 круг');
 assert.equal(await evalJS("document.getElementById('single-race-victory-credits').textContent"),'100');
 assert.match(await evalJS("document.getElementById('record-class-label').textContent"),/БЛИЦ/);
 if(process.env.CYBER_MENU_CAPTURE_DIR){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const file=join(process.env.CYBER_MENU_CAPTURE_DIR,'blitz-menu.png');
  writeFileSync(file,Buffer.from(shot.data,'base64'));
  console.log('BLITZ_MENU_VISUAL_CAPTURE '+file);
 }
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("document.body.dataset.singleRaceMode==='blitz'&&document.getElementById('start-screen').classList.contains('hidden')"),10000,'blitz launch');
 await until(()=>evalJS("!document.getElementById('race-contract-hud').hidden"),10000,'blitz contract HUD');
 assert.equal(await evalJS("document.getElementById('race-contract-progress').textContent"),'0/1','blitz goal in actual HUD');
 assert.equal(await evalJS("document.querySelector('#pause-menu [data-race-laps]').textContent"),'1 круг');
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),6000,'blitz pause');
 await evalJS("document.getElementById('menu-btn').click()");
 await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),6000,'blitz back to menu');
 console.log('BLITZ_MENU_AND_LAUNCH PASS 1 lap, 100 victory credits, pause and return');
 await evalJS("document.querySelector('input[name=single-race-mode][value=sprint]').click()");
 assert.equal(await evalJS("document.body.dataset.singleRaceMode"),'sprint');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=hunter]').nextElementSibling.querySelector('small').textContent"),'2 уничтожения','sprint reverts hunter');
 assert.equal(await evalJS("document.querySelector('input[name=race-contract][value=collector]').nextElementSibling.querySelector('small').textContent"),'3 полезных бонуса','sprint reverts collector');
 assert.equal(await evalJS("document.querySelector('#start-screen [data-race-laps]').textContent"),'3 круга');
 assert.equal(await evalJS("document.getElementById('single-race-victory-credits').textContent"),'300');
 assert.match(await evalJS("document.getElementById('record-class-label').textContent"),/СПРИНТ/);
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("document.body.dataset.singleRaceMode==='sprint'&&document.getElementById('start-screen').classList.contains('hidden')"),10000,'sprint launch');
 assert.equal(await evalJS("document.querySelector('#pause-menu [data-race-laps]').textContent"),'3 круга');
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),6000,'sprint pause');
 await evalJS("document.getElementById('menu-btn').click()");
 await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),6000,'sprint back to menu');
 await evalJS("document.querySelector('input[name=single-race-mode][value=classic]').click()");
 assert.equal(await evalJS("document.body.dataset.singleRaceMode"),'classic');
 assert.equal(await evalJS("document.querySelector('#start-screen [data-race-laps]').textContent"),'15 кругов');
 assert.equal(await evalJS("document.getElementById('single-race-victory-credits').textContent"),'1500');
 assert.match(await evalJS("document.getElementById('record-class-label').textContent"),/КЛАССИКА/);
 assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases,'mode switching does not allocate new canvases');
 console.log('SPRINT_MENU_AND_LAUNCH PASS 3 laps, classic 15 laps, selection/rewards/record labels, return to menu');

 // Returning from a championship must clear the active race mode, not stored standings.
 await sleep(300);
 await evalJS("document.getElementById('championship-new').click()");
 await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.getElementById('start-screen').classList.contains('hidden')"),10000);
 const championshipBeforeExit=await evalJS("localStorage.getItem('cyberRaceChampionship')");
 assert.ok(championshipBeforeExit,'an active championship must have its independent persisted progress');
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
 await evalJS("document.getElementById('menu-btn').click()");
 await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
 assert.equal(await evalJS('document.body.dataset.raceMode'),'single','main menu must reset active championship mode');
 assert.equal(await evalJS('document.body.dataset.raceTrack'),'valley','main menu must return to the default circuit');
 assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),championshipBeforeExit,'championship progress must survive leaving its race');
 assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
 console.log('CHAMPIONSHIP_EXIT_PRESERVES_PROGRESS PASS');
 if(process.argv.includes('--approved')){
  await evalJS("document.getElementById('championship-continue').click()");
  await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.getElementById('start-screen').classList.contains('hidden')"),12000,'checkpoint race launch');
  await until(()=>evalJS("document.getElementById('curr-time').textContent!=='00:00.0'"),25000,'checkpoint race gameplay after countdown');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await sleep(850);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000,'checkpoint pause');
  const raw=await evalJS("localStorage.getItem('cyberRaceStageCheckpointV1')");
  assert.ok(raw,'paused championship must persist full stage checkpoint');
  const savedPoint=JSON.parse(raw);
  assert.equal(savedPoint.stageIndex,0);
  assert.ok(savedPoint.player.totalTime>0);
  assert.equal(savedPoint.bots.length,6);
  assert.ok(Array.isArray(savedPoint.awardedOvertakeIds)&&
    savedPoint.awardedOvertakeIds.every(id=>Number.isSafeInteger(id)&&id>=0&&id<6),
    'actual localStorage checkpoint must persist a validated overtake award list');
  await cdp('Page.enable');
  const beforeResume=await evalJS('performance.timeOrigin');
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>evalJS("performance.timeOrigin>"+beforeResume+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000,'checkpoint reload');
  await evalJS("document.getElementById('championship-continue').click()");
  await until(()=>evalJS("document.body.dataset.stageResumed==='true'"),15000,'checkpoint resume readback');
  assert.equal(Number(await evalJS("document.getElementById('gun-ammo').textContent")),savedPoint.player.gunAmmo);
  assert.equal(await evalJS("document.body.dataset.raceTrack"),savedPoint.trackId);
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),championshipBeforeExit,'stage restore must not add a finished stage');
  console.log('APPROVED_STAGE_CHECKPOINT_BROWSER PASS stored+reloaded stage='+savedPoint.stageIndex+' raceSec='+savedPoint.player.totalTime.toFixed(2)+' bots='+savedPoint.bots.length);
  // Inject a corrupt checkpoint into this disposable Chrome profile, not user storage.
  const invalidStage=JSON.stringify({...savedPoint,player:{...savedPoint.player,gunAmmo:-7}});
  await evalJS("localStorage.setItem('cyberRaceStageCheckpointV1',"+JSON.stringify(invalidStage)+")");
  const beforeInvalidReload=await evalJS('performance.timeOrigin');
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>evalJS("performance.timeOrigin>"+beforeInvalidReload+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000,'invalid checkpoint reload');
  // Record the actual visible message, even if another gameplay toast replaces it
  // before the next CDP poll (the warning lasts only 1.8 gameplay seconds).
  await evalJS("(()=>{const el=document.getElementById('message');window.__qaInvalidNoticeShown=false;window.__qaInvalidNoticeTrace=[];const observe=()=>{const row={text:el.textContent,show:el.classList.contains('show')};window.__qaInvalidNoticeTrace.push(row);if(row.text.includes('Контрольная точка повреждена')&&row.show)window.__qaInvalidNoticeShown=true;};const observer=new MutationObserver(observe);observer.observe(el,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});window.__qaInvalidNoticeObserver=observer;observe();})()");
  await evalJS("document.getElementById('championship-continue').click()");
  await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.body.dataset.stageResumed==='false'"),15000,'invalid checkpoint starts fresh');
  try {
    await until(()=>evalJS("window.__qaInvalidNoticeShown===true"),25000,'visible corrupt checkpoint warning');
  } catch(error) {
    const diagnostic=await evalJS("JSON.stringify({messages:window.__qaInvalidNoticeTrace?.slice(-15),raceMode:document.body.dataset.raceMode,stageResumed:document.body.dataset.stageResumed,raw:document.getElementById('message').textContent,show:document.getElementById('message').classList.contains('show')})");
    throw new Error(error.message+' / state '+diagnostic);
  }
  await evalJS("window.__qaInvalidNoticeObserver.disconnect()");
  assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),championshipBeforeExit,'invalid checkpoint must retain championship standings');
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  console.log('INVALID_STAGE_CHECKPOINT_WARNING PASS fresh stage, visible warning, standings intact');
  // Recreate the invalid checkpoint and leave its stage during the countdown:
  // the warning must not survive that transition into a standalone race.
  // This is different from leaving *after* the countdown consumed the warning.
  await evalJS("localStorage.setItem('cyberRaceStageCheckpointV1',"+JSON.stringify(invalidStage)+")");
  await evalJS("document.getElementById('championship-continue').click()");
  await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.getElementById('start-screen').classList.contains('hidden')"),10000,'reopened invalid stage');
  await until(()=>evalJS("['3','2'].includes(document.getElementById('message').textContent)"),6000,'abandon checkpoint countdown before its warning');
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  // Contract selection belongs to the start menu, not settings or checkpoint.
  await evalJS("document.querySelector('input[name=race-contract][value=hunter]').click()");
  assert.equal(await evalJS("document.querySelector('input[name=race-contract]:checked').value"),'hunter');
  await evalJS("document.getElementById('start-btn').click()");
  await until(()=>evalJS("document.body.dataset.raceMode==='single'&&document.getElementById('start-screen').classList.contains('hidden')"),10000,'single race after invalid checkpoint');
  // Capture every message: a pickup can replace the transient GO toast before CDP polls it.
  await evalJS("(()=>{const el=document.getElementById('message');const seen=[el.textContent];const observer=new MutationObserver(()=>seen.push(el.textContent));observer.observe(el,{childList:true,characterData:true,subtree:true});window.__qaRaceMessages=seen;window.__qaRaceMessageObserver=observer;})()");
  await until(()=>evalJS("window.__qaRaceMessages.some(text=>text==='🏁 ВПЕРЁД!'||text.includes('Контрольная точка повреждена'))"),15000,'standalone GO or leaked warning');
  const observedStartMessages=JSON.parse(await evalJS("JSON.stringify(window.__qaRaceMessages)"));
  assert.ok(observedStartMessages.includes('🏁 ВПЕРЁД!'),'single race must show GO: '+JSON.stringify(observedStartMessages));
  assert.ok(!observedStartMessages.some(text=>text.includes('Контрольная точка повреждена')),'invalid championship warning must not leak into a later single race');
  await evalJS("window.__qaRaceMessageObserver.disconnect();delete window.__qaRaceMessageObserver;delete window.__qaRaceMessages");
  assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),championshipBeforeExit,'transition must preserve championship standings');
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  console.log('CHECKPOINT_NOTICE_SESSION_ISOLATION PASS rejected championship checkpoint -> main menu -> standalone countdown');
 }
 // Resume synthetic stage-two progress in this disposable browser profile only.
 const stageTwo=JSON.stringify({version:1,difficulty:'normal',results:[{order:['player','bot:0','bot:1','bot:2','bot:3','bot:4','bot:5'],playerTime:180}]});
 await evalJS('localStorage.setItem(\'cyberRaceChampionship\','+JSON.stringify(stageTwo)+')');
 const previousPageOrigin=await evalJS('performance.timeOrigin');
 await cdp('Page.enable');await cdp('Page.reload',{ignoreCache:true});
 await until(()=>evalJS("performance.timeOrigin>"+previousPageOrigin+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000);
 await evalJS("document.getElementById('championship-continue').click()");
 await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.body.dataset.raceTrack==='city'&&document.getElementById('start-screen').classList.contains('hidden')"),15000);
 if(process.env.CYBER_TRACK_CAPTURE_DIR){
  await until(()=>evalJS("document.getElementById('curr-time').textContent!=='00:00.0'"),12000,'city live frame');
  await captureTrackFrame('city');
 }
 await key('Escape','Escape',27);
 await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
 await evalJS("document.getElementById('menu-btn').click()");
 await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
 assert.equal(await evalJS('document.body.dataset.raceMode'),'single');
 assert.equal(await evalJS('document.body.dataset.raceTrack'),'valley','return from the city must restore the valley circuit');
 assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),stageTwo,'synthetic saved standings survive the return');
 assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
 console.log('CHAMPIONSHIP_CITY_EXIT_AND_STORAGE PASS');
 if(process.argv.includes('--extended')){
  // Stage 3 is a synthetic checkpoint in this disposable browser profile;
  // it verifies real rendering, game controls and stage transitions, not a full driven championship.
  const stageThree=JSON.stringify({version:1,difficulty:'normal',results:[
   {order:['player','bot:0','bot:1','bot:2','bot:3','bot:4','bot:5'],playerTime:180},
   {order:['bot:2','bot:0','player','bot:1','bot:3','bot:4','bot:5'],playerTime:220}
  ]});
  await evalJS('localStorage.setItem(\'cyberRaceChampionship\','+JSON.stringify(stageThree)+')');
  const beforeThirdReload=await evalJS('performance.timeOrigin');
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>evalJS("performance.timeOrigin>"+beforeThirdReload+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000);
  await evalJS("document.getElementById('championship-continue').click()");
  await until(()=>evalJS("document.body.dataset.raceTrack==='industrial'&&document.body.dataset.raceMode==='championship'&&document.getElementById('start-screen').classList.contains('hidden')"),15000);
  await until(()=>evalJS("!document.getElementById('sector-timing').hidden"),25000,'industrial stage countdown');
  assert.ok((await evalJS("document.querySelector('#hud .hud-label').textContent")).includes('ЭТАП 3/3'));
  assert.equal(await evalJS("document.getElementById('lap-val').textContent"),'01/5');
  const ammunitionBefore=JSON.parse(await evalJS("JSON.stringify({gun:Number(document.getElementById('gun-ammo').textContent),rockets:Number(document.getElementById('rocket-count').textContent),nitro:Number(document.getElementById('nitro-charges').textContent)})"));
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await until(()=>evalJS("Number(document.getElementById('speed-val').textContent)>0"),12000);
  await captureTrackFrame('industrial');
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await key('Space',' ',32);
  await until(()=>evalJS("Number(document.getElementById('nitro-charges').textContent)<"+ammunitionBefore.nitro),5000);
  await key('KeyQ','q',81);
  await until(()=>evalJS("document.getElementById('slot-pulse').dataset.ready==='false'"),5000);
  // Keep fire held until the HUD confirms a shot: a fixed 300 ms pulse can
  // entirely miss an active frame during a short software-WebGL stall.
  await evalJS("window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}))");
  try{
   await until(()=>evalJS("Number(document.getElementById('gun-ammo').textContent)<"+ammunitionBefore.gun),5000,'industrial held gun fires');
  }catch(error){
   console.error('INDUSTRIAL_GUN_DIAG '+await evalJS("JSON.stringify({mode:document.body.dataset.raceMode,track:document.body.dataset.raceTrack,paused:document.getElementById('pause-menu').classList.contains('open'),gun:document.getElementById('gun-ammo').textContent,initial:"+ammunitionBefore.gun+",speed:document.getElementById('speed-val').textContent,fps:document.getElementById('fps-counter').textContent})"));
   throw error;
  }finally{
   await evalJS("window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}))");
  }
  await evalJS("window.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}))");
  await until(()=>evalJS("Number(document.getElementById('rocket-count').textContent)<"+ammunitionBefore.rockets),5000);
  await evalJS("window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}))");
  const ammunitionAfter=JSON.parse(await evalJS("JSON.stringify({gun:Number(document.getElementById('gun-ammo').textContent),rockets:Number(document.getElementById('rocket-count').textContent),nitro:Number(document.getElementById('nitro-charges').textContent)})"));
  assert.ok(ammunitionAfter.gun<ammunitionBefore.gun&&ammunitionAfter.rockets===ammunitionBefore.rockets-1&&ammunitionAfter.nitro===ammunitionBefore.nitro-1);
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  assert.equal(await evalJS('document.activeElement.id'),'resume-btn','pause must focus its Resume control');
  await key('Space',' ',32);
  await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000);
  await sleep(200);
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  const pausedAmmo=await evalJS("JSON.stringify([document.getElementById('gun-ammo').textContent,document.getElementById('rocket-count').textContent,document.getElementById('nitro-charges').textContent])");
  await key('KeyQ','q',81);
  await evalJS("window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}))");
  await sleep(250);
  assert.equal(await evalJS("JSON.stringify([document.getElementById('gun-ammo').textContent,document.getElementById('rocket-count').textContent,document.getElementById('nitro-charges').textContent])"),pausedAmmo,'pause must prevent all weapon/nitro consumption');
  await evalJS("window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}))");
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  assert.equal(await evalJS('document.body.dataset.raceTrack'),'valley');
  assert.equal(await evalJS('document.body.dataset.raceMode'),'single');
  assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),stageThree);
  assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
  console.log('CHAMPIONSHIP_INDUSTRIAL_AND_COMBAT_INPUT PASS stage=3/3 lap=1/5; ammo='+JSON.stringify({before:ammunitionBefore,after:ammunitionAfter})+'; preserved checkpoint; canvases='+initialCanvases);
  // All three completed results are synthetic, but the reload and UI state are real.
  // This tests a full persisted sequence, not the driving of twelve racing laps.
  const completedChampionship=JSON.stringify({...JSON.parse(stageThree),results:[
   ...JSON.parse(stageThree).results,
   {order:['bot:0','player','bot:2','bot:1','bot:3','bot:4','bot:5'],playerTime:260}
  ]});
  const legacyRecord=await evalJS("localStorage.getItem('cyberRaceRecords')");
  const oldPageOrigin=await evalJS('performance.timeOrigin');
  await evalJS('localStorage.setItem(\'cyberRaceChampionship\','+JSON.stringify(completedChampionship)+')');
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>evalJS("performance.timeOrigin>"+oldPageOrigin+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000,'completed championship reload');
  const view=JSON.parse(await evalJS("JSON.stringify({summary:document.getElementById('championship-summary').textContent,continueHidden:document.getElementById('championship-continue').hidden,newLabel:document.getElementById('championship-new').textContent,track:document.body.dataset.raceTrack,mode:document.body.dataset.raceMode})"));
  assert.match(view.summary,/Чемпионат завершён/);
  assert.match(view.summary,/Вольт/,'independent championship points: bot:0 wins with 39; player has 37');
  assert.equal(view.continueHidden,true,'completed 3/3 must not offer a fourth stage');
  assert.match(view.newLabel,/НОВЫЙ ЧЕМПИОНАТ/);
  assert.equal(view.mode,'single');assert.equal(view.track,'valley');
  assert.equal(await evalJS("localStorage.getItem('cyberRaceChampionship')"),completedChampionship,'completed results survive reload');
  assert.equal(await evalJS("localStorage.getItem('cyberRaceRecords')"),legacyRecord,'championship must not overwrite legacy race records');
  // A confirmed new championship clears only this synthetic championship key.
  await evalJS("window.confirm=()=>true;document.getElementById('championship-new').click()");
  await until(()=>evalJS("document.body.dataset.raceMode==='championship'&&document.body.dataset.raceTrack==='valley'&&document.getElementById('start-screen').classList.contains('hidden')"),10000,'new championship from completed standings');
  const resetState=JSON.parse(await evalJS("localStorage.getItem('cyberRaceChampionship')"));
  assert.equal(resetState.results.length,0);
  assert.equal(resetState.difficulty,'normal');
  assert.equal(await evalJS("localStorage.getItem('cyberRaceRecords')"),legacyRecord);
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
  assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
  console.log('CHAMPIONSHIP_THREE_STAGES_PERSISTED_AND_RESET PASS synthetic 3/3, bot:0 39pts, player 37pts, no stage 4, legacy records preserved, new 1/3');
 }
 if(process.argv.includes('--deep')){
  // Longer live run: AI races beside the player; check real HUD participation and frame samples.
  await sleep(350);await evalJS("document.getElementById('start-btn').click()");
  await until(()=>evalJS("document.getElementById('start-screen').classList.contains('hidden')"),10000);
  // The brief "ВПЕРЁД" toast can be replaced immediately by a pickup notice.
  // Advancing lap time is stable evidence that countdown ended and gameplay runs.
  try{await until(()=>evalJS("document.body.dataset.raceMode==='single'&&document.body.dataset.raceTrack==='valley'&&document.getElementById('curr-time').textContent!=='00:00.0'"),25000,'return to valley gameplay after countdown');}
  catch(error){console.error('GAMEPLAY_START_DIAG '+await evalJS("JSON.stringify({message:document.getElementById('message').textContent,lapTime:document.getElementById('curr-time').textContent,pause:document.getElementById('pause-menu').classList.contains('open'),screen:document.getElementById('start-screen').classList.contains('hidden'),track:document.body.dataset.raceTrack,mode:document.body.dataset.raceMode,lap:document.getElementById('lap-val').textContent})"));throw error;}
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  const fpsSamples=[];const positions=[];
  for(let index=0;index<7;index++){
   await sleep(1200);
   fpsSamples.push(await evalJS("document.getElementById('fps-counter').textContent"));
   positions.push(await evalJS("document.getElementById('pos-val').textContent"));
   assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
  }
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  assert.ok(positions.every(p=>/^\d\/7$/.test(p)),'live AI race should report seven participants: '+positions.join(','));
  const measured=fpsSamples.map(v=>Number(v.match(/\d+/)?.[0])).filter(v=>v>0);
  assert.ok(measured.length>=3,'active race FPS HUD must update');
  console.log('AI_RACE_SOAK PASS seven racers; fpsHUD min='+Math.min(...measured)+' max='+Math.max(...measured)+' samples='+measured.length);
  if(process.argv.includes('--perf')){
   // Optional diagnostic run: isolated Chrome profile, real rAF intervals and
   // CDP heap/DOM readback. These are NOT physical GPU-memory measurements.
   async function useQuality(mode){
    await key('Escape','Escape',27);
    await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
    const changed=await evalJS("(()=>{const el=document.querySelector('#pause-menu select[data-setting=quality]');if(!el)return false;el.value='"+mode+"';el.dispatchEvent(new Event('change',{bubbles:true}));return el.value==='"+mode+"';})()");
    assert.ok(changed,'quality selector must exist: '+mode);
    await evalJS("document.getElementById('resume-btn').click()");
    await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000);
    await sleep(250);
   }
   async function performanceSample(label){
    const frames=JSON.parse(await evalJS("new Promise(resolve=>{const xs=[];let begin=null,previous=null;function frame(t){if(begin===null)begin=t;if(previous!==null)xs.push(t-previous);previous=t;if(t-begin<2200){requestAnimationFrame(frame);}else{const sorted=[...xs].sort((a,b)=>a-b),mean=xs.reduce((s,x)=>s+x,0)/xs.length;resolve(JSON.stringify({frames:xs.length,meanMs:Number(mean.toFixed(2)),p95Ms:Number(sorted[Math.floor((sorted.length-1)*.95)].toFixed(2)),maxMs:Number(sorted.at(-1).toFixed(2))}));}}requestAnimationFrame(frame);})"));
    const result={phase:label,frameIntervals:frames,canvases:await evalJS("document.querySelectorAll('canvas').length")};
    assert.equal(result.canvases,initialCanvases,'canvas count grew: '+label);
    try{
     await cdp('HeapProfiler.collectGarbage');
     const heap=await cdp('Runtime.getHeapUsage'),dom=await cdp('Memory.getDOMCounters');
     result.jsHeapMiB=Number((heap.usedSize/1048576).toFixed(2));
     result.domNodes=dom.nodes;result.domDocuments=dom.documents;result.eventListeners=dom.jsEventListeners;
    }catch(error){result.memoryStatus='NOT_VERIFIED '+String(error).slice(0,100);}
    return result;
   }
   await useQuality('high');
   const resourceSamples=[await performanceSample('high')];
   await useQuality('low');
   resourceSamples.push(await performanceSample('low'));
   const restarts=process.argv.includes('--stress')?9:3;
   for(let repeat=1;repeat<=restarts;repeat++){
    await key('KeyR','r',82);
    await until(()=>evalJS("document.getElementById('restart-confirm').open"),5000,'stress restart confirmation');
    await evalJS("document.getElementById('restart-confirm-accept').click()");
    await until(()=>evalJS("!document.getElementById('restart-confirm').open"),5000,'stress restart accepted');
    await sleep(3500); // restart countdown; only isolated browser state is modified
    resourceSamples.push(await performanceSample('low-restart-'+repeat));
   }
   console.log('PERF_SOAK_REPORT '+JSON.stringify({browser:version,width:1280,height:720,profile:'isolated-headless-software-WebGL',samples:resourceSamples}));
   if(process.argv.includes('--stress')){
    const first=resourceSamples[2],last=resourceSamples.at(-1);
    const delta=(name)=>Number.isFinite(first[name])&&Number.isFinite(last[name])?Number((last[name]-first[name]).toFixed(2)):null;
    const trend={restarts,from:first.phase,to:last.phase,jsHeapDeltaMiB:delta('jsHeapMiB'),domNodesDelta:delta('domNodes'),eventListenersDelta:delta('eventListeners'),canvasDelta:delta('canvases')};
    assert.equal(trend.canvasDelta,0,'canvas count increased during stress test');
    console.log('STRESS_RESOURCE_TREND '+JSON.stringify(trend));
   }
  }
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  // Only the browser's supported debug extension is used; no runtime source changes.
  const contextProbe=await evalJS("(()=>{const canvas=[...document.querySelectorAll('canvas')].find(c=>c.getContext('webgl2')||c.getContext('webgl'));const gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl'));const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return 'UNSUPPORTED';window.__restoreCyberContext=()=>ext.restoreContext();ext.loseContext();return 'SUPPORTED';})()");
  if(contextProbe==='SUPPORTED'){
   await until(()=>evalJS("document.getElementById('message').textContent.includes('ПЕРЕЗАПУСКАЕТСЯ')"),6000);
   await evalJS('window.__restoreCyberContext()');
   await until(()=>evalJS("document.getElementById('message').textContent.includes('ВОССТАНОВЛЕНА')"),10000);
   assert.ok(await evalJS("document.getElementById('pause-menu').classList.contains('open')"));
   await sleep(350);
   await evalJS("document.getElementById('resume-btn').click()");
   await until(()=>evalJS("!document.getElementById('pause-menu').classList.contains('open')"),5000);
   await sleep(1500);
   assert.ok(await evalJS("(()=>{const c=[...document.querySelectorAll('canvas')].find(x=>x.getContext('webgl2')||x.getContext('webgl'));const gl=c&&(c.getContext('webgl2')||c.getContext('webgl'));return Boolean(gl&&!gl.isContextLost());})()"));
   assert.equal(await evalJS("document.querySelectorAll('canvas').length"),initialCanvases);
   console.log('WEBGL_CONTEXT_LOSS_RESTORE_AND_RESUME PASS');
  }else console.log('WEBGL_CONTEXT_LOSS_RESTORE NOT_VERIFIED (extension unsupported)');
 }
 // Simulate a browser that silently discards settings/record writes, in this
 // disposable Chrome profile only. Check the actual user-facing warnings.
 if(process.argv.includes('--deep')){
  await key('Escape','Escape',27);
  await until(()=>evalJS("document.getElementById('pause-menu').classList.contains('open')"),5000);
  await evalJS("document.getElementById('menu-btn').click()");
  await until(()=>evalJS("!document.getElementById('start-screen').classList.contains('hidden')"),5000);
 }
 await evalJS("(()=>{window.__qaOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='cyberRaceSettings'||key==='cyberRaceTrackRecordsV1')return;return window.__qaOriginalSetItem.call(this,key,value);};})()");
 const settingsDenied=await evalJS("(()=>{const input=document.querySelector('#start-screen input[data-setting=sound]');input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}));return document.getElementById('menu-status').textContent.includes('только в этой вкладке');})()");
 assert.equal(settingsDenied,true,'blocked settings must warn in the main menu');
 await evalJS("document.getElementById('start-btn').click()");
 await until(()=>evalJS("document.getElementById('start-screen').classList.contains('hidden')"),10000);
 await evalJS("localStorage.removeItem('cyberRaceRecords');localStorage.removeItem('cyberRaceClassRecords');localStorage.removeItem('cyberRaceBuildRecords');localStorage.removeItem('cyberRaceTrackRecordsV1');window.dispatchEvent(new Event('beforeunload'))");
 assert.equal(await evalJS("document.getElementById('record-storage-note').hidden"),false,'blocked records must warn');
 await evalJS("Storage.prototype.setItem=window.__qaOriginalSetItem");
 console.log('BROWSER_BLOCKED_SETTINGS_AND_RECORDS PASS');

 // Deny both remote CDNs and force a fresh navigation to verify local Three.js.
 const offlineOrigin=await evalJS('performance.timeOrigin');
 await cdp('Network.setBlockedURLs',{urls:['*cdn.jsdelivr.net*','*unpkg.com*']});
 await cdp('Page.enable');await cdp('Page.reload',{ignoreCache:true});
 await until(()=>evalJS("performance.timeOrigin>"+offlineOrigin+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000);
 assert.equal(await evalJS("document.documentElement.dataset.cyberBoot"),'ready');
 await cdp('Network.setBlockedURLs',{urls:[]});
 console.log('THREE_LOCAL_WITH_BOTH_CDNS_BLOCKED PASS');

 // Negative control: invalid championship state must not lock the player out
 // of the main menu or make a fictitious fourth stage available.
 const priorChampionship=await evalJS("localStorage.getItem('cyberRaceChampionship')");
 const badChampionship='{"version":1,"difficulty":"normal","results":"not-an-array"}';
 await evalJS("localStorage.setItem('cyberRaceChampionship',"+JSON.stringify(badChampionship)+")");
 const beforeCorruptReload=await evalJS('performance.timeOrigin');
 await cdp('Page.reload',{ignoreCache:true});
 await until(()=>evalJS("performance.timeOrigin>"+beforeCorruptReload+"&&document.documentElement.dataset.cyberBoot==='ready'"),35000,'invalid championship startup');
 assert.equal(await evalJS("document.getElementById('championship-continue').hidden"),true,'invalid championship must not offer Continue');
 assert.equal(await evalJS("document.body.dataset.raceMode"),'single','invalid championship must not enter a stage');
 if(priorChampionship===null)await evalJS("localStorage.removeItem('cyberRaceChampionship')");
 else await evalJS("localStorage.setItem('cyberRaceChampionship',"+JSON.stringify(priorChampionship)+")");
 console.log('CHAMPIONSHIP_INVALID_SAVE_SAFE_BOOT PASS no Continue, single race mode');

 // Synthetic rejection of Fullscreen API in the isolated browser profile:
 // ensures the UI remains operable without claiming a physical fullscreen test.
 await evalJS("document.documentElement.requestFullscreen=()=>Promise.reject(new Error('QA_FULLSCREEN_DENIED'));document.getElementById('fullscreen-start-btn').click()");
 await until(()=>evalJS("document.getElementById('menu-status').textContent.includes('не разрешил')"),5000,'fullscreen denial warning');
 await until(()=>evalJS("!document.getElementById('fullscreen-start-btn').disabled"),5000,'fullscreen control resets');
 assert.equal(await evalJS("document.getElementById('start-btn').disabled"),false);
 console.log('FULLSCREEN_DENIED_UI_RECOVERY PASS');
 assert.equal(exceptions.length,0,'unexpected browser JS exceptions: '+exceptions.join(' | '));
 console.log('JS_EXCEPTIONS 0');
 console.log('BOUNDARY: no full lap-by-lap race or independent physical GPU profiling performed');
}
try{await run();}catch(error){console.error('BROWSER_SMOKE_FAIL',error.stack||error);process.exitCode=1;}
finally{
 for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CDP session closed'));}pending.clear();
 try{ws?.close();}catch{}
 if(chrome&&!chrome.killed)chrome.kill();
 try{server.close();}catch{}
 await sleep(1000);
 if(profile)try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:350});}catch(error){console.warn('Temporary profile cleanup incomplete:',error.code);}
}
