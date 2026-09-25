# Changelog

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
