"""
Нарізає банери головної під різні екрани.

Оригінал кладеться в static/banners як <назва>-1916.avif (1916×821).
Скрипт робить поруч:
  <назва>-960.avif   — телефон
  <назва>-1280.avif  — телефон із щільним екраном, планшет
  <назва>-1280.webp  — для браузерів без AVIF (iPhone на iOS 15 і старіших)

Готові файли не перезаписує — лише ті, яких бракує. Щоб перерізати банер
після заміни оригіналу, видаліть його старі копії.

Запуск: python scripts/banners.py   (потрібен Pillow 11.2+ з AVIF)
"""

from pathlib import Path

from PIL import Image

FOLDER = Path(__file__).resolve().parent.parent / 'static' / 'banners'
ORIGINAL = '-1916.avif'
# Під ці пропорції зроблена рамка слайдера: інші обріжуться справа.
RATIO = 1916 / 821


def main() -> None:
    for original in sorted(FOLDER.glob(f'*{ORIGINAL}')):
        name = original.name[: -len(ORIGINAL)]
        image = Image.open(original).convert('RGB')

        ratio = image.width / image.height
        if abs(ratio - RATIO) / RATIO > 0.01:
            print(f'! {original.name}: {image.width}×{image.height}, а рамка — 1916×821')

        for width, extension, options in (
            (960, 'avif', {'quality': 60}),
            (1280, 'avif', {'quality': 60}),
            (1280, 'webp', {'quality': 80, 'method': 6}),
        ):
            target = FOLDER / f'{name}-{width}.{extension}'
            if target.exists():
                continue
            height = round(image.height * width / image.width)
            image.resize((width, height), Image.LANCZOS).save(target, **options)
            print(f'+ {target.name}')


if __name__ == '__main__':
    main()
