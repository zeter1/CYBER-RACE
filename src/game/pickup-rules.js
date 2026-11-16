(function attachPickupRules(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  Object.assign((root.CyberRace??={}).game??={},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Pure eligibility check: a pickup remains on the road when it cannot help.
  // Options account for player upgrades and the AI's different boost durations.
  function canBenefitFromPickup(type,car,{maxHealth=100,nitroKey='nitro',shieldDuration=7,speedBoostDuration=10}={}){
    if(!car||typeof car!=='object')return false;
    switch(type){
      case 'rocket': return car.rockets<9;
      case 'machinegun': return car.gunAmmo<99;
      case 'nitro': return car[nitroKey]<5;
      case 'health': return car.health<maxHealth;
      case 'shield': return car.shieldTimer<shieldDuration;
      case 'speedboost': return car.speedBoostTimer<speedBoostDuration;
      default: return false;
    }
  }
  return {canBenefitFromPickup};
});
