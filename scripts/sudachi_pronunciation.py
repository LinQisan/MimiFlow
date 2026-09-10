#!/usr/bin/env python3
"""Analyze Japanese text with SudachiPy.

The default mode is a one-shot JSON process for environments where a child
process cannot be kept alive. ``--worker`` keeps the full dictionary resident
and handles newline-delimited JSON requests until stdin closes.
"""

from __future__ import annotations

import json
import re
import sys
from time import perf_counter
from typing import Any


KANJI_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]")
SCRIPT_STARTED_AT = perf_counter()


def katakana_to_hiragana(value: str) -> str:
    converted: list[str] = []
    for character in value:
        codepoint = ord(character)
        if 0x30A1 <= codepoint <= 0x30F6:
            converted.append(chr(codepoint - 0x60))
        else:
            converted.append(character)
    return "".join(converted)


class SudachiAnalyzer:
    """Own one tokenizer and its dictionary-reading memoization."""

    def __init__(self) -> None:
        import_started_at = perf_counter()
        from sudachipy import dictionary, tokenizer

        self.sudachi_import_ms = (perf_counter() - import_started_at) * 1000
        dictionary_started_at = perf_counter()
        self.sudachi = dictionary.Dictionary(dict="full").create()
        self.dictionary_initialization_ms = (
            perf_counter() - dictionary_started_at
        ) * 1000
        self.split_mode = tokenizer.Tokenizer.SplitMode.C
        self.dictionary_readings: dict[str, str] = {}

    def analyze(
        self,
        texts: list[str],
        *,
        script_startup_ms: float = 0.0,
        input_parse_ms: float = 0.0,
        worker: bool = False,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        analysis_started_at = perf_counter()
        pronunciations: dict[str, str] = {}
        lexicon: dict[str, dict[str, Any]] = {}
        tokens: list[dict[str, Any]] = []
        tokenize_ms = 0.0
        dictionary_reading_tokenize_ms = 0.0
        first_tokenize_ms: float | None = None

        def resolve_dictionary_reading(
            dictionary_form: str,
            fallback: str,
        ) -> str:
            nonlocal dictionary_reading_tokenize_ms
            if dictionary_form in self.dictionary_readings:
                return self.dictionary_readings[dictionary_form]
            dictionary_tokenize_started_at = perf_counter()
            dictionary_tokens = self.sudachi.tokenize(
                dictionary_form,
                self.split_mode,
            )
            dictionary_reading_tokenize_ms += (
                perf_counter() - dictionary_tokenize_started_at
            ) * 1000
            reading_parts = [
                item.reading_form().strip() for item in dictionary_tokens
            ]
            reading = katakana_to_hiragana(
                "".join(item for item in reading_parts if item and item != "*")
            )
            self.dictionary_readings[dictionary_form] = reading or fallback
            return reading or fallback

        for text_index, text in enumerate(texts):
            if not text:
                continue
            tokenize_started_at = perf_counter()
            morphemes = self.sudachi.tokenize(text, self.split_mode)
            tokenize_duration_ms = (perf_counter() - tokenize_started_at) * 1000
            tokenize_ms += tokenize_duration_ms
            if first_tokenize_ms is None:
                first_tokenize_ms = tokenize_duration_ms

            for morpheme in morphemes:
                surface = morpheme.surface().strip()
                reading = morpheme.reading_form().strip()
                if not surface:
                    continue
                hiragana_reading = (
                    katakana_to_hiragana(reading)
                    if reading and reading != "*"
                    else ""
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
                    {
                        key: value
                        for key, value in token.items()
                        if key not in {"textIndex", "begin", "end"}
                    },
                )
                if KANJI_PATTERN.search(surface) and hiragana_reading:
                    pronunciations.setdefault(surface, hiragana_reading)

        return (
            {
                "pronunciationMap": pronunciations,
                "lexicon": lexicon,
                "tokens": tokens,
            },
            {
                "worker": worker,
                "scriptStartupMs": script_startup_ms,
                "inputParseMs": input_parse_ms,
                "sudachiImportMs": self.sudachi_import_ms if not worker else 0.0,
                "dictionaryInitializationMs": (
                    self.dictionary_initialization_ms if not worker else 0.0
                ),
                "firstTokenizeMs": first_tokenize_ms,
                "tokenizeMs": tokenize_ms,
                "dictionaryReadingTokenizeMs": dictionary_reading_tokenize_ms,
                "jsonSerializationMs": 0.0,
                "totalAnalysisMs": (perf_counter() - analysis_started_at) * 1000,
                "textCount": len(texts),
                "characterCount": sum(len(text) for text in texts),
                "tokenCount": len(tokens),
                "dictionaryReadingCacheSize": len(self.dictionary_readings),
            },
        )

    def initialization_timings(self) -> dict[str, Any]:
        return {
            "sudachiImportMs": self.sudachi_import_ms,
            "dictionaryInitializationMs": self.dictionary_initialization_ms,
        }


def serialize_result(result: dict[str, Any], timings: dict[str, Any]) -> str:
    serialization_started_at = perf_counter()
    output = json.dumps(
        {**result, "timings": timings},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    timings["jsonSerializationMs"] = (
        perf_counter() - serialization_started_at
    ) * 1000
    # The timing field itself is part of the response, so serialize once more
    # after recording its duration. The reported value covers the large result
    # body and is intentionally separate from tokenization.
    return json.dumps(
        {**result, "timings": timings},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def analyze_one_shot() -> None:
    input_parse_started_at = perf_counter()
    payload: Any = json.load(sys.stdin)
    input_parse_ms = (perf_counter() - input_parse_started_at) * 1000
    raw_texts = payload.get("texts", []) if isinstance(payload, dict) else []
    texts = [item for item in raw_texts if isinstance(item, str)]
    analyzer = SudachiAnalyzer()
    result, timings = analyzer.analyze(
        texts,
        script_startup_ms=(input_parse_started_at - SCRIPT_STARTED_AT) * 1000,
        input_parse_ms=input_parse_ms,
    )
    sys.stdout.write(serialize_result(result, timings))


def analyze_worker() -> None:
    analyzer = SudachiAnalyzer()
    ready = {
        "type": "ready",
        "timings": {
            **analyzer.initialization_timings(),
            "scriptStartupMs": 0.0,
        },
    }
    sys.stdout.write(
        json.dumps(ready, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        request_id: Any = None
        try:
            payload: Any = json.loads(line)
            request_id = payload.get("id") if isinstance(payload, dict) else None
            raw_texts = payload.get("texts", []) if isinstance(payload, dict) else []
            texts = [item for item in raw_texts if isinstance(item, str)]
            result, timings = analyzer.analyze(
                texts,
                worker=True,
            )
            response = {
                "type": "result",
                "id": request_id,
                **result,
                "timings": timings,
            }
        except Exception as error:  # pragma: no cover - process-level fallback
            print(
                f"Sudachi worker request failed: {error}",
                file=sys.stderr,
                flush=True,
            )
            response = {
                "type": "error",
                "id": request_id,
                "message": str(error),
            }
        serialization_started_at = perf_counter()
        output = json.dumps(
            response,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        if isinstance(response.get("timings"), dict):
            response["timings"]["jsonSerializationMs"] = (
                perf_counter() - serialization_started_at
            ) * 1000
        output = json.dumps(
            response,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        sys.stdout.write(output + "\n")
        sys.stdout.flush()


def main() -> None:
    if "--worker" in sys.argv[1:]:
        analyze_worker()
    else:
        analyze_one_shot()


if __name__ == "__main__":
    main()
