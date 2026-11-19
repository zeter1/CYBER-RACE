(function attachPickupRules(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  Object.assign((root.CyberRace??={}).game??={},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Apply a road pickup and report whether it counted for the Collector contract.
  function applyPickup(type,car,{nitroKey='nitro',shieldDuration=7,speedBoostDuration=10}={}){
    switch(type){
      case 'rocket': car.rockets+=2; return true;
      case 'machinegun': car.gunAmmo+=30; return true;
      case 'nitro': car[nitroKey]+=1; return true;
      case 'health': car.health+=40; return true;
      case 'shield': car.shieldTimer+=shieldDuration; return true;
      case 'speedboost': car.speedBoostTimer+=speedBoostDuration; return true;
      default: return false;
    }
  }
  return {applyPickup};
});
