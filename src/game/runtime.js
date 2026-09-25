(async()=>{
  'use strict';
  const CyberRace=globalThis.CyberRace;
  if(!CyberRace?.core||!CyberRace?.game||!CyberRace?.ai||!CyberRace?.weapons||!CyberRace?.audio||!CyberRace?.ui){
    throw new Error('CYBER RACE modules were not loaded in the expected order');
  }
  const {loadThree,loadObject,saveObject}=CyberRace.core;
  const {CONFIG,SETTINGS_DEFAULTS,createTrackEnvironment,resolveLapCompletion}=CyberRace.game;
  const {getDifficulty,stepOpponentFrame,planOpponentAttack}=CyberRace.ai;
  const {createSegmentSphereHit,selectRocketTarget,stepHomingProjectile}=CyberRace.weapons;
  const {AudioSys}=CyberRace.audio;
  const {getUiElements,createMinimap,buildRacePositions,raceProgressPercent,healthPercent}=CyberRace.ui;

    let THREE;
    try{
      THREE=await loadThree();
    }catch(error){
      const title=document.querySelector('#start-screen h1');
      const subtitle=document.querySelector('#start-screen .sub');
      if(title)title.textContent='⚠️ НЕ УДАЛОСЬ ЗАПУСТИТЬ ИГРУ';
      if(subtitle)subtitle.textContent='Не загрузился 3D-движок Three.js. Проверьте подключение к интернету и обновите страницу.';
      document.getElementById('start-btn')?.setAttribute('disabled','disabled');
      console.error('Three.js loading failed',error);
      throw error;
    }


    const {
      speedEl,lapEl,bestTimeEl,currTimeEl,posEl,scoreEl,rocketCountEl,gunAmmoEl,
      nitroChargesEl,pulseCooldownEl,pulseSlotEl,messageEl,healthBar,nitroBar,
      damageOverlay,startScreen,finishScreen,finishTitle,finishStats,fpsEl,pauseMenu,
      resumeBtn,restartBtn,menuBtn,finishMenuBtn,finishRestartBtn,fullscreenStartBtn,
      fullscreenPauseBtn,healthTextEl,shieldStatusEl,effectStatusEl,lockIndicatorEl,
      incomingWarningEl,comboDisplayEl,speedVignetteEl,qualityIndicatorEl,recordInfoEl,
      raceProgressEl,wrongWayEl,hitMarkerEl
    }=getUiElements(document);

    const settings=loadObject('cyberRaceSettings',SETTINGS_DEFAULTS);
    if(!['easy','normal','hard'].includes(settings.difficulty))settings.difficulty='normal';
    if(!['auto','high','low'].includes(settings.quality))settings.quality='auto';
    settings.sound=settings.sound!==false;
    settings.cameraShake=settings.cameraShake!==false;
    function difficulty(){return getDifficulty(settings);}
    function saveSettings(){saveObject('cyberRaceSettings',settings);}
    function syncSettingsUI(){
      document.querySelectorAll('[data-setting]').forEach(el=>{
        const key=el.dataset.setting;
        if(el.type==='checkbox')el.checked=Boolean(settings[key]);
        else el.value=settings[key];
      });
    }

    const INTERACTIVE_SELECTOR='button,select,input,option,label,[role="button"],[data-settings-panel]';
    let menuInteractionGuardUntil=0;
    let gameplayInputBlockUntil=0;
    let fullscreenTransition=false;
    let fullscreenKeepPause=false;
    let lastMenuPointerButton=null;
    let lastMenuPointerAt=0;

    function isInteractiveTarget(target){
      return target instanceof Element&&Boolean(target.closest(INTERACTIVE_SELECTOR));
    }
    function fullscreenElement(){
      return document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement||null;
    }
    function isDirectMenuActivation(event){
      if(!event||event.type!=='click')return true;
      if(event.detail===0)return true;
      const button=event.currentTarget instanceof Element?event.currentTarget.closest('button'):null;
      return Boolean(button&&button===lastMenuPointerButton&&performance.now()-lastMenuPointerAt<4000);
    }
    function guardMenuInteraction(duration=320){
      menuInteractionGuardUntil=Math.max(menuInteractionGuardUntil,performance.now()+duration);
      clearInputs();
    }
    function isMenuInteractionGuarded(){
      return performance.now()<menuInteractionGuardUntil;
    }
    function blockGameplayInput(duration=CONFIG.MENU_INPUT_LOCK_MS){
      gameplayInputBlockUntil=Math.max(gameplayInputBlockUntil,performance.now()+duration);
      clearInputs();
    }
    function isGameplayInputBlocked(){
      return performance.now()<gameplayInputBlockUntil;
    }
    function preservePauseMenu(){
      if(!gameStarted||gameFinished)return;
      paused=true;menuOpen=true;
      clearInputs();setGameplayCursor(false);
      document.body.classList.add('menu-open');
      pauseMenu.classList.add('open');
    }
    function stopUiEvent(event){
      event.stopPropagation();
      if(event.type==='pointerdown'||event.type==='mousedown'||event.type==='touchstart'){
        lastMenuPointerButton=event.target instanceof Element?event.target.closest('button'):null;
        lastMenuPointerAt=performance.now();
        guardMenuInteraction();
      }
    }
    function setFullscreenButtonsBusy(busy){
      [fullscreenStartBtn,fullscreenPauseBtn].forEach(button=>{
        button.disabled=Boolean(busy);
        button.setAttribute('aria-busy',busy?'true':'false');
      });
    }

    const audio = new AudioSys();
    audio.setEnabled(settings.sound);
    document.querySelectorAll('[data-setting]').forEach(el=>{
      ['pointerdown','mousedown','mouseup','click','dblclick','touchstart','touchend'].forEach(type=>el.addEventListener(type,stopUiEvent));
      el.addEventListener('keydown',event=>{if(event.code!=='Escape')event.stopPropagation();});
      el.addEventListener('change',event=>{
        event.stopPropagation();guardMenuInteraction(450);
        const key=el.dataset.setting;
        settings[key]=el.type==='checkbox'?el.checked:el.value;
        saveSettings();syncSettingsUI();
        if(key==='sound'){audio.setEnabled(settings.sound);if(settings.sound)audio.resume();}
        if(key==='quality'){
          lowFpsWindows=0;highFpsWindows=0;
          setQualityMode(settings.quality==='low'?'low':'high',true);
        }
        if(key==='difficulty'&&gameStarted&&!gameFinished)showMessage(`🏁 СЛОЖНОСТЬ: ${difficulty().label}`);
        if(menuOpen)preservePauseMenu();
      });
    });
    document.querySelectorAll('#pause-menu button,#start-screen button,#finish-screen button').forEach(button=>{
      ['pointerdown','mousedown','mouseup','click','dblclick','touchstart','touchend'].forEach(type=>button.addEventListener(type,stopUiEvent));
      button.addEventListener('keydown',event=>{if(event.code!=='Escape')event.stopPropagation();});
    });
    syncSettingsUI();

    class ParticleSystem {
      constructor(scene,max=180){this.scene=scene;this.particles=[];this.pool=[];this.max=max;this.geometry=new THREE.BoxGeometry(1,1,1);}
      spawn(pos, color, count, speed, life, size=0.15, gravity=true, glow=false) {
        if(this.particles.length>=this.max) return;
        const limit=Math.min(count, this.max-this.particles.length);
        for(let i=0;i<limit;i++){
          let mesh;
          if(this.pool.length>0){
            mesh=this.pool.pop();
            mesh.material.color.set(color);
            mesh.material.opacity=1;
            mesh.material.blending=glow?THREE.AdditiveBlending:THREE.NormalBlending;
            mesh.material.depthWrite=!glow;
            mesh.material.needsUpdate=true;
            mesh.visible=true;
          } else {
            const mat=new THREE.MeshBasicMaterial({color, transparent:true, depthWrite:!glow, blending:glow?THREE.AdditiveBlending:THREE.NormalBlending});
            mesh=new THREE.Mesh(this.geometry,mat);
          }
          mesh.position.copy(pos); mesh.rotation.set(0,0,0); mesh.scale.setScalar(size);
          const vel=new THREE.Vector3((Math.random()-0.5)*speed, (Math.random()*0.5+0.3)*speed*(gravity?0.5:1), (Math.random()-0.5)*speed);
          this.scene.add(mesh);
          this.particles.push({mesh, vel, life, maxLife:life, size, rot:new THREE.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5), gravity, glow});
        }
      }
      update(dt) {
        for(let i=this.particles.length-1;i>=0;i--){
          const p=this.particles[i]; p.life-=dt;
          if(p.gravity)p.vel.y-=18*dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x+=p.rot.x*dt*10; p.mesh.rotation.y+=p.rot.y*dt*10;
          const s=Math.max(0, p.life/p.maxLife);
          p.mesh.scale.setScalar(p.size*s); p.mesh.material.opacity=s;
          if(p.life<=0||p.mesh.position.y<-3){p.mesh.visible=false;this.pool.push(p.mesh);this.particles.splice(i,1);}
        }
      }
    }

    class SkidSystem {
      constructor(scene,max=100){this.scene=scene;this.skids=[];this.pool=[];this.max=max;this.geometry=new THREE.PlaneGeometry(0.35,1.0);}
      add(pos, angle) {
        let mesh;
        if(this.pool.length>0){mesh=this.pool.pop();mesh.visible=true;mesh.material.opacity=0.6;}
        else{mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.6,depthWrite:false}));mesh.rotation.x=-Math.PI/2;}
        mesh.position.set(pos.x,0.04,pos.z); mesh.rotation.z=angle;
        this.scene.add(mesh); this.skids.push({mesh, life:10});
        if(this.skids.length>this.max){const old=this.skids.shift();old.mesh.visible=false;this.pool.push(old.mesh);}
      }
      update(dt) {
        for(let i=this.skids.length-1;i>=0;i--){
          const s=this.skids[i]; s.life-=dt;
          s.mesh.material.opacity=Math.max(0,s.life/10*0.6);
          if(s.life<=0){s.mesh.visible=false;this.pool.push(s.mesh);this.skids.splice(i,1);}
        }
      }
    }

    const shockwaves=[];
    const shockwaveGeometry=new THREE.RingGeometry(0.92,1.08,48);
    function spawnShockwave(position,color,maxRadius=18,duration=0.55){
      const material=new THREE.MeshBasicMaterial({
        color,transparent:true,opacity:0.8,side:THREE.DoubleSide,
        depthWrite:false,blending:THREE.AdditiveBlending
      });
      const mesh=new THREE.Mesh(shockwaveGeometry,material);
      mesh.position.copy(position);mesh.rotation.x=-Math.PI/2;mesh.scale.setScalar(0.1);
      scene.add(mesh);
      shockwaves.push({mesh,material,age:0,duration,maxRadius});
    }
    function updateShockwaves(dt){
      for(let i=shockwaves.length-1;i>=0;i--){
        const effect=shockwaves[i];
        effect.age+=dt;
        const progress=THREE.MathUtils.clamp(effect.age/effect.duration,0,1);
        const eased=1-Math.pow(1-progress,3);
        effect.mesh.scale.setScalar(Math.max(0.1,effect.maxRadius*eased));
        effect.material.opacity=(1-progress)*0.78;
        if(progress>=1){
          scene.remove(effect.mesh);effect.material.dispose();shockwaves.splice(i,1);
        }
      }
    }
    function clearShockwaves(){
      for(const effect of shockwaves){scene.remove(effect.mesh);effect.material.dispose();}
      shockwaves.length=0;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.003);
    const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.5, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference: "high-performance" });
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.2;
    document.getElementById('gameCanvas').appendChild(renderer.domElement);
    renderer.domElement.tabIndex=0;
    renderer.domElement.setAttribute('aria-label','Игровое поле Cyber Race');
    renderer.domElement.addEventListener('pointerdown',()=>renderer.domElement.focus({preventScroll:true}));
    renderer.domElement.addEventListener('pointercancel',clearInputs);

    function createSky() {
      const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=512;
      const ctx=canvas.getContext('2d');
      const grad=ctx.createLinearGradient(0,0,0,512);
      grad.addColorStop(0,'#02020a'); grad.addColorStop(0.4,'#0f0c29'); grad.addColorStop(0.7,'#302b63'); grad.addColorStop(1,'#24243e');
      ctx.fillStyle=grad; ctx.fillRect(0,0,512,512);
      for(let i=0;i<400;i++){ctx.fillStyle=`rgba(255,255,255,${Math.random()*0.8})`;ctx.fillRect(Math.random()*512,Math.random()*512,Math.random()*2,Math.random()*2);}
      return new THREE.Mesh(new THREE.SphereGeometry(600,32,32), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas), side:THREE.BackSide}));
    }
    scene.add(createSky());

    scene.add(new THREE.AmbientLight(0x404060,0.5));
    const sun=new THREE.DirectionalLight(0xffddaa,3);
    sun.position.set(60,80,40); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-300; sun.shadow.camera.right=300; sun.shadow.camera.top=300; sun.shadow.camera.bottom=-300; sun.shadow.bias=-0.001;
    scene.add(sun);scene.add(sun.target);
    scene.add(new THREE.HemisphereLight(0x302b63,0x1a2a1a,0.4));

    const {trackPoints,trackCurve,totalLength,samples,tangents,isOnRoadFast,findClosest}=createTrackEnvironment({THREE,scene,document,CONFIG});

    function createCar(color, isPlayer=false) {
      const g=new THREE.Group();
      g.scale.set(1.9,1.9,1.9);

      const bodyMat=new THREE.MeshStandardMaterial({color, roughness:0.2, metalness:0.75});
      const body=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.55,4.4), bodyMat);
      body.position.y=0.65; body.castShadow=true; g.add(body);

      const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.42,2.0), new THREE.MeshStandardMaterial({color:0x0a0a1a, roughness:0.05, metalness:0.9}));
      cabin.position.set(0,1.05,-0.2); cabin.castShadow=true; g.add(cabin);

      const spoiler=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.07,0.5), bodyMat);
      spoiler.position.set(0,1.15,1.9); g.add(spoiler);
      const spL=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.28,0.28), bodyMat); spL.position.set(0.7,1.0,1.85); g.add(spL);
      const spR=spL.clone(); spR.position.x=-0.7; g.add(spR);

      const hlMat=new THREE.MeshStandardMaterial({color:0xffffee, emissive:0xffffaa, emissiveIntensity:2.5});
      const headL=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.2,0.1), hlMat); headL.position.set(0.6,0.62,-2.2); g.add(headL);
      const headR=headL.clone(); headR.position.x=-0.6; g.add(headR);

      if(isPlayer){
        const spotL=new THREE.SpotLight(0xffffee,8,60,0.5,0.4,1); spotL.position.set(0.6,0.6,-2.1); spotL.target.position.set(0.6,0,-14); g.add(spotL); g.add(spotL.target);
        const spotR=spotL.clone(); spotR.position.x=-0.6; spotR.target.position.set(-0.6,0,-14); g.add(spotR); g.add(spotR.target);
      }

      const tailMat=new THREE.MeshStandardMaterial({color:0xff0000, emissive:0xff0000, emissiveIntensity:2});
      const tailL=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.15,0.08), tailMat); tailL.position.set(0.6,0.72,2.2); g.add(tailL);
      const tailR=tailL.clone(); tailR.position.x=-0.6; g.add(tailR);

      const weaponGroup=new THREE.Group(); weaponGroup.position.set(0,1.3,0); g.add(weaponGroup);
      const rocketLauncher=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.24,0.8,8), new THREE.MeshStandardMaterial({color:0x333333}));
      rocketLauncher.position.set(0,0.45,0); rocketLauncher.visible=false; weaponGroup.add(rocketLauncher);
      const machineGun=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.14,1.0), new THREE.MeshStandardMaterial({color:0x222222}));
      machineGun.position.set(0,0.4,0.25); machineGun.visible=false; weaponGroup.add(machineGun);

      const wheels=[];
      [[1.05,1.4],[-1.05,1.4],[1.05,-1.4],[-1.05,-1.4]].forEach(([x,z],i)=>{
        const wg=new THREE.Group(); wg.position.set(x,0.38,z); g.add(wg);
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.3,10).rotateZ(Math.PI/2), new THREE.MeshStandardMaterial({color:0x111111}));
        wg.add(tire);
        const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.32,6).rotateZ(Math.PI/2), new THREE.MeshStandardMaterial({color:0xcccccc, metalness:0.8, roughness:0.2}));
        wg.add(rim);
        wheels.push({group:wg, isFront:i<2, tire, rim});
      });
      return {group:g, wheels, weaponGroup, rocketLauncher, machineGun};
    }

    const playerCar=createCar(0xe82121,true); scene.add(playerCar.group);
    const playerShieldMesh=new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.0,2),
      new THREE.MeshBasicMaterial({color:0x33ccff,transparent:true,opacity:0.16,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    playerShieldMesh.visible=false; scene.add(playerShieldMesh);
    const opponents=[];
    [0x3366ff,0xffaa00,0x22cc44].forEach((col,i)=>{
      const car=createCar(col); scene.add(car.group);
      const healthCanvas=document.createElement('canvas'); healthCanvas.width=64; healthCanvas.height=8;
      const healthCtx=healthCanvas.getContext('2d');
      const healthTex=new THREE.CanvasTexture(healthCanvas);
      const healthPlane=new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.35), new THREE.MeshBasicMaterial({map:healthTex, transparent:true, depthTest:true, depthWrite:false}));
      healthPlane.position.y=3.4; car.group.add(healthPlane);
      opponents.push({
        car, healthPlane, healthCtx, healthTex, 
        t:0.006+i*0.006, baseSpeed:44+Math.random()*7, speed:44+Math.random()*7, 
        offset:(i-1)*7,targetOffset:(i-1)*7,laneChangeTimer:2+Math.random()*3,bumpOffset:0,bumpVelocity:0,
        slowTimer:0,health:100,dead:false,
        respawnTimer:0, attackCooldown:0, rockets:3, gunAmmo:60, 
        lap:1, prevT:0.006+i*0.006, crossedHalf:false, 
        lastSampleIdx: Math.floor((0.006+i*0.006)*CONFIG.NUM_SAMPLES),
        nitroCharges:1,nitroTimer:0,speedBoostTimer:0,shieldTimer:0,
        lastHealthDrawn:-1,id:i
      });
    });

    const bonusMeshes=[];
    const bonusTypes=['rocket','machinegun','nitro','speedboost','emp','health','shield'];
    const bonusData={
      rocket:{color:0xff3333, emissive:0xff0000, geo:new THREE.ConeGeometry(0.35,0.9,8), icon:'🚀', name:'РАКЕТА'},
      machinegun:{color:0x4444ff, emissive:0x2222ff, geo:new THREE.BoxGeometry(0.6,0.45,0.35), icon:'🔫', name:'ПАТРОНЫ'},
      nitro:{color:0x33ff66, emissive:0x00cc44, geo:new THREE.CylinderGeometry(0.3,0.3,0.8,8), icon:'💨', name:'НИТРО'},
      speedboost:{color:0xffdd00, emissive:0xffaa00, geo:new THREE.OctahedronGeometry(0.5), icon:'⚡', name:'СКОРОСТЬ'},
      emp:{color:0xff00ff, emissive:0xcc00cc, geo:new THREE.TorusKnotGeometry(0.35,0.12,32,6), icon:'💥', name:'ЭМИ'},
      health:{color:0xff4444, emissive:0xff2222, geo:new THREE.SphereGeometry(0.45,10,10), icon:'❤️', name:'ЖИЗНЬ'},
      shield:{color:0x55ddff, emissive:0x00aaff, geo:new THREE.IcosahedronGeometry(0.5,1), icon:'🛡️', name:'ЩИТ'}
    };
    const bonusRingGeometry=new THREE.TorusGeometry(0.7,0.04,8,24);
    const sharedBonusGeometries=new Set([...Object.values(bonusData).map(d=>d.geo),bonusRingGeometry]);
    const sharedBonusMaterials=new Set();
    Object.values(bonusData).forEach(d=>{
      d.mainMat=new THREE.MeshStandardMaterial({color:d.color,emissive:d.emissive,emissiveIntensity:0.8,metalness:0.6,roughness:0.3});
      d.ringMat=new THREE.MeshBasicMaterial({color:d.emissive,transparent:true,opacity:0.6,depthWrite:false,blending:THREE.AdditiveBlending});
      sharedBonusMaterials.add(d.mainMat);sharedBonusMaterials.add(d.ringMat);
    });
    const bonusRespawnTimers=new Set();

    function disposeObject3D(root,keepGeometries=new Set(),keepMaterials=new Set()) {
      if(!root) return;
      const disposedMaterials=new Set();
      root.traverse(obj=>{
        if(obj.geometry && !keepGeometries.has(obj.geometry)) obj.geometry.dispose?.();
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        materials.filter(Boolean).forEach(mat=>{
          if(disposedMaterials.has(mat)||keepMaterials.has(mat))return;
          disposedMaterials.add(mat);
          if(mat.map) mat.map.dispose?.();
          mat.dispose?.();
        });
      });
    }

    function scheduleBonusRespawn(delay=10000) {
      const timer=setTimeout(()=>{
        bonusRespawnTimers.delete(timer);
        if(gameStarted&&!gameFinished){
          if(paused){scheduleBonusRespawn(1000);return;}
          if(bonusMeshes.length<CONFIG.NUM_BONUSES)spawnBonus(Math.random(),(Math.random()-0.5)*1.8);
        }
      },delay);
      bonusRespawnTimers.add(timer);
    }

    function clearBonusRespawnTimers() {
      bonusRespawnTimers.forEach(timer=>clearTimeout(timer));
      bonusRespawnTimers.clear();
    }

    function createBonusIcon(type) {
      const d=bonusData[type];
      const group=new THREE.Group();
      const mesh=new THREE.Mesh(d.geo,d.mainMat);
      group.add(mesh); group.userData.rotMesh=mesh;
      const ring=new THREE.Mesh(bonusRingGeometry,d.ringMat);
      ring.rotation.x=Math.PI/2; group.add(ring); group.userData.ring=ring;
      // Floating text labels were intentionally removed: they cluttered the road
      // and created dozens of large canvas textures.
      return group;
    }

    function spawnBonus(t,off) {
      if(bonusMeshes.length>=CONFIG.NUM_BONUSES)return;
      const pt=trackCurve.getPointAt(t), tg=trackCurve.getTangentAt(t).normalize();
      const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
      const pos=pt.clone().addScaledVector(perp, off*CONFIG.ROAD_HALF*0.85); pos.y=2.2;
      const type=bonusTypes[Math.floor(Math.random()*bonusTypes.length)];
      const group=createBonusIcon(type); group.position.copy(pos);
      scene.add(group);
      bonusMeshes.push({group, type, baseY:2.2});
    }
    function spawnBonusAt(x,z) {
      if(bonusMeshes.length>=CONFIG.NUM_BONUSES)return;
      const type=bonusTypes[Math.floor(Math.random()*bonusTypes.length)];
      const group=createBonusIcon(type); group.position.set(x,2.2,z);
      scene.add(group);
      bonusMeshes.push({group, type, baseY:2.2});
    }
    function removeBonusAt(index, respawn=true) {
      const bonus=bonusMeshes[index];
      if(!bonus)return;
      scene.remove(bonus.group);
      disposeObject3D(bonus.group,sharedBonusGeometries,sharedBonusMaterials);
      bonusMeshes.splice(index,1);
      if(respawn)scheduleBonusRespawn();
    }
    for(let i=0;i<CONFIG.NUM_BONUSES;i++) spawnBonus((i*0.016+Math.random()*0.01)%1, (Math.random()-0.5)*1.8);

    const player={
      pos:samples[0].clone(), heading:Math.atan2(tangents[0].x,tangents[0].z),
      speed:0, speedLat:0, steerAngle:0, wheelRot:0, lap:1, lapStart:0, bestLap:Infinity, curLap:0,
      prevT:0, crossedHalf:true, rockets:4, gunAmmo:80, nitro:3,
      speedBoostTimer:0, nitroTimer:0, empTimer:0, shieldTimer:0, regenDelay:0,
      maxSpeed:CONFIG.MAX_SPEED, health:100, invincibleTimer:0,
      driftTime:0, driftScoreCarry:0, score:0, kills:0, deaths:0, combo:0, comboTimer:0,
      totalTime:0, lastSampleIdx:0, destroyed:false, deathTimer:0, damageCooldown:0,
      deathPos:new THREE.Vector3(), deathHeading:0, wrongWayTimer:0, resetCooldown:0,
      pulseCooldown:0, stuckTimer:0
    };

    let paused=true,gameStarted=false,gameFinished=false,menuOpen=false,lastRaceWon=false;
    let raceCountdown=0, countdownLastNumber=null, cameraShake=0, nitroFxTimer=0, incomingThreat=Infinity;
    let raceStartHint=true;
    let qualityMode='high', lowFpsWindows=0, highFpsWindows=0;
    const records=(()=>{
      try{
        const saved=JSON.parse(localStorage.getItem('cyberRaceRecords')||'{}');
        return {bestLap:Number(saved.bestLap)||Infinity,highScore:Number(saved.highScore)||0,bestTotal:Number(saved.bestTotal)||Infinity};
      }catch{return {bestLap:Infinity,highScore:0,bestTotal:Infinity};}
    })();
    const keys={};
    let mouseLeft=false, mouseRight=false, rocketFired=false, gunFireTimer=0;

    function formatRecordTime(value){return Number.isFinite(value)?value.toFixed(2)+' c':'—';}
    function updateRecordInfo(){
      recordInfoEl.innerHTML=`Лучший круг: <b>${formatRecordTime(records.bestLap)}</b> &nbsp;•&nbsp; Очки: <b>${records.highScore}</b>${Number.isFinite(records.bestTotal)?`<br>Лучшее время 15 кругов: <b>${formatRecordTime(records.bestTotal)}</b>`:''}`;
    }
    function saveRecords(){
      records.bestLap=Math.min(records.bestLap,player.bestLap);
      records.highScore=Math.max(records.highScore,Math.round(player.score));
      if(gameFinished&&lastRaceWon)records.bestTotal=Math.min(records.bestTotal,player.totalTime);
      try{localStorage.setItem('cyberRaceRecords',JSON.stringify(records));}catch{}
      updateRecordInfo();
    }
    function clearInputs() {
      Object.keys(keys).forEach(key=>delete keys[key]);
      mouseLeft=false; mouseRight=false; rocketFired=false; gunFireTimer=0;
    }

    function setGameplayCursor(active) {
      document.body.classList.toggle('game-running',Boolean(active));
    }

    function focusGameCanvas() {
      if(!gameStarted||gameFinished||paused||menuOpen)return;
      const active=document.activeElement;
      if(active instanceof HTMLElement&&active!==renderer.domElement)active.blur();
      requestAnimationFrame(()=>{
        if(gameStarted&&!gameFinished&&!paused&&!menuOpen){
          try{renderer.domElement.focus({preventScroll:true});}
          catch{renderer.domElement.focus();}
        }
      });
    }

    function openMenu() {
      if(!gameStarted || gameFinished) return;
      paused=true;menuOpen=true;
      clearInputs();syncSettingsUI();
      setGameplayCursor(false);
      document.body.classList.add('menu-open');
      pauseMenu.classList.add('open');
      if(document.hasFocus())requestAnimationFrame(()=>{
        if(!menuOpen)return;
        try{resumeBtn.focus({preventScroll:true});}
        catch{resumeBtn.focus();}
      });
    }

    function closeMenu({force=false}={}) {
      if(!menuOpen||gameFinished||fullscreenTransition)return;
      if(!force&&isMenuInteractionGuarded())return;
      paused=false;menuOpen=false;
      blockGameplayInput();
      setGameplayCursor(true);
      document.body.classList.remove('menu-open');
      pauseMenu.classList.remove('open');
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      focusGameCanvas();
    }

    function canControl(){
      return gameStarted&&!gameFinished&&!paused&&raceCountdown<=0;
    }
    function canAcceptGameplayInput(){
      return canControl()&&!player.destroyed&&!isGameplayInputBlocked();
    }

    function beginCountdown(){
      raceCountdown=CONFIG.COUNTDOWN_SECONDS+0.15;
      countdownLastNumber=null;
      clearInputs();
      comboDisplayEl.classList.remove('show');
      incomingWarningEl.classList.remove('show');
      lockIndicatorEl.textContent='🚀 ПРИГОТОВЬТЕСЬ';
      lockIndicatorEl.classList.remove('locked');
    }

    function updateCountdown(dt){
      if(raceCountdown<=0)return;
      raceCountdown=Math.max(0,raceCountdown-dt);
      const number=Math.ceil(raceCountdown);
      if(number>0&&number!==countdownLastNumber){
        countdownLastNumber=number;
        showMessage(String(number));
        audio.play('countdown');
      }else if(raceCountdown<=0&&countdownLastNumber!==0){
        countdownLastNumber=0;
        showMessage('🏁 ВПЕРЁД!');
        audio.play('go');
        raceStartHint=true;
        focusGameCanvas();
        opponents.forEach(o=>o.attackCooldown=Math.max(o.attackCooldown,1.4));
      }
    }

    window.togglePause = function(event){
      event?.preventDefault?.();event?.stopPropagation?.();
      if(!gameStarted||gameFinished||fullscreenTransition)return;
      if(menuOpen)closeMenu({force:true});else openMenu();
    };

    function runMenuAction(event,action,{allowDuringGuard=false}={}){
      event?.preventDefault?.();event?.stopPropagation?.();
      if(fullscreenTransition||!isDirectMenuActivation(event))return;
      if(!allowDuringGuard&&isMenuInteractionGuarded())return;
      guardMenuInteraction(180);
      action();
    }

    resumeBtn.addEventListener('click',event=>runMenuAction(event,()=>{
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      audio.resume();closeMenu({force:true});
    },{allowDuringGuard:true}));

    async function requestFullscreenCompat(){
      const root=document.documentElement;
      const request=root.requestFullscreen||root.webkitRequestFullscreen||root.msRequestFullscreen;
      if(!request)throw new Error('Fullscreen API is unavailable');
      return await request.call(root);
    }
    async function exitFullscreenCompat(){
      const exit=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
      if(!exit)throw new Error('Fullscreen exit API is unavailable');
      return await exit.call(document);
    }
    async function toggleFullscreen(event){
      event?.preventDefault?.();event?.stopPropagation?.();
      if(fullscreenTransition||!isDirectMenuActivation(event))return;
      guardMenuInteraction(700);
      fullscreenKeepPause=Boolean(menuOpen||paused||!startScreen.classList.contains('hidden')||!finishScreen.classList.contains('hidden'));
      fullscreenTransition=true;setFullscreenButtonsBusy(true);
      const pauseWasOpen=menuOpen&&gameStarted&&!gameFinished;
      try{
        if(!fullscreenElement())await requestFullscreenCompat();
        else await exitFullscreenCompat();
      }catch(error){
        console.warn('Fullscreen failed:',error);
        showMessage('⚠️ БРАУЗЕР НЕ РАЗРЕШИЛ ПОЛНЫЙ ЭКРАН');
      }finally{
        if(pauseWasOpen)preservePauseMenu();
        else if(!gameStarted||gameFinished){paused=true;setGameplayCursor(false);}
        updateFullscreenButtons();
        setTimeout(()=>{
          fullscreenTransition=false;fullscreenKeepPause=false;setFullscreenButtonsBusy(false);
        },160);
      }
    }
    function updateFullscreenButtons(){
      const text=fullscreenElement()?'⛶ ВЫЙТИ ИЗ ПОЛНОГО ЭКРАНА':'⛶ ПОЛНЫЙ ЭКРАН';
      fullscreenStartBtn.textContent=text;fullscreenPauseBtn.textContent=text;
    }
    function handleFullscreenChange(){
      clearInputs();updateFullscreenButtons();
      if((fullscreenKeepPause||paused)&&gameStarted&&!gameFinished)preservePauseMenu();
      requestAnimationFrame(()=>{
        camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
        renderer.setSize(innerWidth,innerHeight,false);
      });
    }
    fullscreenStartBtn.addEventListener('click',toggleFullscreen);
    fullscreenPauseBtn.addEventListener('click',toggleFullscreen);
    document.addEventListener('fullscreenchange',handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange',handleFullscreenChange);
    document.addEventListener('fullscreenerror',()=>{
      fullscreenTransition=false;setFullscreenButtonsBusy(false);
      if(menuOpen)preservePauseMenu();
      showMessage('⚠️ ПОЛНЫЙ ЭКРАН НЕДОСТУПЕН');
    });
    const fullscreenSupported=Boolean(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen||document.documentElement.msRequestFullscreen);
    if(!fullscreenSupported){
      [fullscreenStartBtn,fullscreenPauseBtn].forEach(button=>{button.disabled=true;button.textContent='⛶ ПОЛНЫЙ ЭКРАН НЕ ПОДДЕРЖИВАЕТСЯ';});
    }

    function returnToMainMenu(){
      saveRecords();
      paused=true; gameStarted=false; gameFinished=false; menuOpen=false; raceCountdown=0;raceStartHint=true;
      document.body.classList.remove('game-session-active','menu-open');
      clearInputs();clearBonusRespawnTimers();setGameplayCursor(false);
      while(projectiles.length)removeProjectileAt(projectiles.length-1);
      particles.particles.forEach(p=>{p.mesh.visible=false;particles.pool.push(p.mesh);});particles.particles.length=0;
      skids.skids.forEach(s=>{s.mesh.visible=false;skids.pool.push(s.mesh);});skids.skids.length=0;
      clearShockwaves();
      pauseMenu.classList.remove('open');finishScreen.classList.add('hidden');startScreen.classList.remove('hidden');
      document.body.classList.remove('low-health');
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      playerShieldMesh.visible=false;
      if(msgTimeout){clearTimeout(msgTimeout);msgTimeout=null;}messageEl.classList.remove('show');
      if(hitMarkerTimer){clearTimeout(hitMarkerTimer);hitMarkerTimer=null;}
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');
      updateRecordInfo(); updateUI();
    }
    restartBtn.addEventListener('click',event=>runMenuAction(event,()=>{audio.resume();window.restartGame();},{allowDuringGuard:true}));
    finishRestartBtn.addEventListener('click',event=>runMenuAction(event,()=>{audio.resume();window.restartGame();},{allowDuringGuard:true}));
    menuBtn.addEventListener('click',event=>runMenuAction(event,returnToMainMenu,{allowDuringGuard:true}));
    finishMenuBtn.addEventListener('click',event=>runMenuAction(event,returnToMainMenu,{allowDuringGuard:true}));
    window.addEventListener('keydown',e=>{
      const key=e.key.toLowerCase();
      const menuVisible=menuOpen||!startScreen.classList.contains('hidden')||!finishScreen.classList.contains('hidden');
      if(e.code==='Escape'){
        clearInputs();
        if(fullscreenTransition)return;
        // При выходе из полноэкранного режима гонка сначала ставится на паузу.
        // Поэтому Esc никогда не оставляет машину ехать без контроля пользователя.
        if(fullscreenElement()){
          fullscreenKeepPause=true;
          if(gameStarted&&!gameFinished&&!menuOpen)openMenu();
          return;
        }
        e.preventDefault();
        if(menuOpen)closeMenu({force:true});else openMenu();
        return;
      }
      if(menuVisible&&isInteractiveTarget(e.target))return;
      if(!menuVisible&&isInteractiveTarget(e.target)){
        if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
        focusGameCanvas();
      }
      if(key==='f'&&!e.repeat){e.preventDefault();toggleFullscreen(e);return;}
      if(key==='m'&&!e.repeat){
        settings.sound=!settings.sound;saveSettings();syncSettingsUI();audio.setEnabled(settings.sound);
        if(settings.sound)audio.resume();
        if(gameStarted&&!gameFinished)showMessage(settings.sound?'🔊 ЗВУК ВКЛЮЧЁН':'🔇 ЗВУК ВЫКЛЮЧЕН');
        return;
      }
      if(canControl()&&(key==='q'||key==='й')&&!e.repeat){
        e.preventDefault();
        activateDefensePulse();
        return;
      }
      if(canControl()&&key==='t'&&!e.repeat){
        e.preventDefault();
        if(!player.destroyed&&player.resetCooldown<=0){
          player.resetCooldown=CONFIG.MANUAL_RESET_COOLDOWN;
          showMessage('↩️ ВОЗВРАТ НА ТРАССУ −10');
          respawnPlayer('manual');
        }
        return;
      }
      if(gameStarted && !gameFinished && key==='r' && !e.repeat){
        e.preventDefault(); window.restartGame(); return;
      }
      if(paused || !gameStarted || gameFinished || player.destroyed) return;
      keys[key]=true; keys[e.code]=true;
      if(e.code==='Space' && !e.repeat) activateNitro();
      if(['w','a','s','d','q','ц','ф','ы','в','й',' '].includes(key)||e.code.startsWith('Arrow'))e.preventDefault();
    });
    window.addEventListener('keyup',e=>{
      keys[e.key.toLowerCase()]=false;keys[e.code]=false;
    });
    window.addEventListener('mousedown',e=>{
      if(isInteractiveTarget(e.target)||menuOpen||fullscreenTransition)return;
      audio.resume();
      if(paused||!gameStarted||gameFinished)return;
      if(e.button===0)mouseLeft=true;
      if(e.button===2){mouseRight=true;e.preventDefault();}
    });
    window.addEventListener('mouseup',e=>{
      if(isInteractiveTarget(e.target)||menuOpen||fullscreenTransition){clearInputs();return;}
      if(e.button===0)mouseLeft=false;
      if(e.button===2){mouseRight=false;rocketFired=false;}
    });
    window.addEventListener('mouseleave',clearInputs);
    window.addEventListener('contextmenu',e=>{
      if(isInteractiveTarget(e.target)||menuOpen)return;
      if(gameStarted&&!paused&&!gameFinished)e.preventDefault();
    });
    window.addEventListener('blur',()=>{clearInputs(); if(gameStarted&&!paused&&!gameFinished)openMenu();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs(); if(gameStarted&&!paused&&!gameFinished)openMenu();}});
    document.getElementById('start-btn').addEventListener('click',event=>runMenuAction(event,()=>{
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      audio.resume();window.restartGame();
    },{allowDuringGuard:true}));

    function activateNitro(){
      if(!canAcceptGameplayInput())return;
      if(player.nitro>0&&player.nitroTimer<=0){player.nitro--;player.nitroTimer=2.5;audio.play('nitro');}
    }

    function activateDefensePulse(){
      if(!canAcceptGameplayInput()||player.pulseCooldown>0)return;
      player.pulseCooldown=CONFIG.DEFENSE_PULSE_COOLDOWN;
      let intercepted=0;
      for(let i=projectiles.length-1;i>=0;i--){
        const projectile=projectiles[i];
        if(projectile.owner==='player')continue;
        if(projectile.mesh.position.distanceTo(player.pos)<=CONFIG.DEFENSE_PULSE_RADIUS){
          const impact=projectile.mesh.position.clone();
          removeProjectileAt(i);
          particles.spawn(impact,0x66ddff,4,5,0.35,0.1,false,true);
          intercepted++;
        }
      }
      let disrupted=0;
      opponents.forEach(opponent=>{
        if(opponent.dead)return;
        if(opponent.car.group.position.distanceTo(player.pos)<=CONFIG.DEFENSE_PULSE_RADIUS){
          opponent.slowTimer=Math.max(opponent.slowTimer,CONFIG.DEFENSE_PULSE_SLOW);
          opponent.attackCooldown=Math.max(opponent.attackCooldown,1.1);
          disrupted++;
        }
      });
      const center=player.pos.clone().setY(0.35);
      spawnShockwave(center,0x33ccff,CONFIG.DEFENSE_PULSE_RADIUS,0.72);
      particles.spawn(center,0x55ddff,qualityMode==='high'?22:12,12,0.8,0.16,false,true);
      player.invincibleTimer=Math.max(player.invincibleTimer,0.35);
      player.score+=intercepted*12;
      incomingWarningEl.classList.remove('show');
      audio.play('shield');
      addCameraShake(0.35);
      if(intercepted||disrupted)showMessage(`🛡 ИМПУЛЬС: РАКЕТ ${intercepted} • ЦЕЛЕЙ ${disrupted}`);
      else showMessage('🛡 ЗАЩИТНЫЙ ИМПУЛЬС');
    }

    const projectiles=[];
    const projectileTmpA=new THREE.Vector3();
    const projectileTmpB=new THREE.Vector3();
    const projectileTmpC=new THREE.Vector3();
    const projectilePrevious=new THREE.Vector3();
    const projectileTargetPos=new THREE.Vector3();
    const projectileTargetVel=new THREE.Vector3();
    const projectileLookPoint=new THREE.Vector3();
    const projectileTrailPos=new THREE.Vector3();
    const bulletGeometry=new THREE.BoxGeometry(0.09,0.09,1.6);
    const playerBulletMaterial=new THREE.MeshBasicMaterial({color:0xffff44,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const botBulletMaterial=new THREE.MeshBasicMaterial({color:0xff8844,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});

    const segmentSphereHit=createSegmentSphereHit(THREE);

    function getTargetPosition(target,out=new THREE.Vector3()){
      if(target===player)return out.copy(player.pos).setY(0.9);
      if(target?.car?.group)return out.copy(target.car.group.position).setY(0.9);
      return null;
    }

    function getTargetVelocity(target,out=new THREE.Vector3()){
      if(target===player){
        const fx=Math.sin(player.heading),fz=Math.cos(player.heading);
        return out.set(fx*player.speed,0,fz*player.speed);
      }
      if(target?.car?.group){
        const tg=trackCurve.getTangentAt(target.t).normalize();
        let speed=target.baseSpeed||0;
        if(target.slowTimer>0)speed*=0.35;
        if(target.nitroTimer>0)speed*=1.7;
        if(target.speedBoostTimer>0)speed*=1.25;
        return out.set(tg.x*speed,0,tg.z*speed);
      }
      return out.set(0,0,0);
    }

    function acquirePlayerRocketTarget(start,forward){
      return selectRocketTarget(
        opponents,start,forward,CONFIG.ROCKET_LOCK_RANGE,CONFIG.ROCKET_LOCK_DOT,
        opponent=>opponent.car.group.position
      );
    }

    function addCameraShake(amount){if(settings.cameraShake)cameraShake=Math.max(cameraShake,amount);}
    let hitMarkerTimer=null;
    function showHitMarker(){
      if(hitMarkerTimer)clearTimeout(hitMarkerTimer);
      hitMarkerEl.classList.add('show');
      hitMarkerTimer=setTimeout(()=>{hitMarkerEl.classList.remove('show');hitMarkerTimer=null;},110);
    }
    function spawnImpactEffect(pos,isRocket=false){
      const distanceToPlayer=pos.distanceTo(player.pos);
      if(isRocket){
        spawnShockwave(pos.clone().setY(0.22),0xff5522,12,0.42);
        particles.spawn(pos,0xff4400,10,9,0.75,0.18,true,true);
        particles.spawn(pos,0xffcc33,6,6,0.5,0.12,true,true);
        if(distanceToPlayer<190)audio.play('explosion');
        addCameraShake(0.75*THREE.MathUtils.clamp(1-distanceToPlayer/190,0,1));
      }else{
        particles.spawn(pos,0xffff55,3,3,0.22,0.08,false,true);
        if(distanceToPlayer<150)audio.play('hit');
        addCameraShake(0.22*THREE.MathUtils.clamp(1-distanceToPlayer/150,0,1));
      }
    }

    const rocketPools={player:[],opponent:[]};
    const bulletPools={player:[],opponent:[]};
    function createBulletMesh(poolKey){
      const mesh=bulletPools[poolKey].pop()||new THREE.Mesh(bulletGeometry,poolKey==='player'?playerBulletMaterial:botBulletMaterial);
      mesh.visible=true;mesh.scale.set(1,1,1);return mesh;
    }
    function removeProjectileAt(index){
      const projectile=projectiles[index];
      if(!projectile)return;
      scene.remove(projectile.mesh);
      if(projectile.isRocket&&projectile.mesh.userData.poolKey){
        projectile.mesh.visible=false;
        projectile.mesh.userData.flame.scale.setScalar(1);
        projectile.mesh.userData.flame.rotation.set(0,0,0);
        rocketPools[projectile.mesh.userData.poolKey].push(projectile.mesh);
      }else if(projectile.poolKey&&bulletPools[projectile.poolKey]){
        projectile.mesh.visible=false;bulletPools[projectile.poolKey].push(projectile.mesh);
      }else if(!projectile.sharedResources)disposeObject3D(projectile.mesh);
      projectiles.splice(index,1);
    }

    function createRocketMesh(color,emissiveColor,poolKey='player') {
      const pooled=rocketPools[poolKey].pop();
      if(pooled){pooled.visible=true;pooled.scale.set(1,1,1);return pooled;}
      const group = new THREE.Group();
      group.userData.poolKey=poolKey;
      const bodyGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ 
        color: color, emissive: emissiveColor, emissiveIntensity: 2.5, metalness: 0.8, roughness: 0.2 
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      group.add(body);
      
      const noseGeo = new THREE.ConeGeometry(0.16, 0.55, 8);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.z = -0.82;
      group.add(nose);
      
      const tailGeo = new THREE.CylinderGeometry(0.2, 0.14, 0.35, 8);
      const tailMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.3 });
      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = 0.72;
      group.add(tail);
      
      const flameGeo = new THREE.ConeGeometry(0.12, 0.6, 8);
      const flameMat = new THREE.MeshBasicMaterial({ 
        color: 0xffaa00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending 
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = 1.05;
      group.add(flame);
      group.userData.flame = flame;
      
      
      return group;
    }

    function fireRocket() {
      if(player.rockets<=0||projectiles.length>=CONFIG.MAX_PROJECTILES)return;
      player.rockets--;
      const forward=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading)).normalize();
      const start=player.pos.clone().addScaledVector(forward,5.2).setY(1.4);
      const target=acquirePlayerRocketTarget(start,forward);

      const rocket=createRocketMesh(0xff2222,0xff0000,'player');
      rocket.position.copy(start);
      rocket.lookAt(start.clone().sub(forward));
      scene.add(rocket);

      projectiles.push({
        mesh:rocket, vel:forward.clone().multiplyScalar(CONFIG.PLAYER_ROCKET_SPEED),
        life:target?CONFIG.PLAYER_ROCKET_LIFE:1.8, damage:35, owner:'player', ownerRef:player,
        target, turnSpeed:target?7.5:0, isRocket:true, age:0, noProgress:0, trailTimer:0,
        lastTargetDistance:target?target.car.group.position.distanceTo(start):Infinity
      });
      updateWeaponVis();
      audio.play('rocket');

      particles.spawn(start.clone(),0xff6600,6,6,0.32,0.13,false,true);
      if(!target)showMessage('🚀 НЕТ ЦЕЛИ ВПЕРЕДИ');
    }

    function fireGun() {
      if(player.gunAmmo<=0)return;
      if(projectiles.length>=CONFIG.MAX_PROJECTILES) return;
      player.gunAmmo--;
      const spread=(Math.random()-0.5)*0.05;
      const heading=player.heading+spread;
      const dx=Math.sin(heading), dz=Math.cos(heading);
      const start=player.pos.clone().add(new THREE.Vector3(dx*3,1.0,dz*3));
      const bullet=createBulletMesh('player');
      bullet.position.copy(start);bullet.lookAt(start.clone().add(new THREE.Vector3(dx,0,dz)));scene.add(bullet);
      projectiles.push({mesh:bullet,vel:new THREE.Vector3(dx*128,0,dz*128),life:0.95,damage:10,owner:'player',ownerRef:player,isRocket:false,age:0,sharedResources:true,poolKey:'player'});
      updateWeaponVis();
      audio.play('shoot');

      particles.spawn(start,0xffff66,2,2.5,0.12,0.08,false,true);
    }

    function updateWeaponVis() {
      playerCar.rocketLauncher.visible=player.rockets>0;
      playerCar.machineGun.visible=player.gunAmmo>0;
      document.getElementById('slot-rocket').classList.toggle('active', player.rockets>0);
      document.getElementById('slot-gun').classList.toggle('active', player.gunAmmo>0);
    }

    function beginPlayerDeath(){
      if(player.destroyed||gameFinished)return;
      player.destroyed=true;player.deathTimer=CONFIG.PLAYER_DEATH_DELAY;
      player.deathPos.copy(player.pos);player.deathHeading=player.heading;
      player.deaths++;player.score=Math.max(0,player.score-50);player.combo=0;player.comboTimer=0;
      player.nitroTimer=0;player.speedBoostTimer=0;player.empTimer=0;player.shieldTimer=0;player.health=0;
      clearInputs();playerCar.group.visible=false;playerShieldMesh.visible=false;
      wrongWayEl.classList.remove('show');incomingWarningEl.classList.remove('show');
      const blast=player.pos.clone().setY(1);
      particles.spawn(blast,0xff2200,18,13,1.4,0.25,true,true);
      particles.spawn(blast,0xffaa00,12,9,1.0,0.18,true,true);
      audio.play('explosion');showMessage('💥 МАШИНА УНИЧТОЖЕНА —50');addCameraShake(1.15);
      for(let i=projectiles.length-1;i>=0;i--){
        if(projectiles[i].owner!=='player'&&projectiles[i].mesh.position.distanceTo(player.pos)<55)removeProjectileAt(i);
      }
    }

    function findSafeRespawnIndex(baseIdx){
      const n=CONFIG.NUM_SAMPLES;
      const offsets=[0,-4,4,-8,8];
      let bestIdx=((baseIdx%n)+n)%n,bestScore=-Infinity;
      for(const offset of offsets){
        const idx=(baseIdx+offset+n)%n;
        const pt=samples[idx];
        let nearestOpponent=Infinity;
        opponents.forEach(o=>{
          if(!o.dead)nearestOpponent=Math.min(nearestOpponent,o.car.group.position.distanceToSquared(pt));
        });
        const score=Math.sqrt(nearestOpponent)-Math.abs(offset)*1.35;
        if(score>bestScore){bestScore=score;bestIdx=idx;}
      }
      return bestIdx;
    }

    function clearHostileProjectilesNear(position,radius=CONFIG.RESPAWN_CLEAR_RADIUS){
      const radiusSq=radius*radius;
      for(let i=projectiles.length-1;i>=0;i--){
        const p=projectiles[i];
        if(p.owner!=='player'&&p.mesh.position.distanceToSquared(position)<=radiusSq)removeProjectileAt(i);
      }
    }

    function respawnPlayer(reason='track') {
      if(reason==='death'){beginPlayerDeath();return;}
      const revive=reason==='revive';
      const previousHealth=player.health;
      const previousRegenDelay=player.regenDelay;
      const closest=findClosest(player.pos.x,player.pos.z,player.lastSampleIdx);
      const safeIdx=findSafeRespawnIndex(closest.idx);
      const pt=samples[safeIdx];
      player.pos.set(pt.x,0,pt.z);
      player.heading=Math.atan2(tangents[safeIdx].x,tangents[safeIdx].z);
      player.speed=0;player.speedLat=0;player.steerAngle=0;
      player.health=revive?100:Math.max(1,previousHealth);
      player.invincibleTimer=revive?2.4:1.25;
      player.damageCooldown=0;
      player.regenDelay=revive?2:Math.max(2,previousRegenDelay);
      player.destroyed=false;player.deathTimer=0;player.wrongWayTimer=0;player.stuckTimer=0;
      playerCar.group.visible=true;
      player.lastSampleIdx=safeIdx;player.prevT=safeIdx/CONFIG.NUM_SAMPLES;
      playerCar.group.position.set(player.pos.x,0.02,player.pos.z);
      playerCar.group.rotation.y=player.heading+Math.PI;
      playerShieldMesh.position.set(player.pos.x,2,player.pos.z);
      clearHostileProjectilesNear(player.pos);
      if(reason==='manual')player.score=Math.max(0,player.score-10);
      blockGameplayInput(180);
    }

    window.restartGame=function(){
      if(gameStarted)saveRecords();
      clearInputs();clearBonusRespawnTimers();
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      document.body.classList.remove('low-health','menu-open');speedVignetteEl.style.opacity='0';
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');
      finishScreen.classList.add('hidden'); startScreen.classList.add('hidden');
      document.body.classList.add('game-session-active');
      gameFinished=false;paused=false;gameStarted=true;menuOpen=false;lastRaceWon=false;
      raceStartHint=true;
      pauseMenu.classList.remove('open');
      setGameplayCursor(true);

      player.pos.copy(samples[0]);
      player.heading=Math.atan2(tangents[0].x,tangents[0].z);
      player.speed=0; player.speedLat=0; player.steerAngle=0; player.health=100; player.invincibleTimer=1.5;
      player.lap=1; player.curLap=0; player.bestLap=Infinity; player.prevT=0; player.crossedHalf=true; player.lastSampleIdx=0;
      player.rockets=4; player.gunAmmo=80; player.nitro=3; player.speedBoostTimer=0; player.nitroTimer=0; player.empTimer=0; player.shieldTimer=0; player.regenDelay=0;
      player.driftTime=0; player.driftScoreCarry=0; player.score=0; player.kills=0; player.deaths=0; player.combo=0; player.comboTimer=0; player.totalTime=0;
      player.destroyed=false;player.deathTimer=0;player.damageCooldown=0;player.wrongWayTimer=0;player.resetCooldown=0;
      player.pulseCooldown=0;player.stuckTimer=0;
      playerCar.group.visible=true; playerCar.group.position.set(player.pos.x,0.02,player.pos.z); playerCar.group.rotation.y=player.heading+Math.PI;
      playerShieldMesh.visible=false; playerShieldMesh.position.set(player.pos.x,2,player.pos.z);
      cameraShake=0; nitroFxTimer=0;
      camCur.set(player.pos.x,15,player.pos.z+30); lookCur.set(player.pos.x,1,player.pos.z);
      playerCar.wheels.forEach(w=>{w.group.rotation.y=0; w.tire.rotation.x=0; w.rim.rotation.x=0;});
      updateWeaponVis();

      opponents.forEach((o,i)=>{
        o.health=100; o.dead=false; o.respawnTimer=0; o.slowTimer=0; o.lap=1;
        o.rockets=3; o.gunAmmo=60; o.attackCooldown=0.8+Math.random()*1.5; o.speedBoostTimer=0;
        o.t=0.006+i*0.006;o.prevT=o.t;o.crossedHalf=false;o.car.group.visible=true;o.healthPlane.visible=true;
        o.offset=(i-1)*7;o.targetOffset=o.offset;o.laneChangeTimer=2+Math.random()*3;o.bumpOffset=0;o.bumpVelocity=0;
        o.lastSampleIdx=Math.floor(o.t*CONFIG.NUM_SAMPLES); o.nitroCharges=1; o.nitroTimer=0; o.shieldTimer=0; o.lastHealthDrawn=-1;
        const pt=trackCurve.getPointAt(o.t), tg=trackCurve.getTangentAt(o.t).normalize();
        const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
        const laneOffset=o.offset+o.bumpOffset;
        o.car.group.position.set(pt.x+perp.x*laneOffset,0.02,pt.z+perp.z*laneOffset);
        o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;
        o.car.wheels.forEach(w=>{w.group.rotation.y=0;w.tire.rotation.x=0;w.rim.rotation.x=0;});
      });

      while(bonusMeshes.length)removeBonusAt(bonusMeshes.length-1,false);
      for(let i=0;i<CONFIG.NUM_BONUSES;i++)spawnBonus((i*0.016+Math.random()*0.01)%1,(Math.random()-0.5)*1.8);
      while(projectiles.length)removeProjectileAt(projectiles.length-1);
      particles.particles.forEach(p=>{p.mesh.visible=false; particles.pool.push(p.mesh);}); particles.particles.length=0;
      skids.skids.forEach(s=>{s.mesh.visible=false; skids.pool.push(s.mesh);}); skids.skids.length=0;
      clearShockwaves();
      startScreen.classList.add('hidden');
      beginCountdown();
      updateUI(); minimap.render(); focusGameCanvas();
    };

    function completeLap(){
      const transition=resolveLapCompletion({
        lap:player.lap,curLap:player.curLap,bestLap:player.bestLap,totalLaps:CONFIG.TOTAL_LAPS
      });
      const completedLap=transition.completedLap;
      player.bestLap=transition.bestLap;
      player.score+=transition.scoreDelta;
      if(transition.grantCombatPack){
        player.rockets=Math.min(9,player.rockets+1);
        player.gunAmmo=Math.min(99,player.gunAmmo+20);
        player.nitro=Math.min(5,player.nitro+1);
        player.health=Math.min(100,player.health+15);
        updateWeaponVis();
        showMessage(`🎁 КРУГ ${completedLap}: БОЕВОЙ КОМПЛЕКТ`);
      }
      if(transition.finished){
        player.curLap=0; finishGame(true); return;
      }
      player.lap=transition.lap; player.curLap=transition.curLap;
      if(!transition.grantCombatPack)showMessage(`🏁 КРУГ ${completedLap} ПРОЙДЕН! +50`);
    }

    function finishGame(won){
      if(gameFinished)return;
      gameFinished=true;paused=true;menuOpen=false;lastRaceWon=Boolean(won);clearInputs();setGameplayCursor(false);
      document.body.classList.remove('game-session-active','menu-open');
      playerShieldMesh.visible=false;document.body.classList.remove('low-health');
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');speedVignetteEl.style.opacity='0';
      pauseMenu.classList.remove('open'); finishScreen.classList.remove('hidden');
      finishTitle.textContent=won?'🏆 ПОБЕДА!':'💀 ПОРАЖЕНИЕ';
      finishTitle.style.color=won?'#00ff66':'#ff0055';
      finishTitle.style.textShadow=won?'0 0 40px #00ff66':'0 0 40px #ff0055';
      const pos=getRacePositions().findIndex(x=>x.who==='player')+1;
      saveRecords();
      finishStats.innerHTML=`Круги: <b>${Math.min(player.lap,CONFIG.TOTAL_LAPS)}/${CONFIG.TOTAL_LAPS}</b><br>Позиция: <b>${pos}/4</b><br>Общее время: <b>${player.totalTime.toFixed(1)} с</b><br>Лучший круг: <b>${player.bestLap<Infinity?player.bestLap.toFixed(2):'--'}</b><br>Очки: <b>${Math.round(player.score)}</b><br>Уничтожено: <b>${player.kills}</b><br>Аварии: <b>${player.deaths}</b>`;
    }

    function destroyOpponent(o,impactAlready=false){
      if(o.dead)return;
      o.dead=true; o.car.group.visible=false; o.healthPlane.visible=false; o.respawnTimer=4;
      for(let i=projectiles.length-1;i>=0;i--){
        if(projectiles[i].ownerRef===o)removeProjectileAt(i);
        else if(projectiles[i].target===o){projectiles[i].target=null; projectiles[i].life=Math.min(projectiles[i].life,0.45);}
      }
      const pos=o.car.group.position.clone().add(new THREE.Vector3(0,1,0));

      const explodeLight=new THREE.PointLight(0xff4400,8,25); explodeLight.position.copy(pos); scene.add(explodeLight);
      setTimeout(()=>scene.remove(explodeLight),400);

      particles.spawn(pos, 0xff2200, 15, 12, 1.5, 0.25, true, true);
      particles.spawn(pos, 0xffaa00, 12, 8, 1.2, 0.2, true, true);
      particles.spawn(pos, 0x444444, 10, 6, 1.5, 0.18, true);

      spawnShockwave(pos.clone().setY(0.22),0xff4400,18,0.58);

      if(!impactAlready)audio.play('explosion');
      addCameraShake(impactAlready?0.55:0.9);
      player.combo=player.comboTimer>0?Math.min(5,player.combo+1):1;
      player.comboTimer=8;
      const reward=100*player.combo;
      player.score+=reward; player.kills++;
      comboDisplayEl.textContent=`КОМБО ×${player.combo}  +${reward}`;
      comboDisplayEl.classList.toggle('show',player.combo>1);

      if(Math.random()<0.6)spawnBonusAt(o.car.group.position.x, o.car.group.position.z);
    }

    function respawnOpponent(o){
      o.health=100; o.dead=false; o.slowTimer=0; o.shieldTimer=0; o.attackCooldown=1.2+Math.random();
      o.rockets=Math.max(o.rockets,2);o.gunAmmo=Math.max(o.gunAmmo,25);o.lastHealthDrawn=-1;o.bumpOffset=0;o.bumpVelocity=0;
      o.car.group.visible=true; o.healthPlane.visible=true;
      const closest = findClosest(o.car.group.position.x, o.car.group.position.z, o.lastSampleIdx);
      const pt=samples[closest.idx],tg=tangents[closest.idx],perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
      o.t=closest.t;o.prevT=o.t;
      const laneOffset=o.offset+o.bumpOffset;
      o.car.group.position.set(pt.x+perp.x*laneOffset,0.02,pt.z+perp.z*laneOffset);
      o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;
      o.lastSampleIdx=closest.idx;
    }

    const particles=new ParticleSystem(scene);
    const skids=new SkidSystem(scene);
    let damageOverlayTimer=null;
    function flashDamage(alpha=0.6){
      if(damageOverlayTimer)clearTimeout(damageOverlayTimer);
      damageOverlay.style.background=`radial-gradient(circle, transparent 30%, rgba(255,0,0,${alpha}) 100%)`;
      damageOverlayTimer=setTimeout(()=>{damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)'; damageOverlayTimer=null;},140);
    }

    function applyPlayerDamage(amount){
      if(player.invincibleTimer>0||player.damageCooldown>0||player.destroyed||gameFinished)return false;
      const multiplier=(player.shieldTimer>0?CONFIG.SHIELD_DAMAGE_MULTIPLIER:1)*difficulty().botDamage;
      const actual=amount*multiplier;
      player.health=Math.max(0,player.health-actual);
      player.damageCooldown=CONFIG.DAMAGE_GRACE;
      player.regenDelay=CONFIG.PLAYER_REGEN_DELAY;
      flashDamage(player.shieldTimer>0?0.25:0.58);
      addCameraShake(player.shieldTimer>0?0.18:0.45);
      return true;
    }

    function updatePlayer(dt){
      if(!canControl())return;
      const cl=Math.min(dt,0.075);
      player.curLap+=cl; player.totalTime+=cl;
      player.resetCooldown=Math.max(0,player.resetCooldown-cl);
      player.damageCooldown=Math.max(0,player.damageCooldown-cl);
      player.pulseCooldown=Math.max(0,player.pulseCooldown-cl);
      if(!Number.isFinite(player.pos.x)||!Number.isFinite(player.pos.z)||!Number.isFinite(player.speed)||
         Math.abs(player.pos.x)>CONFIG.STATE_SANITY_LIMIT||Math.abs(player.pos.z)>CONFIG.STATE_SANITY_LIMIT){
        console.warn('Player state recovered after invalid physics state');
        player.pos.copy(samples[Math.max(0,Math.min(CONFIG.NUM_SAMPLES-1,player.lastSampleIdx||0))]);
        player.speed=0;player.speedLat=0;
        showMessage('↩️ СОСТОЯНИЕ МАШИНЫ ВОССТАНОВЛЕНО');
        respawnPlayer('track');
        return;
      }
      if(player.destroyed){
        player.deathTimer=Math.max(0,player.deathTimer-cl);
        if(player.deathTimer<=0)respawnPlayer('revive');
        return;
      }
      player.comboTimer=Math.max(0,player.comboTimer-cl);
      if(player.comboTimer<=0){player.combo=0;comboDisplayEl.classList.remove('show');}
      player.regenDelay=Math.max(0,player.regenDelay-cl);
      if(player.regenDelay<=0&&player.health>0&&player.health<100)player.health=Math.min(100,player.health+CONFIG.PLAYER_REGEN_RATE*difficulty().regen*cl);
      player.shieldTimer=Math.max(0,player.shieldTimer-cl);
      const inputEnabled=!isGameplayInputBlocked();
      const thr=inputEnabled&&(keys['w']||keys['arrowup']||keys['ц']||keys['ArrowUp'])?1:0;
      const brk=inputEnabled&&(keys['s']||keys['arrowdown']||keys['ы']||keys['ArrowDown'])?1:0;
      const left=inputEnabled&&(keys['a']||keys['arrowleft']||keys['ф']||keys['ArrowLeft'])?1:0;
      const right=inputEnabled&&(keys['d']||keys['arrowright']||keys['в']||keys['ArrowRight'])?1:0;
      const handbrake=inputEnabled&&(keys['shift']||keys['ShiftLeft']||keys['ShiftRight']);
      const steerIn=right-left;
      if(thr||brk||Math.abs(player.speed)>1.2)raceStartHint=false;

      const targetSteer=-steerIn*0.55;
      player.steerAngle+=Math.sign(targetSteer-player.steerAngle)*Math.min(Math.abs(targetSteer-player.steerAngle),10*cl);

      let curMax=player.maxSpeed;
      if(player.speedBoostTimer>0){curMax*=1.35;player.speedBoostTimer=Math.max(0,player.speedBoostTimer-cl);}
      if(player.nitroTimer>0){
        curMax*=1.55;player.nitroTimer=Math.max(0,player.nitroTimer-cl);
      }
      if(player.empTimer>0){
        curMax*=0.58;
        player.empTimer=Math.max(0,player.empTimer-cl);
      }

      let force=0;
      if(thr&&player.speed<curMax)force=CONFIG.ACCEL*thr;
      if(brk)force=-CONFIG.BRAKE*brk;
      let drag=-player.speed*CONFIG.DRAG;
      player.speed += (force + drag) * cl;
      if(Math.abs(player.speed) < 0.1 && !thr && !brk) player.speed = 0;
      player.speed = THREE.MathUtils.clamp(player.speed, -10, curMax);

      const grip=handbrake?CONFIG.DRIFT_GRIP:CONFIG.GRIP;
      player.speedLat*=Math.pow(grip,cl*60);
      if(handbrake && Math.abs(player.speed) > 15 && Math.abs(player.steerAngle) > 0.2){
        player.speedLat += Math.sign(player.steerAngle) * 22 * cl;
        player.driftTime += cl;
        player.driftScoreCarry+=Math.abs(player.speed)*cl*0.035;
        if(player.driftScoreCarry>=1){const gained=Math.floor(player.driftScoreCarry);player.score+=gained;player.driftScoreCarry-=gained;}
        if(player.driftTime>0.08&&Math.random()<Math.min(1,18*cl)){
          const rearL = player.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(player.heading+0.35),0,Math.cos(player.heading+0.35)),1.5);
          const rearR = player.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(player.heading-0.35),0,Math.cos(player.heading-0.35)),1.5);
          skids.add(rearL, player.heading); skids.add(rearR, player.heading);
        }
      } else player.driftTime = Math.max(0, player.driftTime - cl * 3);

      const turn=player.steerAngle*(2.2+Math.abs(player.speed)/curMax*2.5);
      const reverseSteer=player.speed<0?-0.65:1;
      player.heading+=turn*cl*reverseSteer;

      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      const rx = Math.sin(player.heading + Math.PI/2), rz = Math.cos(player.heading + Math.PI/2);
      player.pos.x += (fx * player.speed + rx * player.speedLat) * cl;
      player.pos.z += (fz * player.speed + rz * player.speedLat) * cl;

      opponents.forEach(o=>{
        if(gameFinished)return;
        if(o.dead)return;
        const op=o.car.group.position;
        const dist=Math.hypot(player.pos.x-op.x,player.pos.z-op.z);
        if(dist<CONFIG.CAR_RADIUS*2&&dist>0.01){
          const angle=Math.atan2(player.pos.z-op.z,player.pos.x-op.x);
          const overlap=CONFIG.CAR_RADIUS*2-dist;
          player.pos.x+=Math.cos(angle)*overlap*0.5;
          player.pos.z+=Math.sin(angle)*overlap*0.5;
          const botTangent=trackCurve.getTangentAt(o.t).normalize();
          const botPerpX=-botTangent.z,botPerpZ=botTangent.x;
          const playerSide=Math.sign((player.pos.x-op.x)*botPerpX+(player.pos.z-op.z)*botPerpZ)||1;
          o.bumpVelocity-=playerSide*overlap*2.2;
          if(player.invincibleTimer<=0)applyPlayerDamage(8*cl);
          o.health-=6*cl*(o.shieldTimer>0?0.35:1);
          if(o.health<=0)destroyOpponent(o);
        }
      });
      if(player.health<=0&&player.invincibleTimer<=0)respawnPlayer('death');

      playerCar.group.position.set(player.pos.x,0.02,player.pos.z);
      playerCar.group.rotation.y=player.heading+Math.PI;
      playerShieldMesh.position.set(player.pos.x,2.0,player.pos.z);
      playerShieldMesh.rotation.y+=cl*0.8;
      playerShieldMesh.visible=player.shieldTimer>0;
      if(player.shieldTimer>0)playerShieldMesh.material.opacity=0.12+Math.sin(performance.now()*0.008)*0.06;
      if(player.nitroTimer>0){
        nitroFxTimer-=cl;
        if(nitroFxTimer<=0){
          nitroFxTimer=0.035;
          const exhaust=player.pos.clone().add(new THREE.Vector3(-Math.sin(player.heading)*3.2,0.8,-Math.cos(player.heading)*3.2));
          particles.spawn(exhaust,0x33ddff,3,4,0.32,0.14,false,true);
        }
      }else nitroFxTimer=0;

      const wd=player.speed*cl/0.38;
      playerCar.wheels.forEach(w=>{
        w.tire.rotation.x=(w.tire.rotation.x+wd)%(Math.PI*2);
        w.rim.rotation.x=w.tire.rotation.x;
        if(w.isFront)w.group.rotation.y=player.steerAngle*1.0;
      });

      if(player.invincibleTimer>0){
        player.invincibleTimer-=cl;
        playerCar.group.visible=Math.floor(performance.now()/100)%2===0;
      } else playerCar.group.visible=true;

      const closest = findClosest(player.pos.x, player.pos.z, player.lastSampleIdx);
      player.lastSampleIdx = closest.idx;
      const trackForward=tangents[closest.idx];
      const driveDot=Math.sin(player.heading)*trackForward.x+Math.cos(player.heading)*trackForward.z;
      if(player.speed>9&&driveDot<-0.25)player.wrongWayTimer=Math.min(3,player.wrongWayTimer+cl);
      else player.wrongWayTimer=Math.max(0,player.wrongWayTimer-cl*2.2);
      wrongWayEl.classList.toggle('show',player.wrongWayTimer>CONFIG.WRONG_WAY_DELAY);
      if(closest.dist>CONFIG.ROAD_HALF+3){
        const slow=Math.max(0,1-CONFIG.OFFROAD_DRAG*cl); player.speed*=slow; player.speedLat*=slow;
      }
      const tryingToMove=Boolean(thr||brk);
      if(closest.dist>CONFIG.ROAD_HALF+8&&Math.abs(player.speed)<1.6&&tryingToMove){
        player.stuckTimer+=cl;
      }else{
        player.stuckTimer=Math.max(0,player.stuckTimer-cl*2.2);
      }
      if(player.stuckTimer>=CONFIG.STUCK_RESET_DELAY){
        player.stuckTimer=0;
        showMessage('↩️ МАШИНА ВОЗВРАЩЕНА НА ТРАССУ');
        respawnPlayer('track');
        return;
      }
      if(closest.dist>CONFIG.MAX_TRACK_DISTANCE||Math.abs(player.pos.x)>CONFIG.WORLD_SIZE||Math.abs(player.pos.z)>CONFIG.WORLD_SIZE){
        showMessage('↩️ ВОЗВРАТ НА ТРАССУ'); respawnPlayer('track'); return;
      }
      const nt = closest.t;
      if(player.prevT>0.75&&nt<0.25&&player.crossedHalf&&driveDot>0.15&&closest.dist<CONFIG.ROAD_HALF+10){completeLap(); player.crossedHalf=false; if(gameFinished)return;}
      else if(player.prevT<0.25&&nt>0.75&&player.crossedHalf)player.crossedHalf=false;
      if(nt>0.4&&nt<0.6)player.crossedHalf=true;
      player.prevT=nt;
    }

    function updateOpponents(dt){
      if(!canControl())return;
      opponents.forEach(o=>{
        if(gameFinished)return;
        if(o.dead){o.respawnTimer-=dt; if(o.respawnTimer<=0)respawnOpponent(o); return;}
        o.slowTimer=Math.max(0,o.slowTimer-dt);
        o.shieldTimer=Math.max(0,(o.shieldTimer||0)-dt);

        // Подбор бонусов соперниками
        for(let i=bonusMeshes.length-1; i>=0; i--){
          const b = bonusMeshes[i];
          const d = o.car.group.position.distanceTo(b.group.position);
          if(d < 8){
            const type = b.type;
            if(type==='rocket') o.rockets = Math.min(o.rockets+2, 9);
            else if(type==='machinegun') o.gunAmmo = Math.min(o.gunAmmo+30, 99);
            else if(type==='nitro') o.nitroCharges = Math.min((o.nitroCharges||0)+1, 5);
            else if(type==='speedboost') o.speedBoostTimer = 8;
            else if(type==='emp'){
              if(o.car.group.position.distanceTo(player.pos)<130){
                player.empTimer=Math.max(player.empTimer,4);
                showMessage('⚡ ВАС НАКРЫЛО ЭМИ!');
              }else opponents.forEach(other=>{if(other!==o&&!other.dead)other.slowTimer=Math.max(other.slowTimer,2.5);});
            }
            else if(type==='health') o.health = Math.min(o.health+40, 100);
            else if(type==='shield') o.shieldTimer=Math.max(o.shieldTimer||0,5);
            removeBonusAt(i,true);
          }
        }

        const motion=stepOpponentFrame({
          id:o.id,laneChangeTimer:o.laneChangeTimer,targetOffset:o.targetOffset,offset:o.offset,
          bumpVelocity:o.bumpVelocity,bumpOffset:o.bumpOffset,nitroCharges:o.nitroCharges,
          nitroTimer:o.nitroTimer,speedBoostTimer:o.speedBoostTimer,slowTimer:o.slowTimer,
          baseSpeed:o.baseSpeed,lap:o.lap,t:o.t
        },{
          roadHalf:CONFIG.ROAD_HALF,difficultySpeed:difficulty().botSpeed,
          playerProgress:(player.lap-1)+player.prevT,
          minRubberBand:CONFIG.BOT_MIN_RUBBER_BAND,maxRubberBand:CONFIG.BOT_MAX_RUBBER_BAND,
          maxSpeed:CONFIG.MAX_SPEED,totalLength,totalLaps:CONFIG.TOTAL_LAPS,
          shouldAvoid:({offset,bumpOffset})=>{
            for(const other of opponents){
              if(other===o||other.dead)continue;
              let ahead=other.t-o.t;
              if(ahead<0)ahead+=1;
              const sameLap=other.lap===o.lap||(o.t>0.88&&other.t<0.12&&other.lap===o.lap+1);
              const closeLane=Math.abs((other.offset+other.bumpOffset)-(offset+bumpOffset))<6.5;
              const closeWorld=o.car.group.position.distanceToSquared(other.car.group.position)<CONFIG.BOT_AVOIDANCE_RANGE**2;
              if(sameLap&&ahead>0&&ahead<0.035&&closeLane&&closeWorld)return true;
            }
            return false;
          }
        },dt,Math.random);
        o.laneChangeTimer=motion.laneChangeTimer;o.targetOffset=motion.targetOffset;o.offset=motion.offset;
        o.bumpVelocity=motion.bumpVelocity;o.bumpOffset=motion.bumpOffset;
        o.nitroCharges=motion.nitroCharges;o.nitroTimer=motion.nitroTimer;o.speedBoostTimer=motion.speedBoostTimer;
        o.t=motion.t;o.lap=motion.lap;
        const effSpeed=motion.effSpeed;
        if(motion.finished){finishGame(false);return;}
        const pt=trackCurve.getPointAt(o.t),tg=trackCurve.getTangentAt(o.t).normalize();
        const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
        const laneOffset=o.offset+o.bumpOffset;
        o.car.group.position.set(pt.x+perp.x*laneOffset,0.02,pt.z+perp.z*laneOffset);
        const laneSteer=THREE.MathUtils.clamp((o.targetOffset-o.offset)*0.018+o.bumpVelocity*0.008,-0.18,0.18);
        o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI-laneSteer;
        o.healthPlane.lookAt(camera.position);

        o.car.wheels.forEach(w=>{
          w.tire.rotation.x=(w.tire.rotation.x+effSpeed*dt/0.38)%(Math.PI*2);w.rim.rotation.x=w.tire.rotation.x;
          if(w.isFront)w.group.rotation.y=laneSteer;
        });

        o.prevT=o.t;
        o.lastSampleIdx=Math.floor(o.t*CONFIG.NUM_SAMPLES);

        const roundedHealth=Math.max(0,Math.round(o.health));
        const healthKey=`${roundedHealth}|${o.shieldTimer>0?1:0}`;
        if(healthKey!==o.lastHealthDrawn){
          o.lastHealthDrawn=healthKey;
          o.healthCtx.clearRect(0,0,64,8); o.healthCtx.fillStyle='#330000'; o.healthCtx.fillRect(0,0,64,8);
          o.healthCtx.fillStyle=o.shieldTimer>0?'#22ccff':o.health>60?'#00ff00':o.health>30?'#ffff00':'#ff0000';
          o.healthCtx.fillRect(0,0,64*Math.max(0,o.health/100),8); o.healthTex.needsUpdate=true;
        }

        o.attackCooldown-=dt;
        if(o.attackCooldown<=0){
          const tgForAttack=trackCurve.getTangentAt(o.t).normalize();
          const attackPlan=planOpponentAttack({
            origin:{x:o.car.group.position.x,z:o.car.group.position.z},
            target:{x:player.pos.x,z:player.pos.z},
            targetVelocity:{x:Math.sin(player.heading)*player.speed,z:Math.cos(player.heading)*player.speed},
            forward:{x:tgForAttack.x,z:tgForAttack.z},
            difficulty:difficulty(),
            playerDestroyed:player.destroyed,playerInvincible:player.invincibleTimer,
            projectileCount:projectiles.length,maxProjectiles:CONFIG.MAX_PROJECTILES,
            rockets:o.rockets,gunAmmo:o.gunAmmo,playerLap:player.lap
          },Math.random);
          const shotX=attackPlan.shotX,shotZ=attackPlan.shotZ,dist=attackPlan.distance;
          if(attackPlan.kind==='rocket'){
            o.rockets--;
            const start=o.car.group.position.clone().add(new THREE.Vector3(shotX*3.5,1.4,shotZ*3.5));
            const rocket=createRocketMesh(0xff4444,0xff0000,'opponent');
            rocket.position.copy(start);
            rocket.lookAt(start.clone().sub(new THREE.Vector3(shotX,0,shotZ)));
            scene.add(rocket);
            projectiles.push({
              mesh:rocket,vel:new THREE.Vector3(shotX*CONFIG.BOT_ROCKET_SPEED,0,shotZ*CONFIG.BOT_ROCKET_SPEED),
              life:CONFIG.BOT_ROCKET_LIFE,damage:30,owner:'opponent',ownerRef:o,
              target:player,turnSpeed:4.2,isRocket:true,age:0,noProgress:0,trailTimer:0,
              lastTargetDistance:player.pos.distanceTo(start)
            });
            particles.spawn(start,0xff6622,5,5,0.28,0.12,false,true);
            audio.play('rocket');
          }else if(attackPlan.kind==='bullet'){
            o.gunAmmo--;
            const start=o.car.group.position.clone().add(new THREE.Vector3(shotX*3,1.0,shotZ*3));
            const bullet=createBulletMesh('opponent');
            bullet.position.copy(start);bullet.lookAt(start.clone().add(new THREE.Vector3(shotX,0,shotZ)));scene.add(bullet);
            projectiles.push({mesh:bullet,vel:new THREE.Vector3(shotX*108,0,shotZ*108),life:1.15,damage:9,owner:'opponent',ownerRef:o,isRocket:false,age:0,sharedResources:true,poolKey:'opponent'});
            particles.spawn(start,0xff9955,2,2.5,0.12,0.08,false,true);
            audio.play('shoot');
          }
          o.attackCooldown=attackPlan.cooldown;
        }
      });
    }

    function checkBonuses(){
      if(!canControl()||player.destroyed)return;
      for(let i=bonusMeshes.length-1;i>=0;i--){
        const m=bonusMeshes[i];
        if(player.pos.distanceTo(m.group.position)<6){
          const t=m.type;
          if(t==='rocket')player.rockets=Math.min(player.rockets+2,9);
          else if(t==='machinegun')player.gunAmmo=Math.min(player.gunAmmo+30,99);
          else if(t==='nitro')player.nitro=Math.min(player.nitro+1,5);
          else if(t==='speedboost')player.speedBoostTimer=10;
          else if(t==='emp'){opponents.forEach(o=>{if(!o.dead)o.slowTimer=6;}); showMessage('⚡ ЭМИ!');}
          else if(t==='health')player.health=Math.min(player.health+40,100);
          else if(t==='shield'){
            player.shieldTimer=Math.max(player.shieldTimer,CONFIG.SHIELD_DURATION);
            audio.play('shield'); showMessage('🛡️ ЭНЕРГОЩИТ АКТИВЕН');
          }
          updateWeaponVis();
          if(!['emp','shield'].includes(t))showMessage(`${bonusData[t].icon} ${bonusData[t].name}`);
          removeBonusAt(i,true);
          audio.play('bonus');
          particles.spawn(player.pos.clone(), bonusData[t].emissive, 4, 4, 0.5, 0.15, false, true);
        }
      }
    }

    function handleShooting(dt){
      if(!canAcceptGameplayInput())return;
      if(mouseRight&&player.rockets>0&&!rocketFired){fireRocket(); rocketFired=true;}
      if(!mouseRight)rocketFired=false;
      if(mouseLeft&&player.gunAmmo>0){
        gunFireTimer=Math.max(-0.08,gunFireTimer-dt);
        if(gunFireTimer<=0){fireGun(); gunFireTimer=0.08;}
      } else gunFireTimer=0;
    }

    function updateProjectiles(dt){
      if(!canControl())return;
      incomingThreat=Infinity;
      while(projectiles.length>CONFIG.MAX_PROJECTILES)removeProjectileAt(0);

      for(let i=projectiles.length-1;i>=0;i--){
        const p=projectiles[i];
        p.life-=dt; p.age=(p.age||0)+dt;
        const previous=projectilePrevious.copy(p.mesh.position);

        const targetValid=p.target===player
          ? !gameFinished&&!player.destroyed
          : Boolean(p.target&&!p.target.dead&&p.target.health>0);

        let rocketStep=null;
        if(p.isRocket&&targetValid){
          const targetPos=getTargetPosition(p.target,projectileTargetPos);
          const targetVel=getTargetVelocity(p.target,projectileTargetVel);
          rocketStep=stepHomingProjectile({
            position:{x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z},
            velocity:{x:p.vel.x,y:p.vel.y,z:p.vel.z},
            targetPosition:{x:targetPos.x,y:targetPos.y,z:targetPos.z},
            targetVelocity:{x:targetVel.x,y:targetVel.y,z:targetVel.z},
            turnSpeed:p.turnSpeed||4,dt,lastTargetDistance:p.lastTargetDistance,noProgress:p.noProgress||0,maxLead:0.55
          });
          const distance=rocketStep.distance;
          if(p.target===player&&p.owner!=='player')incomingThreat=Math.min(incomingThreat,distance);
          p.vel.set(rocketStep.velocity.x,rocketStep.velocity.y,rocketStep.velocity.z);
          p.mesh.lookAt(projectileLookPoint.copy(p.mesh.position).sub(p.vel));
          p.noProgress=rocketStep.noProgress;
          p.lastTargetDistance=distance;

          if(distance<=CONFIG.ROCKET_HIT_RADIUS+2.5){
            if(p.owner==='player'&&p.target!==player){
              const rocketDamage=(p.damage||35)*(p.target.shieldTimer>0?0.35:1);
              p.target.health-=rocketDamage;showHitMarker();
              const pos=p.mesh.position.clone(); removeProjectileAt(i); spawnImpactEffect(pos,true);
              if(p.target.health<=0)destroyOpponent(p.target,true);
            }else if(p.owner!=='player'&&player.invincibleTimer<=0&&!player.destroyed){
              applyPlayerDamage(p.damage||30);
              const pos=p.mesh.position.clone(); removeProjectileAt(i); spawnImpactEffect(pos,true);
              if(player.health<=0)respawnPlayer('death');
            }else removeProjectileAt(i);
            continue;
          }

          if(rocketStep.stalled)p.life=Math.min(p.life,0.25);
        }else if(p.isRocket&&p.target){
          p.target=null;
          p.life=Math.min(p.life,0.45);
        }

        if(rocketStep)p.mesh.position.set(rocketStep.position.x,rocketStep.position.y,rocketStep.position.z);
        else p.mesh.position.addScaledVector(p.vel,dt);
        if(p.isRocket){
          p.trailTimer=(p.trailTimer||0)-dt;
          if(p.trailTimer<=0){
            p.trailTimer=qualityMode==='high'?0.035:0.07;
            const trailPos=projectileTrailPos.copy(p.mesh.position).addScaledVector(p.vel,-0.018);
            particles.spawn(trailPos,p.owner==='player'?0xff7733:0xff3344,qualityMode==='high'?2:1,2.8,0.28,0.1,false,true);
          }
        }

        if(p.mesh.userData?.flame){
          p.mesh.userData.flame.scale.setScalar(0.7+Math.random()*0.6);
          p.mesh.userData.flame.rotation.z+=15*dt;
        }
        if(p.mesh.userData?.light)p.mesh.userData.light.intensity=3+Math.random()*3;

        if(Math.abs(p.mesh.position.x)>CONFIG.WORLD_SIZE||Math.abs(p.mesh.position.z)>CONFIG.WORLD_SIZE||p.mesh.position.y<-5){
          removeProjectileAt(i); continue;
        }
        if(p.life<=0){
          const pos=p.mesh.position.clone(); const rocket=p.isRocket;
          removeProjectileAt(i); if(rocket)spawnImpactEffect(pos,true); continue;
        }

        const hitRadius=p.isRocket?CONFIG.ROCKET_HIT_RADIUS:CONFIG.BULLET_HIT_RADIUS;
        if(p.owner!=='player'&&player.invincibleTimer<=0&&!player.destroyed&&segmentSphereHit(previous,p.mesh.position,player.pos,hitRadius)){
          applyPlayerDamage(p.damage||15);
          const pos=p.mesh.position.clone(),rocket=p.isRocket;
          removeProjectileAt(i); spawnImpactEffect(pos,rocket);
          if(player.health<=0)respawnPlayer('death');
          continue;
        }

        if(p.owner==='player'){
          let hitTarget=null;
          for(const o of opponents){
            if(o.dead||o.health<=0)continue;
            if(segmentSphereHit(previous,p.mesh.position,o.car.group.position,hitRadius)){hitTarget=o;break;}
          }
          if(hitTarget){
            const damage=(p.damage||15)*(hitTarget.shieldTimer>0?0.35:1);
            hitTarget.health-=damage;showHitMarker();
            const pos=p.mesh.position.clone(),rocket=p.isRocket;
            removeProjectileAt(i); spawnImpactEffect(pos,rocket);
            if(hitTarget.health<=0)destroyOpponent(hitTarget,true);
          }
        }
      }
      const warning=incomingThreat<125;
      incomingWarningEl.classList.toggle('show',warning);
      if(warning)incomingWarningEl.textContent=`⚠ РАКЕТА: ${Math.max(1,Math.round(incomingThreat))} м`;
    }

    const camCur=new THREE.Vector3(), camTgt=new THREE.Vector3();
    const lookCur=new THREE.Vector3(), lookTgt=new THREE.Vector3();
    function updateCamera(dt){
      if(player.destroyed){
        const elapsed=CONFIG.PLAYER_DEATH_DELAY-player.deathTimer;
        const angle=player.deathHeading+elapsed*1.25;
        camTgt.set(player.deathPos.x+Math.sin(angle)*18,player.deathPos.y+10,player.deathPos.z+Math.cos(angle)*18);
        lookTgt.set(player.deathPos.x,player.deathPos.y+1.2,player.deathPos.z);
        const k=1-Math.exp(-7*dt);camCur.lerp(camTgt,k);lookCur.lerp(lookTgt,k);
        camera.position.copy(camCur);camera.lookAt(lookCur);return;
      }
      const fx=Math.sin(player.heading), fz=Math.cos(player.heading);
      const speedFactor=Math.min(Math.abs(player.speed)/CONFIG.MAX_SPEED,1);
      const backDist=24+speedFactor*8;
      const upDist=11+speedFactor*4;
      camTgt.set(player.pos.x-fx*backDist, player.pos.y+upDist, player.pos.z-fz*backDist);
      lookTgt.set(player.pos.x+fx*18, player.pos.y+2, player.pos.z+fz*18);
      const l=1-Math.exp(-5*dt);
      camCur.lerp(camTgt,l); lookCur.lerp(lookTgt,l);
      camera.position.copy(camCur);
      if(cameraShake>0.01){
        camera.position.x+=(Math.random()-0.5)*cameraShake;
        camera.position.y+=(Math.random()-0.5)*cameraShake*0.55;
        camera.position.z+=(Math.random()-0.5)*cameraShake;
        cameraShake*=Math.exp(-8*dt);
      }else cameraShake=0;
      camera.lookAt(lookCur);
      const targetFov=58+speedFactor*6;
      if(Math.abs(camera.fov-targetFov)>0.06){camera.fov=targetFov;camera.updateProjectionMatrix();}
    }
    camCur.set(0,15,30); lookCur.set(0,0,0);

    const minimap=createMinimap({
      document,trackPoints,samples,
      getPlayer:()=>player,
      getOpponents:()=>opponents
    });

    let msgTimeout;
    function showMessage(txt){
      if(msgTimeout)clearTimeout(msgTimeout);
      messageEl.textContent=txt; messageEl.classList.add('show');
      msgTimeout=setTimeout(()=>messageEl.classList.remove('show'),1800);
    }
    const getRacePositions=()=>buildRacePositions(player,opponents);
    function updateTargetHUD(){
      if(!gameStarted||gameFinished){
        lockIndicatorEl.textContent='🚀 ЦЕЛЬ НЕ ЗАХВАЧЕНА';
        lockIndicatorEl.classList.remove('locked');
        return;
      }
      if(!canControl()||player.destroyed){
        lockIndicatorEl.textContent=player.destroyed?'🚀 СИСТЕМЫ ПЕРЕЗАГРУЖАЮТСЯ':raceCountdown>0?'🚀 ПРИГОТОВЬТЕСЬ':'🚀 ЦЕЛЬ НЕ ЗАХВАЧЕНА';
        lockIndicatorEl.classList.remove('locked');
        return;
      }
      if(raceStartHint||Math.abs(player.speed)<1.2){
        lockIndicatorEl.textContent='⬆ W / ↑ — ГАЗ';
        lockIndicatorEl.classList.remove('locked');
        return;
      }
      if(player.rockets<=0){lockIndicatorEl.textContent='🚀 РАКЕТ НЕТ';lockIndicatorEl.classList.remove('locked');return;}
      const forward=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading)).normalize();
      const start=player.pos.clone().addScaledVector(forward,5.2).setY(1.4);
      const target=acquirePlayerRocketTarget(start,forward);
      if(target){
        const distance=Math.round(target.car.group.position.distanceTo(start));
        lockIndicatorEl.textContent=`🎯 ЦЕЛЬ ЗАХВАЧЕНА • ${distance} м`;
        lockIndicatorEl.classList.add('locked');
      }else{
        lockIndicatorEl.textContent='🚀 ЦЕЛЬ НЕ ЗАХВАЧЕНА';
        lockIndicatorEl.classList.remove('locked');
      }
    }

    function updateUI(){
      speedEl.textContent=player.destroyed?'—':Math.round(Math.abs(player.speed)*3.6);
      lapEl.textContent=`${Math.min(player.lap,CONFIG.TOTAL_LAPS)}/${CONFIG.TOTAL_LAPS}`;
      currTimeEl.textContent=player.curLap.toFixed(1);
      bestTimeEl.textContent=player.bestLap<Infinity?player.bestLap.toFixed(1):'--';
      rocketCountEl.textContent=player.rockets; gunAmmoEl.textContent=player.gunAmmo;
      nitroChargesEl.textContent=player.nitro;
      const pulseReady=player.pulseCooldown<=0;
      pulseCooldownEl.textContent=pulseReady?'ГОТОВ':`${player.pulseCooldown.toFixed(1)}с`;
      pulseSlotEl.classList.toggle('active',pulseReady);
      scoreEl.textContent=Math.round(player.score);
      const hp=healthPercent(player.health);
      healthBar.style.width=hp+'%';
      healthBar.style.background=player.shieldTimer>0?'linear-gradient(90deg,#00aaff,#66eeff)':hp<30?'linear-gradient(90deg,#a80025,#ff315f)':'linear-gradient(90deg,#ff0000,#ff4444)';
      healthTextEl.textContent=`${Math.ceil(hp)} HP`;
      document.body.classList.toggle('low-health',hp>0&&hp<28&&player.shieldTimer<=0);
      shieldStatusEl.innerHTML=player.shieldTimer>0?`<span class="good">ЩИТ: ${player.shieldTimer.toFixed(1)} с</span>`:'ЩИТ: —';
      if(player.empTimer>0)effectStatusEl.innerHTML=`<span class="bad">ЭМИ: ${player.empTimer.toFixed(1)} с</span>`;
      else if(player.nitroTimer>0)effectStatusEl.innerHTML=`<span class="good">НИТРО: ${player.nitroTimer.toFixed(1)} с</span>`;
      else if(player.speedBoostTimer>0)effectStatusEl.innerHTML=`<span class="good">УСКОРЕНИЕ: ${player.speedBoostTimer.toFixed(1)} с</span>`;
      else if(player.regenDelay<=0&&player.health<100)effectStatusEl.innerHTML='<span class="good">РЕМОНТ КОРПУСА</span>';
      else effectStatusEl.textContent='СОСТОЯНИЕ: НОРМА';
      const speedFx=THREE.MathUtils.clamp((Math.abs(player.speed)-34)/45,0,0.65)+(player.nitroTimer>0?0.25:0);
      speedVignetteEl.style.opacity=String(Math.min(0.85,speedFx));
      const nitroPct=Math.min(100,(player.nitroTimer/2.5)*100);
      nitroBar.style.width=player.nitroTimer>0?nitroPct+'%':'0%';
      const positions=getRacePositions();
      posEl.textContent=`${positions.findIndex(x=>x.who==='player')+1}/4`;
      const raceProgress=raceProgressPercent(player,CONFIG.TOTAL_LAPS);
      raceProgressEl.style.width=raceProgress+'%';
      if(player.destroyed)effectStatusEl.innerHTML=`<span class="bad">ВОЗВРАЩЕНИЕ: ${player.deathTimer.toFixed(1)} с</span>`;
      updateTargetHUD();
    }

    function setQualityMode(mode,force=false){
      if(mode===qualityMode&&!force)return;
      qualityMode=mode;
      document.body.classList.toggle('low-quality',mode==='low');
      if(mode==='low'){
        renderer.setPixelRatio(Math.min(devicePixelRatio,1));
        renderer.shadowMap.enabled=false;
        particles.max=110;
        qualityIndicatorEl.textContent=settings.quality==='auto'?'ГРАФИКА: AUTO / ПРОИЗВОДИТЕЛЬНОСТЬ':'ГРАФИКА: ПРОИЗВОДИТЕЛЬНОСТЬ';
      }else{
        renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        renderer.shadowMap.enabled=true;
        renderer.shadowMap.needsUpdate=true;
        particles.max=180;
        qualityIndicatorEl.textContent=settings.quality==='auto'?'ГРАФИКА: AUTO / ВЫСОКАЯ':'ГРАФИКА: ВЫСОКАЯ';
      }
      renderer.setSize(innerWidth,innerHeight,false);
    }

    function updateAdaptiveQuality(fps){
      if(settings.quality!=='auto')return;
      if(fps<CONFIG.LOW_FPS_THRESHOLD){lowFpsWindows++;highFpsWindows=0;}
      else if(fps>CONFIG.HIGH_FPS_THRESHOLD){highFpsWindows++;lowFpsWindows=0;}
      else{lowFpsWindows=Math.max(0,lowFpsWindows-1);highFpsWindows=Math.max(0,highFpsWindows-1);}
      if(qualityMode==='high'&&lowFpsWindows>=3){setQualityMode('low');lowFpsWindows=0;}
      else if(qualityMode==='low'&&highFpsWindows>=8){setQualityMode('high');highFpsWindows=0;}
    }

    let lastTime=performance.now();
    let frameCount=0; let lastFpsTime=performance.now();
    let uiAccumulator=0,minimapAccumulator=0,lightAccumulator=0,lastIdleRender=0;
    function loop(now){
      requestAnimationFrame(loop);
      const dt=Math.min((now-lastTime)/1000,0.1); lastTime=now;
      const time=now/1000;

      const activeFrame=!paused&&gameStarted&&!gameFinished;
      if(activeFrame){
        frameCount++;
        if(now-lastFpsTime>=1000){
          fpsEl.textContent='FPS: '+frameCount;
          updateAdaptiveQuality(frameCount);
          frameCount=0;
          lastFpsTime=now;
        }
      }else if(now-lastFpsTime>=1000){
        frameCount=0;lastFpsTime=now;
      }

      if(activeFrame){
        if(raceCountdown>0){
          updateCountdown(dt);
          incomingWarningEl.classList.remove('show');
          updateCamera(dt);
        }else{
          updatePlayer(dt); updateOpponents(dt); checkBonuses(); handleShooting(dt);
          updateProjectiles(dt); updateCamera(dt);
        }
        particles.update(dt); skids.update(dt); updateShockwaves(dt);

        bonusMeshes.forEach(b=>{
          if(b.group.userData.rotMesh){b.group.userData.rotMesh.rotation.y+=2*dt; b.group.userData.rotMesh.rotation.z=Math.sin(time*3+b.group.position.x)*0.15;}
          if(b.group.userData.ring){b.group.userData.ring.rotation.z+=dt; b.group.userData.ring.scale.setScalar(0.92+Math.sin(time*4+b.group.position.z)*0.1);}
          b.group.position.y=b.baseY+Math.sin(time*2.5+b.group.position.x)*0.3;
        });

        lightAccumulator+=dt;
        if(lightAccumulator>=0.2){
          lightAccumulator=0;
          sun.position.set(player.pos.x+80,90,player.pos.z+50);
          sun.target.position.copy(player.pos);sun.target.updateMatrixWorld();
        }

        uiAccumulator+=dt; minimapAccumulator+=dt;
        if(uiAccumulator>=0.05){uiAccumulator=0;updateUI();}
        if(minimapAccumulator>=0.08){minimapAccumulator=0;minimap.render();}
      }else{
        speedVignetteEl.style.opacity='0';
        incomingWarningEl.classList.remove('show');
      }
      audio.updateEngine(Math.abs(player.speed)/CONFIG.MAX_SPEED,canControl(),player.nitroTimer>0);
      if(!activeFrame){
        if(now-lastIdleRender<CONFIG.IDLE_RENDER_INTERVAL_MS)return;
        lastIdleRender=now;
      }
      renderer.render(scene,camera);
    }
    window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,qualityMode==='high'?1.5:1));renderer.setSize(innerWidth,innerHeight);});
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault(); paused=true; clearInputs(); setGameplayCursor(false); showMessage('⚠️ ГРАФИКА ПЕРЕЗАПУСКАЕТСЯ');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>{if(gameStarted&&!gameFinished){openMenu(); showMessage('✅ ГРАФИКА ВОССТАНОВЛЕНА');}});
    playerCar.group.position.set(player.pos.x,0.02,player.pos.z); playerCar.group.rotation.y=player.heading+Math.PI;
    opponents.forEach(o=>{const pt=trackCurve.getPointAt(o.t),tg=trackCurve.getTangentAt(o.t).normalize(),perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();o.car.group.position.set(pt.x+perp.x*o.offset,0.02,pt.z+perp.z*o.offset);o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;o.attackCooldown=1.2+Math.random();});
    document.body.classList.remove('game-session-active','menu-open');
    pauseMenu.classList.remove('open');
    startScreen.classList.remove('hidden');
    finishScreen.classList.add('hidden');
    updateWeaponVis();updateUI();minimap.render();updateRecordInfo();syncSettingsUI();
    setQualityMode(settings.quality==='low'?'low':'high',true);
    if(settings.quality==='high')qualityIndicatorEl.textContent='ГРАФИКА: ВЫСОКАЯ';
    else if(settings.quality==='low')qualityIndicatorEl.textContent='ГРАФИКА: ПРОИЗВОДИТЕЛЬНОСТЬ';
    window.addEventListener('beforeunload',saveRecords);
    document.documentElement.dataset.cyberBoot='ready';
    requestAnimationFrame(loop);
  
})().catch(error=>{
  document.documentElement.dataset.cyberBoot='error';
  console.error('CYBER RACE runtime failed',error);
});
