(async()=>{
  'use strict';
  const CyberRace=globalThis.CyberRace;
  if(!CyberRace?.core||!CyberRace?.game||!CyberRace?.ai||!CyberRace?.weapons||!CyberRace?.audio||!CyberRace?.ui){
    throw new Error('CYBER RACE modules were not loaded in the expected order');
  }
  const {loadThree,loadObject,saveObject}=CyberRace.core;
  const {CONFIG,SETTINGS_DEFAULTS,SINGLE_RACE_MODES,createTrackEnvironment,sweepCarObstacle2D,createRaceGrid,resolveLapCompletion,sweptVehicleContact2D,singleRaceFinishOrder,stepPlayerDriving,readStandardGamepad,resolveDrivingInput,createCombatEffects,createCombatRenderer,createSpeedFeedback,cameraViewPose,measureFrameRate,stepAdaptiveQuality,CAR_PROFILES,garagePaint,buildProfile,buildLabel,buildKey,playerConfig,healPlayerHealth,respawnHealth,loadGarage,saveGarage,createTuningStore,createGarageRecords,createOvertakeTracker,createDriftMastery,createSlipstreamTracker,applyPickup,getRaceContractDefinition,createRaceContractTracker,createSectorTimer,createLapGhostTracker,createLapGhostVisual,createLapGhostStore,createPilotTutorial,isPrecisionInterception,precisionNitroReward,defenseRocketCue,formatSectorTime,formatSectorDelta}=CyberRace.game;
  const {CHAMPIONSHIP_STAGES,CHAMPIONSHIP_DRIVERS,CHAMPIONSHIP_POINTS,championshipStandings,championshipFinishOrder,createChampionshipStore}=CyberRace.game;
  const {getDifficulty,planOpponentTactics,selectOpponentCombatTarget,stepOpponentFrame,planOpponentAttack}=CyberRace.ai;
  const {createSegmentSphereHit,segmentSphereEntry3D,segmentBoxHit3D,createObstacleIndex,selectRocketTarget,stepHomingProjectile}=CyberRace.weapons;
  const {AudioSys}=CyberRace.audio;
  const {getUiElements,createMinimap,buildRacePositions,buildRivalGapHud,formatRivalDistance,rivalGapTrend,buildOvertakeSeriesHud,buildThreatIndicators,directionLabel,raceProgressPercent,healthPercent,speedometerReading,formatLapTime}=CyberRace.ui;

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
      speedNeedleEl,speedArcEl,shieldBarEl,effectNameEl,effectRowEl,
      speedEl,lapEl,bestTimeEl,currTimeEl,posEl,scoreEl,driftFeedbackEl,driftLabelEl,driftPointsEl,driftProgressEl,rivalGapEl,rivalGapLabelEl,rivalGapValueEl,rivalGapTrendEl,rocketCountEl,gunAmmoEl,
      nitroChargesEl,pulseCooldownEl,pulseSlotEl,messageEl,healthBar,nitroBar,
      overtakeSeriesEl,overtakeMultiplierEl,overtakeNextEl,overtakeTimeEl,overtakeBarEl,overtakeNoticeEl,
      raceContractHudEl,raceContractTitleEl,raceContractProgressEl,raceContractNoticeEl,
      sectorTimingEl,sectorCurrentEl,sectorDeltaEl,sectorDetailEl,
      damageOverlay,startScreen,finishScreen,finishTitle,finishStats,fpsEl,pauseMenu,
      resumeBtn,restartBtn,menuBtn,finishMenuBtn,finishRestartBtn,fullscreenStartBtn,
      restartConfirmDialog,restartConfirmAccept,restartConfirmCancel,
      fullscreenPauseBtn,healthTextEl,shieldStatusEl,effectStatusEl,lockIndicatorEl,
      incomingWarningEl,comboDisplayEl,speedVignetteEl,qualityIndicatorEl,recordInfoEl,
      raceProgressEl,wrongWayEl,hitMarkerEl
    }=getUiElements(document);
    const racePlural=new Intl.PluralRules('ru');
    for(const [selector,count,forms] of [
      ['[data-race-laps]',CONFIG.TOTAL_LAPS,{one:'круг',few:'круга',many:'кругов',other:'круга'}],
      ['[data-race-opponents]',CONFIG.BOT_COUNT,{one:'соперник',few:'соперника',many:'соперников',other:'соперника'}]
    ])for(const el of document.querySelectorAll(selector))el.textContent=`${count} ${forms[racePlural.select(count)]}`;
    const startButton=document.getElementById('start-btn');
    const controlsHelp=document.getElementById('controls-help');
    const controlsHelpButton=document.getElementById('controls-help-btn');
    const controlsHelpClose=document.getElementById('controls-help-close');
    const rearviewIndicatorEl=document.getElementById('rearview-indicator');
    const menuStatus=document.getElementById('menu-status');
    const pauseMenuStatus=document.getElementById('pause-menu-status');
    let garageStorage=null;
    try{garageStorage=window.localStorage;}catch{}
    const championship=createChampionshipStore(garageStorage);
    const stageCheckpoint=CyberRace.game.createStageCheckpoint(garageStorage);
    const checkpointPlayerNumbers=CyberRace.game.playerNumbers;
    const checkpointBotNumbers=CyberRace.game.botNumbers;
    let activeChampionship=null;
    let singleRaceMode='classic'; // Main-menu choice; retained on restart, never changes an active race.
    let selectedRaceContract='none'; // Per-run option, not persisted or shared with championship.
    const raceContractTracker=createRaceContractTracker();
    let contractGoalAnnounced=false;
    let contractNoticeAt=-Infinity;
    let championshipFinishedIds=[];
    let singleRaceFinishedIds=[];
    const championshipNew=document.getElementById('championship-new');
    const championshipContinue=document.getElementById('championship-continue');
    const championshipSummary=document.getElementById('championship-summary');
    const championshipStatus=document.getElementById('championship-status');
    const championshipResults=document.getElementById('championship-results');
    function raceLaps(){return activeChampionship?CHAMPIONSHIP_STAGES[activeChampionship.stageIndex].laps:SINGLE_RACE_MODES[singleRaceMode].laps;}
    let selectedGarage=loadGarage(garageStorage);
    const tuning=createTuningStore(garageStorage);
    let activeGarage={...selectedGarage};
    let activeBuild=tuning.getBuild(activeGarage.classId);
    let activeProfile=buildProfile(activeBuild);
    let drivingConfig=playerConfig(CONFIG,activeBuild);
    const garageButton=document.getElementById('garage-btn');
    let garage;
    function syncGarageLabel(){document.getElementById('garage-current').textContent=buildLabel(tuning.getBuild(selectedGarage.classId));}
    syncGarageLabel();

    const settings=loadObject('cyberRaceSettings',SETTINGS_DEFAULTS);
    if(!['easy','normal','hard'].includes(settings.difficulty))settings.difficulty='normal';
    if(!['auto','high','low'].includes(settings.quality))settings.quality='auto';
    settings.sound=settings.sound!==false;
    settings.cameraShake=settings.cameraShake!==false;
    settings.lapGhost=settings.lapGhost!==false;
    settings.tutorialEnabled=settings.tutorialEnabled!==false;
    settings.tutorialDone=settings.tutorialDone===true;
    settings.tutorialShieldSeen=settings.tutorialShieldSeen===true;
    settings.touchAutoThrottle=settings.touchAutoThrottle===true;
    const mobileControls=matchMedia('(pointer:coarse)');
    const initialInputMode=()=>mobileControls.matches?'touch':'keyboard';
    const initialQualityMode=()=>settings.quality==='low'||(settings.quality==='auto'&&mobileControls.matches)?'low':'high';
    const pilotTutorial=createPilotTutorial();
    pilotTutorial.start({enabled:settings.tutorialEnabled,done:settings.tutorialDone,shieldSeen:settings.tutorialShieldSeen});
    let tutorialInputMode=initialInputMode();
    const pilotTutorialEl=document.getElementById('pilot-tutorial');
    const pilotHeadingEl=document.getElementById('pilot-tutorial-heading');
    const pilotTitleEl=document.getElementById('pilot-tutorial-title');
    const pilotDetailEl=document.getElementById('pilot-tutorial-detail');
    const pilotKeyEl=document.getElementById('pilot-tutorial-key');
    const pilotSkipButton=document.getElementById('pilot-tutorial-skip');
    function advancePilotTutorial(action){
      if(pilotTutorial.action(action,player.totalTime)==='completed'){
        settings.tutorialDone=true;saveSettings();
      }
    }
    function renderPilotTutorial(){
      const view=pilotTutorial.view({active:canControl()&&!player.destroyed,
        now:player.totalTime,mode:tutorialInputMode,ammo:player.gunAmmo,nitro:player.nitro});
      pilotTutorialEl.hidden=!view;
      if(!view)return;
      pilotTutorialEl.dataset.kind=view.kind;
      if(pilotHeadingEl.textContent!==view.heading)pilotHeadingEl.textContent=view.heading;
      let title=view.title;
      if(mobileControls.matches&&view.kind==='step'){
        if(view.key==='▲ ГАЗ'&&!settings.touchAutoThrottle)title='Нажми ▲, чтобы разогнаться';
        else if(view.key==='ПУЛИ')title=player.gunAmmo>0?'Нажми «Пули»':'Подбери патроны на трассе';
        else if(view.key==='НИТРО')title=player.nitro>0?'Нажми «Нитро»':'Подбери нитро на трассе';
      }
      if(pilotTitleEl.textContent!==title)pilotTitleEl.textContent=title;
      if(pilotDetailEl.textContent!==view.detail)pilotDetailEl.textContent=view.detail;
      const key=view.key==='▲ ГАЗ'&&settings.touchAutoThrottle?'АВТОГАЗ':view.key;
      if(pilotKeyEl.textContent!==key)pilotKeyEl.textContent=key;
      pilotSkipButton.hidden=!view.skippable;
    }
    function difficulty(){return getDifficulty(activeChampionship?{...settings,difficulty:championship.snapshot().difficulty}:settings);}
    function saveSettings(){
      const persisted=saveObject('cyberRaceSettings',settings);
      if(!persisted){
        const warning='⚠ Настройки действуют только в этой вкладке: браузер не сохранил изменения.';
        if(menuOpen)pauseMenuStatus.textContent=warning;
        else if(!startScreen.classList.contains('hidden'))menuStatus.textContent=warning;
        else if(gameStarted&&!gameFinished)showMessage(warning);
      }
      return persisted;
    }
    function syncSettingsUI(){
      document.body.classList.toggle('touch-auto-throttle',settings.touchAutoThrottle);
      document.querySelectorAll('[data-setting]').forEach(el=>{
        const key=el.dataset.setting;
        if(el.type==='radio')el.checked=settings[key]===el.value;
        else if(el.type==='checkbox')el.checked=Boolean(settings[key]);
        else el.value=settings[key];
      });
    }

    const INTERACTIVE_SELECTOR='button,a[href],select,input,option,label,[role="button"],[data-settings-panel]';
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
        button.disabled=Boolean(busy)||!fullscreenSupported;
        button.setAttribute('aria-busy',busy?'true':'false');
      });
    }

    const audio = new AudioSys();
    const drivingAudio={throttle:0,skid:0,reverse:false};
    audio.setEnabled(settings.sound);
    document.querySelectorAll('[data-setting]').forEach(el=>{
      ['pointerdown','mousedown','mouseup','click','dblclick','touchstart','touchend'].forEach(type=>el.addEventListener(type,stopUiEvent));
      el.addEventListener('keydown',event=>{if(event.code!=='Escape')event.stopPropagation();});
      el.addEventListener('change',event=>{
        if(el.type==='radio'&&!el.checked)return;
        event.stopPropagation();guardMenuInteraction(450);
        const key=el.dataset.setting;
        settings[key]=el.type==='checkbox'?el.checked:el.value;
        saveSettings();syncSettingsUI();
        if(key==='sound'){audio.setEnabled(settings.sound);if(settings.sound)audio.resume();}
        if(key==='quality'){
          lowFpsWindows=0;highFpsWindows=0;
          setQualityMode(initialQualityMode(),true);
        }
        if(key==='difficulty'&&gameStarted&&!gameFinished)showMessage(`🏁 СЛОЖНОСТЬ: ${difficulty().label}`);
        if(key==='tutorialEnabled'){pilotTutorial.configure(settings.tutorialEnabled);renderPilotTutorial();}
        if(menuOpen)preservePauseMenu();
      });
    });
    document.querySelectorAll('#pause-menu button,#start-screen button,#finish-screen button').forEach(button=>{
      ['pointerdown','mousedown','mouseup','click','dblclick','touchstart','touchend'].forEach(type=>button.addEventListener(type,stopUiEvent));
      button.addEventListener('keydown',event=>{if(event.code!=='Escape')event.stopPropagation();});
    });
    syncSettingsUI();
    document.querySelectorAll('[data-pilot-replay]').forEach(button=>button.addEventListener('click',event=>runMenuAction(event,()=>{
      settings.tutorialEnabled=true;settings.tutorialDone=false;saveSettings();syncSettingsUI();
      pilotTutorial.start({enabled:true,done:false,shieldSeen:settings.tutorialShieldSeen});
      if(menuOpen)pauseMenuStatus.textContent='Инструктаж начнётся после продолжения гонки.';
      else menuStatus.textContent='Инструктаж включён для следующего заезда.';
      renderPilotTutorial();
    },{allowDuringGuard:true})));
    for(const type of ['pointerdown','mousedown','mouseup','click','touchstart','touchend']){
      pilotSkipButton.addEventListener(type,event=>event.stopPropagation());
    }
    pilotSkipButton.addEventListener('click',event=>{
      event.preventDefault();
      if(pilotTutorial.skip()){settings.tutorialDone=true;saveSettings();}
      renderPilotTutorial();focusGameCanvas();
    });
    controlsHelpButton.addEventListener('click',event=>runMenuAction(event,()=>{
      if(!controlsHelp.open)controlsHelp.showModal();
    },{allowDuringGuard:true}));
    controlsHelpClose.addEventListener('click',event=>runMenuAction(event,()=>controlsHelp.close(),{allowDuringGuard:true}));
    controlsHelp.addEventListener('keydown',event=>{
      event.stopPropagation();
      // The close button is the dialog's only focusable control.
      if(event.key==='Tab'){event.preventDefault();controlsHelpClose.focus();}
    },true);
    controlsHelp.addEventListener('cancel',()=>guardMenuInteraction(180));
    controlsHelp.addEventListener('close',()=>{
      if(!startScreen.classList.contains('hidden'))controlsHelpButton.focus({preventScroll:true});
    });
    pauseMenu.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||!menuOpen)return;
      const controls=[...pauseMenu.querySelectorAll('button,a[href],select,input')].filter(el=>!el.disabled&&el.getClientRects().length>0);
      const first=controls[0],last=controls[controls.length-1];
      if(!first)return;
      if(event.shiftKey&&(document.activeElement===first||!pauseMenu.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!pauseMenu.contains(document.activeElement))){event.preventDefault();first.focus();}
    },true);


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
    scene.background = new THREE.Color();
    scene.fog = new THREE.FogExp2();
    const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.5, 2200);
    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference: "high-performance" });
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
    const combatEffects=createCombatEffects({THREE,scene,camera,document});
    const combatRenderer=createCombatRenderer({THREE,renderer});
    const speedFeedback=createSpeedFeedback({document,element:speedVignetteEl});
    speedFeedback.resize(innerWidth,innerHeight);
    document.getElementById('gameCanvas').appendChild(renderer.domElement);
    renderer.domElement.tabIndex=0;
    renderer.domElement.setAttribute('aria-label','Игровое поле Cyber Race');
    renderer.domElement.addEventListener('pointerdown',()=>renderer.domElement.focus({preventScroll:true}));
    renderer.domElement.addEventListener('pointercancel',clearInputs);

    const ambient=new THREE.AmbientLight();
    const skyLight=new THREE.HemisphereLight();
    const sun=new THREE.DirectionalLight();
    sun.castShadow=true;
    sun.shadow.mapSize.set(1536,1536);
    sun.shadow.camera.left=-210; sun.shadow.camera.right=210; sun.shadow.camera.top=210; sun.shadow.camera.bottom=-210; sun.shadow.camera.far=650;
    sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.12;
    scene.add(ambient,skyLight,sun,sun.target);
    function placeTrackLight(position){
      const [x,y,z]=scenery.atmosphere.lightOffset;
      sun.position.set(position.x+x,position.y+y,position.z+z);
      sun.target.position.copy(position);sun.target.updateMatrixWorld();
    }
    function applyTrackAtmosphere(position){
      const light=scenery.atmosphere;
      scene.background.setHex(light.fogColor);
      scene.fog.color.setHex(light.fogColor);scene.fog.density=light.fogDensity;
      ambient.color.setHex(light.ambient);ambient.intensity=light.ambientPower;
      sun.color.setHex(light.key);sun.intensity=light.keyPower;
      skyLight.color.setHex(light.skyLight);skyLight.groundColor.setHex(light.bounce);skyLight.intensity=light.fill;
      placeTrackLight(position);
    }

    let trackGroup=new THREE.Group();trackGroup.name='race-track-valley';scene.add(trackGroup);
    let currentTrackId='valley';
    let {trackPoints,trackCurve,totalLength,samples,tangents,isOnRoadFast,findClosest,projectileObstacles,carObstacles,scenery}=createTrackEnvironment({THREE,scene:trackGroup,document,CONFIG});
    applyTrackAtmosphere(samples[0]);
    const sceneryMotionPreference=matchMedia('(prefers-reduced-motion: reduce)');

    let obstacleIndex=createObstacleIndex(projectileObstacles);
    let startGrid=createRaceGrid(totalLength,CONFIG.ROAD_HALF,CONFIG.BOT_COUNT);
    let startPerp=new THREE.Vector3(-tangents[0].z,0,tangents[0].x).normalize();

    const createCar=CyberRace.game.createCarFactory({THREE,document});

    const playerCar=createCar(garagePaint(activeGarage.paintId).color,true); scene.add(playerCar.group);
    playerCar.setAppearance(activeGarage.classId,garagePaint(activeGarage.paintId).color);
    const playerShieldMesh=new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.0,2),
      new THREE.MeshBasicMaterial({color:0x33ccff,transparent:true,opacity:0.16,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    playerShieldMesh.visible=false; scene.add(playerShieldMesh);
    const opponents=[];
    [0x3366ff,0xffaa00,0x22cc44,0xcc55ff,0x00cccc,0xff6688].slice(0,CONFIG.BOT_COUNT).forEach((col,i)=>{
      const car=createCar(col); scene.add(car.group);
      const healthCanvas=document.createElement('canvas'); healthCanvas.width=64; healthCanvas.height=8;
      const healthCtx=healthCanvas.getContext('2d');
      const healthTex=new THREE.CanvasTexture(healthCanvas);
      const healthPlane=new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.35), new THREE.MeshBasicMaterial({map:healthTex, transparent:true, depthTest:true, depthWrite:false}));
      healthPlane.position.y=3.4; car.group.add(healthPlane);
      opponents.push({
        car, healthPlane, healthCtx, healthTex, 
        t:startGrid[i+1].t, baseSpeed:44+Math.random()*7, speed:44+Math.random()*7,
        offset:startGrid[i+1].offset,targetOffset:startGrid[i+1].offset,laneChangeTimer:2+Math.random()*3,bumpOffset:0,bumpVelocity:0,
        slowTimer:0,health:100,dead:false,
        respawnTimer:0, attackCooldown:0, rockets:0, gunAmmo:0,
        lap:1, prevT:startGrid[i+1].t, crossedHalf:false,
        lastSampleIdx:0,
        nitroCharges:1,nitroTimer:0,speedBoostTimer:0,shieldTimer:0,
        lastHealthDrawn:-1,id:i,tacticalPlan:null,combatTargetId:null,burstRemaining:0,
        lastAttackerId:null,lastAttackerTimer:0,invincibleTimer:1.5
      });
    });

    const bonusMeshes=[];
    let nextBonusId=0;
    const pickupFactory=CyberRace.game.createPickupFactory({THREE,envMap:createCar.environmentMap});
    const bonusTypes=pickupFactory.types;
    const bonusData=pickupFactory.data;
    const sharedBonusGeometries=pickupFactory.geometries;
    const sharedBonusMaterials=pickupFactory.materials;
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

    const createBonusIcon=type=>pickupFactory.create(type);

    function spawnBonus(t,off) {
      if(bonusMeshes.length>=CONFIG.NUM_BONUSES)return;
      const pt=trackCurve.getPointAt(t), tg=trackCurve.getTangentAt(t).normalize();
      const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
      const pos=pt.clone().addScaledVector(perp, off*CONFIG.ROAD_HALF*0.85); pos.y=2.2;
      const type=bonusTypes[Math.floor(Math.random()*bonusTypes.length)];
      const group=createBonusIcon(type); group.position.copy(pos);
      scene.add(group);
      bonusMeshes.push({group,type,baseY:2.2,id:nextBonusId++,t,offset:off*CONFIG.ROAD_HALF*.85});
    }
    function spawnBonusAt(x,z,trackT=null) {
      if(bonusMeshes.length>=CONFIG.NUM_BONUSES)return;
      const type=bonusTypes[Math.floor(Math.random()*bonusTypes.length)];
      const group=createBonusIcon(type); group.position.set(x,2.2,z);
      scene.add(group);
      const t=trackT===null?findClosest(x,z).t:trackT;
      const point=trackCurve.getPointAt(t),tangent=trackCurve.getTangentAt(t).normalize();
      const offset=(x-point.x)*-tangent.z+(z-point.z)*tangent.x;
      bonusMeshes.push({group,type,baseY:2.2,id:nextBonusId++,t,offset});
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
      pos:samples[0].clone().addScaledVector(startPerp,startGrid[0].offset), heading:Math.atan2(tangents[0].x,tangents[0].z),
      speed:0, speedLat:0, steerAngle:0, wheelRot:0, lap:1, lapStart:0, bestLap:Infinity, curLap:0,
      prevT:0, crossedHalf:true, rockets:0, gunAmmo:0, nitro:3,
      speedBoostTimer:0, nitroTimer:0, shieldTimer:0, regenDelay:0,
      maxSpeed:drivingConfig.MAX_SPEED, maxHealth:activeProfile.maxHealth, health:activeProfile.maxHealth, invincibleTimer:0,
      driftTime:0, driftScoreCarry:0, // Legacy numeric fields in the V1 stage checkpoint.
      score:0, kills:0, deaths:0, combo:0, comboTimer:0,
      totalTime:0, lastSampleIdx:0, destroyed:false, deathTimer:0, damageCooldown:0,
      deathPos:new THREE.Vector3(), deathHeading:0, wrongWayTimer:0, resetCooldown:0,
      pulseCooldown:0, stuckTimer:0
    };
    const pickupSweepStart=new THREE.Vector3();
    const overtakeTracker=createOvertakeTracker();
    const driftMastery=createDriftMastery();
    const slipstreamTracker=createSlipstreamTracker();
    let lastOvertakeNotice=null;
    const sectorTimer=createSectorTimer();
    const lapGhost=createLapGhostTracker();
    const lapGhostStore=createLapGhostStore(garageStorage);
    const lapGhostBadge=document.getElementById('lap-ghost-badge');
    const lapGhostBadgeTime=document.getElementById('lap-ghost-badge-time');
    const lapGhostBadgePace=document.getElementById('lap-ghost-pace');
    let lapGhostPaceLastTime=-Infinity,lapGhostPaceDelta=null;
    let lapGhostRecordResult=null;
    const lapGhostVisual=createLapGhostVisual({THREE,scene});
    let lastSectorNotice=null;

    let paused=true,gameStarted=false,gameFinished=false,menuOpen=false,lastRaceWon=false;
    let raceCountdown=0, countdownLastNumber=null, cameraShake=0, incomingThreat=Infinity;
    let incomingRocketSource=null,lastDamageSource=null,lastDamageUntil=-Infinity;
    const threatEdges=Array.from(document.querySelectorAll('[data-threat-direction]'));
    let raceStartHint=true;
    let qualityMode='high', lowFpsWindows=0, highFpsWindows=0;
    const raceRecordsByMode=Object.fromEntries(Object.entries(SINGLE_RACE_MODES).map(([id,mode])=>
      [id,createGarageRecords(garageStorage,mode.recordVersion)]));
    let garageRecords=raceRecordsByMode.classic;
    const recordStorageNote=document.getElementById('record-storage-note');
    let creditedRaceEvents=new Set();
    const keys={};
    const touchInput={forward:false,backward:false,left:false,right:false,drift:false,gun:false,rocket:false,mirror:false};
    const touchPointers=new Map();
    const gamepadInput={throttle:0,brake:0,steer:0,drift:false,gun:false,rocket:false,mirror:false};
    let previousPadButtons={start:false,nitro:false,pulse:false};
    let mouseLeft=false, mouseRight=false, rocketFired=false, gunFireTimer=0;

    function formatRecordTime(value){return Number.isFinite(value)?value.toFixed(2)+' с':'Пока нет';}
    function updateRecordInfo(){
      const recordBuild=gameStarted?activeBuild:tuning.getBuild(selectedGarage.classId);
      const records=garageRecords.get(recordBuild);
      document.getElementById('record-class-label').textContent=buildLabel(recordBuild)+' · '+SINGLE_RACE_MODES[singleRaceMode].label;
      recordInfoEl.querySelector('[data-record="bestLap"]').textContent=formatRecordTime(records.bestLap);
      recordInfoEl.querySelector('[data-record="highScore"]').textContent=String(records.highScore);
      recordInfoEl.querySelector('[data-record="bestTotal"]').textContent=formatRecordTime(records.bestTotal);
    }
    function saveRecords(){
      if(!gameStarted||activeChampionship)return true;
      const persisted=garageRecords.save(activeBuild,{bestLap:player.bestLap,score:player.score,totalTime:player.totalTime,finished:gameFinished,won:lastRaceWon});
      recordStorageNote.hidden=persisted;
      updateRecordInfo();
      return persisted;
    }
    garage=CyberRace.ui.createGarage({THREE,document,createCar,getSelection:()=>selectedGarage,tuning,
      onPurchase:()=>{updateRecordInfo();syncGarageLabel();},
      onOpen:()=>{clearInputs();guardMenuInteraction();},
      onClose:()=>{clearInputs();guardMenuInteraction(180);},
      onApply:selection=>{
        selectedGarage=selection;
        const persisted=saveGarage(garageStorage,selection);
        syncGarageLabel();updateRecordInfo();
        menuStatus.textContent=persisted?'Машина готова к следующему заезду.':'Выбор применён для этой вкладки. Браузер не разрешил сохранить его после закрытия.';
      }
    });
    // localStorage events originate in other same-origin documents, not this tab.
    // Keep the menu and an already-open garage current without altering activeBuild.
    window.addEventListener('storage',event=>{
      if(!garageStorage||event.storageArea!==garageStorage||
         (event.key!==CyberRace.game.TUNING_KEY&&event.key!==null))return;
      if(!tuning.syncFromStorage())return;
      syncGarageLabel();
      garage?.refreshFromStorage();
    });
    let checkpointElapsed=0;
    let checkpointRecoveryNotice='';
    function stageCheckpointMatch(state=championship.snapshot(),stageIndex=activeChampionship?.stageIndex,build=activeBuild){
      if(!state||stageIndex===undefined||stageIndex!==state.results.length||stageIndex>=CHAMPIONSHIP_STAGES.length)return null;
      const trackId=CHAMPIONSHIP_STAGES[stageIndex].id;
      const signature=trackId==='valley'?CONFIG.VALLEY_ROUTE_VERSION+':'+JSON.stringify(state):JSON.stringify(state);
      return {stageIndex,trackId,buildKey:buildKey(build),signature};
    }
    function saveStageCheckpoint(){
      if(!activeChampionship||!gameStarted||gameFinished||raceCountdown>0)return false;
      const match=stageCheckpointMatch();
      if(!match||currentTrackId!==match.trackId)return false;
      const pick=(source,names)=>Object.fromEntries(names.map(key=>[key,key==='x'||key==='z'?source.pos[key]:source[key]]));
      const stageData={
        player:{...pick(player,checkpointPlayerNumbers),bestLap:Number.isFinite(player.bestLap)?player.bestLap:null,
          crossedHalf:Boolean(player.crossedHalf),destroyed:Boolean(player.destroyed)},
        bots:opponents.map(o=>({...pick(o,checkpointBotNumbers),dead:Boolean(o.dead),
          finished:Boolean(o.finished),crossedHalf:Boolean(o.crossedHalf)})),
        bonuses:bonusMeshes.map(b=>({id:b.id,type:b.type,t:b.t,offset:b.offset,x:b.group.position.x,z:b.group.position.z})),
        rewarded:[...creditedRaceEvents].filter(k=>/^lap:[1-5]$/.test(k)),
        awardedOvertakeIds:overtakeTracker.snapshotAwardedIds(),
        awardedDraftIds:slipstreamTracker.snapshotAwardedIds(),
        finishedIds:championshipFinishedIds.slice()
      };
      return stageCheckpoint.save(match,stageData);
    }
    function restoreStageCheckpoint(data){
      const p=data.player;
      for(const key of checkpointPlayerNumbers)if(key!=='x'&&key!=='z')player[key]=p[key];
      player.bestLap=p.bestLap===null?Infinity:p.bestLap;
      player.crossedHalf=p.crossedHalf;player.destroyed=p.destroyed;
      player.pos.set(p.x,0,p.z);pickupSweepStart.copy(player.pos);
      playerCar.group.position.set(p.x,0.02,p.z);playerCar.group.rotation.y=player.heading+Math.PI;
      playerCar.group.visible=!player.destroyed;
      playerShieldMesh.position.set(p.x,2,p.z);playerShieldMesh.visible=player.shieldTimer>0;
      opponents.forEach((o,i)=>{
        const b=data.bots[i];
        for(const key of checkpointBotNumbers)o[key]=b[key];
        o.dead=b.dead;o.finished=b.finished;o.crossedHalf=b.crossedHalf;
        o.tacticalPlan=null;o.combatTargetId=null;o.lastAttackerId=null;o.pickupSweepStart=null;
        const pt=trackCurve.getPointAt(o.t),tangent=trackCurve.getTangentAt(o.t).normalize();
        const perp=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
        o.car.group.position.set(pt.x+perp.x*(o.offset+o.bumpOffset),0.02,pt.z+perp.z*(o.offset+o.bumpOffset));
        o.car.group.rotation.y=Math.atan2(tangent.x,tangent.z)+Math.PI;
        o.car.group.visible=!o.dead;o.healthPlane.visible=!o.dead;
        updateWeaponVis(o.car,o);
        o.lastHealthDrawn=-1;
      });
      while(bonusMeshes.length)removeBonusAt(bonusMeshes.length-1,false);
      for(const b of data.bonuses){
        const group=createBonusIcon(b.type);group.position.set(b.x,2.2,b.z);
        scene.add(group);
        bonusMeshes.push({id:b.id,type:b.type,t:b.t,offset:b.offset,baseY:2.2,group});
      }
      nextBonusId=Math.max(nextBonusId,0,...data.bonuses.map(b=>b.id+1));
      creditedRaceEvents=new Set(data.rewarded);
      // Old V1 checkpoints contain no overtake history; accept and resume them.
      overtakeTracker.restoreAwardedIds(data.awardedOvertakeIds??[]);
      sectorTimer.resume({lap:player.lap,t:player.prevT,elapsed:player.curLap});
      driftMastery.reset();
      // Existing V1 checkpoint lacks drafting history; keep old saves compatible.
      slipstreamTracker.restoreAwardedIds(data.awardedDraftIds??[]);
      // Checkpoint has no current trace: display saved best but start a new
      // recording only after the next complete clean lap.
      lapGhost.reset();
      lapGhost.importBest(lapGhostStore.get(currentTrackId==='valley'?CONFIG.VALLEY_ROUTE_VERSION:currentTrackId,buildKey(activeBuild)));
      lapGhostRecordResult=null;lastSectorNotice=null;
      championshipFinishedIds=data.finishedIds.slice();
      document.body.dataset.stageResumed='true';
      updateWeaponVis();updateUI();minimap.render();
    }
    function championshipTable(rows,caption,stage=false){
      return `<table class="championship-table"><caption>${caption}</caption><thead><tr><th scope="col">Место</th><th scope="col">Пилот</th><th scope="col">${stage?'За этап':'Всего'}</th></tr></thead><tbody>${rows.map((row,i)=>`<tr class="${row.id==='player'?'championship-player':''}"><td>${i+1}</td><th scope="row">${row.name}</th><td>${row.points}</td></tr>`).join('')}</tbody></table>`;
    }
    function championshipStorageMessage(){
      const status=championship.status();
      if(status==='saved')return 'Зачёт сохранён. Во время этапа игра сохраняет контрольную точку примерно каждые 5 секунд и при паузе; при обновлении можно продолжить этот этап.';
      if(status==='invalid')return 'Сохранение повреждено или несовместимо. Оно не загружено. Можно начать новый чемпионат.';
      if(status==='empty')return 'Незавершённый этап восстанавливается из контрольной точки, если браузер разрешает сохранение. Сложность фиксируется при старте чемпионата.';
      return 'Браузер не разрешил сохранить прогресс. Чемпионат доступен в этой вкладке; после закрытия или обновления прогресс может потеряться или вернуться к прежнему сохранению.';
    }
    function updateChampionshipMenu(){
      const state=championship.snapshot(),count=state?.results.length||0;
      championshipContinue.hidden=!state||count>=CHAMPIONSHIP_STAGES.length;
      championshipContinue.textContent=count<3?`ЭТАП ${count+1}: ${CHAMPIONSHIP_STAGES[count].name.toUpperCase()}`:'ЧЕМПИОНАТ ЗАВЕРШЁН';
      championshipNew.textContent=state?'НОВЫЙ ЧЕМПИОНАТ':'НАЧАТЬ ЧЕМПИОНАТ';
      const standings=state?championshipStandings(state):[];
      championshipSummary.innerHTML=state?`<p>${count===3?'Чемпионат завершён. Победитель: '+standings[0].name:'Пройдено этапов: '+count+' / 3'+'. Сложность: '+getDifficulty({difficulty:state.difficulty}).label+'. Следующий: '+CHAMPIONSHIP_STAGES[count].name+'. Перед стартом можно зайти в гараж.'}</p>${count?championshipTable(standings,'Общий зачёт'):''}`:'';
      championshipStatus.textContent=championshipStorageMessage();
    }
    function disposeTrack(group){
      // Every resource under this group belongs to this environment, never to cars/pickups.
      const geometries=new Set(),materials=new Set(),textures=new Set();
      group.traverse(object=>{
        if(object.geometry)geometries.add(object.geometry);
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(!material)continue;materials.add(material);
          for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
        }
        if(object.isInstancedMesh)object.dispose();
      });
      textures.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());geometries.forEach(value=>value.dispose());
      group.clear();
    }
    function switchRaceTrack(trackId){
      if(trackId===currentTrackId)return true;
      const candidate=new THREE.Group();candidate.name='race-track-'+trackId;
      let environment,candidateMap;
      try{
        environment=createTrackEnvironment({THREE,scene:candidate,document,CONFIG,trackId});
        candidateMap=createMinimap({document,trackPoints:environment.trackPoints,samples:environment.samples,getPlayer:()=>player,getOpponents:()=>opponents});
      }catch(error){
        candidateMap?.canvas.remove();disposeTrack(candidate);
        console.error('Track preparation failed',error);
        championshipStatus.textContent='Не удалось подготовить трассу. Текущий прогресс сохранён в этой вкладке. Попробуйте снова.';
        return false;
      }
      clearBonusRespawnTimers();
      while(projectiles.length)removeProjectileAt(projectiles.length-1);
      combatEffects.clear();clearShockwaves();
      scene.remove(trackGroup);disposeTrack(trackGroup);
      trackGroup=candidate;scene.add(trackGroup);
      ({trackPoints,trackCurve,totalLength,samples,tangents,isOnRoadFast,findClosest,projectileObstacles,carObstacles,scenery}=environment);
      obstacleIndex=createObstacleIndex(projectileObstacles);
      startGrid=createRaceGrid(totalLength,CONFIG.ROAD_HALF,CONFIG.BOT_COUNT);
      startPerp=new THREE.Vector3(-tangents[0].z,0,tangents[0].x).normalize();
      minimap.canvas.remove();minimap=candidateMap;
      scenery.setQuality(qualityMode);applyTrackAtmosphere(samples[0]);currentTrackId=trackId;
      sectorTimer.reset();lapGhost.reset();lastSectorNotice=null;
      driftMastery.reset();slipstreamTracker.reset();
      return true;
    }
    function syncRaceModeUI(){
      const stage=activeChampionship?CHAMPIONSHIP_STAGES[activeChampionship.stageIndex]:null;
      document.body.dataset.raceMode=stage?'championship':'single';
      document.body.dataset.singleRaceMode=stage?'':singleRaceMode;
      document.getElementById('single-race-victory-credits').textContent=String(SINGLE_RACE_MODES[singleRaceMode].victoryCredits);
      document.querySelectorAll('input[name="race-contract"]').forEach(input=>{
        const definition=getRaceContractDefinition(input.value,singleRaceMode);
        const goal=input.nextElementSibling?.querySelector('small');
        if(definition&&goal)goal.textContent=definition.menuLabel;
      });
      document.body.dataset.raceTrack=currentTrackId;
      document.body.dataset.raceStage=stage?String(activeChampionship.stageIndex+1):'';
      document.querySelector('#hud .hud-label').textContent=stage?`ЭТАП ${activeChampionship.stageIndex+1}/3 · КРУГ`:'КРУГ';
      const laps=raceLaps();
      const lapWord=laps===1?'круг':laps>=2&&laps<=4?'круга':'кругов';
      document.querySelectorAll('[data-race-laps]').forEach(el=>el.textContent=`${laps} ${lapWord}`);
      document.querySelectorAll('.track-caption').forEach(el=>el.textContent=stage?`ЭТАП ${activeChampionship.stageIndex+1} / 3 · ${stage.name.toUpperCase()}`:'НЕОНОВАЯ ДОЛИНА');
      finishRestartBtn.textContent=stage?'К ЗАЧЁТУ И ГАРАЖУ':'ЕЩЁ РАЗ';
      championshipResults.hidden=true;
    }
    function startChampionshipStage(){
      const state=championship.snapshot(),stageIndex=state?.results.length;
      if(!state||stageIndex>=3)return;
      if(!switchRaceTrack(CHAMPIONSHIP_STAGES[stageIndex].id))return;
      activeChampionship={stageIndex};championshipFinishedIds=[];
      const checkpoint=stageCheckpoint.inspect(stageCheckpointMatch(state,stageIndex,tuning.getBuild(selectedGarage.classId)));
      const saved=checkpoint.data;
      syncRaceModeUI();audio.resume();window.restartGame({resume:Boolean(saved)});
      checkpointRecoveryNotice=checkpoint.status==='invalid'
        ?'⚠ Контрольная точка повреждена или несовместима. Этап начат заново; зачёт и гараж сохранены.':'';
      if(saved){restoreStageCheckpoint(saved);showMessage('↩ ПРОДОЛЖАЕМ СОХРАНЁННЫЙ ЭТАП');}
    }
    championshipNew.addEventListener('click',event=>runMenuAction(event,()=>{
      if(championship.snapshot()&&!window.confirm('Начать новый чемпионат? Текущий зачёт будет заменён. Кредиты и улучшения гаража сохранятся.'))return;
      stageCheckpoint.clear();championship.start(settings.difficulty);updateChampionshipMenu();startChampionshipStage();
    },{allowDuringGuard:true}));
    championshipContinue.addEventListener('click',event=>runMenuAction(event,startChampionshipStage,{allowDuringGuard:true}));
    function finishChampionshipStage(){
      const stageIndex=activeChampionship.stageIndex;
      const order=championshipFinishOrder(opponents,championshipFinishedIds);
      const result=championship.record(stageIndex,order,player.totalTime);
      if(!result.accepted){showMessage('Не удалось принять результат этапа.');return;}
      if(typeof stageCheckpoint!=='undefined')stageCheckpoint.clear();
      const pos=order.indexOf('player')+1;
      lastRaceWon=pos===1;
      if(lastRaceWon)awardRaceEvent('victory',1500);
      const state=championship.snapshot(),standings=championshipStandings(state),complete=state.results.length===3;
      finishTitle.textContent=complete?'🏆 ЧЕМПИОНАТ ЗАВЕРШЁН':`🏁 ЭТАП ${stageIndex+1} ЗАВЕРШЁН`;
      finishTitle.style.color='#80eff9';finishTitle.style.textShadow='0 0 40px #008899';
      const stageRows=order.map((id,index)=>({...CHAMPIONSHIP_DRIVERS.find(driver=>driver.id===id),points:CHAMPIONSHIP_POINTS[index]}));
      championshipResults.innerHTML=`<div class="championship-result-grid">${championshipTable(stageRows,CHAMPIONSHIP_STAGES[stageIndex].name+' - результат этапа',true)}${championshipTable(standings,'Общий зачёт'+(complete?' - итог':''))}</div><p>${complete?'Победитель: '+standings[0].name+'. Ваше место в чемпионате: '+(standings.findIndex(row=>row.id==='player')+1)+'/7.':'Следующий этап: '+CHAMPIONSHIP_STAGES[stageIndex+1].name+'. Перейдите к зачёту; перед стартом доступен гараж.'}</p><p>Финишировавшие соперники сохраняют порядок финиша. Остальные места определяются по пройденной дистанции в момент вашего финиша.</p><p>${championshipStorageMessage()}</p>`;
      championshipResults.hidden=false;
      finishStats.innerHTML=`Место: <b>${pos}/7</b> · За этап: <b>+${CHAMPIONSHIP_POINTS[pos-1]}</b> · Время: <b>${player.totalTime.toFixed(1)} с</b><br>Кредиты: <b>${tuning.snapshot().wallet}</b>`;
      finishStats.innerHTML+=sectorFinishMarkup();
      updateChampionshipMenu();
    }
    function clearInputs() {
      Object.keys(keys).forEach(key=>delete keys[key]);
      mouseLeft=false; mouseRight=false; rocketFired=false; gunFireTimer=0;
      for(const key of Object.keys(touchInput))touchInput[key]=false;
      touchPointers.clear();
      document.querySelectorAll('[data-touch]').forEach(button=>delete button.dataset.active);
      Object.assign(gamepadInput,{throttle:0,brake:0,steer:0,drift:false,gun:false,rocket:false,mirror:false});
      rearviewIndicatorEl.hidden=true;
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
      const checkpointSaved=activeChampionship?saveStageCheckpoint():true;
      pauseMenuStatus.textContent=checkpointSaved?'':'⚠ Контрольная точка не сохранена. После обновления страницы этап может начаться заново.';
      clearInputs();syncSettingsUI();
      // Freeze an up-to-date HUD snapshot before the active-frame updates stop.
      updateUI();
      setGameplayCursor(false);
      document.body.classList.add('menu-open');
      pauseMenu.classList.add('open');
      pauseMenu.scrollTop=0;
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
      return canControl()&&!garage?.isOpen()&&!player.destroyed&&!isGameplayInputBlocked();
    }

    function returnCarToTrack(){
      if(!canControl()||player.destroyed||player.resetCooldown>0)return;
      player.resetCooldown=CONFIG.MANUAL_RESET_COOLDOWN;
      showMessage('↩️ ВОЗВРАТ НА ТРАССУ −10');
      respawnPlayer('manual');
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
        showMessage(checkpointRecoveryNotice||'🏁 ВПЕРЁД!');
        checkpointRecoveryNotice='';
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
    const mobileTrackReturn=document.getElementById('mobile-track-return');
    mobileTrackReturn.addEventListener('click',event=>runMenuAction(event,()=>{
      if(!menuOpen||player.destroyed||raceCountdown>0||player.resetCooldown>0)return;
      closeMenu({force:true});
      returnCarToTrack();
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
      menuStatus.textContent='';pauseMenuStatus.textContent='';
      const pauseWasOpen=menuOpen&&gameStarted&&!gameFinished;
      try{
        if(!fullscreenElement())await requestFullscreenCompat();
        else await exitFullscreenCompat();
      }catch(error){
        console.warn('Fullscreen failed:',error);
        reportFullscreenFailure('Браузер не разрешил полный экран. Можно продолжить в окне.');
      }finally{
        if(pauseWasOpen)preservePauseMenu();
        else if(!gameStarted||gameFinished){paused=true;setGameplayCursor(false);}
        updateFullscreenButtons();
        setTimeout(()=>{
          fullscreenTransition=false;fullscreenKeepPause=false;setFullscreenButtonsBusy(false);
        },160);
      }
    }
    function reportFullscreenFailure(text){
      if(!startScreen.classList.contains('hidden'))menuStatus.textContent=text;
      else if(menuOpen)pauseMenuStatus.textContent=text;
      else showMessage(text);
    }
    function updateFullscreenButtons(){
      const active=Boolean(fullscreenElement());
      [fullscreenStartBtn,fullscreenPauseBtn].forEach(button=>{
        button.querySelector('[data-fullscreen-label]').textContent=active?'Выйти из полного экрана':'Полный экран';
        button.setAttribute('aria-pressed',active?'true':'false');
      });
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
      reportFullscreenFailure('Полный экран недоступен. Можно продолжить в окне.');
    });
    const fullscreenSupported=Boolean(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen||document.documentElement.msRequestFullscreen);
    if(!fullscreenSupported){
      [fullscreenStartBtn,fullscreenPauseBtn].forEach(button=>{button.disabled=true;button.title='Полный экран не поддерживается браузером';});
    }

    function returnToMainMenu(){
      saveStageCheckpoint();saveRecords();
      paused=true; gameStarted=false; gameFinished=false; menuOpen=false; raceCountdown=0;raceStartHint=true;
      document.body.classList.remove('game-session-active','menu-open');
      clearInputs();clearBonusRespawnTimers();setGameplayCursor(false);
      overtakeTracker.reset();lastOvertakeNotice=null;slipstreamTracker.reset();
      driftMastery.reset();
      sectorTimer.reset();lapGhost.reset();lastSectorNotice=null;
      raceContractTracker.start('none');contractGoalAnnounced=false;contractNoticeAt=-Infinity;raceContractNoticeEl.textContent='';
      while(projectiles.length)removeProjectileAt(projectiles.length-1);
      if(activeChampionship&&currentTrackId!=='valley'&&switchRaceTrack('valley')){
        // The menu renders the default course; remove pickups from the previous stage.
        while(bonusMeshes.length)removeBonusAt(bonusMeshes.length-1,false);
        for(let i=0;i<CONFIG.NUM_BONUSES;i++)spawnBonus((i*0.016+Math.random()*0.01)%1,(Math.random()-0.5)*1.8);
      }
      activeChampionship=null;championshipFinishedIds=[];singleRaceFinishedIds=[];
      // A rejected championship checkpoint warning belongs to its stage only.
      checkpointRecoveryNotice='';
      syncRaceModeUI();
      combatEffects.clear();
      clearShockwaves();
      pauseMenu.classList.remove('open');finishScreen.classList.add('hidden');startScreen.classList.remove('hidden');
      document.body.classList.remove('low-health');
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      playerShieldMesh.visible=false;
      if(msgTimeout){clearTimeout(msgTimeout);msgTimeout=null;}messageEl.classList.remove('show');
      if(hitMarkerTimer){clearTimeout(hitMarkerTimer);hitMarkerTimer=null;}
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');
      lastDamageSource=null;lastDamageUntil=-Infinity;incomingRocketSource=null;incomingThreat=Infinity;
      updateRecordInfo(); updateUI();
      menuStatus.textContent='';
      updateChampionshipMenu();
      requestAnimationFrame(()=>{if(!startScreen.classList.contains('hidden'))startButton.focus({preventScroll:true});});
    }
    let resumeAfterRestartCancel=false;
    function requestRaceRestart(){
      if(restartConfirmDialog.open||fullscreenTransition)return;
      if(!gameStarted||gameFinished){audio.resume();window.restartGame();return;}
      resumeAfterRestartCancel=!paused&&!menuOpen;
      if(resumeAfterRestartCancel)openMenu();
      else clearInputs();
      restartConfirmDialog.showModal();
      restartConfirmCancel.focus({preventScroll:true});
    }
    restartConfirmCancel.addEventListener('click',()=>restartConfirmDialog.close('cancel'));
    restartConfirmAccept.addEventListener('click',()=>restartConfirmDialog.close('restart'));
    restartConfirmDialog.addEventListener('close',()=>{
      const resume=resumeAfterRestartCancel;
      resumeAfterRestartCancel=false;
      if(restartConfirmDialog.returnValue==='restart'){audio.resume();window.restartGame();}
      else if(resume&&gameStarted&&!gameFinished&&menuOpen)closeMenu({force:true});
    });
    restartBtn.addEventListener('click',event=>runMenuAction(event,requestRaceRestart,{allowDuringGuard:true}));
    finishRestartBtn.addEventListener('click',event=>runMenuAction(event,()=>{if(activeChampionship){returnToMainMenu();return;}audio.resume();window.restartGame();},{allowDuringGuard:true}));
    menuBtn.addEventListener('click',event=>runMenuAction(event,returnToMainMenu,{allowDuringGuard:true}));
    finishMenuBtn.addEventListener('click',event=>runMenuAction(event,returnToMainMenu,{allowDuringGuard:true}));
    function pollGamepad(){
      const pad=typeof navigator!=='undefined'&&navigator.getGamepads
        ?Array.from(navigator.getGamepads()).find(p=>p&&p.connected&&p.mapping==='standard'):null;
      const {start,nitro,pulse,...drive}=readStandardGamepad(pad);
      if(start&&!previousPadButtons.start&&gameStarted&&!gameFinished&&!restartConfirmDialog.open){
        if(menuOpen)closeMenu({force:true});else openMenu();
      }
      if(nitro&&!previousPadButtons.nitro&&canAcceptGameplayInput())activateNitro();
      if(pulse&&!previousPadButtons.pulse&&canAcceptGameplayInput())activateDefensePulse();
      previousPadButtons={start,nitro,pulse};
      // Re-read each frame; a disconnected controller clears its driving input.
      Object.assign(gamepadInput,drive);
      if(pad&&(drive.throttle>0.05||drive.brake>0.05||Math.abs(drive.steer)>0.05||
        drive.gun||drive.rocket||drive.mirror||nitro||pulse))tutorialInputMode='gamepad';
    }
    const touchButtons=new Map([...document.querySelectorAll('[data-touch]')].map(button=>[button.dataset.touch,button]));
    const driveActions=new Set(['left','right','forward','backward','drift']);
    function refreshTouchAction(action){
      if(!action)return;
      const held=[...touchPointers.values()].includes(action);
      if(Object.hasOwn(touchInput,action))touchInput[action]=held;
      touchButtons.get(action).dataset.active=String(held);
    }
    for(const [action,button] of touchButtons){
      const release=e=>{
        if(!touchPointers.has(e.pointerId))return;
        const heldAction=touchPointers.get(e.pointerId);
        touchPointers.delete(e.pointerId);
        refreshTouchAction(heldAction);
        e.stopPropagation();
      };
      button.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'||!gameStarted||gameFinished||menuOpen)return;
        e.preventDefault();e.stopPropagation();
        if(action==='pause'){openMenu();return;}
        try{button.setPointerCapture(e.pointerId);}catch{}
        tutorialInputMode='touch';
        touchPointers.set(e.pointerId,action);
        refreshTouchAction(action);
        audio.resume();
        if(action==='nitro')activateNitro();
        if(action==='pulse')activateDefensePulse();
      });
      if(driveActions.has(action))button.addEventListener('pointermove',e=>{
        if(!touchPointers.has(e.pointerId))return;
        const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.touch-direction [data-touch]');
        const next=target?.dataset.touch||null;
        const previous=touchPointers.get(e.pointerId);
        if(previous===next)return;
        touchPointers.set(e.pointerId,next);
        refreshTouchAction(previous);
        refreshTouchAction(next);
      });
      button.addEventListener('pointerup',release);
      button.addEventListener('pointercancel',release);
      button.addEventListener('lostpointercapture',release);
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
    }
    window.addEventListener('keydown',e=>{
      // Native keyboard activation of the in-race Skip button must not fire nitro.
      if(typeof pilotSkipButton!=='undefined'&&e.target===pilotSkipButton&&
        (e.code==='Space'||e.code==='Enter')){e.stopPropagation();return;}
      if(restartConfirmDialog.open){
        if(e.code==='Escape'&&!e.repeat){
          e.preventDefault();e.stopPropagation();restartConfirmDialog.close('cancel');
        }
        return;
      }
      if(garage?.isOpen())return;
      const key=e.key.toLowerCase();
      const actionKey=e.code.startsWith('Key')?e.code.slice(3).toLowerCase():key;
      if(gameStarted&&!gameFinished)tutorialInputMode='keyboard';
      const menuVisible=menuOpen||!startScreen.classList.contains('hidden')||!finishScreen.classList.contains('hidden');
      if(e.code==='Escape'){
        if(e.repeat)return;
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
      if(actionKey==='f'&&!e.repeat){e.preventDefault();toggleFullscreen(e);return;}
      if(actionKey==='m'&&!e.repeat){
        settings.sound=!settings.sound;saveSettings();syncSettingsUI();audio.setEnabled(settings.sound);
        if(settings.sound)audio.resume();
        if(gameStarted&&!gameFinished)showMessage(settings.sound?'🔊 ЗВУК ВКЛЮЧЁН':'🔇 ЗВУК ВЫКЛЮЧЕН');
        return;
      }
      if(canControl()&&(actionKey==='q'||key==='й')&&!e.repeat){
        e.preventDefault();
        activateDefensePulse();
        return;
      }
      if(canControl()&&actionKey==='t'&&!e.repeat){
        e.preventDefault();
        returnCarToTrack();
        return;
      }
      if(gameStarted && !gameFinished && actionKey==='r' && !e.repeat){
        e.preventDefault(); requestRaceRestart(); return;
      }
      if(paused || !gameStarted || gameFinished || player.destroyed) return;
      keys[key]=true; keys[e.code]=true;
      if(e.code==='Space' && !e.repeat) activateNitro();
      if(['w','a','s','d','q','ц','ф','ы','в','й',' '].includes(key)||e.code.startsWith('Arrow')||e.code==='KeyC')e.preventDefault();
    });
    window.addEventListener('keyup',e=>{
      keys[e.key.toLowerCase()]=false;keys[e.code]=false;
    });
    window.addEventListener('mousedown',e=>{
      if(isInteractiveTarget(e.target)||menuOpen||fullscreenTransition)return;
      audio.resume();
      if(paused||!gameStarted||gameFinished)return;
      tutorialInputMode='keyboard';
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
    function selectSingleRaceMode(nextMode){
      if(gameStarted||!Object.hasOwn(SINGLE_RACE_MODES,nextMode))return;
      singleRaceMode=nextMode;
      garageRecords=raceRecordsByMode[nextMode];
      recordStorageNote.hidden=true;
      syncRaceModeUI();updateRecordInfo();
    }
    document.querySelectorAll('input[name="single-race-mode"]').forEach(input=>{
      input.addEventListener('change',()=>{if(input.checked)selectSingleRaceMode(input.value);});
    });
    document.querySelectorAll('input[name="race-contract"]').forEach(input=>{
      input.addEventListener('change',()=>{
        if(!gameStarted&&input.checked)selectedRaceContract=['none','hunter','collector','podium'].includes(input.value)?input.value:'none';
      });
    });
    document.getElementById('start-btn').addEventListener('click',event=>runMenuAction(event,()=>{
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      if(!switchRaceTrack('valley'))return;
      activeChampionship=null;championshipFinishedIds=[];syncRaceModeUI();
      audio.resume();window.restartGame();
    },{allowDuringGuard:true}));

    function activateNitro(){
      if(!canAcceptGameplayInput())return;
      if(player.nitro>0&&player.nitroTimer<=0){player.nitro--;player.nitroTimer=2.5;audio.play('nitro');if(typeof advancePilotTutorial==='function')advancePilotTutorial('nitro');}
    }

    function activateDefensePulse(){
      if(!canAcceptGameplayInput()||player.pulseCooldown>0)return;
      player.pulseCooldown=CONFIG.DEFENSE_PULSE_COOLDOWN;
      if(typeof advancePilotTutorial==='function')advancePilotTutorial('pulse');
      let intercepted=0,precisionIntercepts=0;
      for(let i=projectiles.length-1;i>=0;i--){
        const projectile=projectiles[i];
        if(projectile.owner==='player')continue;
        const distance=projectile.mesh.position.distanceTo(player.pos);
        if(distance<=CONFIG.DEFENSE_PULSE_RADIUS){
          if(isPrecisionInterception({distance,radius:CONFIG.DEFENSE_PULSE_RADIUS,
            isRocket:projectile.isRocket,targetingPlayer:projectile.target===player}))precisionIntercepts++;
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
      const nitroReward=precisionNitroReward({precisionCount:precisionIntercepts,charges:player.nitro});
      if(nitroReward)player.nitro=Math.min(5,player.nitro+nitroReward);
      incomingWarningEl.classList.remove('show');
      audio.play('shield');
      addCameraShake(0.35);
      if(nitroReward)showMessage('🛡 ТОЧНЫЙ ОТБОЙ · +1 НИТРО');
      else if(intercepted||disrupted)showMessage(`🛡 ИМПУЛЬС: РАКЕТ ${intercepted} • ЦЕЛЕЙ ${disrupted}`);
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
    const bulletGeometry=new THREE.BoxGeometry(0.055,0.055,1.2);
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
        const speed=Number.isFinite(target.speed)?target.speed:target.baseSpeed||0;
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
    let cameraImpact=new THREE.Vector3();
    function soundAt(pos,strength=1){
      const dx=pos.x-player.pos.x,dz=pos.z-player.pos.z;
      const distance=Math.hypot(dx,(pos.y||0)-(player.pos.y||0),dz);
      // The chase camera follows heading; positive pan is the driver's right.
      const heading=Number.isFinite(player.heading)?player.heading:0;
      const right=dx*Math.cos(heading)-dz*Math.sin(heading);
      return {distance,pan:distance>1?right/distance*.8:0,strength};
    }
    function spawnImpactEffect(pos,isRocket=false,normal=new THREE.Vector3(0,1,0),options={}){
      const distance=pos.distanceTo(player.pos);
      combatEffects.impact(pos,normal,{rocket:isRocket,ground:pos.y<4,...options});
      if(isRocket)spawnShockwave(pos.clone().setY(0.22),0xff7722,12,0.42);
      if(distance<(isRocket?190:150))audio.play(isRocket?'explosion':options.shielded?'shield':'hit',soundAt(pos,isRocket?1:0.7));
      cameraImpact.subVectors(player.pos,pos).normalize();
      addCameraShake((isRocket?0.75:0.12)*THREE.MathUtils.clamp(1-distance/(isRocket?190:90),0,1));
    }
    function targetSurface(projectile,target){
      const car=target===player?playerCar:target.car;
      const shielded=target.shieldTimer>0;
      car.group.updateWorldMatrix(true,false);
      const center=car.group.position.clone().setY(shielded?2:1.2);
      if(shielded){
        const normal=(projectile.impactFrom||projectile.mesh.position).clone().sub(center).normalize();
        if(normal.lengthSq()<0.1)normal.copy(projectile.vel).normalize().negate();
        return {pos:center.addScaledVector(normal,5),normal,anchor:car.group,shielded};
      }
      const dir=projectile.vel.clone().normalize();
      const from=car.group.worldToLocal(center.clone().addScaledVector(dir,-14));
      const to=car.group.worldToLocal(center.clone().addScaledVector(dir,14));
      const hit=segmentBoxHit3D(from,to,{x:0,y:0.62,z:0,w:1.9,h:1.15,d:4.5});
      const local=hit?new THREE.Vector3(hit.point.x,hit.point.y,hit.point.z):new THREE.Vector3(0,0.7,0);
      const normal=hit?new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z).transformDirection(car.group.matrixWorld):dir.negate();
      return {pos:car.group.localToWorld(local),normal,anchor:car.group,shielded};
    }
    function hitVehicle(projectile,target){
      if(target===projectile.ownerRef||projectile.owner==='player'&&target===player)return;
      if(target!==player&&(target.dead||target.health<=0||target.invincibleTimer>0))return;
      const surface=targetSurface(projectile,target);
      if(target===player){
        applyPlayerDamage(projectile.damage||15,false,projectile.impactFrom||projectile.mesh.position);
        spawnImpactEffect(surface.pos,projectile.isRocket,surface.normal,surface);
        if(player.health<=0)respawnPlayer('death');
      }else{
        target.health-=(projectile.damage||15)*(target.shieldTimer>0?0.35:1);
        target.lastAttackerId=projectile.owner==='player'?'player':projectile.ownerRef?.id??null;
        target.lastAttackerTimer=6;
        if(projectile.owner==='player')showHitMarker();
        spawnImpactEffect(surface.pos,projectile.isRocket,surface.normal,surface);
        if(target.health<=0)destroyOpponent(target,true,projectile.owner==='player'?player:projectile.ownerRef);
      }
    }
    function hitScenery(projectile,hit){
      const pos=new THREE.Vector3(hit.point.x,hit.point.y,hit.point.z);
      const normal=new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z);
      let surface=hit.surface;
      if(surface==='ground')surface=isOnRoadFast(pos.x,pos.z)?'stone':'soil';
      spawnImpactEffect(pos,projectile.isRocket,normal,{surface});
      if(!projectile.isRocket&&surface==='metal')audio.play('ricochet',soundAt(pos,0.35));
    }

    function chooseOpponentCombatTarget(o){
      const origin=o.car.getMuzzle(false),forward=trackCurve.getTangentAt(o.t).normalize();
      const candidates=opponents.filter(other=>other!==o).map(other=>({
        id:other.id,entity:other,position:getTargetPosition(other),health:other.health,dead:other.dead,
        invincible:other.invincibleTimer>0,shieldTimer:other.shieldTimer,progress:(other.lap-1)+other.t
      }));
      candidates.push({id:'player',entity:player,position:getTargetPosition(player),health:player.health,
        dead:player.destroyed,invincible:player.invincibleTimer>0,shieldTimer:player.shieldTimer,
        progress:(player.lap-1)+player.prevT});
      for(const candidate of candidates){
        candidate.visible=!candidate.dead&&!obstacleIndex.hit(origin,candidate.position);
      }
      const selected=selectOpponentCombatTarget({selfId:o.id,origin,forward,candidates,
        progress:(o.lap-1)+o.t,range:difficulty().attackRange,minFacing:difficulty().minFacing,
        currentTargetId:o.combatTargetId,lastAttackerId:o.lastAttackerId,lastAttackerTimer:o.lastAttackerTimer});
      if(selected!==o.combatTargetId)o.burstRemaining=0;
      o.combatTargetId=selected;
      return candidates.find(candidate=>candidate.id===selected)?.entity||null;
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
      combatEffects.detachTrail(projectile.trail);
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
      const start=playerCar.getMuzzle(true).addScaledVector(forward,.9);
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

      combatEffects.muzzle(playerCar,true);
      if(!target)showMessage('🚀 НЕТ ЦЕЛИ ВПЕРЕДИ');
    }

    function fireGun() {
      if(player.gunAmmo<=0)return;
      if(projectiles.length>=CONFIG.MAX_PROJECTILES) return;
      player.gunAmmo--;
      const spread=(Math.random()-0.5)*0.05;
      const heading=player.heading+spread;
      const dx=Math.sin(heading), dz=Math.cos(heading);
      const start=playerCar.getMuzzle(false);
      const bullet=createBulletMesh('player');
      bullet.position.copy(start);bullet.lookAt(start.clone().add(new THREE.Vector3(dx,0,dz)));scene.add(bullet);
      projectiles.push({mesh:bullet,vel:new THREE.Vector3(dx*128,0,dz*128),life:0.95,damage:10,owner:'player',ownerRef:player,isRocket:false,age:0,sharedResources:true,poolKey:'player'});
      updateWeaponVis();
      audio.play('shoot');

      combatEffects.muzzle(playerCar);
      if(typeof advancePilotTutorial==='function')advancePilotTutorial('gun');
    }

    function updateWeaponVis(car=playerCar,racer=player) {
      car.rocketLauncher.visible=racer.rockets>0;
      car.machineGun.visible=racer.gunAmmo>0;
      if(racer!==player)return;
      document.getElementById('slot-rocket').classList.toggle('active', player.rockets>0);
      document.getElementById('slot-gun').classList.toggle('active', player.gunAmmo>0);
    }

    function beginPlayerDeath(){
      if(player.destroyed||gameFinished)return;
      overtakeTracker.interrupt();driftMastery.reset();slipstreamTracker.interrupt();sectorTimer.invalidate();lapGhost.invalidate();lastSectorNotice=null;
      player.destroyed=true;player.deathTimer=CONFIG.PLAYER_DEATH_DELAY;
      player.deathPos.copy(player.pos);player.deathHeading=player.heading;
      player.deaths++;player.score=Math.max(0,player.score-50);player.combo=0;player.comboTimer=0;
      player.nitroTimer=0;player.speedBoostTimer=0;player.shieldTimer=0;player.health=0;
      combatEffects.resetDriving();
      clearInputs();playerCar.group.visible=false;playerShieldMesh.visible=false;
      wrongWayEl.classList.remove('show');incomingWarningEl.classList.remove('show');
      lastDamageSource=null;lastDamageUntil=-Infinity;
      const blast=player.pos.clone().setY(1);
      combatEffects.explosion(blast,1.65);
      spawnShockwave(blast.clone().setY(0.22),0xff7722,21,0.65);
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
      sectorTimer.invalidate();lapGhost.invalidate();lastSectorNotice=null;
      if(reason==='death'){beginPlayerDeath();return;}
      combatEffects.resetDriving();
      const revive=reason==='revive';
      overtakeTracker.interrupt();driftMastery.reset();slipstreamTracker.interrupt();
      const previousHealth=player.health;
      const previousRegenDelay=player.regenDelay;
      const safeIdx=revive?0:findSafeRespawnIndex(findClosest(player.pos.x,player.pos.z,player.lastSampleIdx).idx);
      const pt=samples[safeIdx],tg=tangents[safeIdx];
      const offset=revive?startGrid[0].offset:0;
      player.pos.set(pt.x-tg.z*offset,0,pt.z+tg.x*offset);
      if(revive)player.crossedHalf=false;
      pickupSweepStart.copy(player.pos); // A teleport must never sweep through distant pickups.
      player.heading=Math.atan2(tg.x,tg.z);
      player.speed=0;player.speedLat=0;player.steerAngle=0;
      speedFeedback.reset();
      player.health=respawnHealth(previousHealth,player.maxHealth,revive);
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

    window.restartGame=function(options={}){
      if(garage?.isOpen())return;
      if(activeChampionship&&championship.snapshot().results.length>activeChampionship.stageIndex){returnToMainMenu();return;}
      if(gameStarted)saveRecords();
      if(activeChampionship&&typeof stageCheckpoint!=='undefined'&&!options.resume)stageCheckpoint.clear();
      // Standalone starts/restarts must not inherit a previous championship warning.
      if(!activeChampionship)checkpointRecoveryNotice='';
      document.body.dataset.stageResumed='false';checkpointElapsed=0;
      championshipFinishedIds=[];singleRaceFinishedIds=[];
      // Commit the next selection only after the previous race was recorded.
      activeGarage={...selectedGarage};
      activeBuild=tuning.getBuild(activeGarage.classId);
      activeProfile=buildProfile(activeBuild);
      drivingConfig=playerConfig(CONFIG,activeBuild);
      creditedRaceEvents=new Set();
      overtakeTracker.reset();lastOvertakeNotice=null;slipstreamTracker.reset();
      driftMastery.reset();
      sectorTimer.reset();lapGhost.reset();lastSectorNotice=null;
      lapGhostRecordResult=null;
      lapGhost.importBest(lapGhostStore.get(currentTrackId==='valley'?CONFIG.VALLEY_ROUTE_VERSION:currentTrackId,buildKey(activeBuild)));
      raceContractTracker.start(activeChampionship?'none':selectedRaceContract,singleRaceMode);
      if(typeof pilotTutorial!=='undefined'){
        pilotTutorial.start({enabled:settings.tutorialEnabled,done:settings.tutorialDone,shieldSeen:settings.tutorialShieldSeen});
        tutorialInputMode=initialInputMode();
      }
      contractGoalAnnounced=false;contractNoticeAt=-Infinity;raceContractNoticeEl.textContent='';
      player.maxSpeed=drivingConfig.MAX_SPEED;player.maxHealth=activeProfile.maxHealth;
      playerCar.setAppearance(activeGarage.classId,garagePaint(activeGarage.paintId).color);
      clearInputs();clearBonusRespawnTimers();
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      document.body.classList.remove('low-health','menu-open');speedVignetteEl.style.opacity='0';
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');
      lastDamageSource=null;lastDamageUntil=-Infinity;incomingRocketSource=null;incomingThreat=Infinity;
      finishScreen.classList.add('hidden'); startScreen.classList.add('hidden');
      document.body.classList.add('game-session-active');
      gameFinished=false;paused=false;gameStarted=true;menuOpen=false;lastRaceWon=false;
      if(settings.quality==='auto'&&mobileControls.matches)setQualityMode('low');
      raceStartHint=true;
      pauseMenu.classList.remove('open');
      setGameplayCursor(true);

      player.pos.copy(samples[0]).addScaledVector(startPerp,startGrid[0].offset);
      pickupSweepStart.copy(player.pos);
      player.heading=Math.atan2(tangents[0].x,tangents[0].z);
      player.speed=0; player.speedLat=0; player.steerAngle=0; player.health=player.maxHealth; player.invincibleTimer=1.5;
      player.lap=1; player.curLap=0; player.bestLap=Infinity; player.prevT=0; player.crossedHalf=true; player.lastSampleIdx=0;
      lapGhost.beginLap(1,{x:player.pos.x,z:player.pos.z,heading:player.heading});
      player.rockets=0; player.gunAmmo=0; player.nitro=3; player.speedBoostTimer=0; player.nitroTimer=0; player.shieldTimer=0; player.regenDelay=0;
      player.score=0; player.kills=0; player.deaths=0; player.combo=0; player.comboTimer=0; player.totalTime=0;
      player.driftTime=0;player.driftScoreCarry=0;
      player.destroyed=false;player.deathTimer=0;player.damageCooldown=0;player.wrongWayTimer=0;player.resetCooldown=0;
      player.pulseCooldown=0;player.stuckTimer=0;
      playerCar.group.visible=true; playerCar.group.position.set(player.pos.x,0.02,player.pos.z); playerCar.group.rotation.y=player.heading+Math.PI;
      playerShieldMesh.visible=false; playerShieldMesh.position.set(player.pos.x,2,player.pos.z);
      cameraShake=0;
      speedFeedback.reset();camera.fov=58;camera.updateProjectionMatrix();
      const pose=cameraViewPose({x:player.pos.x,y:player.pos.y,z:player.pos.z,heading:player.heading},undefined,false,camera.aspect);
      camCur.set(pose.position.x,pose.position.y,pose.position.z);
      lookCur.set(pose.look.x,pose.look.y,pose.look.z);
      cameraAnchor.copy(player.pos);
      playerCar.wheels.forEach(w=>{w.group.rotation.y=0; w.tire.rotation.x=0; w.rim.rotation.x=0;});
      updateWeaponVis();

      opponents.forEach((o,i)=>{
        o.health=100; o.dead=false; o.finished=false; o.respawnTimer=0; o.slowTimer=0; o.lap=1;
        o.rockets=0; o.gunAmmo=0; o.attackCooldown=0.8+Math.random()*1.5; o.speedBoostTimer=0;
        updateWeaponVis(o.car,o);
        o.t=startGrid[i+1].t;o.prevT=o.t;o.crossedHalf=false;o.car.group.visible=true;o.healthPlane.visible=true;
        o.offset=startGrid[i+1].offset;o.targetOffset=o.offset;o.laneChangeTimer=2+Math.random()*3;o.bumpOffset=0;o.bumpVelocity=0;
        o.lastSampleIdx=Math.floor(o.t*CONFIG.NUM_SAMPLES); o.nitroCharges=1; o.nitroTimer=0; o.shieldTimer=0; o.lastHealthDrawn=-1;
        o.tacticalPlan=null;o.speed=o.baseSpeed;
        o.combatTargetId=null;o.burstRemaining=0;o.lastAttackerId=null;o.lastAttackerTimer=0;o.invincibleTimer=1.5;
        const pt=trackCurve.getPointAt(o.t), tg=trackCurve.getTangentAt(o.t).normalize();
        const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
        const laneOffset=o.offset+o.bumpOffset;
        o.car.group.position.set(pt.x+perp.x*laneOffset,0.02,pt.z+perp.z*laneOffset);
        o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;
        o.pickupSweepStart=null;
        o.car.wheels.forEach(w=>{w.group.rotation.y=0;w.tire.rotation.x=0;w.rim.rotation.x=0;});
      });

      while(bonusMeshes.length)removeBonusAt(bonusMeshes.length-1,false);
      for(let i=0;i<CONFIG.NUM_BONUSES;i++)spawnBonus((i*0.016+Math.random()*0.01)%1,(Math.random()-0.5)*1.8);
      while(projectiles.length)removeProjectileAt(projectiles.length-1);
      combatEffects.clear();
      clearShockwaves();
      startScreen.classList.add('hidden');
      beginCountdown();
      updateUI(); minimap.render(); focusGameCanvas();
    };

    function awardRaceEvent(key,amount){
      if(!gameStarted||creditedRaceEvents.has(key))return false;
      creditedRaceEvents.add(key);
      tuning.award(amount); // Immediately persist; a denied storage still keeps tab state.
      return true;
    }
    function recordSectorSplit(event){
      if(event)lastSectorNotice={...event,until:player.totalTime+2.8};
    }
    function sectorFinishMarkup(){
      const {lastCompleted}=sectorTimer.snapshot();
      if(!lastCompleted){
        return '<section class="finish-sector-analysis"><h2>ТЕМП ПО СЕКТОРАМ</h2><p>Нет полного корректного замера. После следующего чистого круга появится сравнение.</p></section>';
      }
      const cards=lastCompleted.times.map((time,index)=>{
        const delta=lastCompleted.deltas[index];
        const tone=delta===null?'neutral':delta<-.005?'faster':delta>.005?'slower':'neutral';
        const comparison=delta===null?'ПЕРВЫЙ ЗАМЕР':formatSectorDelta(delta);
        return `<div class="finish-sector" data-tone="${tone}"><span>СЕКТОР ${index+1}</span><strong>${formatSectorTime(time)}</strong><small>${comparison}</small></div>`;
      }).join('');
      const losses=lastCompleted.deltas.map((delta,index)=>({delta,index}))
        .filter(item=>item.delta!==null&&item.delta>.005)
        .sort((a,b)=>b.delta-a.delta);
      const guidance=losses.length
        ?`Больше всего времени потеряно в секторе ${losses[0].index+1}: ${formatSectorDelta(losses[0].delta)} к личному лучшему.`
        :lastCompleted.deltas.some(delta=>delta!==null)
          ?'Отличный темп: нет секторов медленнее предыдущего лучшего!'
          :'Первый полный замер готов. На следующем круге появится сравнение.';
      return `<section class="finish-sector-analysis"><h2>ТЕМП ПО СЕКТОРАМ · КРУГ ${lastCompleted.lap}</h2><div class="finish-sector-grid">${cards}</div><p>${guidance}</p></section>`;
    }
    function completeLap(){
      // A callback for the same crossing cannot create a second fictitious lap.
      if(!gameStarted||gameFinished||player.curLap<1)return;
      const lapWasValid=sectorTimer.snapshot().lastCompleted?.lap===player.lap;
      const transition=resolveLapCompletion({
        lap:player.lap,curLap:player.curLap,bestLap:player.bestLap,totalLaps:raceLaps(),validLap:lapWasValid
      });
      const ghostImproved=lapGhost.completeLap({lap:player.lap,elapsed:player.curLap,x:player.pos.x,
        z:player.pos.z,heading:player.heading,valid:lapWasValid});
      if(ghostImproved){
        const ghostTrack=currentTrackId==='valley'?CONFIG.VALLEY_ROUTE_VERSION:currentTrackId;
        lapGhostRecordResult=lapGhostStore.put(ghostTrack,buildKey(activeBuild),lapGhost.exportBest());
      }
      const completedLap=transition.completedLap;
      player.bestLap=transition.bestLap;
      player.score+=transition.scoreDelta;
      awardRaceEvent('lap:'+completedLap,activeChampionship?300:SINGLE_RACE_MODES[singleRaceMode].lapCredits);
      if(transition.grantLapBonus){
        if(player.nitro<5)player.nitro++;
        if(player.health<player.maxHealth)player.health=healPlayerHealth(player.health,player.maxHealth,15);
        showMessage(`🎁 КРУГ ${completedLap}: БОНУС ЗА КРУГ`);
      }
      if(transition.finished){
        player.curLap=0; finishGame(true); return;
      }
      player.lap=transition.lap; player.curLap=transition.curLap;
      lapGhost.beginLap(player.lap,{x:player.pos.x,z:player.pos.z,heading:player.heading});
      // Commit the awarded lap and its idempotency token together before the next frame.
      if(activeChampionship&&typeof saveStageCheckpoint==='function')saveStageCheckpoint();
      if(!transition.grantLapBonus)showMessage(`🏁 КРУГ ${completedLap} ПРОЙДЕН! +50 очков · +300 кредитов`);
    }

    function finishGame(won){
      if(gameFinished)return;
      const singleOrder=!activeChampionship&&won?singleRaceFinishOrder(opponents,singleRaceFinishedIds):null;
      const singlePlace=singleOrder?singleOrder.indexOf('player')+1:0;
      const raceWon=Boolean(won)&&(Boolean(activeChampionship)||singlePlace===1);
      const contractOutcome=!activeChampionship
        ?raceContractTracker.finalize({finished:Boolean(won),kills:player.kills,place:singlePlace}):null;
      gameFinished=true;paused=true;menuOpen=false;lastRaceWon=raceWon;
      driftMastery.reset();
      if(raceWon&&!activeChampionship)awardRaceEvent('victory',SINGLE_RACE_MODES[singleRaceMode].victoryCredits);
      if(contractOutcome?.credits)awardRaceEvent('contract:'+contractOutcome.status.id,contractOutcome.credits);
      clearInputs();setGameplayCursor(false);
      document.body.classList.remove('game-session-active','menu-open');
      playerShieldMesh.visible=false;document.body.classList.remove('low-health');
      if(damageOverlayTimer){clearTimeout(damageOverlayTimer);damageOverlayTimer=null;}
      damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)';
      incomingWarningEl.classList.remove('show');wrongWayEl.classList.remove('show');hitMarkerEl.classList.remove('show');comboDisplayEl.classList.remove('show');speedVignetteEl.style.opacity='0';
      pauseMenu.classList.remove('open'); finishScreen.classList.remove('hidden');
      finishTitle.textContent=raceWon?'🏆 ПОБЕДА!':singleOrder?`🏁 ФИНИШ — ${singlePlace} МЕСТО`:'💀 ПОРАЖЕНИЕ';
      finishTitle.style.color=raceWon?'#00ff66':singleOrder?'#80eff9':'#ff0055';
      finishTitle.style.textShadow=raceWon?'0 0 40px #00ff66':singleOrder?'0 0 40px #008899':'0 0 40px #ff0055';
      if(activeChampionship){finishChampionshipStage();return;}
      const positions=singleOrder||getRacePositions(),pos=singleOrder?singlePlace:positions.findIndex(x=>x.who==='player')+1;
      const recordsPersisted=saveRecords();
      const ghostLine=lapGhostRecordResult?.improved
        ?`<br>👻 Новый призрак круга: <b>${lapGhost.snapshot().bestTime.toFixed(2)} с</b>${lapGhostRecordResult.persisted?' · сохранён для следующих заездов':' · только в этой вкладке (хранилище недоступно)'}`:'';
      const contractLine=contractOutcome?.status
        ?`<br>Контракт «${contractOutcome.status.title}»: <b>${contractOutcome.credits?'+200 кредитов':'не выполнен'}</b>`:'';
      finishStats.innerHTML=`Круги: <b>${Math.min(player.lap,raceLaps())}/${raceLaps()}</b><br>Позиция: <b>${pos}/${positions.length}</b><br>Общее время: <b>${player.totalTime.toFixed(1)} с</b><br>Лучший круг: <b>${player.bestLap<Infinity?player.bestLap.toFixed(2):'--'}</b><br>Очки: <b>${Math.round(player.score)}</b><br>Уничтожено: <b>${player.kills}</b><br>Аварии: <b>${player.deaths}</b><br>Кредиты: <b>${tuning.snapshot().wallet}</b>${raceWon?' (победа +'+SINGLE_RACE_MODES[singleRaceMode].victoryCredits+')':''}${contractLine}${ghostLine}${recordsPersisted?'':'<br>⚠ Рекорды действуют только в этой вкладке — браузер не сохранил результат.'}`;
      finishStats.innerHTML+=sectorFinishMarkup();
    }

    function destroyOpponent(o,impactAlready=false,killer=null){
      if(o.dead)return;
      o.dead=true; o.car.group.visible=false; o.healthPlane.visible=false; o.respawnTimer=4;
      for(let i=projectiles.length-1;i>=0;i--){
        // Do not splice unrelated indices during updateProjectiles -> hitVehicle -> destroy.
        if(projectiles[i].ownerRef===o)projectiles[i].life=0;
        else if(projectiles[i].target===o){projectiles[i].target=null; projectiles[i].life=Math.min(projectiles[i].life,0.45);}
      }
      const pos=o.car.group.position.clone().add(new THREE.Vector3(0,1,0));

      combatEffects.explosion(pos,1.65);

      spawnShockwave(pos.clone().setY(0.22),0xff4400,18,0.58);

      if(!impactAlready)audio.play('explosion',soundAt(pos,1.5));
      addCameraShake((impactAlready?0.55:0.9)*THREE.MathUtils.clamp(1-pos.distanceTo(player.pos)/150,0,1));
      o.combatTargetId=null;o.burstRemaining=0;o.tacticalPlan=null;
      if(killer===player){
        player.combo=player.comboTimer>0?Math.min(5,player.combo+1):1;
        player.comboTimer=8;
        const reward=100*player.combo;
        player.score+=reward; player.kills++;
        comboDisplayEl.textContent=`КОМБО ×${player.combo}  +${reward}`;
        comboDisplayEl.classList.toggle('show',player.combo>1);
      }

      if(Math.random()<0.6)spawnBonusAt(o.car.group.position.x, o.car.group.position.z,o.t);
    }

    function respawnOpponent(o){
      const {t,offset}=startGrid[o.id+1];
      const pt=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t).normalize();
      o.tacticalPlan=null;o.speed=o.baseSpeed;
      o.combatTargetId=null;o.burstRemaining=0;o.lastAttackerId=null;o.lastAttackerTimer=0;o.invincibleTimer=1.5;
      o.health=100; o.dead=false; o.slowTimer=0; o.shieldTimer=0; o.attackCooldown=1.2+Math.random();
      o.nitroTimer=0;o.speedBoostTimer=0;o.lastHealthDrawn=-1;o.bumpOffset=0;o.bumpVelocity=0;
      o.car.group.visible=true; o.healthPlane.visible=true;
      o.t=t;o.prevT=t;o.crossedHalf=false;
      o.offset=offset;o.targetOffset=offset;
      o.car.group.position.set(pt.x-tg.z*offset,0.02,pt.z+tg.x*offset);
      o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;
      o.pickupSweepStart=null;
      o.lastSampleIdx=Math.floor(t*CONFIG.NUM_SAMPLES);
    }

    const particles=combatEffects;
    let damageOverlayTimer=null;
    function flashDamage(alpha=0.6){
      if(damageOverlayTimer)clearTimeout(damageOverlayTimer);
      damageOverlay.style.background=`radial-gradient(circle, transparent 30%, rgba(255,0,0,${alpha}) 100%)`;
      damageOverlayTimer=setTimeout(()=>{damageOverlay.style.background='radial-gradient(circle, transparent 40%, rgba(255,0,0,0) 100%)'; damageOverlayTimer=null;},140);
    }

    function applyPlayerDamage(amount,continuousContact=false,source=null){
      // Physical overlap deals damage for the full time in contact; projectile
      // damage still uses the existing short impact grace period.
      if(player.invincibleTimer>0||(!continuousContact&&player.damageCooldown>0)||player.destroyed||gameFinished)return false;
      const multiplier=(player.shieldTimer>0?CONFIG.SHIELD_DAMAGE_MULTIPLIER:1)*difficulty().botDamage;
      const actual=amount*multiplier;
      player.health=Math.max(0,player.health-actual);
      if(source&&Number.isFinite(source.x)&&Number.isFinite(source.z)){
        lastDamageSource={x:source.x,z:source.z};
        lastDamageUntil=player.totalTime+0.85;
      }
      player.regenDelay=CONFIG.PLAYER_REGEN_DELAY;
      if(player.driftAwardThisFrame>0){
        player.score=Math.max(0,player.score-player.driftAwardThisFrame);
        player.driftAwardThisFrame=0;
      }
      driftMastery.interrupt();
      if(player.damageCooldown<=0){
        player.damageCooldown=CONFIG.DAMAGE_GRACE;
        flashDamage(player.shieldTimer>0?0.25:0.58);
        addCameraShake(player.shieldTimer>0?0.18:0.45);
      }
      return true;
    }

    function tireOnAsphalt(point){
      return findClosest(point.x,point.z,player.lastSampleIdx).dist<=CONFIG.ROAD_HALF;
    }
    function updatePlayer(dt){
      if(!canControl())return;
      player.driftAwardThisFrame=0;
      // loop already caps dt at 0.1 s; player and AI must advance equal time.
      // stepPlayerDriving substeps physics internally at up to 120 Hz.
      const cl=dt;
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
      if(player.regenDelay<=0&&player.health>0&&player.health<player.maxHealth)player.health=healPlayerHealth(player.health,player.maxHealth,CONFIG.PLAYER_REGEN_RATE*difficulty().regen*cl);
      player.shieldTimer=Math.max(0,player.shieldTimer-cl);
      const {throttle:thr,brake:brk,steering:steerIn,handbrake}=resolveDrivingInput(
        keys,touchInput,gamepadInput,!isGameplayInputBlocked(),
        settings.touchAutoThrottle&&tutorialInputMode==='touch');
      if(thr||brk||Math.abs(player.speed)>1.2)raceStartHint=false;

      let curMax=player.maxSpeed;
      if(player.speedBoostTimer>0){curMax*=1.35;player.speedBoostTimer=Math.max(0,player.speedBoostTimer-cl);}
      if(player.nitroTimer>0){
        curMax*=1.55;player.nitroTimer=Math.max(0,player.nitroTimer-cl);
      }
      const motion=stepPlayerDriving({
        speed:player.speed,speedLat:player.speedLat,steerAngle:player.steerAngle,
        heading:player.heading,maxSpeed:curMax
      },{throttle:thr,brake:brk,steering:steerIn,handbrake},drivingConfig,cl);
      player.speed=motion.speed;player.speedLat=motion.speedLat;
      if(typeof pilotTutorial!=='undefined')pilotTutorial.observeDrive({throttle:thr,speed:player.speed},player.totalTime);
      player.steerAngle=motion.steerAngle;player.heading=motion.heading;
      drivingAudio.throttle=thr;
      drivingAudio.skid=motion.drifting?Math.min(1,.25+Math.abs(player.speedLat)/7):brk&&player.speed>20?.16:0;
      drivingAudio.reverse=player.speed<-.5;
      const previousX=player.pos.x,previousZ=player.pos.z;
      pickupSweepStart.copy(player.pos);
      player.pos.x+=motion.deltaX;player.pos.z+=motion.deltaZ;
      let driftContact=false;
      const hasCarObstacles=typeof carObstacles!=='undefined'&&typeof sweepCarObstacle2D==='function';
      let obstacleHit=hasCarObstacles
        ?sweepCarObstacle2D({x:previousX,z:previousZ},player.pos,carObstacles,CONFIG.CAR_RADIUS):null;
      if(obstacleHit){
        driftContact=true;
        player.pos.x=obstacleHit.x;player.pos.z=obstacleHit.z;
        player.speed=0;player.speedLat=0;
      }

      const beforeTrafficX=player.pos.x,beforeTrafficZ=player.pos.z;
      opponents.forEach(o=>{
        if(gameFinished)return;
        if(o.dead)return;
        const op=o.car.group.position;
        const dist=Math.hypot(player.pos.x-op.x,player.pos.z-op.z);
        if(dist<CONFIG.CAR_RADIUS*2&&dist>0.01){
          driftContact=true;
          overtakeTracker.contact(o.id);
          const angle=Math.atan2(player.pos.z-op.z,player.pos.x-op.x);
          const overlap=CONFIG.CAR_RADIUS*2-dist;
          player.pos.x+=Math.cos(angle)*overlap*0.5;
          player.pos.z+=Math.sin(angle)*overlap*0.5;
          const botTangent=trackCurve.getTangentAt(o.t).normalize();
          const botPerpX=-botTangent.z,botPerpZ=botTangent.x;
          const playerSide=Math.sign((player.pos.x-op.x)*botPerpX+(player.pos.z-op.z)*botPerpZ)||1;
          o.bumpVelocity-=playerSide*overlap*2.2;
          o.contactFxCooldown=Math.max(0,(o.contactFxCooldown||0)-cl);
          if(o.contactFxCooldown<=0&&Math.abs(player.speed)>6){
            o.contactFxCooldown=0.12;
            combatEffects.burst(player.pos.clone().lerp(o.car.group.position,0.5).setY(0.8),7,player.pos.clone().sub(op).setY(0).normalize(),0.55);
          }
          if(player.invincibleTimer<=0)applyPlayerDamage(8*cl,true,op);
          if(!(o.invincibleTimer>0))o.health-=6*cl*(o.shieldTimer>0?0.35:1);
          if(o.health<=0)destroyOpponent(o,false,player);
        }
      });
      // Opponent contact can push the car; that displacement cannot cross a wall either.
      if(hasCarObstacles&&(player.pos.x!==beforeTrafficX||player.pos.z!==beforeTrafficZ)){
        const pushHit=sweepCarObstacle2D({x:beforeTrafficX,z:beforeTrafficZ},player.pos,carObstacles,CONFIG.CAR_RADIUS);
        if(pushHit){
          obstacleHit=pushHit;
          player.pos.x=pushHit.x;player.pos.z=pushHit.z;player.speed=0;player.speedLat=0;
        }
      }
      if(player.health<=0&&player.invincibleTimer<=0){
        respawnPlayer('death');
        // Death hides the car; do not reveal it or complete a lap this frame.
        return;
      }

      playerCar.group.position.set(player.pos.x,0.02,player.pos.z);
      playerCar.group.rotation.y=player.heading+Math.PI;
      playerShieldMesh.position.set(player.pos.x,2.0,player.pos.z);
      playerShieldMesh.rotation.y+=cl*0.8;
      playerShieldMesh.visible=player.shieldTimer>0;
      if(player.shieldTimer>0)playerShieldMesh.material.opacity=0.12+Math.sin(performance.now()*0.008)*0.06;

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

      // Shared contact signal: a scrape breaks drafting even when no HP is lost.
      player.draftContact=driftContact;
      const closest = findClosest(player.pos.x, player.pos.z, player.lastSampleIdx);
      player.lastSampleIdx = closest.idx;
      const trackForward=tangents[closest.idx];
      const driveDot=Math.sin(player.heading)*trackForward.x+Math.cos(player.heading)*trackForward.z;
      const driftAward=driftMastery.step({drifting:motion.drifting,speed:player.speed,
        speedLat:player.speedLat,steerAngle:player.steerAngle,
        onRoad:closest.dist<=CONFIG.ROAD_HALF-CONFIG.CAR_RADIUS,
        forward:driveDot>0.3,contact:driftContact,dt:cl});
      player.driftAwardThisFrame=driftAward;
      player.score+=driftAward;
      if(player.speed>9&&driveDot<-0.25)player.wrongWayTimer=Math.min(3,player.wrongWayTimer+cl);
      else player.wrongWayTimer=Math.max(0,player.wrongWayTimer-cl*2.2);
      wrongWayEl.classList.toggle('show',player.wrongWayTimer>CONFIG.WRONG_WAY_DELAY);
      if(closest.dist>CONFIG.ROAD_HALF+3){
        const slow=Math.max(0,1-CONFIG.OFFROAD_DRAG*cl); player.speed*=slow; player.speedLat*=slow;
      }
      const tryingToMove=Boolean(thr||brk);
      if((obstacleHit&&tryingToMove)||(closest.dist>CONFIG.ROAD_HALF+8&&Math.abs(player.speed)<1.6&&tryingToMove)){
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
      combatEffects.updateDriving(playerCar,{nitro:player.nitroTimer>0,drifting:motion.drifting&&!driftContact,
        speed:player.speed,speedLat:player.speedLat,isAsphalt:tireOnAsphalt},cl);
      const nt = closest.t;
      lapGhost.record({lap:player.lap,elapsed:player.curLap,x:player.pos.x,
        z:player.pos.z,heading:player.heading});
      const sectorSample={lap:player.lap,t:nt,elapsed:player.curLap,
        onRoad:closest.dist<CONFIG.ROAD_HALF+10,
        forward:player.speed>=-0.1&&(player.speed<9||driveDot>-.25)};
      if(player.prevT>0.75&&nt<0.25&&player.crossedHalf&&driveDot>0.15&&closest.dist<CONFIG.ROAD_HALF+10){
        recordSectorSplit(sectorTimer.closeLap(sectorSample));
        if(player.lap>=raceLaps()){
          // Resolve other racers at the player's crossing before publishing places.
          // The normal AI update is then blocked by gameFinished.
          // findClosest uses sample indices: its wrap occurs at the bisector
          // between the last and first samples, rather than at interpolated t.
          const first=samples[0],last=samples[samples.length-1];
          const dx=first.x-last.x,dz=first.z-last.z;
          const side=(previousX-(first.x+last.x)*.5)*dx+(previousZ-(first.z+last.z)*.5)*dz;
          const travel=(player.pos.x-previousX)*dx+(player.pos.z-previousZ)*dz;
          const crossingFraction=travel>0?THREE.MathUtils.clamp(-side/travel,0,1):1;
          updateOpponents(cl*crossingFraction);
        }
        completeLap(); player.crossedHalf=false; if(gameFinished)return;
      }else{
        recordSectorSplit(sectorTimer.observe(sectorSample));
        if(player.prevT<0.25&&nt>0.75&&player.crossedHalf)player.crossedHalf=false;
      }
      if(nt>0.4&&nt<0.6)player.crossedHalf=true;
      player.prevT=nt;
    }

    function resolveMissedMovingContact(opponent,oldBot,dt){
      if(gameFinished||player.destroyed||opponent.dead||opponent.finished)return;
      const radius=CONFIG.CAR_RADIUS*2;
      // The earlier player update already handles overlap against this old position.
      if(Math.hypot(player.pos.x-oldBot.x,player.pos.z-oldBot.z)<radius)return;
      if(!sweptVehicleContact2D(pickupSweepStart,player.pos,oldBot,opponent.car.group.position,radius))return;
      overtakeTracker.contact(opponent.id);
      if(player.driftAwardThisFrame>0){
        player.score=Math.max(0,player.score-player.driftAwardThisFrame);
        player.driftAwardThisFrame=0;
      }
      driftMastery.interrupt();
      if(player.invincibleTimer<=0)applyPlayerDamage(8*dt,true,opponent.car.group.position);
      if(!(opponent.invincibleTimer>0)){
        opponent.health-=6*dt*(opponent.shieldTimer>0?0.35:1);
        if(opponent.health<=0)destroyOpponent(opponent,false,player);
      }
      if(player.health<=0&&player.invincibleTimer<=0)respawnPlayer('death');
    }

    function updateOpponents(dt){
      if(!canControl())return;
      const frameFinishers=[];
      // All planners see the same pre-update traffic, including the player's lane.
      const traffic=opponents.filter(o=>!o.dead).map(o=>({
        id:o.id,t:o.t,offset:o.offset+o.bumpOffset,targetOffset:o.targetOffset,speed:o.speed
      }));
      if(!player.destroyed){
        const point=samples[player.lastSampleIdx],tangent=tangents[player.lastSampleIdx];
        traffic.push({id:'player',t:player.prevT,
          offset:(player.pos.x-point.x)*-tangent.z+(player.pos.z-point.z)*tangent.x,
          speed:player.speed*(Math.sin(player.heading)*tangent.x+Math.cos(player.heading)*tangent.z)});
      }
      opponents.forEach(o=>{
        if(gameFinished||o.finished)return;
        if(o.dead){o.respawnTimer-=dt; if(o.respawnTimer<=0)respawnOpponent(o); return;}
        o.slowTimer=Math.max(0,o.slowTimer-dt);
        o.shieldTimer=Math.max(0,(o.shieldTimer||0)-dt);
        o.invincibleTimer=Math.max(0,(o.invincibleTimer||0)-dt);
        o.lastAttackerTimer=Math.max(0,(o.lastAttackerTimer||0)-dt);

        // Подбор бонусов соперниками
        for(let i=bonusMeshes.length-1; i>=0; i--){
          const b = bonusMeshes[i];
          const pickupStart=o.pickupSweepStart||o.car.group.position;
          if(segmentSphereHit(pickupStart,o.car.group.position,b.group.position,8)){
            applyPickup(b.type,o,{nitroKey:'nitroCharges',shieldDuration:5,speedBoostDuration:8});
            updateWeaponVis(o.car,o);
            removeBonusAt(i,true);
          }
        }
        // Keep only the position before this frame's AI movement; next frame checks its full sweep.
        o.pickupSweepStart={x:o.car.group.position.x,y:o.car.group.position.y,z:o.car.group.position.z};

        const tangent=trackCurve.getTangentAt(o.t).normalize();
        let bend=0;
        for(const seconds of [.8,1.6,2.5]){
          const preview=trackCurve.getTangentAt((o.t+Math.max(o.speed,o.baseSpeed)*seconds/totalLength)%1).normalize();
          bend=Math.max(bend,Math.acos(THREE.MathUtils.clamp(tangent.dot(preview),-1,1)));
        }
        o.tacticalPlan=planOpponentTactics(o,{
          totalLength,roadHalf:CONFIG.ROAD_HALF,totalLaps:raceLaps(),bend,traffic,
          pickups:bonusMeshes.map(b=>({id:b.id,type:b.type,t:b.t,offset:b.offset}))
        },dt);
        const remainingDistance=(1-o.t)*totalLength;
        const motion=stepOpponentFrame({
          id:o.id,laneChangeTimer:o.laneChangeTimer,targetOffset:o.targetOffset,offset:o.offset,
          bumpVelocity:o.bumpVelocity,bumpOffset:o.bumpOffset,nitroCharges:o.nitroCharges,
          nitroTimer:o.nitroTimer,speedBoostTimer:o.speedBoostTimer,slowTimer:o.slowTimer,
          baseSpeed:o.baseSpeed,lap:o.lap,t:o.t
        },{
          roadHalf:CONFIG.ROAD_HALF,difficultySpeed:difficulty().botSpeed,
          playerProgress:(player.lap-1)+player.prevT,
          minRubberBand:CONFIG.BOT_MIN_RUBBER_BAND,maxRubberBand:CONFIG.BOT_MAX_RUBBER_BAND,
          maxSpeed:CONFIG.MAX_SPEED,totalLength,totalLaps:raceLaps(),
          tactics:o.tacticalPlan
        },dt,Math.random);
        const oldBot={x:o.car.group.position.x,z:o.car.group.position.z};
        const nextTangent=motion.finished?tangent:trackCurve.getTangentAt(motion.t).normalize();
        const nextPosition=motion.finished?null:trackCurve.getPointAt(motion.t);
        if(nextPosition){
          const laneOffset=motion.offset+motion.bumpOffset;
          nextPosition.x-=nextTangent.z*laneOffset;
          nextPosition.z+=nextTangent.x*laneOffset;
        }
        const blocked=nextPosition&&typeof scenery!=='undefined'&&scenery.blocksFinishBarricade?.(oldBot,nextPosition);
        o.laneChangeTimer=motion.laneChangeTimer;o.targetOffset=motion.targetOffset;
        o.nitroCharges=motion.nitroCharges;o.nitroTimer=motion.nitroTimer;o.speedBoostTimer=motion.speedBoostTimer;
        if(blocked){
          // Keep lap progress and lane position consistent with the stopped car.
          o.bumpVelocity=0;
        }else{
          o.offset=motion.offset;o.bumpVelocity=motion.bumpVelocity;o.bumpOffset=motion.bumpOffset;
          o.t=motion.t;o.lap=motion.lap;
        }
        const effSpeed=blocked?0:motion.effSpeed;
        o.speed=effSpeed;
        if(motion.finished){
          frameFinishers.push({id:o.id,time:remainingDistance/Math.max(motion.effSpeed,1e-6)});o.finished=true;o.dead=true;
          o.car.group.visible=false;o.healthPlane.visible=false;o.speed=0;
          for(const projectile of projectiles)if(projectile.ownerRef===o||projectile.target===o)projectile.life=0;
          return;
        }
        if(!blocked)o.car.group.position.set(nextPosition.x,0.02,nextPosition.z);
        const tg=blocked?tangent:nextTangent;
        const laneSteer=THREE.MathUtils.clamp((o.targetOffset-o.offset)*0.018+o.bumpVelocity*0.008,-0.18,0.18);
        o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI-laneSteer;
        resolveMissedMovingContact(o,oldBot,dt);
        if(o.dead||gameFinished)return;
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
          o.healthCtx.fillRect(0,0,64*Math.max(0,Math.min(1,o.health/100)),8); o.healthTex.needsUpdate=true;
        }

        o.attackCooldown-=dt;
        if(o.attackCooldown<=0){
          const target=chooseOpponentCombatTarget(o);
          if(!target){o.burstRemaining=0;o.attackCooldown=.3;return;}
          const tgForAttack=trackCurve.getTangentAt(o.t).normalize();
          const targetPosition=getTargetPosition(target),targetVelocity=getTargetVelocity(target);
          const attackPlan=planOpponentAttack({
            combat:true,origin:o.car.getMuzzle(false),target:targetPosition,targetVelocity,
            forward:{x:tgForAttack.x,z:tgForAttack.z},
            difficulty:difficulty(),
            lineOfSight:true,targetDead:target===player?player.destroyed:target.dead,
            targetInvincible:target.invincibleTimer>0,targetShieldTimer:target.shieldTimer,targetHealth:target.health,
            projectileCount:projectiles.length,maxProjectiles:CONFIG.MAX_PROJECTILES,
            rockets:o.rockets,gunAmmo:o.gunAmmo,burstRemaining:o.burstRemaining,
            rocketSpeed:CONFIG.BOT_ROCKET_SPEED,bulletSpeed:CONFIG.BOT_BULLET_SPEED
          },Math.random);
          const shotX=attackPlan.shotX,shotZ=attackPlan.shotZ,dist=attackPlan.distance;
          if(attackPlan.kind!=='none'){
            const muzzle=o.car.getMuzzle(attackPlan.kind==='rocket');
            const end=muzzle.clone().add(new THREE.Vector3(shotX*dist,0,shotZ*dist));
            if(obstacleIndex.hit(muzzle,end)){
              o.burstRemaining=0;o.attackCooldown=.3;return;
            }
          }
          o.burstRemaining=attackPlan.burstRemaining;
          if(attackPlan.kind==='rocket'){
            o.rockets--;
            updateWeaponVis(o.car,o);
            const start=o.car.getMuzzle(true).add(new THREE.Vector3(shotX*.9,0,shotZ*.9));
            const rocket=createRocketMesh(0xff4444,0xff0000,'opponent');
            rocket.position.copy(start);
            rocket.lookAt(start.clone().sub(new THREE.Vector3(shotX,0,shotZ)));
            scene.add(rocket);
            projectiles.push({
              mesh:rocket,vel:new THREE.Vector3(shotX*CONFIG.BOT_ROCKET_SPEED,0,shotZ*CONFIG.BOT_ROCKET_SPEED),
              life:CONFIG.BOT_ROCKET_LIFE,damage:30,owner:'opponent',ownerRef:o,
              target,turnSpeed:4.2,isRocket:true,age:0,noProgress:0,trailTimer:0,
              lastTargetDistance:targetPosition.distanceTo(start)
            });
            combatEffects.muzzle(o.car,true);
            audio.play('rocket',soundAt(start,.85));
          }else if(attackPlan.kind==='bullet'){
            o.gunAmmo--;
            updateWeaponVis(o.car,o);
            const start=o.car.getMuzzle(false);
            const bullet=createBulletMesh('opponent');
            bullet.position.copy(start);bullet.lookAt(start.clone().add(new THREE.Vector3(shotX,0,shotZ)));scene.add(bullet);
            projectiles.push({mesh:bullet,vel:new THREE.Vector3(shotX*CONFIG.BOT_BULLET_SPEED,0,shotZ*CONFIG.BOT_BULLET_SPEED),life:1.15,damage:9,owner:'opponent',ownerRef:o,isRocket:false,age:0,sharedResources:true,poolKey:'opponent'});
            combatEffects.muzzle(o.car);
            audio.play('shoot',soundAt(start,.85));
          }
          o.attackCooldown=attackPlan.cooldown;
        }
      });
      frameFinishers.sort((a,b)=>a.time-b.time||a.id-b.id);
      const finishedIds=activeChampionship?championshipFinishedIds:singleRaceFinishedIds;
      for(const finisher of frameFinishers)finishedIds.push('bot:'+finisher.id);
    }

    function updateSlipstream(dt){
      const point=samples[player.lastSampleIdx],tangent=tangents[player.lastSampleIdx];
      const onRoad=Boolean(point)&&Math.hypot(player.pos.x-point.x,player.pos.z-point.z)<=CONFIG.ROAD_HALF-CONFIG.CAR_RADIUS;
      const forward=Boolean(tangent)&&Math.sin(player.heading)*tangent.x+Math.cos(player.heading)*tangent.z>0.5;
      const awardedId=slipstreamTracker.step({
        dt,now:player.totalTime,
        active:canControl()&&!player.destroyed,
        player:{x:player.pos.x,z:player.pos.z,heading:player.heading,
          speed:player.speed,nitro:player.nitro,onRoad,forward,
          undamaged:!player.draftContact&&player.invincibleTimer<=0&&player.damageCooldown<=0},
        rivals:opponents.map(o=>({id:o.id,x:o.car.group.position.x,z:o.car.group.position.z,
          heading:o.car.group.rotation.y-Math.PI,speed:o.speed,
          active:!o.dead&&!o.finished&&o.invincibleTimer<=0}))
      });
      if(awardedId!==null)player.nitro=Math.min(5,player.nitro+1);
    }

    function updateOvertakes(){
      const tangent=tangents[player.lastSampleIdx];
      const forward=Boolean(tangent)&&player.speed>9&&player.invincibleTimer<=0&&
        Math.sin(player.heading)*tangent.x+Math.cos(player.heading)*tangent.z>0.45;
      const events=overtakeTracker.step({
        time:player.totalTime,totalLength,active:canControl()&&!player.destroyed,forward,
        player:{lap:player.lap,t:player.prevT,x:player.pos.x,z:player.pos.z},
        rivals:opponents.map(o=>({id:o.id,lap:o.lap,t:o.t,
          x:o.car.group.position.x,z:o.car.group.position.z,
          active:!o.dead&&!o.finished&&o.invincibleTimer<=0}))
      });
      for(const event of events){
        player.score+=event.points;
        // Independent feedback lane: never erase countdown, lap or combat messages.
        lastOvertakeNotice={event,time:player.totalTime};
      }
    }

    function checkBonuses(){
      if(!canControl()||player.destroyed)return;
      for(let i=bonusMeshes.length-1;i>=0;i--){
        const m=bonusMeshes[i];
        if(segmentSphereHit(pickupSweepStart,player.pos,m.group.position,6)){
          const t=m.type;
          const useful=applyPickup(t,player,{shieldDuration:CONFIG.SHIELD_DURATION});
          if(t==='shield'){
            player.shieldTimer=Math.max(player.shieldTimer,CONFIG.SHIELD_DURATION);
            audio.play('shield'); showMessage('🛡️ ЭНЕРГОЩИТ АКТИВЕН','pickup');
          }
          updateWeaponVis();
          if(t!=='shield')showMessage(`${bonusData[t].icon} ${bonusData[t].name}`,'pickup');
          removeBonusAt(i,true);
          if(useful)raceContractTracker.recordUsefulPickup();
          audio.play('bonus');
          particles.spawn(player.pos.clone(), bonusData[t].emissive, 4, 4, 0.5, 0.15, false, true);
        }
      }
    }

    function handleShooting(dt){
      if(!canAcceptGameplayInput())return;
      const wantsRocket=mouseRight||(typeof touchInput!=='undefined'&&touchInput.rocket)||(typeof gamepadInput!=='undefined'&&gamepadInput.rocket);
      const wantsGun=mouseLeft||(typeof touchInput!=='undefined'&&touchInput.gun)||(typeof gamepadInput!=='undefined'&&gamepadInput.gun);
      if(wantsRocket&&player.rockets>0&&!rocketFired){fireRocket(); rocketFired=true;}
      if(!wantsRocket)rocketFired=false;
      if(wantsGun&&player.gunAmmo>0){
        gunFireTimer=Math.max(-0.16,gunFireTimer-dt);
        // Accumulate the firing cadence so low FPS does not reduce shot rate.
        // The simulation step is capped at 0.1 s; two shots per frame suffice.
        let fired=0;
        while(gunFireTimer<=0&&player.gunAmmo>0&&fired<2){
          fireGun();gunFireTimer+=0.08;fired++;
        }
        if(gunFireTimer<0)gunFireTimer=0; // No unbounded catch-up burst.
      } else gunFireTimer=0;
    }

    function findProjectileVehicle(from,to,p,radius){
      let vehicle=null,hitTime=Infinity;
      if(p.owner!=='player'&&player!==p.ownerRef&&player.invincibleTimer<=0&&!player.destroyed){
        const t=segmentSphereEntry3D(from,to,player.pos,radius);
        if(t!==null){vehicle=player;hitTime=t;}
      }
      for(const o of opponents){
        if(o===p.ownerRef||o.dead||o.health<=0||o.invincibleTimer>0)continue;
        const t=segmentSphereEntry3D(from,to,o.car.group.position,radius);
        if(t!==null&&t<hitTime){vehicle=o;hitTime=t;}
      }
      return {vehicle,hitTime};
    }

    function updateProjectiles(dt){
      if(!canControl())return;
      incomingThreat=Infinity;incomingRocketSource=null;
      while(projectiles.length>CONFIG.MAX_PROJECTILES)removeProjectileAt(0);
      for(let i=projectiles.length-1;i>=0;i--){
        const p=projectiles[i];if(!p)continue;
        if(p.life<=0){removeProjectileAt(i);continue;}
        p.life-=dt;p.age=(p.age||0)+dt;
        const previous=p.mesh.position.clone();
        p.impactFrom=previous;
        const targetValid=p.target===player?!gameFinished&&!player.destroyed&&player.invincibleTimer<=0
          :Boolean(p.target&&p.target!==p.ownerRef&&!p.target.dead&&p.target.health>0&&!(p.target.invincibleTimer>0));
        let rocketStep=null;
        if(p.isRocket&&targetValid){
          const targetPos=getTargetPosition(p.target,projectileTargetPos),targetVel=getTargetVelocity(p.target,projectileTargetVel);
          rocketStep=stepHomingProjectile({position:p.mesh.position,velocity:p.vel,targetPosition:targetPos,targetVelocity:targetVel,turnSpeed:p.turnSpeed||4,dt,lastTargetDistance:p.lastTargetDistance,noProgress:p.noProgress||0,maxLead:0.55});
          p.vel.set(rocketStep.velocity.x,rocketStep.velocity.y,rocketStep.velocity.z);
          p.noProgress=rocketStep.noProgress;p.lastTargetDistance=rocketStep.distance;
          if(p.target===player&&p.owner!=='player'&&rocketStep.distance<incomingThreat){
            incomingThreat=rocketStep.distance;
            incomingRocketSource={x:previous.x,z:previous.z};
          }
          if(rocketStep.stalled)p.life=Math.min(p.life,0.25);
        }else if(p.isRocket&&p.target){p.target=null;p.life=Math.min(p.life,0.45);}
        if(!p.trail)p.trail=combatEffects.createTrail(p.isRocket,p.owner,previous);
        if(rocketStep&&rocketStep.distance<=CONFIG.ROCKET_HIT_RADIUS+2.5){
          const intendedSurface=targetSurface(p,p.target);
          const first=findProjectileVehicle(previous,intendedSurface.pos,p,CONFIG.ROCKET_HIT_RADIUS);
          const target=first.vehicle||p.target,surface=targetSurface(p,target);
          // An obstacle between the fuse and target receives the blast first.
          const obstruction=obstacleIndex.hit(previous,surface.pos);
          combatEffects.moveTrail(p.trail,previous,obstruction?new THREE.Vector3(obstruction.point.x,obstruction.point.y,obstruction.point.z):surface.pos);
          removeProjectileAt(i);
          if(obstruction)hitScenery(p,obstruction);
          else if(target!==player||player.invincibleTimer<=0)hitVehicle(p,target);
          continue;
        }
        if(rocketStep)p.mesh.position.set(rocketStep.position.x,rocketStep.position.y,rocketStep.position.z);
        else p.mesh.position.addScaledVector(p.vel,dt);
        if(p.isRocket)p.mesh.lookAt(projectileLookPoint.copy(p.mesh.position).sub(p.vel));
        const worldHit=obstacleIndex.hit(previous,p.mesh.position);
        const radius=p.isRocket?CONFIG.ROCKET_HIT_RADIUS:CONFIG.BULLET_HIT_RADIUS;
        const {vehicle,hitTime}=findProjectileVehicle(previous,p.mesh.position,p,radius);
        if(worldHit&&worldHit.t<hitTime){
          const pos=new THREE.Vector3(worldHit.point.x,worldHit.point.y,worldHit.point.z);
          combatEffects.moveTrail(p.trail,previous,pos);removeProjectileAt(i);hitScenery(p,worldHit);continue;
        }
        if(vehicle){
          // Broad damage spheres extend beyond the visible body. Resolve cover up to
          // the actual visual surface before confirming damage, including a wall
          // located between the broad sphere's entry and the body itself.
          const surface=targetSurface(p,vehicle),obstruction=obstacleIndex.hit(previous,surface.pos);
          const pos=obstruction?new THREE.Vector3(obstruction.point.x,obstruction.point.y,obstruction.point.z):surface.pos;
          combatEffects.moveTrail(p.trail,previous,pos);removeProjectileAt(i);
          if(obstruction)hitScenery(p,obstruction);else hitVehicle(p,vehicle);continue;
        }
        combatEffects.moveTrail(p.trail,previous,p.mesh.position);
        if(p.mesh.userData?.flame){p.mesh.userData.flame.scale.set(0.85,1+Math.sin(p.age*90)*0.18,0.85);}
        if(Math.abs(p.mesh.position.x)>CONFIG.WORLD_SIZE||Math.abs(p.mesh.position.z)>CONFIG.WORLD_SIZE||p.mesh.position.y<-5){removeProjectileAt(i);continue;}
        if(p.life<=0){const pos=p.mesh.position.clone();removeProjectileAt(i);if(p.isRocket)spawnImpactEffect(pos,true);}
      }
      const warning=incomingThreat<125;incomingWarningEl.classList.toggle('show',warning);
      if(warning){
        const direction=directionLabel(buildThreatIndicators({
          player:player.pos,heading:player.heading,now:player.totalTime,active:true,
          rocket:{source:incomingRocketSource}
        }).rocket);
        const cue=defenseRocketCue({distance:incomingThreat,radius:CONFIG.DEFENSE_PULSE_RADIUS,
          cooldown:player.pulseCooldown,charges:player.nitro,direction});
        incomingWarningEl.dataset.defense=cue?.phase||'off';
        incomingWarningEl.textContent=cue?.text||'';
      }else incomingWarningEl.dataset.defense='off';
    }

    const camCur=new THREE.Vector3(), camTgt=new THREE.Vector3();
    const lookCur=new THREE.Vector3(), lookTgt=new THREE.Vector3();
    const cameraAnchor=new THREE.Vector3(), cameraTravel=new THREE.Vector3();
    let speedMotionTime=0;
    let rearviewActive=false;
    function updateCamera(dt){
      const rear=canControl()&&!player.destroyed&&
        Boolean(keys.KeyC||keys.c||touchInput.mirror||gamepadInput.mirror);
      const cameraCut=rear!==rearviewActive;
      rearviewActive=rear;
      rearviewIndicatorEl.hidden=!rear;
      const reduceMotion=sceneryMotionPreference.matches;
      const view=speedFeedback.update({speed:player.speed,maxSpeed:drivingConfig.MAX_SPEED,
        active:!paused&&gameStarted&&!gameFinished&&raceCountdown<=0,destroyed:player.destroyed,
        nitro:player.nitroTimer>0,reducedMotion:reduceMotion,cameraShake:settings.cameraShake},dt);
      const fov=reduceMotion?58:camera.fov+(view.fov-camera.fov)*(1-Math.exp(-7*dt));
      if(Math.abs(camera.fov-fov)>0.001){camera.fov=fov;camera.updateProjectionMatrix();}
      speedMotionTime+=dt;
      if(player.destroyed){
        const elapsed=CONFIG.PLAYER_DEATH_DELAY-player.deathTimer;
        const angle=player.deathHeading+elapsed*1.25;
        camTgt.set(player.deathPos.x+Math.sin(angle)*18,player.deathPos.y+10,player.deathPos.z+Math.cos(angle)*18);
        lookTgt.set(player.deathPos.x,player.deathPos.y+1.2,player.deathPos.z);
        const k=1-Math.exp(-7*dt);camCur.lerp(camTgt,k);lookCur.lerp(lookTgt,k);
        camera.position.copy(camCur);camera.lookAt(lookCur);return;
      }
      // Carry the chase rig with the car; smooth the viewing angle and distance
      // independently so forward speed doesn't push the car away from the camera.
      cameraTravel.subVectors(player.pos,cameraAnchor);
      camCur.add(cameraTravel);lookCur.add(cameraTravel);
      cameraAnchor.copy(player.pos);
      const pose=cameraViewPose({x:player.pos.x,y:player.pos.y,z:player.pos.z,heading:player.heading},view,rear,camera.aspect);
      camTgt.set(pose.position.x,pose.position.y,pose.position.z);
      lookTgt.set(pose.look.x,pose.look.y,pose.look.z);
      // A deliberate camera cut avoids an inverted steering illusion mid-transition.
      const l=cameraCut?1:1-Math.exp(-5*dt);
      camCur.lerp(camTgt,l); lookCur.lerp(lookTgt,l);
      camera.position.copy(camCur);
      const fx=Math.sin(player.heading),fz=Math.cos(player.heading);
      // Tiny chassis vibration; impact shake keeps its existing separate envelope.
      camera.position.x+=Math.sin(speedMotionTime*37)*fz*view.vibration;
      camera.position.z-=Math.sin(speedMotionTime*37)*fx*view.vibration;
      camera.position.y+=Math.sin(speedMotionTime*51)*view.vibration*0.6;
      if(cameraShake>0.01&&!reduceMotion){
        const phase=performance.now()*0.055;
        camera.position.addScaledVector(cameraImpact,Math.sin(phase)*cameraShake*0.4);
        camera.position.x+=Math.sin(phase*1.37)*cameraShake*0.3;
        camera.position.y+=Math.sin(phase*1.81)*cameraShake*0.28;
        cameraShake*=Math.exp(-10*dt);
      }else cameraShake=0;
      camera.lookAt(lookCur);
    }
    camCur.set(0,15,30); lookCur.set(0,0,0);

    let minimap=createMinimap({
      document,trackPoints,samples,
      getPlayer:()=>player,
      getOpponents:()=>opponents
    });

    let msgTimeout;
    function showMessage(txt,placement='center'){
      if(msgTimeout)clearTimeout(msgTimeout);
      messageEl.classList.toggle('pickup-notice',placement==='pickup');
      messageEl.textContent=txt; messageEl.classList.add('show');
      msgTimeout=setTimeout(()=>messageEl.classList.remove('show'),1800);
    }
    let rivalGapSample=null,rivalGapDirection='unknown';
    const getRacePositions=()=>{
      const positions=buildRacePositions(player,opponents);
      const finishedIds=activeChampionship?championshipFinishedIds:singleRaceFinishedIds;
      if(!finishedIds.length)return positions;
      const finishRank=row=>row.who==='player'?-1:finishedIds.indexOf('bot:'+opponents[row.index].id);
      return positions.sort((a,b)=>{
        const ar=finishRank(a),br=finishRank(b);
        if(ar>=0||br>=0)return ar>=0&&br>=0?ar-br:ar>=0?-1:1;
        return b.progress-a.progress;
      });
    };
    function renderThreatIndicators(){
      const result=buildThreatIndicators({
        player:player.pos,heading:player.heading,now:player.totalTime,
        active:canControl()&&!player.destroyed,
        damage:{source:lastDamageSource,until:lastDamageUntil},
        rocket:incomingThreat<125&&incomingRocketSource?{source:incomingRocketSource}:null
      });
      for(const marker of threatEdges){
        const side=marker.dataset.threatDirection;
        const signal=result.damage===side?'damage':result.rocket===side?'rocket':'off';
        if(marker.dataset.signal!==signal)marker.dataset.signal=signal;
        const label=signal==='damage'?'УДАР':signal==='rocket'?'РАКЕТА':'УГРОЗА';
        const target=marker.querySelector('strong');
        if(target.textContent!==label)target.textContent=label;
      }
    }
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
      const start=playerCar.getMuzzle(true).addScaledVector(forward,.9);
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

    function renderMobileReadouts(contract){
      if(!mobileControls.matches)return;
      for(const [action,count,empty] of [
        ['gun',player.gunAmmo,player.gunAmmo<=0],['rocket',player.rockets,player.rockets<=0],
        ['nitro',player.nitro,player.nitro<=0],['pulse',player.pulseCooldown>0?Math.ceil(player.pulseCooldown)+' с':'',player.pulseCooldown>0]
      ]){
        const button=touchButtons.get(action),counter=button.querySelector('.touch-count');
        if(counter.textContent!==String(count))counter.textContent=count;
        if(button.dataset.empty!==String(empty))button.dataset.empty=String(empty);
      }
      const event=document.getElementById('mobile-race-event');
      const sector=sectorDetailEl.textContent?sectorDetailEl.textContent+' · '+sectorDeltaEl.textContent:'';
      const notice=raceContractNoticeEl.textContent||(!overtakeNoticeEl.hidden&&overtakeNoticeEl.textContent)||
        (rivalGapEl.dataset.drafting==='true'&&rivalGapTrendEl.textContent)||sector||'';
      event.hidden=!notice;
      if(event.textContent!==notice)event.textContent=notice;
      if(menuOpen){
        mobileTrackReturn.disabled=raceCountdown>0||player.destroyed||player.resetCooldown>0;
        const stats=document.getElementById('mobile-pause-stats');
        const rows=[`Очки ${scoreEl.textContent}`,`Лучший круг ${bestTimeEl.textContent}`];
        if(contract)rows.push(contract.title+' · '+(contract.met?'цель выполнена':contract.progressLabel));
        stats.textContent=rows.join(' / ');
        stats.hidden=false;
      }
    }

    function updateUI(){
      const speed=speedometerReading(player.destroyed?0:player.speed);
      speedEl.textContent=player.destroyed?'—':speed.kmh;
      speedNeedleEl.style.transform=`rotate(${speed.angle}deg)`;
      speedArcEl.style.strokeDasharray=`${speed.fraction*100} 100`;
      lapEl.textContent=`${String(Math.min(player.lap,raceLaps())).padStart(2,'0')}/${raceLaps()}`;
      currTimeEl.textContent=formatLapTime(player.curLap);
      bestTimeEl.textContent=formatLapTime(player.bestLap);
      rocketCountEl.textContent=player.rockets;gunAmmoEl.textContent=player.gunAmmo;
      nitroChargesEl.textContent=player.nitro;
      for(const [id,count] of [['slot-rocket',player.rockets],['slot-gun',player.gunAmmo],['slot-nitro',player.nitro]]){
        document.getElementById(id).classList.toggle('empty',count<=0);
      }
      const pulseReady=player.pulseCooldown<=0;
      pulseCooldownEl.textContent=pulseReady?'ГОТОВ':`${player.pulseCooldown.toFixed(1)} с`;
      pulseSlotEl.classList.toggle('active',pulseReady);
      pulseSlotEl.dataset.ready=String(pulseReady);
      pulseSlotEl.style.setProperty('--cooldown',`${(1-Math.min(1,player.pulseCooldown/CONFIG.DEFENSE_PULSE_COOLDOWN))*100}%`);
      scoreEl.textContent=Math.round(player.score);
      const driftView=driftMastery.view();
      const showDrift=driftView.visible&&gameStarted&&!gameFinished&&!paused&&raceCountdown<=0&&!player.destroyed;
      driftFeedbackEl.hidden=!showDrift;
      if(showDrift){
        driftFeedbackEl.dataset.active=String(driftView.active);
        driftLabelEl.textContent=driftView.label;
        driftPointsEl.textContent=driftView.points?`+${driftView.points}`:'—';
        driftProgressEl.style.transform=`scaleX(${driftView.progress/100})`;
      }
      const hp=healthPercent(player.health/player.maxHealth*100);
      healthBar.style.width=hp+'%';
      healthBar.parentElement.setAttribute('aria-valuemax',String(player.maxHealth));
      healthBar.parentElement.setAttribute('aria-valuenow',String(Math.min(player.maxHealth,Math.ceil(player.health))));
      healthBar.parentElement.setAttribute('aria-valuetext',`${Math.ceil(player.health)} HP`);
      healthTextEl.textContent=Math.ceil(player.health);
      healthTextEl.title=`${Math.ceil(player.health)} / ${player.maxHealth} HP`;
      document.body.classList.toggle('low-health',hp>0&&hp<28&&player.shieldTimer<=0);
      shieldStatusEl.textContent=player.shieldTimer>0?`${player.shieldTimer.toFixed(1)} с`:'—';
      shieldBarEl.style.width=`${Math.min(100,player.shieldTimer/CONFIG.SHIELD_DURATION*100)}%`;
      shieldBarEl.closest('.effect-row').classList.toggle('inactive',player.shieldTimer<=0);
      let effectName='СОСТОЯНИЕ',effectText='НОРМА',effectFraction=0;
      if(player.nitroTimer>0){effectName='НИТРО';effectText=`${player.nitroTimer.toFixed(1)} с`;effectFraction=player.nitroTimer/2.5;}
      else if(player.speedBoostTimer>0){effectName='УСКОРЕНИЕ';effectText=`${player.speedBoostTimer.toFixed(1)} с`;effectFraction=player.speedBoostTimer/10;}
      else if(player.regenDelay<=0&&player.health<player.maxHealth){effectName='РЕМОНТ';effectText='АКТИВЕН';}
      if(player.destroyed){effectName='ВОЗВРАЩЕНИЕ';effectText=`${player.deathTimer.toFixed(1)} с`;effectFraction=0;}
      effectNameEl.textContent=effectName;effectStatusEl.textContent=effectText;
      effectRowEl.classList.toggle('inactive',effectName==='СОСТОЯНИЕ');
      effectRowEl.classList.toggle('bad',player.destroyed);
      nitroBar.style.width=`${Math.min(100,effectFraction*100)}%`;
      const timing=sectorTimer.snapshot();
      const sectorVisible=gameStarted&&!gameFinished&&raceCountdown<=0;
      sectorTimingEl.hidden=!sectorVisible;
      if(sectorVisible){
        const active=timing.valid&&!player.destroyed;
        const notice=active&&lastSectorNotice&&player.totalTime<=lastSectorNotice.until?lastSectorNotice:null;
        sectorCurrentEl.textContent=active?`СЕКТОР ${timing.sector}/3`:'СЕКТОРЫ';
        sectorTimingEl.dataset.tone=notice?.delta===null?'neutral':notice?.delta<-.005?'faster':notice?.delta>.005?'slower':'neutral';
        sectorDeltaEl.textContent=notice
          ?(notice.delta===null?formatSectorTime(notice.time):formatSectorDelta(notice.delta))
          :active?'ИДЁТ ЗАМЕР':'КРУГ БЕЗ ЗАМЕРА';
        const detail=notice
          ?`СЕКТОР ${notice.sector} · ${notice.delta===null?'ПЕРВЫЙ ЗАМЕР':notice.improved?'БЫСТРЕЕ':notice.delta>.005?'МЕДЛЕННЕЕ':'ВРОВЕНЬ'}`:'';
        if(sectorDetailEl.textContent!==detail)sectorDetailEl.textContent=detail;
      }
      const positions=getRacePositions();
      posEl.textContent=`${positions.findIndex(x=>x.who==='player')+1}/${positions.length}`;
      const finishedIds=activeChampionship?championshipFinishedIds:singleRaceFinishedIds;
      const rival=buildRivalGapHud(player,opponents,positions,finishedIds,totalLength);
      const trackGap=Boolean(rival)&&gameStarted&&!gameFinished&&raceCountdown<=0&&!paused&&!player.destroyed;
      if(!trackGap||rival.finished){
        rivalGapSample=null;rivalGapDirection='unknown';
      }else if(!rivalGapSample||rivalGapSample.reading.rivalId!==rival.rivalId||
               rivalGapSample.reading.direction!==rival.direction||player.totalTime<rivalGapSample.time){
        rivalGapSample={reading:rival,time:player.totalTime};rivalGapDirection='unknown';
      }else if(player.totalTime-rivalGapSample.time>=0.7){
        rivalGapDirection=rivalGapTrend(rivalGapSample.reading,rival);
        rivalGapSample={reading:rival,time:player.totalTime};
      }
      rivalGapEl.hidden=!rival||!gameStarted||gameFinished;
      if(rival){
        rivalGapLabelEl.textContent=`${rival.direction==='ahead'?'ДО':'ОТ'} ${rival.place}-ГО`;
        rivalGapValueEl.textContent=rival.finished?'ФИНИШ':formatRivalDistance(rival.distance);
        rivalGapEl.dataset.trend=rivalGapDirection;
        rivalGapTrendEl.textContent=rival.finished?'СОПЕРНИК УЖЕ ФИНИШИРОВАЛ':
          rivalGapDirection==='closing'?(rival.direction==='ahead'?'РАЗРЫВ СОКРАЩАЕТСЯ':'СОПЕРНИК ПРИБЛИЖАЕТСЯ'):
          rivalGapDirection==='opening'?(rival.direction==='ahead'?'РАЗРЫВ РАСТЁТ':'ОТРЫВ РАСТЁТ'):
          rivalGapDirection==='steady'?'РАЗРЫВ СТАБИЛЕН':'СЛЕДИ ЗА ОТРЫВОМ';
      }
      const draftView=slipstreamTracker.view(player.totalTime);
      const showDraft=trackGap&&draftView.visible;
      rivalGapEl.dataset.drafting=String(showDraft);
      rivalGapEl.style.setProperty('--draft-progress',String(showDraft?draftView.progress:0));
      if(showDraft)rivalGapTrendEl.textContent=draftView.rewarded
        ?'ПОТОК: +1 НИТРО'
        :'ПОТОК '+Math.round(draftView.progress*100)+'% → +1 НИТРО';
      const seriesView=buildOvertakeSeriesHud(
        overtakeTracker.getSeriesStatus(player.totalTime),lastOvertakeNotice,player.totalTime,
        gameStarted&&!gameFinished&&raceCountdown<=0&&!player.destroyed);
      overtakeSeriesEl.hidden=!seriesView.visible;
      if(seriesView.visible){
        overtakeMultiplierEl.textContent=seriesView.multiplier;
        overtakeNextEl.textContent=seriesView.nextReward;
        overtakeTimeEl.textContent=seriesView.remaining;
        overtakeBarEl.style.width=seriesView.progress+'%';
      }
      if(overtakeNoticeEl.textContent!==seriesView.notice)overtakeNoticeEl.textContent=seriesView.notice;
      overtakeNoticeEl.hidden=!seriesView.notice;
      const raceProgress=raceProgressPercent(player,raceLaps());
      raceProgressEl.style.width=raceProgress+'%';
      const contractView=gameStarted&&!activeChampionship&&!gameFinished
        ?raceContractTracker.status({kills:player.kills}):null;
      raceContractHudEl.hidden=!contractView;
      if(contractView){
        raceContractTitleEl.textContent=contractView.title;
        raceContractProgressEl.textContent=contractView.met?'ЦЕЛЬ ВЫПОЛНЕНА · ФИНИШИРУЙТЕ':contractView.progressLabel;
        raceContractHudEl.dataset.complete=String(contractView.met);
        if(contractView.met&&!contractGoalAnnounced){
          contractGoalAnnounced=true;contractNoticeAt=player.totalTime;
          raceContractNoticeEl.textContent='Контракт выполнен! Награда после финиша.';
        }
        if(player.totalTime-contractNoticeAt>=2.5&&raceContractNoticeEl.textContent)raceContractNoticeEl.textContent='';
      }
      updateTargetHUD();
      renderThreatIndicators();
      if(typeof renderPilotTutorial==='function')renderPilotTutorial();
      if(typeof renderMobileReadouts==='function')renderMobileReadouts(contractView);
    }

    function setQualityMode(mode,force=false){
      if(mode===qualityMode&&!force)return;
      qualityMode=mode;
      combatEffects.setQuality(mode);combatRenderer.setQuality(mode);
      scenery.setQuality(mode);speedFeedback.setQuality(mode);
      document.body.classList.toggle('low-quality',mode==='low');
      if(mode==='low'){
        renderer.setPixelRatio(Math.min(devicePixelRatio,1));
        renderer.shadowMap.enabled=false;
        // Bounded effect batches use half capacity in performance mode.
        qualityIndicatorEl.textContent=settings.quality==='auto'?'ГРАФИКА: AUTO / ПРОИЗВОДИТЕЛЬНОСТЬ':'ГРАФИКА: ПРОИЗВОДИТЕЛЬНОСТЬ';
      }else{
        renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        renderer.shadowMap.enabled=true;
        renderer.shadowMap.needsUpdate=true;
        // Full bounded effect capacity in high quality.
        qualityIndicatorEl.textContent=settings.quality==='auto'?'ГРАФИКА: AUTO / ВЫСОКАЯ':'ГРАФИКА: ВЫСОКАЯ';
      }
      renderer.setSize(innerWidth,innerHeight,false);
    }

    function updateAdaptiveQuality(fps){
      if(settings.quality!=='auto')return;
      const next=stepAdaptiveQuality({mode:qualityMode,lowFpsWindows,highFpsWindows},
        fps,CONFIG.LOW_FPS_THRESHOLD,CONFIG.HIGH_FPS_THRESHOLD);
      lowFpsWindows=next.lowFpsWindows;highFpsWindows=next.highFpsWindows;
      if(next.mode!==qualityMode)setQualityMode(next.mode);
    }

    let lastTime=performance.now();
    let frameCount=0; let lastFpsTime=performance.now();
    let uiAccumulator=0,minimapAccumulator=0,lightAccumulator=0;
    function loop(now){
      requestAnimationFrame(loop);
      const elapsed=Math.max(0,(now-lastTime)/1000);
      const dt=Math.min(elapsed,0.1); lastTime=now;
      const time=now/1000;

      if(typeof pollGamepad==='function')pollGamepad();
      const activeFrame=!paused&&gameStarted&&!gameFinished;
      if(activeFrame){
        frameCount++;
        if(now-lastFpsTime>=1000){
          const fps=measureFrameRate(frameCount,now-lastFpsTime);
          fpsEl.textContent='FPS: '+Math.round(fps);
          updateAdaptiveQuality(fps);
          frameCount=0;
          lastFpsTime=now;
        }
      }else{
        // A pause/menu/background interval must not be counted as active render time.
        frameCount=0;lastFpsTime=now;
        lowFpsWindows=0;highFpsWindows=0;
      }

      if(activeFrame){
        if(typeof activeChampionship!=='undefined'&&activeChampionship&&raceCountdown<=0){checkpointElapsed+=elapsed;if(checkpointElapsed>=5){checkpointElapsed=0;saveStageCheckpoint();}}
        if(raceCountdown>0){
          updateCountdown(elapsed);
          incomingWarningEl.classList.remove('show');
          updateCamera(dt);
        }else{
          updatePlayer(dt); updateOpponents(dt); updateSlipstream(dt); updateOvertakes(); checkBonuses(); handleShooting(dt);
          updateProjectiles(dt); updateCamera(dt);
          if(typeof pilotTutorial!=='undefined'&&pilotTutorial.noticeThreat({
            active:!player.destroyed,near:incomingThreat<125,canPulse:player.pulseCooldown<=0,now:player.totalTime
          })){settings.tutorialShieldSeen=true;saveSettings();}
        }
        particles.update(dt); updateShockwaves(dt);

        pickupFactory.update(bonusMeshes,time,dt);

        lightAccumulator+=dt;
        if(lightAccumulator>=0.2){
          lightAccumulator=0;
          placeTrackLight(player.pos);
        }

        uiAccumulator+=dt; minimapAccumulator+=dt;
        if(uiAccumulator>=0.05){uiAccumulator=0;updateUI();}
        if(minimapAccumulator>=0.08){minimapAccumulator=0;minimap.render();}
      }else{
        speedFeedback.update({active:false},0);
        incomingWarningEl.classList.remove('show');
        rearviewIndicatorEl.hidden=true;
      }
      const ghostActive=activeFrame&&raceCountdown<=0&&!gameFinished&&!player.destroyed;
      const ghostTime=lapGhost.snapshot().bestTime;
      const ghostVisible=ghostActive&&settings.lapGhost&&ghostTime!==null;
      lapGhostBadge.hidden=!ghostVisible;
      if(ghostVisible){
        lapGhostBadgeTime.textContent=ghostTime.toFixed(1)+' с';
        // Compare only while moving forward, and at most seven times per second.
        if(player.curLap<lapGhostPaceLastTime||player.curLap-lapGhostPaceLastTime>=0.15){
          lapGhostPaceLastTime=player.curLap;
          lapGhostPaceDelta=player.speed>5&&player.wrongWayTimer<0.05
            ?lapGhost.paceAt({elapsed:player.curLap,x:player.pos.x,z:player.pos.z,heading:player.heading})
            :null;
        }
        const delta=lapGhostPaceDelta;
        lapGhostBadgePace.dataset.pace=delta===null?'neutral':delta<-.05?'ahead':delta>.05?'behind':'neutral';
        lapGhostBadgePace.textContent=delta===null?'':Math.abs(delta)<.05
          ?' · ВРОВЕНЬ':delta<0
            ?' · ВПЕРЕДИ ≈'+Math.abs(delta).toFixed(1)+' с'
            :' · ПОЗАДИ ≈'+delta.toFixed(1)+' с';
      }else{
        lapGhostPaceLastTime=-Infinity;lapGhostPaceDelta=null;
        lapGhostBadgePace.textContent='';
      }
      lapGhostVisual.update(ghostVisible?lapGhost.poseAt(player.curLap):null,
        {enabled:settings.lapGhost,quality:qualityMode,active:ghostActive});
      scenery.update(dt,player.pos,activeFrame,sceneryMotionPreference.matches);
      audio.updateEngine(Math.abs(player.speed)/drivingConfig.MAX_SPEED,canControl()&&!player.destroyed,player.nitroTimer>0,drivingAudio);
      if(activeFrame)combatRenderer.render(scene,camera);
    }
    // A rotation ends old thumb contacts, even on browsers that omit pointercancel.
    // Browser toolbar resize without orientation change must not interrupt driving.
    let lastPortraitViewport=typeof innerHeight==='number'&&typeof innerWidth==='number'?innerHeight>=innerWidth:null;
    window.addEventListener('resize',()=>{
      const portrait=innerHeight>=innerWidth;
      if(portrait!==lastPortraitViewport){
        lastPortraitViewport=portrait;
        if(window.matchMedia?.('(pointer:coarse)').matches)clearInputs();
      }
      speedFeedback.resize(innerWidth,innerHeight);
      camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio,qualityMode==='high'?1.5:1));
      renderer.setSize(innerWidth,innerHeight);
      if(gameStarted&&!paused&&!gameFinished)combatRenderer.render(scene,camera);
    });
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault(); paused=true; clearInputs(); setGameplayCursor(false); showMessage('⚠️ ГРАФИКА ПЕРЕЗАПУСКАЕТСЯ');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>{if(gameStarted&&!gameFinished){openMenu(); showMessage('✅ ГРАФИКА ВОССТАНОВЛЕНА');}});
    playerCar.group.position.set(player.pos.x,0.02,player.pos.z); playerCar.group.rotation.y=player.heading+Math.PI;
    opponents.forEach(o=>{const pt=trackCurve.getPointAt(o.t),tg=trackCurve.getTangentAt(o.t).normalize(),perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();o.car.group.position.set(pt.x+perp.x*o.offset,0.02,pt.z+perp.z*o.offset);o.car.group.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;o.attackCooldown=1.2+Math.random();});
    document.body.classList.remove('game-session-active','menu-open');
    pauseMenu.classList.remove('open');
    startScreen.classList.remove('hidden');
    finishScreen.classList.add('hidden');
    updateWeaponVis();updateUI();minimap.render();updateRecordInfo();syncSettingsUI();
    setQualityMode(initialQualityMode(),true);
    if(settings.quality==='high')qualityIndicatorEl.textContent='ГРАФИКА: ВЫСОКАЯ';
    else if(settings.quality==='low')qualityIndicatorEl.textContent='ГРАФИКА: ПРОИЗВОДИТЕЛЬНОСТЬ';
    window.addEventListener('beforeunload',()=>{saveStageCheckpoint();saveRecords();});
    updateFullscreenButtons();
    syncRaceModeUI();updateChampionshipMenu();
    championshipNew.disabled=false;championshipContinue.disabled=false;
    garageButton.disabled=false;
    startButton.disabled=false;startButton.setAttribute('aria-busy','false');
    startButton.querySelector('[data-start-label]').textContent='НАЧАТЬ ГОНКУ';
    menuStatus.textContent='';
    document.documentElement.dataset.cyberBoot='ready';
    requestAnimationFrame(loop);
  
})().catch(error=>{
  document.documentElement.dataset.cyberBoot='error';
  document.getElementById('start-screen')?.classList.add('menu-load-error');
  const startButton=document.getElementById('start-btn');
  if(startButton){
    startButton.disabled=true;startButton.setAttribute('aria-busy','false');
    const label=startButton.querySelector('[data-start-label]');
    if(label)label.textContent='ЗАПУСК НЕДОСТУПЕН';
  }
  const status=document.getElementById('menu-status');
  if(status)status.textContent='Не удалось подготовить игру. Проверьте подключение и обновите страницу.';
  console.error('CYBER RACE runtime failed',error);
});
