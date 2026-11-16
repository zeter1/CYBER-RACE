(function attachRaceContracts(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  Object.assign((root.CyberRace??={}).game??={},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RACE_CONTRACT_CREDITS=200;
  const RACE_CONTRACTS=Object.freeze({
    hunter:Object.freeze({id:'hunter',title:'Охотник',target:2,menuLabel:'2 уничтожения',description:'Совершите 2 уничтожения'}),
    collector:Object.freeze({id:'collector',title:'Сборщик',target:3,menuLabel:'3 полезных бонуса',description:'Подберите 3 полезных бонуса'}),
    podium:Object.freeze({id:'podium',title:'Подиум',target:1,menuLabel:'Место в топ-3',description:'Финишируйте в топ-3'})
  });
  // The one-lap format needs achievable choices. Long-race rules remain unchanged.
  const BLITZ_CONTRACTS=Object.freeze({
    hunter:Object.freeze({...RACE_CONTRACTS.hunter,target:1,menuLabel:'1 уничтожение',description:'Совершите 1 уничтожение'}),
    collector:Object.freeze({...RACE_CONTRACTS.collector,target:2,menuLabel:'2 полезных бонуса',description:'Подберите 2 полезных бонуса'})
  });
  function getRaceContractDefinition(id,mode='classic'){
    if(!Object.hasOwn(RACE_CONTRACTS,id))return null;
    return mode==='blitz'&&Object.hasOwn(BLITZ_CONTRACTS,id)?BLITZ_CONTRACTS[id]:RACE_CONTRACTS[id];
  }
  const boundedCount=value=>Number.isFinite(value)?Math.max(0,Math.trunc(value)):0;

  // Transient session state. No extra localStorage key or championship checkpoint.
  function createRaceContractTracker(){
    let id='none',mode='classic',pickups=0,finalized=false;
    function status({kills=0,place=null,finished=false}={}){
      const definition=getRaceContractDefinition(id,mode);
      if(!definition)return null;
      let progress=0;
      if(id==='hunter')progress=Math.min(definition.target,boundedCount(kills));
      if(id==='collector')progress=Math.min(definition.target,pickups);
      if(id==='podium'&&finished&&Number.isSafeInteger(place)&&place>=1&&place<=3)progress=1;
      return {
        id,title:definition.title,description:definition.description,
        progress,target:definition.target,met:progress>=definition.target,
        progressLabel:id==='podium'?'ТОП-3 НА ФИНИШЕ':progress+'/'+definition.target,
        reward:RACE_CONTRACT_CREDITS
      };
    }
    return {
      start(nextId,nextMode='classic'){
        id=Object.hasOwn(RACE_CONTRACTS,nextId)?nextId:'none';
        mode=nextMode==='blitz'?'blitz':'classic';
        pickups=0;finalized=false;
        return id;
      },
      recordUsefulPickup(){
        if(id!=='collector'||finalized)return false;
        pickups=Math.min(getRaceContractDefinition('collector',mode).target,pickups+1);
        return true;
      },
      status,
      finalize(result={}){
        const view=status(result);
        if(finalized||result.finished!==true)return {status:view,credits:0};
        finalized=true;
        return {status:view,credits:view?.met?RACE_CONTRACT_CREDITS:0};
      }
    };
  }
  return {RACE_CONTRACTS,RACE_CONTRACT_CREDITS,getRaceContractDefinition,createRaceContractTracker};
});
