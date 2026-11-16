(()=>{
  'use strict';
  const game=(globalThis.CyberRace??=Object.create(null)).game??=Object.create(null);
  // A close-range hit rewards deliberate timing, not a blind pulse or a bullet intercept.
  const PRECISION_FRACTION=0.5;
  function isPrecisionInterception({distance,radius,isRocket,targetingPlayer}={}){
    return isRocket===true&&targetingPlayer===true&&Number.isFinite(distance)&&distance>=0&&
      Number.isFinite(radius)&&radius>0&&distance<=radius*PRECISION_FRACTION;
  }
  function precisionNitroReward({precisionCount,charges,maxCharges=5}={}){
    return Number.isFinite(precisionCount)&&precisionCount>0&&Number.isFinite(charges)&&
      charges>=0&&Number.isFinite(maxCharges)&&maxCharges>0&&charges<maxCharges?1:0;
  }
  // Shared contract for the in-race cue and its underlying interception rules.
  // The prompt never tells the player to fire an out-of-range or cooling-down pulse.
  function defenseRocketCue({distance,radius,cooldown,charges,maxCharges=5,direction=''}={}){
    if(!Number.isFinite(distance)||distance<0||!Number.isFinite(radius)||radius<=0||
       !Number.isFinite(cooldown))return null;
    const ready=cooldown<=0,within=distance<=radius;
    const precision=within&&isPrecisionInterception({
      distance,radius,isRocket:true,targetingPlayer:true
    })&&precisionNitroReward({precisionCount:1,charges,maxCharges})>0;
    const phase=!ready?'cooldown':!within?'prepare':precision?'precision':'intercept';
    const action=phase==='cooldown'?('ЗАРЯДКА '+Math.max(0,cooldown).toFixed(1)+' с'):
      phase==='prepare'?'ГОТОВЬ ИМПУЛЬС':
      phase==='precision'?'Q / B / ЩИТ: ТОЧНО (+1 НИТРО)':'Q / B / ЩИТ: ОТРАЗИТЬ';
    const bearing=direction?' · '+direction:'';
    return {phase,text:'⚠ РАКЕТА: '+Math.max(1,Math.round(distance))+' м'+bearing+' · '+action};
  }
  Object.assign(game,{isPrecisionInterception,precisionNitroReward,defenseRocketCue});
  if(typeof module!=='undefined'&&module.exports)
    module.exports={isPrecisionInterception,precisionNitroReward,defenseRocketCue};
})();
