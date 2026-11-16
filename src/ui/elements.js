(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const ui=root.ui??=(Object.create(null));
  const ids={
    speedNeedleEl:'speedometer-needle',speedArcEl:'speedometer-arc',shieldBarEl:'shield-bar',effectNameEl:'effect-name',effectRowEl:'effect-row',
    speedEl:'speed-val',lapEl:'lap-val',bestTimeEl:'best-time',currTimeEl:'curr-time',posEl:'pos-val',scoreEl:'score-val',
    driftFeedbackEl:'drift-feedback',driftLabelEl:'drift-label',driftPointsEl:'drift-points',driftProgressEl:'drift-progress',
    rivalGapEl:'rival-gap',rivalGapLabelEl:'rival-gap-label',rivalGapValueEl:'rival-gap-value',rivalGapTrendEl:'rival-gap-trend',
    overtakeSeriesEl:'overtake-series',overtakeMultiplierEl:'overtake-multiplier',overtakeNextEl:'overtake-next',
    overtakeTimeEl:'overtake-time',overtakeBarEl:'overtake-bar',overtakeNoticeEl:'overtake-event',
    sectorTimingEl:'sector-timing',sectorCurrentEl:'sector-current',sectorDeltaEl:'sector-delta',sectorDetailEl:'sector-detail',
    raceContractHudEl:'race-contract-hud',raceContractTitleEl:'race-contract-title',
    raceContractProgressEl:'race-contract-progress',raceContractNoticeEl:'race-contract-notice',
    rocketCountEl:'rocket-count',gunAmmoEl:'gun-ammo',nitroChargesEl:'nitro-charges',pulseCooldownEl:'pulse-cooldown',
    pulseSlotEl:'slot-pulse',messageEl:'message',healthBar:'health-bar',nitroBar:'nitro-bar',damageOverlay:'damage-overlay',
    startScreen:'start-screen',finishScreen:'finish-screen',finishTitle:'finish-title',finishStats:'finish-stats',fpsEl:'fps-counter',
    pauseMenu:'pause-menu',resumeBtn:'resume-btn',restartBtn:'restart-btn',menuBtn:'menu-btn',finishMenuBtn:'finish-menu-btn',
    finishRestartBtn:'finish-restart-btn',fullscreenStartBtn:'fullscreen-start-btn',fullscreenPauseBtn:'fullscreen-pause-btn',
    healthTextEl:'health-text',shieldStatusEl:'shield-status',effectStatusEl:'effect-status',lockIndicatorEl:'lock-indicator',
    incomingWarningEl:'incoming-warning',comboDisplayEl:'combo-display',speedVignetteEl:'speed-vignette',
    qualityIndicatorEl:'quality-indicator',recordInfoEl:'record-info',raceProgressEl:'race-progress',wrongWayEl:'wrong-way',hitMarkerEl:'hit-marker',
    restartConfirmDialog:'restart-confirm',restartConfirmAccept:'restart-confirm-accept',restartConfirmCancel:'restart-confirm-cancel'
  };
  ui.getUiElements=function getUiElements(doc=document){
    return Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,doc.getElementById(id)]));
  };
})();
