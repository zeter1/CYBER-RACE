(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const ai=root.ai??=(Object.create(null));
  const DIFFICULTY={
    easy:{botSpeed:.94,botDamage:.72,attackDelay:1.22,regen:1.35,attackRange:128,minFacing:.18,aimSpread:.055,label:'НОВИЧОК'},
    normal:{botSpeed:1,botDamage:1,attackDelay:1,regen:1,attackRange:145,minFacing:.10,aimSpread:.032,label:'ОБЫЧНАЯ'},
    hard:{botSpeed:1.07,botDamage:1.22,attackDelay:.84,regen:.72,attackRange:160,minFacing:.04,aimSpread:.018,label:'ХАРДКОР'}
  };
  ai.DIFFICULTY=DIFFICULTY;
  ai.getDifficulty=function getDifficulty(settings){return DIFFICULTY[settings?.difficulty]||DIFFICULTY.normal;};
})();
