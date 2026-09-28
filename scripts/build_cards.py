#!/usr/bin/env python3
"""Genera data/cards.json a partir de pictionary_600_tarjetas.md.

El JSON es la unica fuente de datos que consume la app. Este script es
reproducible: vuelve a ejecutarlo cada vez que cambie el markdown.

Uso:
    python3 scripts/build_cards.py
    python3 scripts/build_cards.py --input pictionary_600_tarjetas.md --output data/cards.json

Falla con SystemExit != 0 si el resultado no cumple las validaciones
obligatorias (conteos, IDs, dificultad, texto).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "pictionary_600_tarjetas.md"
DEFAULT_OUTPUT = ROOT / "data" / "cards.json"

# ---------------------------------------------------------------------------
# Mazos: prefijo de ID -> metadatos. Agregar un mazo nuevo es agregar una
# entrada aqui y las tarjetas en el markdown (seccion 9 del prompt).
# ---------------------------------------------------------------------------
DECKS = OrderedDict(
    [
        ("infantil", {"label": "Infantil", "emoji": "\U0001F7E2", "color": "#2e9e4f", "count": 200}),
        ("adulto", {"label": "Adulto", "emoji": "\U0001F535", "color": "#2f6fd6", "count": 100}),
        ("mixto", {"label": "Mixto / Familiar", "emoji": "\U0001F7E1", "color": "#f2b800", "count": 100}),
        (
            "chile",
            {
                "label": "Chile",
                "emoji": "\U0001F1E8\U0001F1F1",
                "icon": "flag-cl",
                "color": "#d52b1e",
                "count": 100,
            },
        ),
        ("desafio", {"label": "Desaf\u00edo / Fiesta", "emoji": "\U0001F7E3", "color": "#7b3fbf", "count": 100}),
    ]
)

PREFIX_TO_DECK = {"I": "infantil", "A": "adulto", "M": "mixto", "C": "chile", "D": "desafio"}
DECK_TO_PREFIX = {v: k for k, v in PREFIX_TO_DECK.items()}

ID_RE = re.compile(r"^[IAMCD]\d{3}$")
DIFFICULTY_RE = re.compile(r"^\s*(\u2b50+)\s*$")
ROW_RE = re.compile(r"^\|\s*([IAMCD]\d{3})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$")

# Un encabezado "##  Titulo" que empieza con emoji: se quita el emoji/espacios.
HEADING_EMOJI_RE = re.compile(r"^[\W_]+", re.UNICODE)

TOTAL_CARDS = 600


def normalize_text(text: str) -> str:
    """Clave para detectar duplicados: sin tildes, minusculas, espacios simples."""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", stripped).strip().lower()


def clean_heading(heading: str) -> str:
    return HEADING_EMOJI_RE.sub("", heading).strip()


def parse_markdown(lines: list[str]) -> list[dict]:
    """Parsea todas las tablas '| ID | Tarjeta | Dificultad |' del markdown."""
    cards: list[dict] = []
    current_deck: str | None = None
    current_category: str | None = None

    for raw_line in lines:
        line = raw_line.rstrip("\n")

        if line.startswith("# "):
            title = line[2:].strip().upper()
            if "INFANTIL" in title:
                current_deck = "infantil"
            elif "ADULTA" in title:
                current_deck = "adulto"
            elif "MIXTA" in title:
                current_deck = "mixto"
            elif "CHILE" in title:
                current_deck = "chile"
            elif "DESAF" in title:
                current_deck = "desafio"
            else:
                current_deck = None
            current_category = None
            continue

        if line.startswith("## "):
            if current_deck is not None:
                current_category = clean_heading(line[3:].strip()) or None
            continue

        match = ROW_RE.match(line)
        if not match:
            continue

        card_id, text, stars = match.group(1), match.group(2).strip(), match.group(3)
        prefix = card_id[0]
        deck = PREFIX_TO_DECK[prefix]

        if current_deck is not None and current_deck != deck:
            raise ValueError(
                f"La tarjeta {card_id} aparece en la seccion '{current_deck}' "
                f"pero su prefijo corresponde al mazo '{deck}'."
            )

        difficulty_match = DIFFICULTY_RE.match(stars)
        if not difficulty_match:
            raise ValueError(f"Dificultad invalida para {card_id}: {stars!r}")
        difficulty = len(difficulty_match.group(1))

        cards.append(
            {
                "id": card_id,
                "text": text,
                "deck": deck,
                "difficulty": difficulty,
                "points": difficulty,
                "category": current_category,
            }
        )

    return cards


def mark_duplicates(cards: list[dict]) -> None:
    """Agrega 'duplicateOf' a las repeticiones (primera aparicion intacta)."""
    first_seen: dict[str, str] = {}
    for card in cards:
        key = normalize_text(card["text"])
        if key in first_seen:
            card["duplicateOf"] = first_seen[key]
        else:
            first_seen[key] = card["id"]


def validate(cards: list[dict], decks: dict) -> None:
    errors: list[str] = []

    if len(cards) != TOTAL_CARDS:
        errors.append(f"Se esperaban {TOTAL_CARDS} tarjetas y se encontraron {len(cards)}.")

    counts = Counter(card["deck"] for card in cards)
    for deck_id, meta in decks.items():
        if counts.get(deck_id, 0) != meta["count"]:
            errors.append(
                f"Mazo '{deck_id}': se esperaban {meta['count']} tarjetas y hay {counts.get(deck_id, 0)}."
            )

    ids = [card["id"] for card in cards]
    if len(set(ids)) != len(ids):
        repeated = [i for i, n in Counter(ids).items() if n > 1]
        errors.append(f"IDs duplicados: {repeated}.")

    for card in cards:
        if not ID_RE.match(card["id"]):
            errors.append(f"ID con formato invalido: {card['id']!r}.")
            continue
        if PREFIX_TO_DECK[card["id"][0]] != card["deck"]:
            errors.append(f"El ID {card['id']} no coincide con el mazo '{card['deck']}'.")
        if card["difficulty"] not in (1, 2, 3):
            errors.append(f"Dificultad invalida en {card['id']}: {card['difficulty']}.")
        if card["points"] != card["difficulty"]:
            errors.append(f"points != difficulty en {card['id']}.")
        if not isinstance(card["text"], str) or not card["text"].strip():
            errors.append(f"Texto vacio en {card['id']}.")

    if errors:
        raise SystemExit("Validacion fallida:\n  - " + "\n  - ".join(errors))


def build(input_path: Path, output_path: Path) -> dict:
    lines = input_path.read_text(encoding="utf-8").splitlines()
    cards = parse_markdown(lines)
    mark_duplicates(cards)

    decks = OrderedDict()
    for deck_id, meta in DECKS.items():
        decks[deck_id] = dict(meta)

    validate(cards, decks)

    payload = {
        "meta": {
            "name": "pictonarIA",
            "version": "1.0.0",
            "total": len(cards),
            "source": input_path.name,
        },
        "decks": decks,
        "cards": cards,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)

    payload = build(args.input, args.output)
    cards = payload["cards"]
    duplicates = [c for c in cards if "duplicateOf" in c]
    counts = Counter(c["deck"] for c in cards)

    print(f"OK: {len(cards)} tarjetas -> {args.output}")
    for deck_id, meta in payload["decks"].items():
        print(f"  {meta['emoji']} {meta['label']}: {counts[deck_id]}")
    print(f"  Duplicados marcados: {len(duplicates)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
