# Реквизит детективной доски

Все семь изображений получены встроенной генерацией изображений, затем только уменьшены и сжаты для веба. Общая концовка каждого промпта:

> warm desaturated amber lighting, slight film grain, soft single-source shadow from upper left, no visible brand names or readable text, muted vintage color grade, consistent with a 1970s detective case file aesthetic

| Файл | Основная часть промпта | Формат и размер |
| --- | --- | --- |
| `cork-board.webp` | top-down flat-lay photo of a cork board surface, slightly worn with small pin holes scattered across it, empty, no objects on it | WebP, 1024×1024 |
| `hero-board.webp` | wide shot of a cork board with two blank cream index cards pinned at opposite sides, a short piece of red string loosely connecting two empty pins between them, plenty of empty board space around, no text on the cards | WebP, 1600×900 |
| `manila-paper.webp` | aged manila folder paper texture, cream and light brown tones, subtle creases and a couple of faint coffee-ring stains, flat, empty, no text, no objects | WebP, 512×512 |
| `red-pin.png` | single red push pin, isolated on a transparent background, top-down product shot angle, small drop shadow | PNG с альфой, 120×120 |
| `masking-tape.png` | one torn strip of beige masking tape, isolated on transparent background, slightly wrinkled, faint shadow | PNG с альфой, 200×80 |
| `red-string.png` | close-up of thin red string/yarn, straight segment, isolated on transparent background, slight fiber texture | PNG с альфой, 400×20 |
| `stamp-ink.png` | red rubber stamp ink texture only, uneven distressed ink impression shape, no letters, no text, isolated on transparent background, worn edges | PNG с альфой, 400×160 |

Надпись на штампе и названия статей сделаны HTML/CSS поверх изображений. Линия маршрута рисуется в SVG по измеренным координатам карточек; `red-string.png` используется как текстурный `<pattern>` для её обводки.
