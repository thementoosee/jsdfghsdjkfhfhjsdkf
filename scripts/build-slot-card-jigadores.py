"""Build portrait TOP-5 default slot thumb with Jigadores mascot + card chrome."""
from __future__ import annotations

import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ASSETS = Path(
    r"C:\Users\estud\.cursor\projects\c-Users-estud-Desktop-overlaysfever-overlaysfever-main-overlaysfever-main\assets"
)

SRC_CANDIDATES = [
    ASSETS
    / "c__Users_estud_AppData_Roaming_Cursor_User_workspaceStorage_aab6ebc110ce7738d3172418a93b6711_images_image-7a066f34-7719-49cd-b88d-821b9530c5ca.png",
    PUBLIC / "logo-jigadores-mascot.png",
]


def find_logo() -> Path:
    for path in SRC_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("Jigadores mascot logo not found")


def is_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 10:
        return True
    brightness = (r + g + b) / 3
    # near-black / deep navy outside the emblem
    if brightness < 28:
        return True
    if r < 35 and g < 35 and b < 45 and brightness < 38:
        return True
    return False


def cut_mascot(src: Image.Image) -> Image.Image:
    """Crop off bottom wordmark + shield tip, then clear outer black bg."""
    w, h = src.size
    # Text band starts ~y=330 on 451px source — keep faces + headphone frame only
    crop_bottom = int(h * 0.72)
    cropped = src.crop((0, 0, w, crop_bottom))

    # Upscale for cleaner edges when placing large
    cropped = cropped.resize((cropped.width * 2, cropped.height * 2), Image.Resampling.LANCZOS)
    cw, ch = cropped.size
    px = cropped.load()

    visited = [[False] * cw for _ in range(ch)]
    q: deque[tuple[int, int]] = deque()
    for x in range(cw):
        q.append((x, 0))
        q.append((x, ch - 1))
    for y in range(ch):
        q.append((0, y))
        q.append((cw - 1, y))

    mask = Image.new("L", (cw, ch), 0)
    mp = mask.load()
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= cw or y >= ch or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b, a):
            continue
        mp[x, y] = 255
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    cut = cropped.copy()
    cp = cut.load()
    for y in range(ch):
        for x in range(cw):
            if mp[x, y] == 255:
                cp[x, y] = (0, 0, 0, 0)

    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    return cut


def build_card(mascot: Image.Image) -> Image.Image:
    w, h = 432, 624
    img = Image.new("RGB", (w, h), (14, 18, 34))
    draw = ImageDraw.Draw(img)

    for y in range(h):
        t = y / (h - 1)
        wave = abs(math.sin(t * math.pi))
        r = int(16 + 14 * (1 - t) + 6 * wave)
        g = int(20 + 12 * (1 - t) + 4 * wave)
        b = int(42 + 22 * (1 - t))
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([40, 80, w - 40, h - 60], fill=(110, 60, 190, 70))
    gd.ellipse([80, 140, w - 80, h - 100], fill=(40, 130, 180, 35))
    glow = glow.filter(ImageFilter.GaussianBlur(34))
    layer = Image.alpha_composite(img.convert("RGBA"), glow)
    d = ImageDraw.Draw(layer, "RGBA")

    gold = (218, 178, 72, 255)
    gold_hi = (255, 228, 150, 220)
    gold_dim = (150, 110, 40, 255)

    # Card chrome frame (no bottom nameplate)
    d.rectangle([0, 0, w - 1, h - 1], outline=(6, 8, 14, 255), width=3)
    d.rounded_rectangle([5, 5, w - 6, h - 6], radius=38, outline=gold, width=8)
    d.rounded_rectangle([14, 14, w - 15, h - 15], radius=32, outline=gold_hi, width=2)
    d.rounded_rectangle([18, 18, w - 19, h - 19], radius=30, outline=(28, 36, 64, 255), width=3)
    d.rounded_rectangle([22, 22, w - 23, h - 23], radius=28, outline=(130, 90, 210, 170), width=2)

    # Inner well — almost full card so mascot can fill
    d.rounded_rectangle([28, 30, w - 29, h - 31], radius=24, fill=(8, 10, 22, 70), outline=(255, 255, 255, 28), width=1)

    # Sized to sit inside the frame with breathing room
    max_w = w - 72
    max_h = h - 100
    lw, lh = mascot.size
    scale = min(max_w / lw, max_h / lh) * 0.88
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    logo_r = mascot.resize((nw, nh), Image.Resampling.LANCZOS)

    shadow = Image.new("RGBA", (nw + 28, nh + 28), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([4, nh // 2, nw + 24, nh + 24], fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))

    lx = (w - nw) // 2
    ly = (h - nh) // 2
    layer.paste(shadow, (lx - 14, ly - 4), shadow)
    layer.paste(logo_r, (lx, ly), logo_r)

    d = ImageDraw.Draw(layer, "RGBA")
    for x0, y0, x1, y1 in (
        (26, 26, 54, 26),
        (26, 26, 26, 54),
        (w - 55, 26, w - 27, 26),
        (w - 27, 26, w - 27, 54),
        (26, h - 55, 26, h - 27),
        (26, h - 27, 54, h - 27),
        (w - 27, h - 55, w - 27, h - 27),
        (w - 55, h - 27, w - 27, h - 27),
    ):
        d.line([(x0, y0), (x1, y1)], fill=gold_hi, width=3)

    d.ellipse([w // 2 - 7, 10, w // 2 + 7, 24], fill=gold, outline=gold_hi)
    d.ellipse([w // 2 - 3, 13, w // 2 + 3, 19], fill=gold_dim)

    return layer


def main() -> None:
    src_path = find_logo()
    src = Image.open(src_path).convert("RGBA")
    mascot_public = PUBLIC / "logo-jigadores-mascot.png"
    if src_path.resolve() != mascot_public.resolve():
        src.save(mascot_public)

    cut = cut_mascot(src)
    cut.save(PUBLIC / "logo-jigadores-mascot-cut.png")
    card = build_card(cut)
    png = PUBLIC / "slot-card-jigadores.png"
    jpg = PUBLIC / "slot-card-jigadores.jpg"
    card.save(png, "PNG", optimize=True)
    card.convert("RGB").save(jpg, "JPEG", quality=95)
    print(f"logo={src_path.name} cut={cut.size} png={png.stat().st_size} jpg={jpg.stat().st_size}")


if __name__ == "__main__":
    main()
