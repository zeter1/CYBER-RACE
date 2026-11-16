(function attachChampionship(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  Object.assign((root.CyberRace??={}).game??={},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CHAMPIONSHIP_KEY='cyberRaceChampionship';
  const CHAMPIONSHIP_STAGES=Object.freeze([
    Object.freeze({id:'valley',name:'Неоновая долина',laps:3,description:'Знакомая долина: гонка с боем'}),
    Object.freeze({id:'city',name:'Неоновый квартал',laps:4,description:'Городская трасса: связки поворотов'}),
    Object.freeze({id:'industrial',name:'Стальной экспресс',laps:5,description:'Промзона: длинные скоростные прямые'})
  ]);
  // Coordinates use the existing SCALE; each route is a separate closed circuit.
  const CHAMPIONSHIP_TRACK_POINTS=Object.freeze({
    city:[[0,0,0],[38,0,0],[50,0,-18],[48,0,-45],[75,0,-60],[82,0,-90],[58,0,-110],[25,0,-108],[9,0,-85],[-18,0,-80],[-34,0,-105],[-65,0,-105],[-83,0,-80],[-78,0,-48],[-48,0,-40],[-42,0,-13],[-20,0,0]],
    industrial:[[0,0,0],[55,0,0],[105,0,-5],[130,0,-28],[130,0,-70],[105,0,-95],[50,0,-100],[-15,0,-100],[-75,0,-94],[-102,0,-70],[-102,0,-28],[-76,0,-5],[-35,0,0]]
  });
  const CHAMPIONSHIP_DRIVERS=Object.freeze([
    {id:'player',name:'Вы'},{id:'bot:0',name:'Вольт'},{id:'bot:1',name:'Пламя'},
    {id:'bot:2',name:'Вектор'},{id:'bot:3',name:'Фантом'},{id:'bot:4',name:'Импульс'},{id:'bot:5',name:'Комета'}
  ].map(Object.freeze));
  const CHAMPIONSHIP_POINTS=Object.freeze([15,12,10,8,6,4,2]);
  const ids=CHAMPIONSHIP_DRIVERS.map(d=>d.id);
  const validOrder=order=>Array.isArray(order)&&order.length===ids.length&&new Set(order).size===ids.length&&order.every(id=>ids.includes(id));
  function validateChampionship(value){
    if(!value||value.version!==1||!['easy','normal','hard'].includes(value.difficulty)||!Array.isArray(value.results)||value.results.length>3)return null;
    const results=[];
    for(const result of value.results){
      if(!result||!validOrder(result.order)||!Number.isFinite(result.playerTime)||result.playerTime<=0||result.playerTime>86400)return null;
      results.push({order:[...result.order],playerTime:result.playerTime});
    }
    return {version:1,difficulty:value.difficulty,results,runToken:typeof value.runToken==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(value.runToken)?value.runToken:null};
  }
  function championshipStandings(state){
    const results=validateChampionship(state)?.results||[];
    return CHAMPIONSHIP_DRIVERS.map((driver,index)=>({...driver,index,points:results.reduce((sum,r)=>sum+CHAMPIONSHIP_POINTS[r.order.indexOf(driver.id)],0),wins:results.filter(r=>r.order[0]===driver.id).length,lastPlace:results.length?results.at(-1).order.indexOf(driver.id)+1:0}))
      .sort((a,b)=>b.points-a.points||b.wins-a.wins||a.lastPlace-b.lastPlace||a.index-b.index);
  }
  function championshipFinishOrder(opponents,finishedIds){
    const finished=finishedIds.filter(id=>ids.includes(id)&&id!=='player');
    const unfinished=opponents.filter(o=>!finished.includes('bot:'+o.id)).slice().sort((a,b)=>((b.lap-1)+b.t)-((a.lap-1)+a.t)||a.id-b.id);
    return [...finished,'player',...unfinished.map(o=>'bot:'+o.id)];
  }
  function createChampionshipStore(storage){
    let state=null,status='empty';
    try{
      const raw=storage?.getItem(CHAMPIONSHIP_KEY);
      if(raw){
        try{state=validateChampionship(JSON.parse(raw));status=state?'saved':'invalid';}
        catch{status='invalid';}
      }
      else if(!storage)status='denied';
    }catch{status='unavailable';}
    const snapshot=()=>state?{...state,results:state.results.map(r=>({...r,order:[...r.order]}))}:null;
    function persist(){
      try{
        if(!storage)throw Error('unavailable');
        const raw=JSON.stringify(state);storage.setItem(CHAMPIONSHIP_KEY,raw);
        if(storage.getItem(CHAMPIONSHIP_KEY)!==raw)throw Error('readback');
        status='saved';return true;
      }catch{status='denied';return false;}
    }
    return {
      snapshot,status:()=>status,
      start(difficulty='normal'){
        const runToken=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
        state={version:1,difficulty:['easy','normal','hard'].includes(difficulty)?difficulty:'normal',results:[],runToken};
        return {state:snapshot(),persisted:persist()};
      },
      record(stageIndex,order,playerTime){
        if(!state||stageIndex!==state.results.length||stageIndex>=3||!validOrder(order)||!Number.isFinite(playerTime)||playerTime<=0||playerTime>86400)return {accepted:false,persisted:false};
        state.results.push({order:[...order],playerTime});
        return {accepted:true,persisted:persist()};
      }
    };
  }
  return {CHAMPIONSHIP_KEY,CHAMPIONSHIP_STAGES,CHAMPIONSHIP_TRACK_POINTS,CHAMPIONSHIP_DRIVERS,CHAMPIONSHIP_POINTS,validateChampionship,championshipStandings,championshipFinishOrder,createChampionshipStore};
});
