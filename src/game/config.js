(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const game=root.game??=(Object.create(null));
  game.CONFIG={
    TOTAL_LAPS:15,SCALE:7,ROAD_HALF:40,NUM_SAMPLES:600,BOT_COUNT:6,
    CAR_RADIUS:3.8,MAX_SPEED:52,ACCEL:36,BRAKE:50,
    DRAG:0.14,OFFROAD_DRAG:1.35,GRIP:0.94,DRIFT_GRIP:0.985,
    REVERSE_SPEED:10,HANDBRAKE_DECEL:10,MAX_LATERAL_SPEED:12,
    STEER_MAX:0.55,STEER_RESPONSE:10,STEER_SPEED_SENSITIVITY:0.85,
    WORLD_SIZE:3000,NUM_BONUSES:60,
    MAX_PROJECTILES:80,ENVIRONMENT_ATTEMPTS:1200,LAMP_COUNT:56,
    PLAYER_ROCKET_SPEED:155,BOT_ROCKET_SPEED:118,BOT_BULLET_SPEED:108,
    PLAYER_ROCKET_LIFE:3.2,BOT_ROCKET_LIFE:3.5,
    ROCKET_LOCK_RANGE:230,ROCKET_LOCK_DOT:0.12,
    ROCKET_HIT_RADIUS:6.2,BULLET_HIT_RADIUS:4.2,
    COUNTDOWN_SECONDS:3,PLAYER_REGEN_DELAY:7,PLAYER_REGEN_RATE:1.8,
    SHIELD_DURATION:7,SHIELD_DAMAGE_MULTIPLIER:0.25,
    BOT_MAX_RUBBER_BAND:1.12,BOT_MIN_RUBBER_BAND:0.88,
    LOW_FPS_THRESHOLD:42,HIGH_FPS_THRESHOLD:56,MAX_TRACK_DISTANCE:150,
    PLAYER_DEATH_DELAY:1.35,WRONG_WAY_DELAY:1.1,MANUAL_RESET_COOLDOWN:4,
    MENU_INPUT_LOCK_MS:240,DAMAGE_GRACE:0.065,RESPAWN_CLEAR_RADIUS:46,
    DEFENSE_PULSE_COOLDOWN:18,DEFENSE_PULSE_RADIUS:90,DEFENSE_PULSE_SLOW:3.2,
    STUCK_RESET_DELAY:4.5,BOT_AVOIDANCE_RANGE:18,STATE_SANITY_LIMIT:6000,
    IDLE_RENDER_INTERVAL_MS:66
  };
  // Standalone race formats use different record namespaces, but share the garage.
  // Keep classic tied to the existing route version to preserve all old records.
  game.SINGLE_RACE_MODES=Object.freeze({
    classic:Object.freeze({laps:game.CONFIG.TOTAL_LAPS,recordVersion:'valley-2026-v2',lapCredits:300,victoryCredits:1500,label:'КЛАССИКА'}),
    sprint:Object.freeze({laps:3,recordVersion:'valley-2026-v2-sprint-3',lapCredits:300,victoryCredits:300,label:'СПРИНТ'}),
    blitz:Object.freeze({laps:1,recordVersion:'valley-2026-v2-blitz-1',lapCredits:300,victoryCredits:100,label:'БЛИЦ'})
  });
  game.SETTINGS_DEFAULTS={difficulty:'normal',quality:'auto',sound:true,cameraShake:true,lapGhost:true,cornerSpotter:true,tutorialEnabled:true,tutorialDone:false,tutorialShieldSeen:false};
})();
