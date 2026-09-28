#!/usr/bin/env python3
"""Genera los íconos PNG de la PWA sin dependencias externas.

Dibuja una tarjeta blanca con los cinco colores de los mazos sobre fondo
oscuro. Todo el contenido relevante queda dentro del area segura (80%),
por lo que el ícono sirve tambien como `maskable`.

Uso: python3 scripts/make_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"

BG = (20, 33, 61, 255)  # #14213d
CARD = (255, 255, 255, 255)
DOTS = [
    (46, 158, 79, 255),   # infantil  verde
    (47, 111, 214, 255),  # adulto    azul
    (242, 184, 0, 255),   # mixto     amarillo
    (213, 43, 30, 255),   # chile     rojo
    (123, 63, 191, 255),  # desafio   morado
]


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filtro None
        raw += pixels[y * stride : (y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def inside_rounded_rect(px, py, cx, cy, half_w, half_h, radius) -> bool:
    dx = abs(px - cx)
    dy = abs(py - cy)
    if dx > half_w or dy > half_h:
        return False
    inner_x = half_w - radius
    inner_y = half_h - radius
    if dx <= inner_x or dy <= inner_y:
        return True
    return (dx - inner_x) ** 2 + (dy - inner_y) ** 2 <= radius * radius


def render(size: int, supersample: int = 3) -> bytearray:
    ss = supersample
    big = size * ss
    buffer = bytearray(size * size * 4)
    cx = cy = big / 2
    half_w = big * 0.29
    half_h = big * 0.36
    radius = big * 0.07
    dot_radius = big * 0.05
    spacing = big * 0.115

    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx + 0.5
                    py = y * ss + sy + 0.5
                    if inside_rounded_rect(px, py, cx, cy, half_w, half_h, radius):
                        color = CARD
                        for i, dot in enumerate(DOTS):
                            dcx = cx + (i - 2) * spacing
                            if (px - dcx) ** 2 + (py - cy) ** 2 <= dot_radius ** 2:
                                color = dot
                                break
                    else:
                        color = BG
                    r += color[0]
                    g += color[1]
                    b += color[2]
                    a += color[3]
            n = ss * ss
            index = (y * size + x) * 4
            buffer[index : index + 4] = bytes((r // n, g // n, b // n, a // n))
    return buffer


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        pixels = render(size)
        write_png(ICONS / f"icon-{size}.png", size, size, pixels)
        print(f"OK icons/icon-{size}.png")
    # Maskable: mismo arte, ya centrado dentro del area segura.
    write_png(ICONS / "icon-maskable-512.png", 512, 512, render(512))
    print("OK icons/icon-maskable-512.png")


if __name__ == "__main__":
    main()
