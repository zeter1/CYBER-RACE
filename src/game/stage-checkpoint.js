// A separate, versioned checkpoint. Legacy championship and garage keys are never erased.
(function attachStageCheckpoint(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  Object.assign((root.CyberRace??={}).game??={},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STAGE_CHECKPOINT_KEY='cyberRaceStageCheckpointV1';
  const playerNumbers=Object.freeze(['x','z','heading','speed','speedLat','steerAngle','lap','curLap','totalTime','prevT','lastSampleIdx','health','score','kills','deaths','rockets','gunAmmo','nitro','regenDelay','nitroTimer','speedBoostTimer','shieldTimer','pulseCooldown','invincibleTimer','resetCooldown','damageCooldown','wrongWayTimer','stuckTimer','driftTime','driftScoreCarry','combo','comboTimer','deathTimer']);
  const botNumbers=Object.freeze(['id','t','prevT','lap','offset','targetOffset','laneChangeTimer','bumpOffset','bumpVelocity','baseSpeed','speed','slowTimer','health','respawnTimer','attackCooldown','rockets','gunAmmo','nitroCharges','nitroTimer','speedBoostTimer','shieldTimer','lastSampleIdx','burstRemaining','lastAttackerTimer','invincibleTimer']);
  const bonusTypes=new Set(['rocket','machinegun','nitro','speedboost','health','shield']);
  // Matches CONFIG.STATE_SANITY_LIMIT; do not attempt to resume far outside the game world.
  const WORLD_LIMIT=6000;
  // Keep stage lengths and sample count in sync with championship.js and CONFIG.NUM_SAMPLES.
  const STAGES=Object.freeze([{id:'valley',laps:3},{id:'city',laps:4},{id:'industrial',laps:5}]);
  const SAMPLE_COUNT=600;
  const playerTimers=['regenDelay','nitroTimer','speedBoostTimer','shieldTimer','pulseCooldown','invincibleTimer','resetCooldown','damageCooldown','wrongWayTimer','stuckTimer','driftTime','comboTimer','deathTimer'];
  const botTimers=['slowTimer','nitroTimer','speedBoostTimer','shieldTimer','invincibleTimer','lastAttackerTimer'];
  const validNumbers=(data,names)=>data&&typeof data==='object'&&names.every(key=>Number.isFinite(data[key])&&Math.abs(data[key])<=1e7);
  const inWorld=(...values)=>values.every(value=>Number.isFinite(value)&&Math.abs(value)<=WORLD_LIMIT);
  const validTimers=(data,names)=>names.every(key=>data[key]>=0&&data[key]<=3600);
  const validSample=value=>Number.isSafeInteger(value)&&value>=0&&value<SAMPLE_COUNT;
  const validAmmo=(data,limits)=>Object.entries(limits).every(([key,limit])=>
    Number.isSafeInteger(data[key])&&data[key]>=0&&data[key]<=limit);
  // Optional for older V1 checkpoints; new saves persist awarded opponent ids (0..5).
  const validOvertakeAwards=ids=>Array.isArray(ids)&&ids.length<=6&&
    [...ids].every(id=>Number.isSafeInteger(id)&&id>=0&&id<6)&&new Set(ids).size===ids.length;
  function validCheckpoint(data,match){
    if(!data||data.version!==1||!match||data.stageIndex!==match.stageIndex||data.trackId!==match.trackId||
       data.buildKey!==match.buildKey||data.signature!==match.signature||!Number.isFinite(data.savedAt)||
       !validNumbers(data.player,playerNumbers)||!(data.player.bestLap===null||(Number.isFinite(data.player.bestLap)&&data.player.bestLap>=0))||
       typeof data.player.crossedHalf!=='boolean'||typeof data.player.destroyed!=='boolean'||
       !Array.isArray(data.bots)||data.bots.length!==6||
       !Array.isArray(data.bonuses)||data.bonuses.length>60||
       !Array.isArray(data.rewarded)||data.rewarded.length>32||
       !Array.isArray(data.finishedIds)||data.finishedIds.length>6||
       (data.awardedOvertakeIds!==undefined&&!validOvertakeAwards(data.awardedOvertakeIds))||
       (data.awardedDraftIds!==undefined&&!validOvertakeAwards(data.awardedDraftIds)))return false;
    const stage=STAGES[data.stageIndex];
    if(!Number.isSafeInteger(data.stageIndex)||!stage||stage.id!==data.trackId)return false;
    if(!Number.isSafeInteger(data.player.lap)||data.player.lap<1||data.player.lap>stage.laps||
       data.player.prevT<0||data.player.prevT>1||!validSample(data.player.lastSampleIdx)||
       data.player.health<0||data.player.health>250||
       data.player.speed< -20||data.player.speed>250||Math.abs(data.player.speedLat)>50||
       Math.abs(data.player.steerAngle)>2||
       data.player.curLap<0||data.player.curLap>86400||
       data.player.totalTime<0||data.player.totalTime>86400||
       data.player.bestLap!==null&&data.player.bestLap>86400||
       data.player.score<0||data.player.kills<0||data.player.deaths<0||
       !validTimers(data.player,playerTimers)||
       !inWorld(data.player.x,data.player.z)||
       !validAmmo(data.player,{rockets:9,gunAmmo:99,nitro:5}))return false;
    if(data.bots.some((bot,id)=>!validNumbers(bot,botNumbers)||bot.id!==id||
       !Number.isSafeInteger(bot.lap)||bot.lap<1||bot.lap>stage.laps+1||
       bot.t<0||bot.t>1||bot.prevT<0||bot.prevT>1||!validSample(bot.lastSampleIdx)||
       bot.speed<0||bot.speed>250||bot.baseSpeed<0||bot.baseSpeed>250||
       bot.health>125||bot.health< -1000||(!bot.dead&&bot.health<0)||
       !validTimers(bot,botTimers)||
       !inWorld(bot.offset,bot.targetOffset,bot.bumpOffset)||
       !validAmmo(bot,{rockets:9,gunAmmo:99,nitroCharges:5})||
       !['dead','finished','crossedHalf'].every(k=>typeof bot[k]==='boolean')))return false;
    if(data.bonuses.some(b=>!b||typeof b!=='object'||!bonusTypes.has(b.type)||!Number.isSafeInteger(b.id)||b.id<0||b.id>1e7||
       !Number.isFinite(b.t)||b.t<0||b.t>1||!inWorld(b.x,b.z,b.offset)))return false;
    if(data.rewarded.some(k=>typeof k!=='string'||!/^lap:[1-5]$/.test(k))||new Set(data.rewarded).size!==data.rewarded.length)return false;
    if(data.finishedIds.some(id=>typeof id!=='string'||!/^bot:[0-5]$/.test(id))||new Set(data.finishedIds).size!==data.finishedIds.length)return false;
    return true;
  }
  function createStageCheckpoint(storage){
    function inspect(match){
      let raw;
      try{raw=storage?.getItem(STAGE_CHECKPOINT_KEY);}
      catch{return {status:'unavailable',data:null};}
      if(!raw)return {status:'missing',data:null};
      if(raw.length>80000)return {status:'invalid',data:null};
      try{
        const parsed=JSON.parse(raw);
        return validCheckpoint(parsed,match)
          ?{status:'valid',data:parsed}:{status:'invalid',data:null};
      }catch{return {status:'invalid',data:null};}
    }
    return {
      inspect,
      load(match){return inspect(match).data;},
      save(match,data){
        const packet={...data,...match,version:1,savedAt:Date.now()};
        if(!validCheckpoint(packet,match))return false;
        try{
          if(!storage)return false;
          const raw=JSON.stringify(packet);
          storage.setItem(STAGE_CHECKPOINT_KEY,raw);
          return storage.getItem(STAGE_CHECKPOINT_KEY)===raw;
        }catch{return false;}
      },
      clear(){
        try{
          if(!storage)return false;
          storage.removeItem(STAGE_CHECKPOINT_KEY);
          return storage.getItem(STAGE_CHECKPOINT_KEY)===null;
        }catch{return false;}
      }
    };
  }
  return {STAGE_CHECKPOINT_KEY,playerNumbers,botNumbers,validCheckpoint,createStageCheckpoint};
});
