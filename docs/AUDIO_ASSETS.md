# Источники звуков

## Собственный сгенерированный набор

Десять mono WAV (PCM 16-bit, 44 100 Гц, всего 785 420 байт) находятся в `assets/audio/generated/`. Выстрелы (две вариации), ракета, взрыв, щит и нитро созданы параметрическим синтезом Jsfxr с дополнительными шумовыми/низкочастотными слоями. Бонус, зацикленные двигатель и шины синтезированы локальным скриптом. Это синтез, а не нейросетевая генерация и не запись настоящего двигателя. Чужие аудиозаписи в новом наборе не использованы.

В пользовательской подборке генераторов указан Jsfxr Pro. Использован бесплатный открытый [Jsfxr](https://sfxr.me/): [официальный исходник](https://github.com/chr15m/jsfxr), Eric Fredricksen / Chris McCormick, оригинальный sfxr - DrPetter. Бесплатная версия позволяет экспорт WAV и коммерческое использование. Инструмент работает только при подготовке файлов; в runtime сторонний код не добавлен.

Параметры, фиксированный seed, слои, нормализация и обработка стыков принадлежат [scripts/build-audio.cjs](../scripts/build-audio.cjs). [manifest.json](../assets/audio/generated/manifest.json) содержит длительности и SHA-256 каждого результата. Peak событий ограничен 0.8, циклов - 0.65. Циклы используют 40-мс crossfade, события - короткие плавные края. Runtime дополнительно регулирует высоту/громкость, фильтрует дальние звуки, панорамирует бой и ограничивает общую смесь компрессором.

Для повторной генерации сохраните официальный `sfxr.js` с https://raw.githubusercontent.com/chr15m/jsfxr/master/sfxr.js вне проекта. Нужен Node.js; установка пакетов не нужна. Скрипт проверяет SHA-256 исходника `6095a6358e654bc3ffd55d9ccecf694f187953d78b1391ee2823a6fcb92551c5` и при другой версии останавливается. Из корня проекта выполните `node scripts/build-audio.cjs "C:\path\to\sfxr.js"`. Команда перезаписывает только десять WAV и manifest в `assets/audio/generated/`; перед изменением параметров сохраните эту папку. Затем выполните `node tests/audio-system.mjs`.

Файлы загружаются с того же origin один раз по HTTP/HTTPS. При file://, ошибке файла или неподдерживаемом формате сохраняется процедурный вариант двигателя, шин и событий. Звуковые передачи служат для восприятия ускорения и не меняют физику или баланс машин. Отсчёт и сигнал старта остаются процедурными.

## Сохранённые исходные ассеты Kenney

Текущий runtime использует `ricochet.ogg` из следующей таблицы. Остальные пять прежних файлов сохранены без изменений; новые события берутся из generated WAV. Лицензии и контрольные суммы исходного набора сохранены ниже.

Использованы шесть неизменённых OGG-файлов Kenney, всего 304 860 байт. Автор - Kenney. Лицензия обоих наборов - [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Проверено по официальным страницам 2026-11-11.

- [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds), версия 1.0 (2020). Исходная лицензия: [LICENSE-scifi.txt](../assets/audio/LICENSE-scifi.txt).
- [Impact Sounds](https://kenney.nl/assets/impact-sounds), версия 1.0 (2019). Исходная лицензия: [LICENSE-impact.txt](../assets/audio/LICENSE-impact.txt).

| Локальный файл | Набор / исходный файл в ZIP | Байты | SHA-256 |
|---|---|---:|---|
| `assets/audio/shoot.ogg` | Sci-fi Sounds / `Audio/laserSmall_000.ogg` | 7 286 | `72b589eadd41781257ac859e4f4d030222e623390e4a1a83f6d05329a6e026f1` |
| `assets/audio/rocket.ogg` | Sci-fi Sounds / `Audio/thrusterFire_000.ogg` | 201 216 | `0fdc474d93f209debf1fc4ea77765a669dcb7676db31b4d8a0a509685bccf374` |
| `assets/audio/explosion.ogg` | Sci-fi Sounds / `Audio/explosionCrunch_001.ogg` | 47 916 | `fdd04d6f0032d4d57c134ad37f3587d2d00e58c9572715275bd8cf4f43593576` |
| `assets/audio/shield.ogg` | Sci-fi Sounds / `Audio/forceField_000.ogg` | 25 672 | `c2916f2a062c8ddd1aca2826d134fe90847037db31342726ffb0f9097afe339c` |
| `assets/audio/ricochet.ogg` | Sci-fi Sounds / `Audio/impactMetal_000.ogg` | 15 491 | `956c6612a256aa1a67a2327fffe2454f6b1d82e4c1c2be28fd66916335d5b1d6` |
| `assets/audio/hit.ogg` | Impact Sounds / `Audio/impactMetal_heavy_001.ogg` | 7 279 | `83554049f81f4db9209379e103c30bfa63f65c42189a03f300b045c2c82e23ae` |

Файлы только переименованы; код игры ограничивает длительность воспроизведения ракетной струи и добавляет процедурные слои. Остальные материалы наборов в проект не включены.
