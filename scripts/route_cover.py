"""Cover für die Feeds einzelner Lernrouten, im Stil des Haupt-Covers.

Dunkler Grund, oben "LERN-PODCAST", groß "Lernroute" und der Name der Route,
das letzte Wort in einer Akzentfarbe je Route, unten der Fortschrittsbalken.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

BG = (21, 33, 43)
INK = (228, 236, 239)
MUTED = (147, 164, 172)
EYEBROW = (111, 179, 207)
ACCENTS = [(232, 178, 90), (108, 192, 142), (111, 179, 207), (226, 128, 110), (178, 150, 220), (230, 200, 90)]
BAR = [(46, 125, 79), (201, 134, 28), (31, 95, 122), (38, 54, 64)]

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF"]


def _font(name: str, size: int):
    from PIL import ImageFont
    for d in FONT_DIRS:
        p = Path(d) / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _wrap(draw, words: list[str], font, width: int) -> list[str]:
    lines: list[str] = []
    cur = ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def make_cover(route_id: str, title: str, out: Path) -> bool:
    """Erzeugt out (1400×1400 PNG). Gibt False zurück, wenn Pillow fehlt."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False
    size, left, width = 1400, 110, 1180
    accent = ACCENTS[int(hashlib.sha1(route_id.encode()).hexdigest(), 16) % len(ACCENTS)]
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    d.text((left, 175), "LERN-PODCAST", font=_font("DejaVuSansMono.ttf", 40), fill=EYEBROW)

    words = ["Lernroute"] + title.replace(":", "").split()
    fsize = 150
    while fsize > 70:
        font = _font("DejaVuSans-Bold.ttf", fsize)
        lines = _wrap(d, words, font, width)
        if len(lines) * fsize * 1.07 <= 620:
            break
        fsize -= 8
    y = 300
    for i, line in enumerate(lines):
        d.text((left, y), line, font=font, fill=accent if i == len(lines) - 1 and i > 0 else INK)
        y += int(fsize * 1.07)

    x, n = left, 38
    step = (width + 6) / n
    for i in range(n):
        col = BAR[0] if i < 6 else BAR[1] if i < 9 else BAR[2] if i < 16 else BAR[3]
        d.rounded_rectangle([int(x + i * step), 1060, int(x + i * step + step - 9), 1110], radius=6, fill=col)
    d.text((left, 1165), "Deine eigene Lernroute · einfach erklärt", font=_font("DejaVuSans.ttf", 50), fill=MUTED)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)
    return True


if __name__ == "__main__":
    import sys
    make_cover(sys.argv[1], sys.argv[2], Path(sys.argv[3]))
