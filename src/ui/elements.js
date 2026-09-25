(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const ui=root.ui??=(Object.create(null));
  const ids={
    speedEl:'speed-val',lapEl:'lap-val',bestTimeEl:'best-time',currTimeEl:'curr-time',posEl:'pos-val',scoreEl:'score-val',
    rocketCountEl:'rocket-count',gunAmmoEl:'gun-ammo',nitroChargesEl:'nitro-charges',pulseCooldownEl:'pulse-cooldown',
    pulseSlotEl:'slot-pulse',messageEl:'message',healthBar:'health-bar',nitroBar:'nitro-bar',damageOverlay:'damage-overlay',
    startScreen:'start-screen',finishScreen:'finish-screen',finishTitle:'finish-title',finishStats:'finish-stats',fpsEl:'fps-counter',
    pauseMenu:'pause-menu',resumeBtn:'resume-btn',restartBtn:'restart-btn',menuBtn:'menu-btn',finishMenuBtn:'finish-menu-btn',
    finishRestartBtn:'finish-restart-btn',fullscreenStartBtn:'fullscreen-start-btn',fullscreenPauseBtn:'fullscreen-pause-btn',
    healthTextEl:'health-text',shieldStatusEl:'shield-status',effectStatusEl:'effect-status',lockIndicatorEl:'lock-indicator',
    incomingWarningEl:'incoming-warning',comboDisplayEl:'combo-display',speedVignetteEl:'speed-vignette',
    qualityIndicatorEl:'quality-indicator',recordInfoEl:'record-info',raceProgressEl:'race-progress',wrongWayEl:'wrong-way',hitMarkerEl:'hit-marker'
  };
  ui.getUiElements=function getUiElements(doc=document){
    return Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,doc.getElementById(id)]));
  };
})();
