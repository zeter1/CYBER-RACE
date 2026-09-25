# Changelog

## 2026-09-25 — Web Architecture & CI 2.2

### Deterministic simulation

- Opponent lane/nitro/rubber-band/progress frame logic собрана в `stepOpponentFrame(..., rng)` с dependency injection для RNG и world-space avoidance.
- Opponent fire decision/lead/ammo choice вынесен в `planOpponentAttack(..., rng)`; runtime оставляет только projectile/audio/mesh side effects.
- Homing rocket kinematics вынесена в `stepHomingProjectile`: lead, steering, velocity, position и stall detection считаются без Three.js.
- Добавлен `src/core/seeded-rng.js` для воспроизводимых simulation scenarios.

### Regression replay

- Добавлен versioned fixture `tests/fixtures/cyber-replay.json`.
- `tests/scenarios.mjs` replay-ит 180 opponent frames, серию attack decisions и 90 homing-rocket frames.
- GitHub Actions теперь выполняет deterministic replay scenarios до headless WebGL boot.

### Совместимость

Visual effects, pools, damage application, input и Three.js object lifecycle остаются runtime side effects. Seeded RNG используется для regression proof; обычный gameplay продолжает использовать `Math.random`.

## 2026-09-25 — Web Architecture & CI 2.1

### Архитектура

- Track/environment generation и nearest-track lookup вынесены в `src/game/track-environment.js`.
- Lap/final state transition вынесен в `src/game/race-state.js`.
- Opponent lane/rubber-band/speed/attack/lead math вынесена в `src/ai/opponent-brain.js`.
- Collision contract и projectile ballistics разделены между `src/weapons/geometry.js` и `src/weapons/ballistics.js`.
- Minimap и HUD model вынесены в `src/ui/minimap.js` и `src/ui/hud-model.js`.
- `src/game/runtime.js` уменьшен и оставлен orchestration/rendering boundary.

### Verification

- Добавлен `tests/contracts.mjs` для track lookup, AI math, swept collision, rocket targeting/homing, HUD и lap state transitions.
- Structural validator теперь фиксирует новые subsystem boundaries и запрещает возврат вынесенной логики в runtime.
- GitHub Actions запускает contract tests до headless Chrome/WebGL boot smoke.

### Совместимость

Projectile meshes, opponent side effects, input и frame orchestration по-прежнему выполняются runtime-слоем; full interactive gameplay/GPU/audio остаются отдельным уровнем проверки.

## 2026-09-25 — Web Portfolio Architecture & CI 2.0

### Изменено

- Большой inline JavaScript runtime вынесен из `index.html` в `src/game/runtime.js`.
- Выделены `src/core`, `src/game`, `src/ai`, `src/weapons`, `src/audio` и `src/ui`.
- Добавлена архитектурная карта `docs/ARCHITECTURE.md`.
- Добавлен `scripts/validate-structure.mjs` для проверки bootstrap/module boundaries.
- GitHub Actions усилен: syntax checks + structural validation + headless Chrome boot smoke с runtime-ready marker.
- README синхронизирован с текущей архитектурой и фактическим уровнем проверки.

### Совместимость

Gameplay не переписывался целиком: orchestration сохранён и переносится поэтапно. Полный интерактивный gameplay остаётся отдельным runtime-уровнем проверки.
