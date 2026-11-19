(function attachGarageProfiles(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createGarageProfiles(){
  'use strict';
  const GARAGE_KEY='cyberRaceGarage';
  const CLASS_RECORDS_KEY='cyberRaceClassRecords';
  const TUNING_KEY='cyberRaceTuning',BUILD_RECORDS_KEY='cyberRaceBuildRecords';
  const START_CREDITS=1200,WALLET_LIMIT=10000000;
  const UPGRADES=Object.freeze({
    engine:Object.freeze({name:'Двигатель',prices:Object.freeze([400,800,1400]),description:'+3% скорость, +7% разгон / уровень'}),
    tires:Object.freeze({name:'Шины',prices:Object.freeze([300,600,1000]),description:'Лучше сцепление и отклик руля / уровень'}),
    armor:Object.freeze({name:'Броня',prices:Object.freeze([350,700,1200]),description:'+15% прочность / уровень'})
  });
  const CAR_PROFILES=Object.freeze({
    universal:Object.freeze({id:'universal',name:'Универсал',tag:'GT / 01',description:'Ровный темп и надёжное управление. Знакомый баланс для любой трассы.',maxHealth:100,driving:Object.freeze({MAX_SPEED:52,ACCEL:36,STEER_MAX:0.55,STEER_RESPONSE:10})}),
    interceptor:Object.freeze({id:'interceptor',name:'Перехватчик',tag:'RX / 02',description:'Быстрее на прямых и острее в поворотах. Лёгкий кузов требует беречь здоровье.',maxHealth:80,driving:Object.freeze({MAX_SPEED:58,ACCEL:42,STEER_MAX:0.61,STEER_RESPONSE:12})}),
    armored:Object.freeze({id:'armored',name:'Броневик',tag:'AX / 03',description:'Запас прочности для плотной борьбы. Тяжёлый руль и спокойный разгон.',maxHealth:140,driving:Object.freeze({MAX_SPEED:48,ACCEL:30,STEER_MAX:0.48,STEER_RESPONSE:8})})
  });
  const GARAGE_PAINTS=Object.freeze([
    {id:'red',name:'Киноварь',color:0xe82121},{id:'cyan',name:'Ледяной неон',color:0x36d9ed},
    {id:'magenta',name:'Фуксия',color:0xde3ca8},{id:'gold',name:'Янтарь',color:0xffb638},
    {id:'white',name:'Арктика',color:0xdbe6f2},{id:'violet',name:'Ультрафиолет',color:0x835be8}
  ].map(Object.freeze));
  function normalizeGarage(value){
    const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return {classId:typeof data.classId==='string'&&Object.hasOwn(CAR_PROFILES,data.classId)?data.classId:'universal',paintId:GARAGE_PAINTS.some(p=>p.id===data.paintId)?data.paintId:'red'};
  }
  function garagePaint(paintId){return GARAGE_PAINTS.find(p=>p.id===paintId)||GARAGE_PAINTS[0];}
  function validClass(id){return typeof id==='string'&&Object.hasOwn(CAR_PROFILES,id);}
  function normalizeLevels(value){
    const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{},levels={};
    for(const type of Object.keys(UPGRADES))levels[type]=Number.isSafeInteger(raw[type])&&raw[type]>=0&&raw[type]<=3?raw[type]:0;
    return levels;
  }
  function normalizeTuning(value){
    const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{},levels={};
    for(const id of Object.keys(CAR_PROFILES))levels[id]=normalizeLevels(raw.levels?.[id]);
    const wallet=Number.isSafeInteger(raw.wallet)&&raw.wallet>=0&&raw.wallet<=WALLET_LIMIT?raw.wallet:START_CREDITS;
    return {wallet,levels};
  }
  function normalizeBuild(value){
    const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{classId:value};
    const classId=validClass(raw.classId)?raw.classId:'universal';
    return {classId,levels:normalizeLevels(raw.levels)};
  }
  function buildKey(value){const b=normalizeBuild(value),l=b.levels;return b.classId+':'+l.engine+'-'+l.tires+'-'+l.armor;}
  function buildLabel(value){const b=normalizeBuild(value),l=b.levels;return CAR_PROFILES[b.classId].name+' · Д'+l.engine+' / Ш'+l.tires+' / Б'+l.armor;}
  function buildProfile(value){
    const b=normalizeBuild(value),stock=CAR_PROFILES[b.classId],l=b.levels;
    return {...stock,maxHealth:Math.round(stock.maxHealth*(1+.15*l.armor)),
      driving:{...stock.driving,MAX_SPEED:stock.driving.MAX_SPEED*(1+.03*l.engine),
        ACCEL:stock.driving.ACCEL*(1+.07*l.engine),
        STEER_MAX:stock.driving.STEER_MAX*(1+.025*l.tires),
        STEER_RESPONSE:stock.driving.STEER_RESPONSE*(1+.055*l.tires)}};
  }
  function playerConfig(base,value){
    const b=normalizeBuild(value);
    return {...base,...buildProfile(b).driving,GRIP:b.levels.tires?Math.max(.85,base.GRIP-.008*b.levels.tires):base.GRIP};
  }
  function healPlayerHealth(health,maxHealth,amount){return Math.max(0,Math.min(maxHealth,health+Math.max(0,amount)));}
  function respawnHealth(health,maxHealth,revive){return revive?maxHealth:Math.max(1,health);}
  function read(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
  function write(storage,key,value){
    try{
      if(!storage)return false;
      const serialized=JSON.stringify(value);
      storage.setItem(key,serialized);
      return storage.getItem(key)===serialized; // Some storage adapters silently discard writes.
    }catch{return false;}
  }
  function loadGarage(storage){return normalizeGarage(read(storage,GARAGE_KEY));}
  function saveGarage(storage,value){return write(storage,GARAGE_KEY,normalizeGarage(value));}
  function loadTuning(storage){return normalizeTuning(read(storage,TUNING_KEY));}
  function createTuningStore(storage){
    let available=false,localOnly=false,initial=null;
    try{
      if(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function'){
        const raw=storage.getItem(TUNING_KEY);
        try{initial=JSON.parse(raw||'null');}catch{initial=null;} // Preserve legacy corrupt-save recovery.
        available=true;
      }else localOnly=true;
    }catch{localOnly=true;}
    let state=normalizeTuning(initial);
    // Each tab has its own JS state. Re-read the shared wallet immediately before
    // every debit/grant; otherwise the last open tab overwrites earlier purchases.
    function syncFromStorage(){
      if(localOnly)return false; // Keep unsaved tab-only purchases if storage failed.
      try{
        const raw=storage.getItem(TUNING_KEY);
        let latestValue=null;
        try{latestValue=JSON.parse(raw||'null');}catch{} // Legacy invalid data starts from defaults.
        const latest=normalizeTuning(latestValue);
        const changed=JSON.stringify(state)!==JSON.stringify(latest);
        state=latest;
        available=true;
        return changed;
      }catch{
        available=false;localOnly=true;
        return false;
      }
    }
    function persist(){
      if(localOnly)return false;
      available=write(storage,TUNING_KEY,state);
      if(!available)localOnly=true; // Do not erase local changes on a later refresh.
      return available;
    }
    return {
      syncFromStorage,
      snapshot(){syncFromStorage();return normalizeTuning(state);},
      getBuild(classId){
        syncFromStorage();
        const id=validClass(classId)?classId:'universal';
        return normalizeBuild({classId:id,levels:state.levels[id]});
      },
      canPersist:()=>available,
      purchase(classId,type){
        if(!validClass(classId)||typeof type!=='string'||!Object.hasOwn(UPGRADES,type))return {ok:false,reason:'invalid'};
        syncFromStorage(); // Revalidate price, level and balance against the latest persisted data.
        const level=state.levels[classId][type];
        if(level>=3)return {ok:false,reason:'max'};
        const price=UPGRADES[type].prices[level];
        if(state.wallet<price)return {ok:false,reason:'funds',price};
        state.wallet-=price;state.levels[classId][type]=level+1;
        return {ok:true,level:level+1,price,persisted:persist()};
      },
      award(amount){
        // Allow only the configured Blitz win, contract, lap and Classic win grants.
        if(amount!==100&&amount!==200&&amount!==300&&amount!==1500)return {ok:false,reason:'invalid'};
        syncFromStorage();
        state.wallet=Math.min(WALLET_LIMIT,state.wallet+amount);
        return {ok:true,persisted:persist(),wallet:state.wallet};
      }
    };
  }
  function normalizeRecords(data){
    const time=value=>Number.isFinite(value)&&value>0&&value<=1e9?value:Infinity;
    return {bestLap:time(data?.bestLap),highScore:Number.isFinite(data?.highScore)&&data.highScore>=0?Math.min(1e9,Math.round(data.highScore)):0,bestTotal:time(data?.bestTotal)};
  }
  const TRACK_RECORDS_KEY='cyberRaceTrackRecordsV1';
  function createTrackRecords(storage,trackVersion){
    if(typeof trackVersion!=='string'||!/^[a-z0-9-]{3,40}$/.test(trackVersion))throw TypeError('Invalid track version');
    const raw=read(storage,TRACK_RECORDS_KEY);
    const tracks=raw?.version===1&&raw.tracks&&typeof raw.tracks==='object'&&!Array.isArray(raw.tracks)?raw.tracks:{};
    const source=tracks[trackVersion]&&typeof tracks[trackVersion]==='object'&&!Array.isArray(tracks[trackVersion])?tracks[trackVersion]:{};
    const current=Object.create(null);
    for(const [key,value] of Object.entries(source).slice(0,192)){
      if(/^(universal|interceptor|armored):[0-3]-[0-3]-[0-3]$/.test(key))current[key]=normalizeRecords(value);
    }
    return {
      get(build){return {...(current[buildKey(build)]||normalizeRecords(null))};},
      label:buildLabel,
      save(build,race){
        const key=buildKey(build);
        const incoming=normalizeRecords({bestLap:race.bestLap,highScore:race.score,bestTotal:race.finished&&race.won?race.totalTime:Infinity});
        // Another tab may have saved a different car or a better result since
        // this store was created. Re-read and merge monotone best records.
        const latest=read(storage,TRACK_RECORDS_KEY);
        const allTracks=latest?.version===1&&latest.tracks&&typeof latest.tracks==='object'&&!Array.isArray(latest.tracks)?latest.tracks:tracks;
        const fresh=allTracks[trackVersion]&&typeof allTracks[trackVersion]==='object'&&!Array.isArray(allTracks[trackVersion])?allTracks[trackVersion]:{};
        const merged={...fresh};
        for(const [savedKey,cached] of Object.entries(current)){
          const recent=normalizeRecords(merged[savedKey]);
          merged[savedKey]={bestLap:Math.min(recent.bestLap,cached.bestLap),highScore:Math.max(recent.highScore,cached.highScore),bestTotal:Math.min(recent.bestTotal,cached.bestTotal)};
        }
        const before=normalizeRecords(merged[key]);
        current[key]={bestLap:Math.min(before.bestLap,incoming.bestLap),highScore:Math.max(before.highScore,incoming.highScore),bestTotal:Math.min(before.bestTotal,incoming.bestTotal)};
        merged[key]=current[key];
        // Preserve other builds and route versions; leave legacy keys untouched.
        return write(storage,TRACK_RECORDS_KEY,{version:1,tracks:{...allTracks,[trackVersion]:merged}});
      }
    };
  }
  function createGarageRecords(storage,trackVersion=null){
    if(trackVersion!==null)return createTrackRecords(storage,trackVersion);
    // Stock builds keep their original keys; tuned builds never overwrite legacy records.
    const records={universal:normalizeRecords(read(storage,'cyberRaceRecords'))};
    const classes=read(storage,CLASS_RECORDS_KEY);
    for(const id of ['interceptor','armored'])records[id]=normalizeRecords(classes?.[id]);
    const tuned=Object.create(null),stored=read(storage,BUILD_RECORDS_KEY);
    if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
      for(const [key,value] of Object.entries(stored).slice(0,192)){
        if(/^(universal|interceptor|armored):[0-3]-[0-3]-[0-3]$/.test(key)&&!key.endsWith(':0-0-0'))tuned[key]=normalizeRecords(value);
      }
    }
    function lookup(build){
      const b=normalizeBuild(build),key=buildKey(b),stock=Object.values(b.levels).every(level=>level===0);
      return {b,key,stock,current:stock?records[b.classId]:tuned[key]||normalizeRecords(null)};
    }
    return {
      get(build){return {...lookup(build).current};},
      label:buildLabel,
      save(build,race){
        const {b,key,stock,current}=lookup(build);
        const incoming=normalizeRecords({bestLap:race.bestLap,highScore:race.score,bestTotal:race.finished&&race.won?race.totalTime:Infinity});
        const next={bestLap:Math.min(current.bestLap,incoming.bestLap),highScore:Math.max(current.highScore,incoming.highScore),bestTotal:Math.min(current.bestTotal,incoming.bestTotal)};
        if(!stock){tuned[key]=next;return write(storage,BUILD_RECORDS_KEY,tuned);}
        records[b.classId]=next;
        return b.classId==='universal'?write(storage,'cyberRaceRecords',next):
          write(storage,CLASS_RECORDS_KEY,{interceptor:records.interceptor,armored:records.armored});
      }
    };
  }
  return {GARAGE_KEY,CLASS_RECORDS_KEY,TUNING_KEY,BUILD_RECORDS_KEY,START_CREDITS,UPGRADES,CAR_PROFILES,GARAGE_PAINTS,normalizeGarage,garagePaint,normalizeLevels,normalizeTuning,normalizeBuild,buildKey,buildLabel,buildProfile,playerConfig,healPlayerHealth,respawnHealth,loadGarage,saveGarage,loadTuning,createTuningStore,createGarageRecords};
});
