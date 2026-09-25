# Архитектура CYBER RACE

## Цель

Проект развивается от одного большого inline runtime к модульной browser-first архитектуре без одномоментного переписывания gameplay.

## Текущий bootstrap

`index.html` содержит DOM/CSS и подключает JavaScript в фиксированном порядке:

1. `src/core/three-loader.js` — Three.js CDN + fallback.
2. `src/core/storage.js` — безопасный JSON/localStorage boundary.
3. `src/game/config.js` — gameplay constants и defaults.
4. `src/ai/difficulty.js` — AI difficulty profiles.
5. `src/weapons/geometry.js` — projectile collision helper.
6. `src/audio/audio-system.js` — Web Audio engine/SFX.
7. `src/ui/elements.js` — централизованный HUD/menu DOM lookup.
8. `src/game/runtime.js` — orchestration, rendering, race loop и оставшаяся legacy gameplay logic.

Модули публикуют узкие API через `globalThis.CyberRace`. Это позволяет переносить subsystem boundaries постепенно, сохраняя простую публикацию без bundler.

## Следующие границы

Дальнейшее разделение должно идти по зависимостям:

- track/environment/rendering → `src/game/`;
- opponent decision/movement → `src/ai/`;
- gun/rocket/projectiles → `src/weapons/`;
- menu/HUD/minimap → `src/ui/`.

Каждый перенос должен сохранять observable behavior и сопровождаться structural validation + browser boot smoke.

## Verification

`scripts/validate-structure.mjs` проверяет наличие и порядок модулей и запрещает возврат большого inline JavaScript.

GitHub Actions запускает `node --check`, structural validation и headless Chrome boot smoke. Маркер `data-cyber-boot="ready"` выставляется только после завершения runtime initialization.

Полный интерактивный gameplay, GPU performance, Web Audio и баланс этим smoke test не доказываются.
