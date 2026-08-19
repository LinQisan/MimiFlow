#!/usr/bin/env python3
"""Analyze article text with the full Sudachi dictionary."""

from __future__ import annotations

import json
import re
import sys
from typing import Any

from sudachipy import dictionary, tokenizer


KANJI_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]")


def katakana_to_hiragana(value: str) -> str:
    converted: list[str] = []
    for character in value:
        codepoint = ord(character)
        if 0x30A1 <= codepoint <= 0x30F6:
            converted.append(chr(codepoint - 0x60))
        else:
            converted.append(character)
    return "".join(converted)


def build_analysis(texts: list[str]) -> dict[str, Any]:
    sudachi = dictionary.Dictionary(dict="full").create()
    split_mode = tokenizer.Tokenizer.SplitMode.C
    pronunciations: dict[str, str] = {}
    lexicon: dict[str, dict[str, Any]] = {}
    tokens: list[dict[str, Any]] = []
    dictionary_readings: dict[str, str] = {}

    def resolve_dictionary_reading(dictionary_form: str, fallback: str) -> str:
        if dictionary_form in dictionary_readings:
            return dictionary_readings[dictionary_form]
        reading_parts = [
            item.reading_form().strip()
            for item in sudachi.tokenize(dictionary_form, split_mode)
        ]
        reading = katakana_to_hiragana(
            "".join(item for item in reading_parts if item and item != "*")
        )
        dictionary_readings[dictionary_form] = reading or fallback
        return reading or fallback

    for text_index, text in enumerate(texts):
        if not text:
            continue
        for morpheme in sudachi.tokenize(text, split_mode):
            surface = morpheme.surface().strip()
            reading = morpheme.reading_form().strip()
            if not surface:
                continue
            hiragana_reading = (
                katakana_to_hiragana(reading) if reading and reading != "*" else ""
            )
            dictionary_form = morpheme.dictionary_form().strip()
            if not dictionary_form or dictionary_form == "*":
                dictionary_form = surface
            normalized_form = morpheme.normalized_form().strip() or dictionary_form
            dictionary_reading = (
                hiragana_reading
                if dictionary_form == surface
                else resolve_dictionary_reading(dictionary_form, hiragana_reading)
            )
            parts_of_speech = [
                item for item in morpheme.part_of_speech() if item and item != "*"
            ]
            token = {
                "surface": surface,
                "dictionaryForm": dictionary_form,
                "normalizedForm": normalized_form,
                "reading": hiragana_reading,
                "dictionaryReading": dictionary_reading,
                "partsOfSpeech": parts_of_speech,
                "textIndex": text_index,
                "begin": morpheme.begin(),
                "end": morpheme.end(),
            }
            tokens.append(token)
            lexicon.setdefault(
                surface,
                {key: value for key, value in token.items() if key not in {"textIndex", "begin", "end"}},
            )
            if KANJI_PATTERN.search(surface) and hiragana_reading:
                pronunciations.setdefault(surface, hiragana_reading)

    return {
        "pronunciationMap": pronunciations,
        "lexicon": lexicon,
        "tokens": tokens,
    }


def main() -> None:
    payload: Any = json.load(sys.stdin)
    raw_texts = payload.get("texts", []) if isinstance(payload, dict) else []
    texts = [item for item in raw_texts if isinstance(item, str)]
    json.dump(build_analysis(texts), sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
