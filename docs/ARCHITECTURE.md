# Архитектура CYBER RACE

## Цель

CYBER RACE развивается как browser-first Three.js/WebGL проект с поэтапным разделением gameplay без one-shot rewrite. Runtime остаётся orchestration/rendering layer, а детерминированная simulation math вынесена в dependency-injected pure contracts.

## Bootstrap

`index.html` подключает JavaScript в фиксированном порядке:

1. `src/core/three-loader.js` — Three.js CDN + fallback.
2. `src/core/storage.js` — localStorage boundary.
3. `src/core/seeded-rng.js` — deterministic PRNG для replay/regression scenarios.
4. `src/game/config.js` — gameplay constants.
5. `src/game/race-state.js` — lap/final transitions.
6. `src/game/track-environment.js` — track/environment и nearest-track lookup.
7. `src/ai/difficulty.js` — profiles сложности.
8. `src/ai/opponent-brain.js` — opponent frame simulation + attack planning с injected RNG/avoidance dependency.
9. `src/weapons/geometry.js` — swept collision.
10. `src/weapons/ballistics.js` — targeting и pure homing projectile step.
11. `src/audio/audio-system.js` — Web Audio.
12. `src/ui/elements.js` — DOM lookup.
13. `src/ui/hud-model.js` — HUD model.
14. `src/ui/minimap.js` — minimap rendering.
15. `src/game/runtime.js` — Three.js object lifecycle, input, effects и frame orchestration.

## Deterministic simulation boundary

### Opponent frame

`stepOpponentFrame(state, context, dt, rng)` получает plain-data state и dependencies. Runtime передаёт `Math.random` и callback для world-space avoidance; tests передают seeded RNG и deterministic predicate.

Функция владеет lane cadence, interpolation, bump damping, nitro timers, rubber-band speed и race progress. Runtime только применяет returned state к Three.js entity.

### Attack planning

`planOpponentAttack(options, rng)` принимает позиции/скорости, ammo и difficulty и возвращает `none | bullet | rocket`, aim vector и следующий cooldown. Projectile meshes/audio остаются side effects runtime.

### Homing projectile

`stepHomingProjectile(...)` вычисляет lead, turn blend, velocity, next position и stall detection без Three.js. Runtime отвечает за meshes, pools, impacts и damage application.

## Replay fixtures

`tests/fixtures/cyber-replay.json` — versioned deterministic fixture. `tests/scenarios.mjs` replay-ит:

- 180 opponent frames с seeded lane/nitro decisions;
- серию opponent attack decisions;
- 90 homing-rocket frames по движущейся цели.

Проверяются final state и event counts с числовыми tolerances. Это regression proof последовательностей, а не только отдельных формул.

## Verification

CI выполняет:

`syntax → structural validation → contract tests → deterministic replay scenarios → headless Chrome/WebGL boot → diff hygiene`.

Headless boot подтверждает initialization до `data-cyber-boot="ready"`, но не доказывает реальный GPU performance, Web Audio, keyboard/mouse feel или gameplay balance.
