use napi::{bindgen_prelude::AsyncTask, Env, Error, JsUnknown, Result, Task};
use napi_derive::napi;
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use sudachi::{
    analysis::{stateful_tokenizer::StatefulTokenizer, Mode},
    config::Config,
    dic::dictionary::JapaneseDictionary,
    prelude::MorphemeList,
};

// Only in-process native work: libuv schedules tasks, a mutex preserves the
// tokenizer/dictionary-reading cache semantics of the former serial analyzer.
static ANALYZER: Mutex<Option<Analyzer>> = Mutex::new(None);
struct Analyzer {
    tokenizer: StatefulTokenizer<Arc<JapaneseDictionary>>,
    dictionary_readings: HashMap<String, String>,
}
fn failure(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
fn hiragana(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if ('\u{30a1}'..='\u{30f6}').contains(&c) {
                char::from_u32(c as u32 - 0x60).unwrap()
            } else {
                c
            }
        })
        .collect()
}
// Python str.strip also recognizes the four ASCII information separators.
fn trim(value: &str) -> &str {
    value.trim_matches(|c: char| c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c))
}
fn has_kanji(value: &str) -> bool {
    value.chars().any(|c| {
        ('\u{3400}'..='\u{4dbf}').contains(&c)
            || ('\u{4e00}'..='\u{9fff}').contains(&c)
            || "々〆ヵヶ".contains(c)
    })
}
impl Analyzer {
    fn new(resources: &str) -> Result<Self> {
        let root = PathBuf::from(resources);
        let config = Config::new(
            Some(root.join("sudachi.json")),
            Some(root.clone()),
            Some(root.join("system.dic")),
        )
        .map_err(failure)?;
        let dictionary = Arc::new(JapaneseDictionary::from_cfg(&config).map_err(failure)?);
        Ok(Self {
            tokenizer: StatefulTokenizer::create(dictionary, false, Mode::C),
            dictionary_readings: HashMap::new(),
        })
    }
    fn tokenize(&mut self, text: &str) -> Result<MorphemeList<Arc<JapaneseDictionary>>> {
        self.tokenizer.reset().push_str(text);
        self.tokenizer.do_tokenize().map_err(failure)?;
        let mut result = MorphemeList::empty(self.tokenizer.dict_clone());
        result
            .collect_results(&mut self.tokenizer)
            .map_err(failure)?;
        Ok(result)
    }
    fn analyze(&mut self, texts: &[String], deadline: Instant) -> Result<Value> {
        let started = Instant::now();
        let mut pronunciations = Map::new();
        let mut lexicon = Map::new();
        let mut tokens = Vec::new();
        let mut tokenize_ms = 0.0;
        let mut dictionary_ms = 0.0;
        let mut first_ms = None;
        for (text_index, text) in texts.iter().enumerate() {
            check_deadline(deadline)?;
            if text.is_empty() {
                continue;
            }
            let before = Instant::now();
            let morphemes = self.tokenize(text)?;
            let elapsed = before.elapsed().as_secs_f64() * 1000.0;
            tokenize_ms += elapsed;
            first_ms.get_or_insert(elapsed);
            for morpheme in morphemes.iter() {
                check_deadline(deadline)?;
                let raw_surface = morpheme.surface();
                let surface = trim(&raw_surface);
                if surface.is_empty() {
                    continue;
                }
                let raw_reading = trim(morpheme.reading_form());
                let reading = if raw_reading == "*" {
                    String::new()
                } else {
                    hiragana(raw_reading)
                };
                let raw_dictionary = trim(morpheme.dictionary_form());
                let dictionary_form = if raw_dictionary.is_empty() || raw_dictionary == "*" {
                    surface
                } else {
                    raw_dictionary
                };
                let raw_normalized = trim(morpheme.normalized_form());
                let normalized = if raw_normalized.is_empty() {
                    dictionary_form
                } else {
                    raw_normalized
                };
                let dictionary_reading = if dictionary_form == surface {
                    reading.clone()
                } else if let Some(value) = self.dictionary_readings.get(dictionary_form) {
                    value.clone()
                } else {
                    let before = Instant::now();
                    let parts = self.tokenize(dictionary_form)?;
                    dictionary_ms += before.elapsed().as_secs_f64() * 1000.0;
                    let raw = parts
                        .iter()
                        .map(|m| trim(m.reading_form()).to_owned())
                        .filter(|s| !s.is_empty() && s != "*")
                        .collect::<String>();
                    let mut value = hiragana(&raw);
                    if value.is_empty() {
                        value = reading.clone();
                    }
                    self.dictionary_readings
                        .insert(dictionary_form.to_owned(), value.clone());
                    value
                };
                let pos: Vec<&str> = morpheme
                    .part_of_speech()
                    .iter()
                    .map(String::as_str)
                    .filter(|s| !s.is_empty() && *s != "*")
                    .collect();
                let lexeme = json!({"surface": surface, "dictionaryForm": dictionary_form, "normalizedForm": normalized, "reading": reading, "dictionaryReading": dictionary_reading, "partsOfSpeech": pos});
                lexicon
                    .entry(surface.to_owned())
                    .or_insert_with(|| lexeme.clone());
                if has_kanji(surface) && !reading.is_empty() {
                    pronunciations
                        .entry(surface.to_owned())
                        .or_insert(json!(reading));
                }
                let mut token = lexeme;
                token["textIndex"] = json!(text_index);
                // SudachiPy exposes Unicode codepoint offsets, not UTF-8 bytes
                // or JS UTF-16 offsets. Preserve that existing public contract.
                token["begin"] = json!(morpheme.begin_c());
                token["end"] = json!(morpheme.end_c());
                tokens.push(token);
            }
        }
        let output = json!({"pronunciationMap": pronunciations, "lexicon": lexicon, "tokens": tokens,
            "timings": {"worker": true, "scriptStartupMs": 0, "inputParseMs": 0, "sudachiImportMs": 0,
                "dictionaryInitializationMs": 0, "firstTokenizeMs": first_ms, "tokenizeMs": tokenize_ms,
                "dictionaryReadingTokenizeMs": dictionary_ms, "jsonSerializationMs": 0,
                "totalAnalysisMs": started.elapsed().as_secs_f64() * 1000.0,
                "textCount": texts.len(), "characterCount": texts.iter().map(|s| s.chars().count()).sum::<usize>(),
                "tokenCount": tokens.len(), "dictionaryReadingCacheSize": self.dictionary_readings.len()}});
        // Count JSON-equivalent payload bytes without serializing a transport
        // message or allocating a second result buffer.
        serde_json::to_writer(SizeLimit(0), &output).map_err(failure)?;
        check_deadline(deadline)?;
        Ok(output)
    }
}

