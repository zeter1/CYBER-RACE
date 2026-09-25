# Архитектура CYBER RACE

## Цель

CYBER RACE развивается как browser-first Three.js/WebGL проект с поэтапным разделением gameplay без one-shot rewrite. Runtime остаётся orchestration layer, а математика и subsystem contracts выносятся в отдельные тестируемые модули.

## Bootstrap

`index.html` подключает JavaScript в фиксированном порядке:

1. `src/core/three-loader.js` — Three.js CDN + fallback.
2. `src/core/storage.js` — localStorage boundary.
3. `src/game/config.js` — gameplay constants.
4. `src/game/race-state.js` — чистые переходы состояния кругов/финиша.
5. `src/game/track-environment.js` — трасса, road/environment generation, nearest-track lookup.
6. `src/ai/difficulty.js` — profiles сложности.
7. `src/ai/opponent-brain.js` — lane choice, rubber-band speed, attack geometry и lead aiming.
8. `src/weapons/geometry.js` — swept segment/sphere collision contract.
9. `src/weapons/ballistics.js` — lock selection, lead time, homing и rocket progress.
10. `src/audio/audio-system.js` — Web Audio.
11. `src/ui/elements.js` — DOM lookup.
12. `src/ui/hud-model.js` — race ordering/progress/health presentation model.
13. `src/ui/minimap.js` — minimap rendering.
14. `src/game/runtime.js` — orchestration, Three.js object lifecycle, input и frame loop.

Browser modules публикуют узкие API через `globalThis.CyberRace`. Pure modules одновременно поддерживают CommonJS export для Node contract tests.

## Границы ответственности

### Track / environment

`track-environment.js` владеет track points, Catmull-Rom samples, road/environment geometry и ближайшей точкой трассы. Runtime больше не содержит ground/road/environment construction.

### Opponent AI

`opponent-brain.js` владеет математикой lane selection, rubber-band multiplier, speed modifiers, attack cone и predictive lead. Runtime оставляет side effects: бонусы, meshes, ammo и projectile spawning.

### Weapons / projectiles

`geometry.js` и `ballistics.js` отделяют collision/targeting/homing contracts от Three.js rendering/pools. Runtime всё ещё владеет projectile meshes и impact effects.

### HUD / minimap

`hud-model.js` вычисляет race order, progress и health bounds. `minimap.js` владеет canvas minimap. Runtime связывает модель с текущим player/opponent state.

### Race state

`race-state.js` определяет переход completed lap → next lap/final state и выдачу боекомплекта на каждом третьем круге.

## Verification

`tests/contracts.mjs` проверяет без браузера:

- nearest-track lookup и fallback;
- AI rubber-band/lane/speed/lead math;
- swept projectile collision;
- rocket lock/homing/progress;
- HUD ordering/progress;
- lap/final state transitions.

`scripts/validate-structure.mjs` фиксирует module order и запрещает возврат вынесенной subsystem logic в runtime.

GitHub Actions выполняет syntax → structural validation → gameplay contract tests → headless Chrome/WebGL boot → diff hygiene.

Headless boot подтверждает initialization до `data-cyber-boot="ready"`, но не доказывает интерактивное управление, звук, реальный GPU performance или полный баланс гонки.
