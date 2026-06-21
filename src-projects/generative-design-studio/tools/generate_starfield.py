#!/usr/bin/env python3
"""
同心円スタートレイル画像ジェネレータ（イラスト回転トレイル用の素材）。

「軌跡を描き込んだ星空イラスト」をプロシージャルに生成する。
回転前提なので「正方形・極が中央・同心円・くっきり」を満たすように作る。

使い方:
    pip install pillow
    python tools/generate_starfield.py                 # 既定(白・4096)で public/starfield.png を生成
    python tools/generate_starfield.py --color rainbow # 虹色版
    python tools/generate_starfield.py --size 4096 --count 9000 --out public/starfield.png

ポイント:
    - 2倍解像度で描いてから縮小し、擬似アンチエイリアスでくっきりさせる。
    - 半径は面積一様(sqrt分布)で外周ほど密に。弧長は外周ほど長め。
    - 各弧は「太く暗いグロー下地」→「本線」の二度描きでほのかな滲みを付与。
    - 中心に静かな極の領域＋小さな極星。
"""

import argparse
import colorsys
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw


def generate(size: int, supersample: int, count: int, color: str, seed: int) -> Image.Image:
    random.seed(seed)
    S = size * supersample
    cx = cy = S / 2
    maxr = int(S * 0.74)

    # 背景: 暗い青 + 中心のごく淡いグロー（小さなグラデを拡大してブロックを防ぐ）
    g = 64
    base = Image.new("RGB", (g, g), (6, 9, 22))
    gd = ImageDraw.Draw(base)
    for i in range(g // 2, 0, -1):
        t = 1 - i / (g / 2)
        v = (6 + int(10 * t), 9 + int(16 * t), 22 + int(34 * t))
        gd.ellipse([g / 2 - i, g / 2 - i, g / 2 + i, g / 2 + i], fill=v)
    img = base.resize((S, S), Image.BILINEAR)
    d = ImageDraw.Draw(img)

    def arc(r, a0, a1, rgb, w):
        d.arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=rgb, width=w)

    def star_rgb(bright: float):
        if color == "white" or random.random() < 0.45:
            v = int(120 + 135 * bright)
            return (v, v, v)
        # rainbow
        h = random.random()
        r, gg, b = colorsys.hsv_to_rgb(h, 0.8, 1.0)
        s = 0.5 + 0.5 * bright
        return (int(r * 255 * s), int(gg * 255 * s), int(b * 255 * s))

    for _ in range(count):
        r = math.sqrt(random.random()) * maxr  # 面積一様（外周ほど多い）
        if r < 30:
            continue
        span = random.uniform(5, 22) * (0.5 + r / maxr)  # 弧長（外周ほど長い）
        a0 = random.uniform(0, 360)
        a1 = a0 + span
        bright = random.random()
        rgb = star_rgb(bright)
        w = random.choice([2, 2, 3, 3, 4]) * max(1, supersample // 2)
        glow = tuple(max(8, c // 5) for c in rgb)
        arc(r, a0, a1, glow, w + 4)  # グロー下地
        arc(r, a0, a1, rgb, w)       # 本線

    # 中心(極)の静かな領域 + 極星
    for i in range(28, 0, -1):
        rr = int(120 * i / 28)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(8, 12, 28))
    pr = max(3, 2 * supersample)
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=(255, 255, 255))

    if supersample > 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    here = Path(__file__).resolve().parent
    default_out = here.parent / "public" / "starfield.png"

    p = argparse.ArgumentParser(description="同心円スタートレイル画像ジェネレータ")
    p.add_argument("--size", type=int, default=4096, help="出力の一辺ピクセル (既定 4096)")
    p.add_argument("--supersample", type=int, default=2, help="描画時の拡大倍率→縮小でAA (既定 2)")
    p.add_argument("--count", type=int, default=9000, help="軌跡(円弧)の本数 (既定 9000)")
    p.add_argument("--color", choices=["white", "rainbow"], default="white", help="色 (既定 white)")
    p.add_argument("--seed", type=int, default=7, help="乱数シード")
    p.add_argument("--out", type=str, default=str(default_out), help="出力パス")
    args = p.parse_args()

    img = generate(args.size, args.supersample, args.count, args.color, args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"saved {out} ({img.size[0]}x{img.size[1]}, color={args.color}, count={args.count})")


if __name__ == "__main__":
    main()