fn check_deadline(deadline: Instant) -> Result<()> {
    if Instant::now() > deadline {
        Err(Error::from_reason("Sudachi annotation timed out"))
    } else {
        Ok(())
    }
}
struct SizeLimit(usize);
impl std::io::Write for SizeLimit {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0 += bytes.len();
        if self.0 > 20 * 1024 * 1024 {
            return Err(std::io::Error::other("Sudachi output exceeded the limit"));
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
pub struct AnalyzeTask {
    texts: Vec<String>,
    resources: String,
    deadline: Instant,
}
#[napi]
impl Task for AnalyzeTask {
    type Output = Value;
    type JsValue = JsUnknown;
    fn compute(&mut self) -> Result<Value> {
        check_deadline(self.deadline)?;
        let mut slot = ANALYZER.lock().map_err(failure)?;
        if slot.is_none() {
            *slot = Some(Analyzer::new(&self.resources)?);
        }
        slot.as_mut().unwrap().analyze(&self.texts, self.deadline)
    }
    fn resolve(&mut self, env: Env, output: Value) -> Result<JsUnknown> {
        env.to_js_value(&output)
    }
}
#[napi]
pub fn analyze(texts: Vec<String>, resources: String) -> AsyncTask<AnalyzeTask> {
    let count: usize = texts.iter().map(|s| s.encode_utf16().count()).sum();
    let timeout_ms = (10_000usize.saturating_add(count.saturating_mul(2))).clamp(15_000, 60_000);
    AsyncTask::new(AnalyzeTask {
        texts,
        resources,
        deadline: Instant::now() + Duration::from_millis(timeout_ms as u64),
    })
}
