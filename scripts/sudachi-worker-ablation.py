"""Compare worker reuse with per-request startup on a fixed, database-free corpus.

Run with the project's Sudachi Python environment. Each trial includes startup,
analysis, JSON transport, and shutdown; it is not a warm-request latency test.
"""

import hashlib
import json
import platform
import statistics
import subprocess
import sys
from pathlib import Path
from time import perf_counter


SCRIPT = Path(__file__).resolve().with_name("sudachi_pronunciation.py")
TEXTS = [
    "昨日、図書館で日本語の本を借りました。",
    "先生は学生に文章を読ませた。",
    "食べなかった料理を冷蔵庫に入れておく。",
    "新しい仕事に慣れるまで時間がかかります。",
    "雨が降っているのに、彼は傘を持っていない。",
    "この問題は簡単そうに見えるが、解くのは難しい。",
    "電車が遅れたため、会議に間に合わなかった。",
    "本を読むことによって、さまざまな考え方を学べる。",
    "今日は２０２６年９月８日です。午後3時に会いましょう。",
    "コンピューターとパソコンは同じ意味ですか。",
    "東京へ行く予定だったが、京都に変更した。",
    "彼女は静かに窓を開け、外の景色を眺めた。",
]
BATCHES = [TEXTS[i:] + TEXTS[:i] for i in range(6)]
TRIALS = 5


def invoke(payload, worker):
    result = subprocess.run(
        [sys.executable, str(SCRIPT), *(["--worker"] if worker else [])],
        input=payload,
        text=True,
        capture_output=True,
        timeout=30,
        check=True,
    )
    if not worker:
        return [json.loads(result.stdout)]
    messages = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    if not messages or messages[0].get("type") != "ready":
        raise RuntimeError("Worker did not report readiness")
    responses = messages[1:]
    if len(responses) != len(BATCHES):
        raise RuntimeError("Unexpected worker response count")
    for index, response in enumerate(responses):
        if response.get("type") != "result" or response.get("id") != index:
            raise RuntimeError("Worker response failed or arrived out of order")
    return responses


def run(worker):
    started = perf_counter()
    if worker:
        responses = invoke("".join(
            json.dumps({"id": index, "texts": texts}, ensure_ascii=False) + "\n"
            for index, texts in enumerate(BATCHES)
        ), True)
    else:
        responses = []
        for texts in BATCHES:
            responses.extend(invoke(json.dumps({"texts": texts}, ensure_ascii=False), False))
    elapsed = (perf_counter() - started) * 1000
    outputs = [
        {key: response[key] for key in ("pronunciationMap", "lexicon", "tokens")}
        for response in responses
    ]
    return elapsed, outputs


def main():
    timings = {"persistent_worker": [], "per_request_startup": []}
    reference = None
    for trial in range(TRIALS):
        # Alternate order to reduce bias from OS filesystem cache and machine load.
        for worker in ([True, False] if trial % 2 == 0 else [False, True]):
            elapsed, outputs = run(worker)
            if reference is None:
                reference = outputs
            if outputs != reference:
                raise RuntimeError("Ablation changed tokens, lexicon, or pronunciation output")
            timings["persistent_worker" if worker else "per_request_startup"].append(elapsed)
    medians = {name: statistics.median(values) for name, values in timings.items()}
    fingerprint = hashlib.sha256(json.dumps(reference, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    print(json.dumps({
        "experiment": "Sudachi worker reuse ablation",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "trials_per_variant": TRIALS,
        "requests_per_trial": len(BATCHES),
        "texts_per_request": len(TEXTS),
        "timing_scope": "entire sequential batch including process startup and shutdown",
        "application_result_cache": "bypassed in both variants",
        "output_equal_across_all_runs": True,
        "output_sha256": fingerprint,
        "trial_ms": {name: [round(value, 2) for value in values] for name, values in timings.items()},
        "median_ms": {name: round(value, 2) for name, value in medians.items()},
        "startup_vs_worker_ratio": round(medians["per_request_startup"] / medians["persistent_worker"], 2),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
