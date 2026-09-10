import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { evaluateSelectedOption } from "../modules/practice/domain/evaluate-attempt.ts";
import { summarizePracticeSubmission } from "../modules/practice/domain/submission-summary.ts";
import { calculateJlptScore } from "../modules/practice/domain/jlpt-scoring.ts";
import {
  buildCompletedQuestionText,
  buildCompletedSortingText,
  normalizeSortingPrompt,
  parseSortingPrompt,
  normalizeQuestionDisplayText,
  normalizeQuestionTextFields,
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from "../modules/practice/domain/question-text.ts";
import {
  annotateJapaneseText,
  escapeHtml,
} from "../utils/language/japaneseRuby.ts";
import {
  extractSentenceAtOffset,
  extractSentenceContainingSelection,
  splitSentenceSegments,
} from "../utils/text/sentenceContext.ts";
import {
  renderUnderlineMarkup,
  toggleUnderlineSelection,
} from "../utils/text/underlineMarkup.ts";
import {
  buildAudioDialogueSourceId,
  findAudioDialogueTiming,
  parseAudioDialogueSourceId,
} from "../utils/audioDialogue/sourceId.ts";
import { createTrustedMarkupSlots } from "../components/exam/question-renderer/trustedMarkup.ts";
import {
  formatJlptListeningTitle,
  parseJlptListeningIdentity,
} from "../utils/listening/jlptIdentity.ts";
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from "../utils/questions/optionLabels.ts";
import { getQuestionTypeLabel } from "../utils/questions/typeLabels.ts";
import {
  getPaperReadingMaterialTitle,
  getPaperQuestionSectionNumber,
  getReadingQuestionSection,
  isReadingGrammarQuestion,
} from "../modules/questions/domain/paper-editor.ts";
import { isReadingTitleDerivedFromContent } from "../lib/repositories/materials/material-title.ts";
import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from "../features/reading/domain/article-blocks.ts";
import {
  ARTICLE_TABLE_TEMPLATE,
  insertArticleFootnote,
  insertArticleText,
} from "../features/reading/domain/article-editing.ts";
import { parseArticleFootnotes } from "../features/reading/domain/article-footnotes.ts";
import {
  prepareEbookChapters,
  removeRepeatedEbookHeadings,
} from "../lib/ebooks/chapter-display.ts";
import { parsePastedBookText } from "../lib/ebooks/pasted-book.ts";
import { parseMultiQuizText } from "../modules/import/domain/quiz-text-parser.ts";
import { buildArticleQuestionsFromQuickInput } from "../modules/import/domain/article-question-builder.ts";
import { normalizePaperAttributes } from "../features/practice/domain/paper-attributes.ts";
import { parseListeningOptionText } from "../modules/import/domain/listening-option-parser.ts";
import { selectListeningQuestionEntriesForFile } from "../modules/import/domain/listening-batch-assignments.ts";
import {
  isPathInsideRoot,
  resolvePathInsideRoot,
} from "../utils/files/path.ts";
import {
  parseInput,
  readBoolean,
  readFiniteNumber,
  readJsonRecord,
  readString,
} from "../lib/validation/schema.ts";
import { z } from "zod";
import { actionFailure, actionSuccess } from "../lib/actions/result.ts";
import { DomainError } from "../lib/errors/domain-error.ts";
import {
  getMaterialCollectionTypeError,
  isCollectionTypeAllowedForMaterial,
} from "../modules/import/collection-policy.ts";
import {
  decodeMaterialPayload,
  materialPayloadEnvelopeSchema,
} from "../lib/codecs/material-payload.ts";
import {
  decodeQuestionContent,
  encodeQuestionContent,
} from "../lib/codecs/question-content.ts";
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from "../utils/questions/editorOptions.ts";
import { reorderExamOptionsForSession } from "../lib/repositories/exam/exam-option-order.ts";
import { updateDialogueTextAtIndex } from "../features/listening/domain/dialogue-editor.ts";
import { buildCollectionAudioFolder } from "../modules/import/audio/domain.ts";
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
  buildSurfaceVariantMapForText,
  buildJapaneseVocabularySearchTerms,
  containsJapaneseVocabularyMatch,
  detectJapaneseInflection,
  resolveJapaneseTargetSurface,
} from "../utils/vocabulary/japaneseInflection.ts";
import {
  buildVocabularyCanonicalKeys,
  expandVocabularyHeadwordMatchVariants,
  splitVocabularyHeadwordVariants,
} from "../utils/vocabulary/vocabularyCanonical.ts";
import {
  extractVocabularyPronunciationVariants,
  getVocabularyDisplayPronunciations,
  getVocabularyMatchVariants,
  selectVocabularyDisplayPronunciation,
} from "../utils/text/pronunciation.ts";
import { formatVocabularySentenceSource } from "../utils/vocabulary/sourceDisplay.ts";
import { normalizeVocabularySentenceTextKey } from "../utils/vocabulary/sentenceQuality.ts";
import { splitLineStringList } from "../utils/text/jsonList.ts";
import { hasVocabularyMeaning } from "../utils/vocabulary/vocabularyMeaning.ts";
import {
  buildPracticeQuestionGroups,
  findPracticeQuestionGroupIndex,
} from "../modules/practice/domain/question-groups.ts";
import { groupQuestionsByMaterial } from "../modules/practice/domain/material-question-groups.ts";
import { buildAnswerCardSections } from "../modules/practice/domain/answer-card-sections.ts";
import {
  buildPaperPartQuestionNumbers,
  renderAnswerPaperHtml,
  renderQuestionPaperHtml,
  renderTranscriptPaperHtml,
} from "../features/practice/export/paper-export-html.ts";

const ROOT = process.cwd();

const PAPER_EXPORT_FIXTURE = {
  id: "paper-1",
  title: "N1 <模擬試験>",
  description: "A4 印刷用",
  language: "ja",
  level: "N1",
  questionCount: 1,
  generatedAt: new Date("2026-08-15T00:00:00Z"),
  audioFiles: [],
  warnings: [],
  sections: [
    {
      key: "TEXT_VOCAB:1",
      materialKey: "TEXT_VOCAB",
      materialTitle: "文字・語彙",
      sectionNumber: 1,
      sectionTitle: "漢字読み",
      heading: "問題1｜漢字読み",
      materials: [
        {
          id: "material-1",
          type: "VOCAB_GRAMMAR",
          title: "語彙",
          passageText: "",
          audioPath: "",
          audioAbsolutePath: null,
          audioExportName: null,
          transcript: "",
          dialogues: [],
          questions: [
            {
              id: "question-1",
              materialId: "material-1",
              materialType: "VOCAB_GRAMMAR",
              questionType: "PRONUNCIATION",
              targetWord: "",
              prompt: "++輸出++を確認する。",
              context: "",
              analysis: "仅答案册可见的解析",
              imageDataUrl: null,
              options: [
                { id: "a", text: "ゆしゅつ", imageDataUrl: null },
                { id: "b", text: "ゆそう", imageDataUrl: null },
              ],
              answerIds: ["a"],
              optionLabelFormat: "numeric",
              customOptionLabels: [],
              sortingOrder: [],
              sourceOrder: 0,
              localNumber: 1,
            },
          ],
        },
      ],
    },
  ],
};

test("paper export keeps answers out of the question document", () => {
  const questionHtml = renderQuestionPaperHtml(PAPER_EXPORT_FIXTURE);
  const answerHtml = renderAnswerPaperHtml(PAPER_EXPORT_FIXTURE);

  assert.match(questionHtml, /QUESTION PAPER/);
  assert.match(questionHtml, /N1 &lt;模擬試験&gt;/);
  assert.match(questionHtml, /class="underline">輸出<\/span>/);
  assert.doesNotMatch(questionHtml, /仅答案册可见的解析/);
  assert.match(answerHtml, /1（ゆしゅつ）/);
  assert.match(answerHtml, /仅答案册可见的解析/);
});

test("paper export creates a useful no-listening transcript document", () => {
  const transcriptHtml = renderTranscriptPaperHtml(PAPER_EXPORT_FIXTURE);
  assert.match(transcriptHtml, /本试卷不包含听力材料/);
});

test("paper export underlines JLPT target words in prompts and usage options", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const question = fixture.sections[0].materials[0].questions[0];
  question.targetWord = "着手";
  question.prompt = "まだ着手していない仕事がある。";
  question.questionType = "SYNONYM_REPLACEMENT";
  question.options[0].text = "着手する";

  const promptHtml = renderQuestionPaperHtml(fixture);
  assert.match(promptHtml, /class="underline">着手<\/span>していない/);

  question.questionType = "WORD_DISTINCTION";
  const usageHtml = renderQuestionPaperHtml(fixture);
  assert.match(usageHtml, /class="underline">着手<\/span>する/);

  question.targetWord = "";
  question.prompt = "着手";
  const fallbackUsageHtml = renderQuestionPaperHtml(fixture);
  assert.match(fallbackUsageHtml, /class="underline">着手<\/span>する/);

  question.prompt = "程遠い";
  question.options = [
    { id: "a", text: "目標には程遠い。", imageDataUrl: null },
    { id: "b", text: "友人とは程遠くなっている。", imageDataUrl: null },
  ];
  const inflectedUsageHtml = renderQuestionPaperHtml(fixture);
  assert.match(inflectedUsageHtml, /class="underline">程遠い<\/span>/);
  assert.match(inflectedUsageHtml, /class="underline">程遠く<\/span>なっている/);
});

test("practice options underline inflected Japanese target words", () => {
  assert.equal(resolveJapaneseTargetSurface("目標には程遠い。", "程遠い"), "程遠い");
  assert.equal(
    resolveJapaneseTargetSurface("友人とは程遠くなっている。", "程遠い"),
    "程遠く",
  );
  assert.equal(
    resolveJapaneseTargetSurface(
      "卒業後連絡がかすれていた友人と、最近また会うようになった。",
      "かすれる",
    ),
    "かすれて",
  );
  assert.equal(
    resolveJapaneseTargetSurface(
      "うちの子は今ではゲームへの関心がかすれ、ほとんどしなくなった。",
      "かすれる",
    ),
    "かすれ",
  );
  assert.equal(
    resolveJapaneseTargetSurface("まったく関係のない選択肢。", "かすれる"),
    "かすれる",
  );
});

test("paper export keeps Japanese non-listening continuous and resets each listening problem", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const nonListeningQuestion =
    fixture.sections[0].materials[0].questions[0];
  nonListeningQuestion.id = "non-listening-1";
  const secondNonListeningQuestion = structuredClone(nonListeningQuestion);
  secondNonListeningQuestion.id = "non-listening-2";
  fixture.sections[0].materials[0].questions.push(secondNonListeningQuestion);

  const listeningSection = structuredClone(fixture.sections[0]);
  listeningSection.key = "LISTENING:1";
  listeningSection.materialKey = "LISTENING";
  listeningSection.sectionNumber = 1;
  listeningSection.materials[0].id = "listening-material";
  listeningSection.materials[0].questions = listeningSection.materials[0].questions.map(
    (question, index) => ({
      ...question,
      id: `listening-${index + 1}`,
      materialId: "listening-material",
      materialType: "LISTENING",
    }),
  );
  fixture.sections.push(listeningSection);
  const secondListeningSection = structuredClone(listeningSection);
  secondListeningSection.key = "LISTENING:2";
  secondListeningSection.sectionNumber = 2;
  secondListeningSection.materials[0].questions = [
    {
      ...secondListeningSection.materials[0].questions[0],
      id: "listening-problem-2-1",
    },
  ];
  fixture.sections.push(secondListeningSection);

  const numbers = buildPaperPartQuestionNumbers(fixture);
  assert.equal(numbers.get("non-listening-1"), 1);
  assert.equal(numbers.get("non-listening-2"), 2);
  assert.equal(numbers.get("listening-1"), 1);
  assert.equal(numbers.get("listening-2"), 2);
  assert.equal(numbers.get("listening-problem-2-1"), 1);
});

test("paper export numbers English listening and reading independently", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  fixture.language = "en";
  const readingQuestion = fixture.sections[0].materials[0].questions[0];
  readingQuestion.id = "reading-1";
  const secondReadingQuestion = structuredClone(readingQuestion);
  secondReadingQuestion.id = "reading-2";
  fixture.sections[0].materials[0].questions.push(secondReadingQuestion);
  const listeningSection = structuredClone(fixture.sections[0]);
  listeningSection.key = "LISTENING:1";
  listeningSection.materialKey = "LISTENING";
  listeningSection.materials[0].questions = [
    { ...readingQuestion, id: "listening-1" },
    { ...readingQuestion, id: "listening-2" },
  ];
  fixture.sections.push(listeningSection);

  const numbers = buildPaperPartQuestionNumbers(fixture);
  assert.deepEqual(
    ["reading-1", "reading-2", "listening-1", "listening-2"].map(id =>
      numbers.get(id),
    ),
    [1, 2, 1, 2],
  );
});

test("paper export positions the sorting star above its answer line", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const question = fixture.sections[0].materials[0].questions[0];
  question.questionType = "SORTING";
  question.prompt = "前半 ＿＿＿ ★＿＿＿ ＿＿＿ ＿＿＿ 後半";
  question.targetWord = "";

  const html = renderQuestionPaperHtml(fixture);
  assert.match(html, /class="sort-slot has-star"><span class="sort-star">★/);
  assert.doesNotMatch(html, /★＿＿＿/);
});

test("paper export hides completed cloze prompts but keeps their options", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const material = fixture.sections[0].materials[0];
  const question = material.questions[0];
  material.type = "READING";
  material.passageText = "本文[1]本文";
  question.materialType = "READING";
  question.questionType = "FILL_BLANK";
  question.prompt = "COMPLETED_ANSWER_SENTENCE";
  question.targetWord = "";
  question.options[0].text = "選択肢A";

  const html = renderQuestionPaperHtml(fixture);
  assert.doesNotMatch(html, /COMPLETED_ANSWER_SENTENCE/);
  assert.match(html, /選択肢A/);
});

test("paper export renders markdown information tables as real tables", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const question = fixture.sections[0].materials[0].questions[0];
  question.questionType = "READING_INFORMATION";
  question.targetWord = "";
  question.prompt = [
    "講座を選びなさい。",
    "| 団体 | 回数 |",
    "| --- | --- |",
    "| 茶道会 | 4回 |",
  ].join("\n");
  question.context = question.prompt.replace("4回", "5回");

  const html = renderQuestionPaperHtml(fixture);
  assert.match(html, /class="paper-table"/);
  assert.match(html, /<th>団体<\/th>/);
  assert.match(html, /<th>茶道会<\/th>/);
  assert.match(html, /<td>5回<\/td>/);
  assert.doesNotMatch(html, /<td>4回<\/td>/);
  assert.equal((html.match(/class="paper-table"/g) || []).length, 1);
});

test("Japanese listening problem three prints sequence numbers only", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const section = fixture.sections[0];
  const material = section.materials[0];
  const question = material.questions[0];
  section.materialKey = "LISTENING";
  section.sectionNumber = 3;
  section.heading = "問題3｜概要理解";
  material.type = "LISTENING";
  material.title = "INTERNAL_AUDIO_TITLE";
  question.materialType = "LISTENING";
  question.questionType = "LISTENING";
  question.targetWord = "";
  question.options[0].text = "PLACEHOLDER_OPTION";

  const html = renderQuestionPaperHtml(fixture);
  assert.match(html, /question sequence-only/);
  assert.doesNotMatch(html, /PLACEHOLDER_OPTION/);
  assert.doesNotMatch(html, /INTERNAL_AUDIO_TITLE/);
});

test("Japanese listening problem four prints sequence numbers only", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const section = fixture.sections[0];
  const material = section.materials[0];
  const question = material.questions[0];
  section.materialKey = "LISTENING";
  section.sectionNumber = 4;
  section.heading = "問題4｜即時応答";
  material.type = "LISTENING";
  material.title = "INTERNAL_AUDIO_TITLE";
  question.materialType = "LISTENING";
  question.questionType = "LISTENING";
  question.targetWord = "";
  question.options[0].text = "PLACEHOLDER_OPTION";

  const html = renderQuestionPaperHtml(fixture);
  assert.match(html, /question sequence-only/);
  assert.doesNotMatch(html, /PLACEHOLDER_OPTION/);
  assert.doesNotMatch(html, /INTERNAL_AUDIO_TITLE/);
});

test("answer PDF lists every answer first and only repeats analyzed questions", () => {
  const fixture = structuredClone(PAPER_EXPORT_FIXTURE);
  const first = fixture.sections[0].materials[0].questions[0];
  first.analysis = "有内容的解析";
  const second = structuredClone(first);
  second.id = "question-2";
  second.localNumber = 2;
  second.analysis = "";
  second.prompt = "无解析题目不应重复的题干";
  fixture.sections[0].materials[0].questions.push(second);

  const html = renderAnswerPaperHtml(fixture);
  assert.match(html, /<tr><th>1<\/th><th>2<\/th><\/tr>/);
  assert.match(html, /<tr><td>1<\/td><td>1<\/td><\/tr>/);
  assert.doesNotMatch(html, /\(1\)|（1）/);
  assert.equal((html.match(/class="answer-item"/g) || []).length, 1);
  assert.match(html, /有内容的解析/);
  assert.doesNotMatch(html, /无解析题目不应重复的题干/);
});

test("practice answer card keeps Japanese non-listening numbers continuous", () => {
  const sections = buildAnswerCardSections([
    { id: "v1", questionType: "PRONUNCIATION" },
    { id: "v2", questionType: "PRONUNCIATION" },
    { id: "g1", questionType: "SORTING" },
    { id: "r1", questionType: "READING_SHORT", passageId: "p1" },
    {
      id: "l1",
      questionType: "LISTENING_COMPREHENSION",
      lessonId: "a1",
      lesson: { sectionNumber: 4, sectionTitle: "即時応答" },
    },
  ], "ja");

  assert.deepEqual(
    sections.map((section) => ({
      key: section.key,
      title: section.materialTitle,
      problem: section.sectionNumber,
      localNumbers: section.items.map((item) => item.localNumber),
    })),
    [
      {
        key: "TEXT_VOCAB:1",
        title: "文字・語彙",
        problem: 1,
        localNumbers: [1, 2],
      },
      {
        key: "GRAMMAR:6",
        title: "文法",
        problem: 6,
        localNumbers: [3],
      },
      {
        key: "READING:8",
        title: "読解",
        problem: 8,
        localNumbers: [4],
      },
      {
        key: "LISTENING:4",
        title: "聴解",
        problem: 4,
        localNumbers: [1],
      },
    ],
  );
});

test("English listening answer cards use TOEIC parts instead of JLPT problems", () => {
  const sections = buildAnswerCardSections(
    [
      {
        id: "l1",
        questionType: "LISTENING",
        lessonId: "audio-1",
        lesson: {
          sectionNumber: 1,
          sectionTitle: "Part 1 · Photographs",
        },
      },
      {
        id: "l2",
        questionType: "TOEIC_QUESTION_RESPONSE",
        lessonId: "audio-2",
        lesson: {
          sectionNumber: 2,
          sectionTitle: "Part 2 · Question-Response",
        },
      },
      { id: "r1", questionType: "TOEIC_INCOMPLETE_SENTENCES" },
      {
        id: "r2",
        questionType: "TOEIC_TEXT_COMPLETION",
        passageId: "passage-1",
      },
    ],
    "en",
  );

  assert.deepEqual(
    sections.map((section) => ({
      title: section.materialTitle,
      section: section.sectionTitle,
      numbers: section.items.map(item => item.localNumber),
    })),
    [
      { title: "Reading", section: "Part 5 · Incomplete Sentences", numbers: [1] },
      { title: "Reading", section: "Part 6 · Text Completion", numbers: [2] },
      { title: "Listening", section: "Part 1 · Photographs", numbers: [1] },
      { title: "Listening", section: "Part 2 · Question-Response", numbers: [2] },
    ],
  );
});

test("questions sharing one listening material render as one practice page", () => {
  const groups = buildPracticeQuestionGroups([
    { id: "q1", lessonId: "audio-1" },
    { id: "q2", lessonId: "audio-2" },
    { id: "q3", lessonId: "audio-2" },
    { id: "q4", lessonId: null },
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      startIndex: group.startIndex,
      endIndex: group.endIndex,
      ids: group.questions.map((question) => question.id),
    })),
    [
      {
        key: "listening:audio-1",
        startIndex: 0,
        endIndex: 0,
        ids: ["q1"],
      },
      {
        key: "listening:audio-2",
        startIndex: 1,
        endIndex: 2,
        ids: ["q2", "q3"],
      },
      {
        key: "question:q4",
        startIndex: 3,
        endIndex: 3,
        ids: ["q4"],
      },
    ],
  );
  assert.equal(findPracticeQuestionGroupIndex(groups, 1), 1);
  assert.equal(findPracticeQuestionGroupIndex(groups, 2), 1);
});

test("paper overview preserves material and subquestion hierarchy", () => {
  const groups = groupQuestionsByMaterial(
    [
      { id: "q1", materialId: "article-1" },
      { id: "q2", materialId: "article-2" },
      { id: "q3", materialId: "article-2" },
      { id: "q4", materialId: "article-3" },
    ],
    (question) => question.materialId,
  );

  assert.deepEqual(
    groups.map((group) => ({
      materialId: group.materialId,
      questionIds: group.questions.map((question) => question.id),
    })),
    [
      { materialId: "article-1", questionIds: ["q1"] },
      { materialId: "article-2", questionIds: ["q2", "q3"] },
      { materialId: "article-3", questionIds: ["q4"] },
    ],
  );
});

test("Japanese inflection evidence excludes particles and restores suru lemmas", () => {
  assert.deepEqual(
    buildSurfaceAliasMapForText("問題の核心を突いている。", ["突く"]),
    {
      "突いて": "突く",
      "突いている": "突く",
    },
  );
  assert.equal(
    detectJapaneseInflection({
      word: "野鳥",
      sentenceText: "貴重な野鳥にも巡り会える。",
      partsOfSpeech: ["名詞"],
    }),
    null,
  );
  assert.deepEqual(
    detectJapaneseInflection({
      word: "募集",
      sentenceText: "アルバイトを募集していたので、応募した。",
      partsOfSpeech: ["動詞"],
    }),
    { surface: "募集していた", lemma: "募集する" },
  );
  assert.deepEqual(
    detectJapaneseInflection({
      word: "高い",
      sentenceText: "昨日は値段が高かった。",
      partsOfSpeech: ["形容詞"],
    }),
    { surface: "高かった", lemma: "高い" },
  );
});

test("compound vocabulary headwords match and pronounce each displayed variant", () => {
  const headword = "立つ / 発つ";
  const text = "東京を発って、壇上に立った。";

  assert.deepEqual(splitVocabularyHeadwordVariants(headword), ["立つ", "発つ"]);
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("立つ"));
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("発つ"));
  assert.deepEqual(buildSurfaceAliasMapForText(text, [headword]), {
    "立った": headword,
    "発って": headword,
  });
  assert.deepEqual(buildSurfaceVariantMapForText(text, [headword]), {
    "立った": "立つ",
    "発って": "発つ",
  });
  assert.deepEqual(buildPronunciationMapForText(text, { [headword]: "たつ" }), {
    "立った": "たった",
    "発って": "たって",
  });

  const forms = buildJapaneseVocabularySearchTerms(headword, ["動詞"]);
  assert.ok(forms.includes("立って"));
  assert.ok(forms.includes("発って"));
  assert.deepEqual(
    buildSurfaceAliasMapForText("戦後の夏に旅立った。", [headword]),
    {},
  );
});

test("dictionary-style readings select the headword-aligned kana alias", () => {
  const raw = "わりに / わりと / わりあい(に / と) わりと";
  const pronunciation = selectVocabularyDisplayPronunciation("割と", [raw]);
  const matchVariants = getVocabularyMatchVariants("割と", [raw]);

  assert.equal(pronunciation, "わりと");
  assert.deepEqual(extractVocabularyPronunciationVariants(raw), [
    "わりに",
    "わりと",
    "わりあいに",
    "わりあいと",
  ]);
  assert.deepEqual(getVocabularyDisplayPronunciations("割と", [raw, "わりと"]), [
    "わりと",
  ]);
  assert.deepEqual(
    buildJapaneseVocabularySearchTerms("割と", ["副詞"], matchVariants),
    ["割と", "わりと", "わりに", "わりあいに", "わりあいと"],
  );
  assert.equal(
    containsJapaneseVocabularyMatch(
      "道が込んでいるかと思ったら、わりにすいていた。",
      "わりに",
      true,
    ),
    true,
  );
  assert.equal(
    containsJapaneseVocabularyMatch("そのかわりに手伝った。", "わりに", true),
    false,
  );
  assert.equal(
    containsJapaneseVocabularyMatch("ネコの口のまわりにある。", "わりに", true),
    false,
  );
  assert.equal(
    containsJapaneseVocabularyMatch("今日はわりと静かだ。", "わりと"),
    true,
  );
  assert.equal(
    selectVocabularyDisplayPronunciation("人間", ["にん|げん"]),
    "にん|げん",
  );
});

test("katakana headword alternatives keep the slash and match both variants", () => {
  const headword = "ダイヤ/ダイヤグラム";

  assert.deepEqual(splitVocabularyHeadwordVariants(headword), [
    "ダイヤ",
    "ダイヤグラム",
  ]);
  assert.deepEqual(expandVocabularyHeadwordMatchVariants(headword), [
    "ダイヤ",
    "ダイヤグラム",
  ]);
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("ダイヤ"));
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("ダイヤグラム"));
});

test("optional kana in vocabulary headwords matches every realized spelling", () => {
  const headword = "仕方(が)ない";
  const text = "仕方ないこともあれば、仕方がないこともある。";

  assert.deepEqual(expandVocabularyHeadwordMatchVariants(headword), [
    "仕方ない",
    "仕方がない",
  ]);
  assert.deepEqual(expandVocabularyHeadwordMatchVariants("仕方（が）ない"), [
    "仕方ない",
    "仕方がない",
  ]);
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("仕方ない"));
  assert.ok(buildVocabularyCanonicalKeys(headword).includes("仕方がない"));
  assert.deepEqual(buildJapaneseVocabularySearchTerms(headword, ["慣用句"]), [
    "仕方ない",
    "仕方がない",
  ]);
  assert.deepEqual(buildSurfaceAliasMapForText(text, [headword]), {
    "仕方ない": headword,
    "仕方がない": headword,
  });
  assert.deepEqual(buildSurfaceVariantMapForText(text, [headword]), {
    "仕方ない": "仕方ない",
    "仕方がない": "仕方がない",
  });
});

test("Unit03 na-adjectives match their attributive, predicative and adverbial forms", () => {
  const forms = buildJapaneseVocabularySearchTerms("深刻な", ["形容詞"]);

  for (const surface of [
    "深刻な",
    "深刻だ",
    "深刻です",
    "深刻で",
    "深刻に",
    "深刻だった",
    "深刻ではない",
  ]) {
    assert.ok(forms.includes(surface), `missing na-adjective form: ${surface}`);
  }
  const aliases = buildSurfaceAliasMapForText(
    "問題は深刻で、以前ほど気楽ではない。",
    ["深刻な", "気楽な"],
  );
  assert.equal(aliases["深刻で"], "深刻な");
  assert.equal(aliases["気楽ではない"], "気楽な");
  assert.ok(
    Object.hasOwn(
      buildSurfaceAliasMapForText("塩分を過剰に取る。", ["過剰な"]),
      "過剰に",
    ),
  );
});

test("vocabulary sentence search removes placeholders and expands Japanese inflections", () => {
  const forms = buildJapaneseVocabularySearchTerms("～忘れる", ["他動詞"]);

  assert.equal(forms[0], "忘れる");
  assert.ok(forms.includes("忘れた"));
  assert.ok(forms.includes("忘れて"));
  assert.ok(forms.includes("忘れない"));
  assert.ok(forms.includes("忘れられる"));
  assert.ok(forms.includes("忘れれば"));
  assert.ok(forms.every((form) => !form.includes("～") && !form.includes("~")));

  const godanForms = buildJapaneseVocabularySearchTerms("行く", ["動詞"]);
  assert.ok(godanForms.includes("行った"));
  assert.ok(godanForms.includes("行って"));
  assert.ok(!godanForms.includes("行いた"));

  assert.deepEqual(
    buildJapaneseVocabularySearchTerms("～を問わず", ["慣用句"]),
    ["を問わず"],
  );
});

test("listening vocabulary resolves sentence timing from stable and legacy ids", () => {
  const dialogues = [
    { id: 13, sequenceId: 13, stableId: "line-13", start: 48.22, end: 54.28 },
  ];
  assert.deepEqual(findAudioDialogueTiming(dialogues, "line-13"), {
    start: 48.22,
    end: 54.28,
  });
  assert.deepEqual(findAudioDialogueTiming(dialogues, "13"), {
    start: 48.22,
    end: 54.28,
  });
});

test("vocabulary sentence sources show parent materials instead of internal items", () => {
  assert.equal(
    formatVocabularySentenceSource({
      sourceType: "AUDIO_DIALOGUE",
      source: "听力：2025年7月N1",
      sourceUrl: "/listening/material-id",
    }),
    "听力 · 2025年7月N1",
  );
  assert.equal(
    formatVocabularySentenceSource({
      sourceType: "MEDIA_SUBTITLE_LINE",
      source: "影视：非自然死亡 · S1E3",
      sourceUrl: "/subtitles/material-id",
    }),
    "影视 · 非自然死亡 · S1E3",
  );
  assert.equal(formatVocabularySentenceSource({ source: "Unit1" }), "Unit1");
});

test("vocabulary sentence edits reuse the canonical sentence identity", () => {
  assert.equal(
    normalizeVocabularySentenceTextKey("  1. 道が込んでいる。\n"),
    normalizeVocabularySentenceTextKey("道が込んでいる。"),
  );
});

test("vocabulary meanings preserve punctuation and split only on lines", () => {
  assert.deepEqual(splitLineStringList("比较，格外\n相对来说"), [
    "比较，格外",
    "相对来说",
  ]);
});

test("listening timeline text edits preserve timing and uploaded metadata", () => {
  const dialogues = [
    { id: 1, text: "旧文本", start: 1.2, end: 2.8, note: "保留" },
    { id: 2, text: "下一句", start: 3, end: 4 },
  ];
  const updated = updateDialogueTextAtIndex(dialogues, 0, "新文本");

  assert.deepEqual(updated?.[0], {
    id: 1,
    text: "新文本",
    start: 1.2,
    end: 2.8,
    note: "保留",
  });
  assert.equal(updated?.[1], dialogues[1]);
  assert.equal(updateDialogueTextAtIndex(dialogues, 9, "不存在"), null);
});

test("audio uploads use stable type and collection folders", () => {
  assert.equal(
    buildCollectionAudioFolder({
      materialType: "LISTENING",
      collection: {
        id: "6ba8ddbb-9e5a-494c-9cf0-57dd7820a950",
        title: "2025年7月N1",
        collectionType: "PAPER",
        level: "N1",
      },
    }),
    "listening/jlpt/n1/2025-07",
  );
  assert.equal(
    buildCollectionAudioFolder({
      materialType: "SPEAKING",
      collection: {
        id: "chapter-12345678",
        title: "Unit 1",
        collectionType: "CHAPTER",
        parent: { id: "book-87654321", title: "跟读 教材" },
      },
    }),
    "shadowing/跟读-教材/Unit-1",
  );
});

test("audio-only listening options keep their authored order", () => {
  const options = [
    { id: "first", text: "", isCorrect: false },
    { id: "second", text: "　", isCorrect: true },
    { id: "third", text: "", isCorrect: false },
  ];
  assert.deepEqual(reorderExamOptionsForSession(options, "LISTENING"), options);
});

test("questions can explicitly keep their authored option order", () => {
  const options = [
    { id: "first", text: "一", isCorrect: false },
    { id: "second", text: "二", isCorrect: true },
    { id: "third", text: "三", isCorrect: false },
  ];

  assert.deepEqual(
    reorderExamOptionsForSession(options, "LISTENING", false),
    options,
  );
});

test("JLPT listening problem 3 keeps its authored option order", () => {
  const options = [
    { id: "first", text: "一", isCorrect: false },
    { id: "second", text: "二", isCorrect: true },
    { id: "third", text: "三", isCorrect: false },
  ];

  assert.deepEqual(
    reorderExamOptionsForSession(options, "LISTENING", true, 3),
    options,
  );
});

test("submitted practice restores authored option order for review", async () => {
  const repository = await readFile(
    path.join(ROOT, "lib/repositories/exam/index.ts"),
    "utf8",
  );
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );

  assert.match(repository, /authoredOptions: options/);
  assert.match(player, /session\.isSubmitted[\s\S]*restoreAuthoredOptionOrder/);
  assert.match(player, /question=\{displayedCurrentQuestion\}/);
  assert.match(player, /allQuestions=\{displayedAllQuestions\}/);
});

test("practice copy follows configured option labels and omits question numbers", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );

  assert.match(player, /formatOptionLabel\(/);
  assert.match(player, /question\.optionLabelFormat/);
  assert.match(player, /question\.customOptionLabels/);
  assert.equal(player.includes("sections.push(`第 ${questionIndex + 1} 题`)"), false);
});

test("practice review marks wrong questions in every question layout", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );
  const renderer = await readFile(
    path.join(ROOT, "components/exam/QuestionRenderer.tsx"),
    "utf8",
  );
  const standardQuestion = await readFile(
    path.join(ROOT, "components/exam/question-renderer/StandardQuestion.tsx"),
    "utf8",
  );

  assert.match(player, /wrongQuestionIds=\{reviewWrongQuestionIds\}/);
  assert.match(renderer, /itemIsWrong \? <WrongQuestionBadge/);
  assert.match(renderer, /isWrongReview=\{wrongQuestionIds\.includes\(question\.id\)\}/);
  assert.match(standardQuestion, /isWrongReview \? \(/);
});

test("submission review hides the global MimiFlow navigation", async () => {
  const navigation = await readFile(
    path.join(ROOT, "components/layout/StudyNavigation.tsx"),
    "utf8",
  );

  assert.match(
    navigation,
    /\/practice\\\/\[\^\/\]\+\\\/submissions\\\/\[\^\/\]\+\$/,
  );
});

test("submission review preserves its current question across refreshes", async () => {
  const page = await readFile(
    path.join(
      ROOT,
      "app/(study)/practice/[id]/submissions/[submissionId]/page.tsx",
    ),
    "utf8",
  );
  const reviewClient = await readFile(
    path.join(ROOT, "features/practice/ui/PracticeSubmissionReviewClient.tsx"),
    "utf8",
  );
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );

  assert.match(page, /initialQuestionId=\{qid\}/);
  assert.match(reviewClient, /requestedIndex >= 0 \? requestedIndex : firstWrongIndex/);
  assert.match(player, /url\.searchParams\.set\('qid', currentQuestionId\)/);
  assert.match(player, /window\.history\.replaceState/);
});

test("practice player separates mobile navigation and utility controls", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );

  assert.match(player, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(player, /md:hidden/);
  assert.match(player, /top-\[6\.5rem\]/);
});

test("saved question notes survive switching away and back without a refresh", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );
  const noteEditor = await readFile(
    path.join(ROOT, "components/exam/QuestionNoteEditor.tsx"),
    "utf8",
  );

  assert.match(player, /savedNotesByQuestionId\[question\.id\] \?\? question\.note/);
  assert.match(player, /onSaved=\{handleQuestionNoteSaved\}/);
  assert.match(noteEditor, /onSaved\?\.\(questionId, normalized\)/);
  assert.equal(noteEditor.includes("noteCacheRef"), false);
});

test("database fields keep audit timestamps and query indexes", async () => {
  const schema = await readFile(
    path.join(ROOT, "prisma/schema.prisma"),
    "utf8",
  );

  assert.match(schema, /model Vocabulary[\s\S]*updatedAt[\s\S]*@@index\(\[wordAudio\]\)/);
  assert.match(schema, /vocabulary_word_trgm_idx/);
  assert.match(schema, /vocabulary_meanings_trgm_idx/);
  assert.match(schema, /model VocabularySentence[\s\S]*@@index\(\[sourceType, sourceId\]\)[\s\S]*@@index\(\[audioFile\]\)/);
  assert.match(schema, /vocabulary_sentences_text_trgm_idx/);
  assert.match(schema, /questions_prompt_trgm_idx/);
  assert.match(schema, /questions_context_trgm_idx/);
  assert.match(schema, /model VocabularySentenceLink[\s\S]*@@index\(\[sentenceId\]\)/);
  assert.match(schema, /model CollectionMaterial[\s\S]*@@index\(\[collectionId, sortOrder\]\)/);
});

test("development server accepts interactive Cloudflare Tunnel requests", async () => {
  const nextConfig = await readFile(
    path.join(ROOT, "next.config.ts"),
    "utf8",
  );

  assert.match(nextConfig, /tunnelDevelopmentOrigins = \['\*\.trycloudflare\.com'\]/);
  assert.match(nextConfig, /allowedDevOrigins: developmentOrigins/);
  assert.match(nextConfig, /serverActions:[\s\S]*allowedOrigins:/);
  assert.match(nextConfig, /process\.env\.NODE_ENV === 'development'/);
});

test("question editors keep at least two options and preserve one correct answer", () => {
  const options = [
    { id: "a", isCorrect: false },
    { id: "b", isCorrect: true },
    { id: "c", isCorrect: false },
  ];
  const afterCorrectRemoval = removeQuestionOptionAt(options, 1);
  assert.equal(afterCorrectRemoval.length, MIN_QUESTION_OPTION_COUNT);
  assert.equal(afterCorrectRemoval[0].isCorrect, true);
  assert.deepEqual(
    removeQuestionOptionAt(afterCorrectRemoval, 0),
    afterCorrectRemoval,
  );
});

test("question text import accepts a variable option count", () => {
  const [draft] = parseMultiQuizText(
    "どちらが自然ですか。\n1. はい\n2. いいえ\n3. わかりません",
  );
  assert.deepEqual(
    draft.options.map((option) => option.text),
    ["はい", "いいえ", "わかりません"],
  );
  assert.equal(draft.contextSentence, "");
});

test("problem 7 import recognizes standalone bracketed blank numbers", () => {
  const articleContent = "この制度は、多くの人に利用されている[1]、課題も残っている。";
  const input = [
    "[1]",
    "1　ものの",
    "2　ために",
    "3　ことで",
    "4　ほどに",
  ].join("\n");
  const parsed = parseMultiQuizText(input);

  assert.equal(parsed[0].sourceSerial, 1);
  const result = buildArticleQuestionsFromQuickInput(input, articleContent, {
    questionType: "FILL_BLANK",
  });
  assert.equal(result.drafts.length, 1);
  assert.deepEqual(result.drafts[0], {
    questionType: "FILL_BLANK",
    prompt: "この制度は、多くの人に利用されているものの、課題も残っている。",
    contextSentence: articleContent,
    explanation: "",
    options: [
      { text: "ものの", isCorrect: true },
      { text: "ために", isCorrect: false },
      { text: "ことで", isCorrect: false },
      { text: "ほどに", isCorrect: false },
    ],
    __previewToken: "[1]",
    __previewDuplicateToken: false,
  });
  assert.deepEqual(result.previewRows[0], {
    serial: "1",
    placeholderToken: "[1]",
    generatedPrompt:
      "この制度は、多くの人に利用されているものの、課題も残っている。",
    questionType: "FILL_BLANK",
    correctAnswer: "ものの",
    isDuplicateToken: false,
  });
});

test("problem 7 import accepts numbered option groups with trailing slashes", () => {
  const input = [
    "42\\",
    "1　それによって\\",
    "2　そればかりでなく\\",
    "3　それどころか\\",
    "4　それにもかかわらず",
    "43\\",
    "1　承知していれば\\",
    "2　承知していて\\",
    "3　承知していたのか\\",
    "4　承知していたかのように",
    "44\\",
    "1　なら\\",
    "2　だって\\",
    "3　でさえ\\",
    "4　といっても",
  ].join("\n");
  const content = [
    "社会の仕組みは変化している[1]、考え方も変わってきた。",
    "事情を[2]、別の判断をしただろう。",
    "専門家[3]、すべてを知っているわけではない。",
  ].join("\n");
  const result = buildArticleQuestionsFromQuickInput(input, content, {
    questionType: "FILL_BLANK",
    matchFillBlanksByOrder: true,
  });

  assert.equal(result.drafts.length, 3);
  assert.deepEqual(
    result.previewRows.map((row) => ({
      serial: row.serial,
      token: row.placeholderToken,
      answer: row.correctAnswer,
    })),
    [
      { serial: "42", token: "[1]", answer: "それによって" },
      { serial: "43", token: "[2]", answer: "承知していれば" },
      { serial: "44", token: "[3]", answer: "なら" },
    ],
  );
  assert.deepEqual(
    result.drafts.map(question => question.options.map(option => option.text)),
    [
      ["それによって", "そればかりでなく", "それどころか", "それにもかかわらず"],
      ["承知していれば", "承知していて", "承知していたのか", "承知していたかのように"],
      ["なら", "だって", "でさえ", "といっても"],
    ],
  );
});

test("question text import accepts numbered bold JLPT pronunciation batches", () => {
  const parsed = parseMultiQuizText(
    [
      "1．佐藤選手がゴールを決めたとき、観客は**絶叫**した。\\",
      "　1　せっきょう\\",
      "　2　ぜっきょう\\",
      "　3　ぜっきゅう\\",
      "　4　せっきゅう",
      "2．**背後**から物音が聞こえた。\\",
      "　1　はいご\\",
      "　2　はいこう\\",
      "　3　せいご\\",
      "　4　せいこう",
    ].join("\n"),
  );

  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((question) => ({
      serial: question.sourceSerial,
      prompt: question.prompt,
      targetWord: question.targetWord,
      type: question.questionType,
      options: question.options.map((option) => option.text),
    })),
    [
      {
        serial: 1,
        prompt: "佐藤選手がゴールを決めたとき、観客は絶叫した。",
        targetWord: "絶叫",
        type: "PRONUNCIATION",
        options: ["せっきょう", "ぜっきょう", "ぜっきゅう", "せっきゅう"],
      },
      {
        serial: 2,
        prompt: "背後から物音が聞こえた。",
        targetWord: "背後",
        type: "PRONUNCIATION",
        options: ["はいご", "はいこう", "せいご", "せいこう"],
      },
    ],
  );
});

test("question text import separates consecutive numbered usage questions", () => {
  const parsed = parseMultiQuizText(
    [
      "20　保留",
      "1　デパートで子どもが迷子になったが、店員さんが保留してくれて無事だった。",
      "2　上司の意見を聞く必要があるため、先方への返答を保留した。",
      "3　顧客のデータは随時このパソコンに保留しています。",
      "4　帰ろうとしたら、保留された。",
      "21　調達",
      "1　必要な資金を銀行から調達した。",
      "2　資料を机に調達した。",
      "3　天気を調達した。",
      "4　時間を調達した。",
    ].join("\n"),
  );

  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((question) => ({
      type: question.questionType,
      prompt: question.prompt,
      optionCount: question.options.length,
    })),
    [
      { type: "WORD_DISTINCTION", prompt: "保留", optionCount: 4 },
      { type: "WORD_DISTINCTION", prompt: "調達", optionCount: 4 },
    ],
  );
});

test("numbered JLPT grammar questions 26 through 35 use problem 5", () => {
  const parsed = parseMultiQuizText(
    [
      "26　庭の草取りを始めたが、一日では（　　）終わりそうにない。",
      "1　とても",
      "2　とうてい",
      "3　よほど",
      "4　いっそう",
      "36　自分の主張を譲らない西山さん（　　）★（　　）も課長だ。",
      "1　にして",
      "2　さすがの",
      "3　困っている",
      "4　は",
    ].join("\n"),
  );

  assert.equal(parsed[0].questionType, "GRAMMAR_SELECTION");
  assert.equal(parsed[0].prompt.startsWith("庭の草取り"), true);
  assert.equal(parsed[1].questionType, "SORTING");
});

test("multiline problem 6 text keeps prompts and inline options together", () => {
  const parsed = parseMultiQuizText(
    [
      "36　高級車には憧れるが、私の給料では宝くじに ＿＿＿　★＿＿＿　＿＿＿　＿＿＿ 一生買えそうにない。",
      "1　しない　　2　でも　　3　当たり　　4　限り",
      "",
      "37　年中無休で営業していて、私たちの日常生活に欠かせない ＿＿＿　＿＿＿　★＿＿＿",
      "＿＿＿ 店舗も出てきているらしい。",
      "1　コンビニだが　　2　定休日を設ける",
      "3　近年の人手不足などにより　　4　存在である",
    ].join("\n"),
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].questionType, "SORTING");
  assert.equal(parsed[1].questionType, "SORTING");
  assert.equal(parsed[1].prompt.includes("店舗も出てきているらしい。"), true);
  assert.deepEqual(
    parsed[1].options.map((option) => option.text),
    [
      "コンビニだが",
      "定休日を設ける",
      "近年の人手不足などにより",
      "存在である",
    ],
  );
});

test("article questions accept standalone serials followed by option-only text", () => {
  const parsed = parseMultiQuizText(
    [
      "41",
      "1　しか　　2　なら　　3　すらも　　4　だけが",
      "",
      "42",
      "1　失敗するに越したことはありません",
      "2　失敗するわけにはいきません",
      "3　失敗するものなのです",
      "4　失敗するほどです",
      "",
      "43",
      "1　解くためには　　2　解かなければ　　3　解いたうえで　　4　解いたからこそ",
      "",
      "44",
      "1　逃避だと思うでしょう",
      "2　逃避でしょう",
      "3　逃避だと思いがちです",
      "4　逃避であるかのようです",
    ].join("\n"),
  );

  assert.equal(parsed.length, 4);
  assert.deepEqual(
    parsed.map((question) => ({
      serial: question.sourceSerial,
      prompt: question.prompt,
      optionCount: question.options.length,
    })),
    [41, 42, 43, 44].map((serial) => ({
      serial,
      prompt: "",
      optionCount: 4,
    })),
  );
  assert.deepEqual(
    parsed[0].options.map((option) => option.text),
    ["しか", "なら", "すらも", "だけが"],
  );
  assert.deepEqual(
    parsed[2].options.map((option) => option.text),
    ["解くためには", "解かなければ", "解いたうえで", "解いたからこそ"],
  );
});

test("Japanese listening options recognize tab-separated numbered lines", () => {
  assert.deepEqual(
    parseListeningOptionText(
      [
        "\t1\t日本の現状を分析する",
        "\t2\t日本人にインタビューする",
        "\t3\t自分の国のじょうきょうを調べる",
        "\t4\t自分ができることをリストにする 。",
      ].join("\n"),
    ),
    [
      "日本の現状を分析する",
      "日本人にインタビューする",
      "自分の国のじょうきょうを調べる",
      "自分ができることをリストにする。",
    ],
  );

  assert.deepEqual(
    parseListeningOptionText(
      [
        "1 山川デパートにアポイントメントを取る",
        "2 山川デパートに関する記録を読む",
        "3 山川デパートに送る資料を作る",
        "4 山川デパートにあいさつメールを送る",
      ].join("\n"),
    ),
    [
      "山川デパートにアポイントメントを取る",
      "山川デパートに関する記録を読む",
      "山川デパートに送る資料を作る",
      "山川デパートにあいさつメールを送る",
    ],
  );
});

test("batch listening questions stay assigned to their matching subtitle file", () => {
  const questions = ["a.ass", "b.ass"].map(sourceFileName => ({
    sourceFileName,
  }));

  assert.deepEqual(
    selectListeningQuestionEntriesForFile(questions, "b.ass", true).map(
      entry => entry.question.sourceFileName,
    ),
    ["b.ass"],
  );
  assert.equal(
    selectListeningQuestionEntriesForFile(questions, "a.ass", false).length,
    2,
  );
});

test("question context stores only text distinct from the prompt", () => {
  assert.deepEqual(
    normalizeQuestionTextFields("  同一段 文字  ", "同一段   文字"),
    { prompt: "同一段 文字", context: null },
  );
  assert.deepEqual(normalizeQuestionTextFields("完整句", "带有 [1] 的定位句"), {
    prompt: "完整句",
    context: "带有 [1] 的定位句",
  });
  assert.deepEqual(normalizeQuestionTextFields("", "纯听力语境"), {
    prompt: null,
    context: "纯听力语境",
  });
});

test("reading underline markers toggle safely and render as semantic emphasis", () => {
  const source = "これはとても惜しいことです。";
  const start = source.indexOf("とても惜しい");
  const underlined = toggleUnderlineSelection(
    source,
    start,
    start + "とても惜しい".length,
  );

  assert.equal(underlined.text, "これは++とても惜しい++ことです。");
  assert.match(
    renderUnderlineMarkup(underlined.text),
    /<span class="exam-text-underline">とても惜しい<\/span>/,
  );
  const restored = toggleUnderlineSelection(
    underlined.text,
    underlined.selectionStart,
    underlined.selectionEnd,
  );
  assert.equal(restored.text, source);
  assert.equal(
    renderUnderlineMarkup("&lt;script&gt;++安全++&lt;/script&gt;"),
    '&lt;script&gt;<span class="exam-text-underline">安全</span>&lt;/script&gt;',
  );
});

test("reading upload and editing share table insertion behavior", async () => {
  const inserted = insertArticleText("前文", ARTICLE_TABLE_TEMPLATE, 2, 2);
  assert.match(inserted.text, /^前文\n\n\| 团体名・实施内容/);
  assert.equal(inserted.cursor, inserted.text.length);

  const editor = await readFile(
    path.join(ROOT, "features/content/ui/EditArticleUI.tsx"),
    "utf8",
  );
  const importer = await readFile(
    path.join(ROOT, "modules/import/components/ArticleImportPanel.tsx"),
    "utf8",
  );
  assert.match(editor, /ARTICLE_TABLE_TEMPLATE/);
  assert.match(editor, /handleToggleUnderline/);
  assert.match(editor, /插入完形填空/);
  assert.match(importer, /ARTICLE_TABLE_TEMPLATE/);
});

test("reading upload and editing share footnote insertion and recognition", async () => {
  const source = "昨日、図書館へ行きました。";
  const start = source.indexOf("図書館");
  const inserted = insertArticleFootnote(
    source,
    start,
    start + "図書館".length,
  );

  assert.equal(inserted.changed, true);
  assert.equal(inserted.text, "昨日、図書館[^1]へ行きました。\n\n[^1]: 図書館：");
  assert.deepEqual(parseArticleFootnotes(inserted.text), {
    body: "昨日、図書館[^1]へ行きました。",
    footnotes: [
      { id: "1", label: "1", term: "", definition: "図書館：" },
    ],
  });

  const editor = await readFile(
    path.join(ROOT, "features/content/ui/EditArticleUI.tsx"),
    "utf8",
  );
  const importer = await readFile(
    path.join(ROOT, "modules/import/components/ArticleImportPanel.tsx"),
    "utf8",
  );
  assert.match(editor, /insertArticleFootnote/);
  assert.match(importer, /insertArticleFootnote/);
  assert.match(importer, /ArticleBodyPreview/);
  assert.match(importer, />\s*插入注解\s*</);
});

test("reading wordbook highlights do not render numbered vocabulary annotations", async () => {
  assert.equal(
    hasVocabularyMeaning({
      pronunciations: ["わた"],
      partsOfSpeech: ["名詞"],
      meanings: [],
    }),
    false,
  );
  assert.equal(
    hasVocabularyMeaning({
      pronunciations: ["わた"],
      partsOfSpeech: ["名詞"],
      meanings: ["  ", "棉花"],
    }),
    true,
  );

  const [reader, route, chart] = await Promise.all([
    readFile(
      path.join(ROOT, "features/reading/ui/ArticleReaderClient.tsx"),
      "utf8",
    ),
    readFile(
      path.join(ROOT, "app/api/reading/wordbook-distribution/route.ts"),
      "utf8",
    ),
    readFile(
      path.join(ROOT, "components/vocabulary/WordbookDistributionChart.tsx"),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(reader, /ARTICLE_ANNOTATION|activeChapterAnnotations|文章注释/);
  assert.match(reader, /buildSurfaceAliasMapForText/);
  assert.match(reader, /wordbookSurfaceToBaseWord/);
  assert.doesNotMatch(reader, /暂无注释/);
  assert.match(reader, /本文单词书分布/);
  assert.match(reader, /wordbookDistribution/);
  assert.match(route, /getPaperWordbookDistribution/);
  assert.match(chart, /未加入任何单词书/);
});

test("grammar sentences are derived from the blank prompt and correct option", () => {
  const options = [
    { id: "a", text: "連鎖" },
    { id: "b", text: "合併" },
  ];
  assert.equal(
    buildCompletedQuestionText(
      "二つの会社の（ ）によって、食品会社が誕生した。",
      options,
      "b",
    ),
    "二つの会社の合併によって、食品会社が誕生した。",
  );
  assert.equal(
    buildCompletedQuestionText("空格なし", options, ["b"]),
    "空格なし",
  );
});

test("self-contained vocabulary and grammar questions reject separate context", () => {
  assert.equal(supportsSeparateQuestionContext("GRAMMAR"), false);
  assert.equal(supportsSeparateQuestionContext("GRAMMAR_SELECTION"), false);
  assert.equal(supportsSeparateQuestionContext("SORTING"), false);
  assert.equal(supportsSeparateQuestionContext("PRONUNCIATION"), false);
  assert.equal(supportsSeparateQuestionContext("SYNONYM_REPLACEMENT"), false);
  assert.equal(supportsSeparateQuestionContext("WORD_DISTINCTION"), false);
  assert.equal(supportsSeparateQuestionContext("READING_COMPREHENSION"), true);
});

test("sorting sentences derive completed text from explicit option order", () => {
  assert.equal(
    buildCompletedSortingText(
      "A[[sort]][[sort:star]]C",
      [{ text: "1" }, { text: "2" }],
      [1, 0],
    ),
    "A21C",
  );
});

test("sorting prompts normalize parentheses and starred underlines into semantic slots", () => {
  const underlines = normalizeSortingPrompt("A＿＿＿ ★＿＿＿ ＿＿＿ ＿＿＿B");
  assert.equal(
    underlines,
    "A[[sort]] [[sort:star]] [[sort]] [[sort]]B",
  );
  assert.deepEqual(parseSortingPrompt(underlines), {
    prompt: underlines,
    segments: [
      { text: "A", slotIndex: null, isStar: false },
      { text: "[[sort]]", slotIndex: 0, isStar: false },
      { text: " ", slotIndex: null, isStar: false },
      { text: "[[sort:star]]", slotIndex: 1, isStar: true },
      { text: " ", slotIndex: null, isStar: false },
      { text: "[[sort]]", slotIndex: 2, isStar: false },
      { text: " ", slotIndex: null, isStar: false },
      { text: "[[sort]]", slotIndex: 3, isStar: false },
      { text: "B", slotIndex: null, isStar: false },
    ],
    slotCount: 4,
    starCount: 1,
    starIndex: 1,
  });

  const parentheses = parseSortingPrompt("A（　　）★（　　）（　　）B");
  assert.equal(parentheses.slotCount, 4);
  assert.equal(parentheses.starIndex, 1);
});

test("question text import treats an underline-wrapped star as one sorting slot", () => {
  const [draft] = parseMultiQuizText(
    [
      "36　昨日はとても寒く、積もり＿＿＿＿　＿＿★＿＿　＿＿＿＿　＿＿＿＿　ずっと雪が降っていた。",
      "1　が",
      "2　こそ",
      "3　しなかった",
      "4　午前中",
    ].join("\n"),
  );

  assert.equal(draft.questionType, "SORTING");
  assert.equal(
    draft.prompt,
    "昨日はとても寒く、積もり[[sort]]　[[sort:star]]　[[sort]]　[[sort]]　ずっと雪が降っていた。",
  );
  assert.deepEqual(parseSortingPrompt(draft.prompt), {
    prompt: draft.prompt,
    segments: [
      {
        text: "昨日はとても寒く、積もり",
        slotIndex: null,
        isStar: false,
      },
      { text: "[[sort]]", slotIndex: 0, isStar: false },
      { text: "　", slotIndex: null, isStar: false },
      { text: "[[sort:star]]", slotIndex: 1, isStar: true },
      { text: "　", slotIndex: null, isStar: false },
      { text: "[[sort]]", slotIndex: 2, isStar: false },
      { text: "　", slotIndex: null, isStar: false },
      { text: "[[sort]]", slotIndex: 3, isStar: false },
      {
        text: "　ずっと雪が降っていた。",
        slotIndex: null,
        isStar: false,
      },
    ],
    slotCount: 4,
    starCount: 1,
    starIndex: 1,
  });
});

test("usage questions derive their target word from the prompt", () => {
  assert.equal(usesExplicitQuestionTargetWord("WORD_DISTINCTION"), false);
  assert.equal(usesExplicitQuestionTargetWord("PRONUNCIATION"), true);
  assert.equal(usesExplicitQuestionTargetWord("SYNONYM_REPLACEMENT"), true);
});

test("untrusted values are normalized at data boundaries", () => {
  assert.deepEqual(readJsonRecord({ title: "ok" }), { title: "ok" });
  assert.deepEqual(readJsonRecord(["not", "a", "record"]), {});
  assert.equal(readString(12), "");
  assert.equal(readBoolean("true"), false);
  assert.equal(readFiniteNumber("12.5"), 12.5);
  assert.equal(readFiniteNumber("invalid", 3), 3);
});

test("material payloads are discriminated by material type", () => {
  const reading = decodeMaterialPayload("READING", {
    text: "本文",
    dialogues: [{ text: "wrong domain" }],
  });
  assert.equal(reading.text, "本文");
  assert.equal(reading.description, "");

  const listening = materialPayloadEnvelopeSchema.parse({
    type: "LISTENING",
    payload: { dialogues: [{ text: "会話", start: 1, end: 2 }] },
  });
  assert.equal(listening.payload.dialogues[0].text, "会話");
  assert.equal(listening.payload.tags, undefined);
});

test("question content stores extensions but never canonical question fields", () => {
  const encoded = encodeQuestionContent({
    prompt: "duplicate",
    contextSentence: "duplicate",
    explanation: "duplicate",
    targetWord: "語彙",
    optionLabelFormat: "numeric",
  });
  assert.deepEqual(encoded, {
    targetWord: "語彙",
    optionLabelFormat: "numeric",
    customOptionLabels: [],
  });
  assert.equal(decodeQuestionContent(encoded).targetWord, "語彙");
});

test("server actions share a serializable result and domain error contract", () => {
  assert.deepEqual(actionSuccess({ id: "saved" }, "已保存"), {
    success: true,
    message: "已保存",
    id: "saved",
  });
  assert.deepEqual(
    actionFailure(new DomainError("NOT_FOUND", "内容不存在。")),
    {
      success: false,
      message: "内容不存在。",
      error: { code: "NOT_FOUND", message: "内容不存在。" },
    },
  );
  assert.throws(
    () =>
      parseInput(
        z.object({ title: z.string().trim().min(1, "标题不能为空。") }),
        { title: "" },
      ),
    (error) =>
      error instanceof DomainError && error.code === "VALIDATION_ERROR",
  );
});

test("filesystem paths cannot escape the configured audio root", () => {
  const root = path.join(ROOT, "public", "audios");
  assert.equal(
    isPathInsideRoot(root, path.join(root, "uploads", "a.mp3")),
    true,
  );
  assert.equal(
    isPathInsideRoot(root, path.join(ROOT, "public", "audios-copy")),
    false,
  );
  assert.equal(resolvePathInsideRoot(root, "..", "private.mp3"), null);
});

test("audio library keeps uploads organized and folders hierarchical", async () => {
  const action = await readFile(
    path.join(ROOT, "features/audio/manage-actions.ts"),
    "utf8",
  );
  const ankiAction = await readFile(
    path.join(ROOT, "features/import/anki-actions.ts"),
    "utf8",
  );
  const page = await readFile(
    path.join(ROOT, "app/(admin)/manage/system/audio/page.tsx"),
    "utf8",
  );
  assert.match(action, /return `staging\/\$\{year\}-\$\{month\}`/);
  assert.match(action, /item\.folder\.startsWith\(`\$\{selectedFolder\}\//);
  assert.match(action, /walkAudioFolders/);
  assert.match(action, /replace\(\/\[\^\\p\{L\}\\p\{N\}/);
  assert.match(action, /prisma\.vocabulary\.updateMany/);
  assert.match(action, /wordAudio: nextPath/);
  assert.match(ankiAction, /buildVocabularyAudioFolder/);
  assert.match(page, /folderSummaries\.map/);
  assert.match(page, /上传到目录/);
  assert.match(page, /待整理/);
  assert.match(page, /linkedVocabularyAudio/);
});

test("material and collection compatibility is governed by one policy", () => {
  assert.equal(isCollectionTypeAllowedForMaterial("LISTENING", "PAPER"), true);
  assert.equal(
    isCollectionTypeAllowedForMaterial("LISTENING", "COURSE"),
    false,
  );
  assert.equal(isCollectionTypeAllowedForMaterial("SPEAKING", "PAPER"), false);
  assert.match(
    getMaterialCollectionTypeError("LISTENING", "COURSE"),
    /听力材料目前只能加入正式试卷/,
  );
});

test("paper reading excerpts are not presented as real article titles", () => {
  assert.equal(
    isReadingTitleDerivedFromContent(
      "宅配クリーニング「ピース」ご利用案内",
      "宅配クリーニング「ピース」ご利用案内\n\nインターネットで注文して…",
    ),
    true,
  );
  assert.equal(
    isReadingTitleDerivedFromContent(
      "日本の働き方を考える",
      "近年、日本では働き方についての議論が続いている。",
    ),
    false,
  );
});

test("plain-text article tables become semantic reading blocks", () => {
  const blocks = parseArticleContentBlocks([
    "■ クリーニング基本料金\n　コート　　　　2,500円　　　セーター　　　800円\n　ジャケット　　1,300円　　　ワイシャツ　　400円",
    "■ お届けまでの日数\n　　　　　　16時までのご発送　　16時以降のご発送\n特別会員　　　　3日後　　　　　　　4日後\n普通会員　　　　6日後　　　　　　　7日後",
  ]);

  assert.deepEqual(blocks[0], { type: "text", text: "■ クリーニング基本料金" });
  assert.deepEqual(blocks[1], {
    type: "table",
    hasHeader: false,
    rows: [
      ["コート", "2,500円", "セーター", "800円"],
      ["ジャケット", "1,300円", "ワイシャツ", "400円"],
    ],
  });
  assert.equal(blocks[3].type, "table");
  assert.equal(blocks[3].hasHeader, true);
  assert.deepEqual(blocks[3].rows[0], [
    "",
    "16時までのご発送",
    "16時以降のご発送",
  ]);
});

test("reading imports only structure explicit tables", () => {
  const blocks = parseArticleContentBlocks([
    "# 玉北市市民学習センター\n- 玉北市在住者による団体\n1. 事前説明会",
    "| 団体名 | 実施期間 | 開講場所 |\n| --- | --- | --- |\n| 大空グループ | 4月と5月 | 市内の公園 |",
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ["text", "table"]);
  assert.equal(blocks[0].text, "# 玉北市市民学習センター\n- 玉北市在住者による団体\n1. 事前説明会");
  assert.equal(blocks[1].hasHeader, true);

  const html = renderSafeArticleContentBlocksHtml(blocks);
  assert.doesNotMatch(html, /article-structured-heading/);
  assert.doesNotMatch(html, /article-structured-list/);
  assert.match(html, /<table class="article-structured-table">/);
  assert.match(html, /<th scope="col">団体名<\/th>/);
});

test("professional books preserve chapters and mathematical notation", () => {
  const parsed = parsePastedBookText(
    "# 第一章 集合\n\n集合 $A$ を考える。\n\n$$\\sum_{i=1}^{n} i$$\n\n第2章　極限\n\n\\(x \\to 0\\) とする。",
    "解析学入門",
  );
  const blocks = parseArticleContentBlocks(
    parsed.chapters[0].text.split(/\n{2,}/),
  );

  assert.equal(parsed.chapterCount, 2);
  assert.equal(parsed.displayMathCount, 1);
  assert.equal(parsed.inlineMathCount, 2);
  assert.deepEqual(blocks[1], {
    type: "math",
    expression: "\\sum_{i=1}^{n} i",
  });
});

test("listening quick entry accepts option-only lines separated by full-width spaces", () => {
  const parsed = parseMultiQuizText(
    "1　受信機の反応を良くする\n2　車の本体を軽くする\n3　タイヤを大きくする\n4　パワーの強いバッテリーに替える",
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].prompt, "");
  assert.deepEqual(
    parsed[0].options.map((option) => option.text),
    [
      "受信機の反応を良くする",
      "車の本体を軽くする",
      "タイヤを大きくする",
      "パワーの強いバッテリーに替える",
    ],
  );
});

test("ebook navigation removes disposable pages and repairs repeated labels", () => {
  const chapters = prepareEbookChapters(
    [
      { id: "cover", title: "Cover", text: "Cover", href: "cover.xhtml" },
      { id: "title", title: "本の名前", text: "本の名前", href: "title.xhtml" },
      {
        id: "one",
        title: "本の名前",
        text: "本の名前\n\n第一章\n\n長い本文がここから始まる。".repeat(12),
        href: "one.xhtml",
      },
      {
        id: "two",
        title: "第二章",
        text: "第二章\n\n次の本文。",
        href: "two.xhtml",
      },
      {
        id: "three",
        title: "本の名前",
        text: "本の名前\n\n「碧さん、脱線！」\n\n本文。".repeat(12),
        href: "three.xhtml",
      },
    ],
    "本の名前",
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    ["第一章", "第二章", "章节 03"],
  );
  assert.deepEqual(
    removeRepeatedEbookHeadings(
      ["本の名前", "第一章", "本文"],
      "本の名前",
      "第一章",
    ),
    ["本文"],
  );
});

test("JLPT listening filenames preserve exam, section, and question identity", () => {
  const identity = parseJlptListeningIdentity("2025-07-N1-P02-Q06.mp3");
  assert.deepEqual(identity, {
    level: "N1",
    session: "2025-07",
    sectionNumber: 2,
    questionNumber: 6,
    sectionLabel: "ポイント理解",
  });
  assert.equal(formatJlptListeningTitle(identity), "問題2-06｜ポイント理解");
  assert.equal(parseJlptListeningIdentity("202507N1-02-06.mp3"), null);
  assert.equal(
    parseJlptListeningIdentity("問題1-03")?.sectionLabel,
    "課題理解",
  );
  assert.equal(parseJlptListeningIdentity("Shadowing-Unit01-03.mp3"), null);
});

test("question option labels default to numeric and support custom sequences", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => formatOptionLabel(index, "numeric")),
    ["1", "2", "3", "4"],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => formatOptionLabel(index, "katakana")),
    ["ア", "イ", "ウ", "エ"],
  );
  const custom = parseCustomOptionLabels("Ⅰ|Ⅱ|Ⅲ|Ⅳ");
  assert.equal(formatOptionLabel(2, "custom", custom), "Ⅲ");
  assert.equal(normalizeOptionLabelFormat("unknown"), "numeric");
  assert.equal(normalizeOptionLabelFormat("unknown", "numeric"), "numeric");
});

test("stored question types use data-aware JLPT display names", () => {
  assert.equal(getQuestionTypeLabel("LISTENING"), "聴解");
  assert.equal(getQuestionTypeLabel("PRONUNCIATION"), "漢字読み");
  assert.equal(getQuestionTypeLabel("SYNONYM_REPLACEMENT"), "言い換え類義");
  assert.equal(getQuestionTypeLabel("WORD_DISTINCTION"), "用法");
  assert.equal(getQuestionTypeLabel("GRAMMAR"), "文脈規定");
  assert.equal(getQuestionTypeLabel("GRAMMAR_SELECTION"), "文の文法1");
  assert.equal(getQuestionTypeLabel("FILL_BLANK"), "文章の文法");
  assert.equal(getQuestionTypeLabel("SORTING"), "文の文法2");
  assert.equal(getQuestionTypeLabel("READING_COMPREHENSION"), "内容理解");
  assert.equal(getQuestionTypeLabel("READING_SHORT"), "内容理解（短文）");
  assert.equal(getQuestionTypeLabel("READING_MEDIUM"), "内容理解（中文）");
  assert.equal(getQuestionTypeLabel("READING_LONG"), "内容理解（長文）");
  assert.equal(getQuestionTypeLabel("READING_INTEGRATED"), "統合理解");
  assert.equal(getQuestionTypeLabel("READING_ARGUMENT"), "主張理解（長文）");
  assert.equal(getQuestionTypeLabel("READING_INFORMATION"), "情報検索");
  assert.deepEqual(getReadingQuestionSection("FILL_BLANK"), {
    sectionNumber: 7,
    title: "文章の文法",
  });
  assert.deepEqual(getReadingQuestionSection("READING_COMPREHENSION"), {
    sectionNumber: 8,
    title: "内容理解",
  });
  assert.equal(isReadingGrammarQuestion("FILL_BLANK"), true);
  assert.equal(isReadingGrammarQuestion("READING_SHORT"), false);
  assert.deepEqual(
    [
      ["VOCAB_GRAMMAR", "PRONUNCIATION"],
      ["VOCAB_GRAMMAR", "SORTING"],
      ["READING", "FILL_BLANK"],
      ["READING", "READING_SHORT"],
      ["READING", "READING_INFORMATION"],
    ].map(([materialType, questionType]) =>
      getPaperQuestionSectionNumber(materialType, questionType),
    ),
    [1, 6, 7, 8, 13],
  );
  assert.equal(getPaperReadingMaterialTitle("FILL_BLANK"), "問題7｜文章の文法");
  assert.equal(
    getPaperReadingMaterialTitle("READING_COMPREHENSION"),
    "問題8｜内容理解",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_SHORT"),
    "問題8｜内容理解（短文）",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_MEDIUM"),
    "問題9｜内容理解（中文）",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_LONG"),
    "問題10｜内容理解（長文）",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_INTEGRATED"),
    "問題11｜統合理解",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_ARGUMENT"),
    "問題12｜主張理解（長文）",
  );
  assert.equal(
    getPaperReadingMaterialTitle("READING_INFORMATION"),
    "問題13｜情報検索",
  );
});

test("answer correctness is derived from stored options", () => {
  const options = [
    { id: "option-a", isCorrect: false },
    { id: "option-b", isCorrect: true },
  ];

  assert.deepEqual(evaluateSelectedOption(options, "option-b"), {
    selectedOptionId: "option-b",
    correctOptionId: "option-b",
    isCorrect: true,
  });
  assert.equal(evaluateSelectedOption(options, "option-a").isCorrect, false);
  assert.throws(
    () => evaluateSelectedOption(options, "forged-option"),
    /所选答案无效/,
  );
});

test("N1 full-paper scoring applies section weights and pass thresholds", () => {
  const weighted = calculateJlptScore(
    [
      { section: "LANGUAGE", problemNumber: 1, isCorrect: true },
      { section: "LANGUAGE", problemNumber: 4, isCorrect: true },
      { section: "READING", problemNumber: 8, isCorrect: true },
      { section: "READING", problemNumber: 10, isCorrect: true },
      { section: "LISTENING", problemNumber: 4, isCorrect: true },
      { section: "LISTENING", problemNumber: 5, isCorrect: true },
    ],
    "N1",
  );
  assert.equal(weighted.language.rawScore, 3);
  assert.equal(weighted.reading.rawScore, 5);
  assert.equal(weighted.listening.rawScore, 4);
  assert.equal(weighted.passLine, 100);

  const perfect = calculateJlptScore(
    [
      ...Array.from({ length: 54 }, () => ({
        section: "LANGUAGE",
        problemNumber: 1,
        isCorrect: true,
      })),
      ...Array.from({ length: 25 }, () => ({
        section: "READING",
        problemNumber: 8,
        isCorrect: true,
      })),
      ...Array.from({ length: 26 }, () => ({
        section: "LISTENING",
        problemNumber: 1,
        isCorrect: true,
      })),
    ],
    "n1",
  );
  assert.equal(perfect.language.score, 60);
  assert.equal(perfect.reading.score, 60);
  assert.equal(perfect.listening.score, 60);
  assert.equal(perfect.totalScore, 180);
  assert.equal(perfect.passed, true);

  const thresholdPassed = calculateJlptScore(
    [
      ...Array.from({ length: 17 }, () => ({
        section: "LANGUAGE",
        problemNumber: 1,
        isCorrect: true,
      })),
      ...Array.from({ length: 25 }, () => ({
        section: "READING",
        problemNumber: 8,
        isCorrect: true,
      })),
      ...Array.from({ length: 26 }, () => ({
        section: "LISTENING",
        problemNumber: 1,
        isCorrect: true,
      })),
    ],
    "N1",
  );
  assert.equal(thresholdPassed.language.score, 19);
  assert.ok(thresholdPassed.totalScore >= 100);
  assert.equal(thresholdPassed.passed, true);

  const sectionFailed = calculateJlptScore(
    [
      ...Array.from({ length: 16 }, () => ({
        section: "LANGUAGE",
        problemNumber: 1,
        isCorrect: true,
      })),
      ...Array.from({ length: 25 }, () => ({
        section: "READING",
        problemNumber: 8,
        isCorrect: true,
      })),
      ...Array.from({ length: 26 }, () => ({
        section: "LISTENING",
        problemNumber: 1,
        isCorrect: true,
      })),
    ],
    "N1",
  );
  assert.equal(sectionFailed.language.score, 18);
  assert.ok(sectionFailed.totalScore >= 100);
  assert.equal(sectionFailed.passed, false);
});

test("partial practice submissions exclude unanswered questions", () => {
  const questions = [
    {
      id: "q1",
      options: [
        { id: "q1-a", isCorrect: true },
        { id: "q1-b", isCorrect: false },
      ],
    },
    {
      id: "q2",
      options: [
        { id: "q2-a", isCorrect: true },
        { id: "q2-b", isCorrect: false },
      ],
    },
    {
      id: "q3",
      options: [
        { id: "q3-a", isCorrect: true },
        { id: "q3-b", isCorrect: false },
      ],
    },
  ];

  assert.deepEqual(
    summarizePracticeSubmission(questions, {
      q1: "q1-a",
      q2: "q2-b",
    }),
    {
      submittedQuestionIds: ["q1", "q2"],
      submittedCount: 2,
      gradableCount: 2,
      wrongIndexes: [1],
      wrongCount: 1,
      correctCount: 1,
      unansweredCount: 1,
    },
  );
});

test("internal empty question markers never reach practice UI", () => {
  assert.equal(normalizeQuestionDisplayText("（未填写语境句）"), null);
  assert.equal(normalizeQuestionDisplayText("听力未填写语境句"), null);
  assert.equal(normalizeQuestionDisplayText("**未填写语境句）"), null);
  assert.equal(normalizeQuestionDisplayText("暂无文字题干"), null);
  assert.equal(
    normalizeQuestionDisplayText("男の人は何を提出しますか。"),
    "男の人は何を提出しますか。",
  );
});

test("content writes use null instead of internal question placeholders", async () => {
  const contentActions = await readFile(
    path.join(ROOT, "modules/content/actions/materials.ts"),
    "utf8",
  );
  const paperActions = await readFile(
    path.join(ROOT, "features/practice/admin-actions.ts"),
    "utf8",
  );
  const paperEditor = await readFile(
    path.join(ROOT, "features/practice/ui/PaperQuestionEditor.tsx"),
    "utf8",
  );

  assert.equal(contentActions.includes("未填写语境句"), false);
  assert.equal(paperEditor.includes("|| '未填写题干'"), false);
  assert.equal(contentActions.includes("（听力题）"), false);
  assert.equal(paperActions.includes("未填写语境句"), false);
});

test("plain text and ruby fallbacks escape HTML", () => {
  const unsafe = '<img src=x onerror=alert(1)> & "quoted"';
  const escaped = "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;";

  assert.equal(escapeHtml(unsafe), escaped);
  assert.equal(annotateJapaneseText(unsafe, {}), escaped);
  assert.equal(
    annotateJapaneseText("猫<script>alert(1)</script>", { 猫: "ねこ" }),
    '<ruby>猫<rt aria-hidden="true" data-context-ignore="true">ねこ</rt></ruby>&lt;script&gt;alert(1)&lt;/script&gt;',
  );
});

test("reading blanks survive article escaping without trusting stored HTML", () => {
  const article = "最初は[1]、次は[2]。<img src=x onerror=alert(1)>";
  const slots = createTrustedMarkupSlots(article);
  const firstBlank = slots.add('<span class="article-blank-empty">(1)</span>');
  const secondBlank = slots.add('<span class="article-blank-empty">(2)</span>');
  const tokenized = article
    .replace("[1]", firstBlank)
    .replace("[2]", secondBlank);
  const rendered = slots.restore(escapeHtml(tokenized));

  assert.equal(
    rendered,
    '最初は<span class="article-blank-empty">(1)</span>、次は<span class="article-blank-empty">(2)</span>。&lt;img src=x onerror=alert(1)&gt;',
  );
  assert.equal(rendered.includes("&lt;span"), false);
});

test("selection context follows the original surface and never stores an article fallback", () => {
  const article =
    "猫が窓辺で眠っている。犬は庭を走っている。鳥が空を飛んでいる。";

  assert.equal(
    extractSentenceContainingSelection(article, "走っている"),
    "犬は庭を走っている。",
  );
  assert.equal(extractSentenceContainingSelection(article, "走る"), "");
  assert.equal(
    extractSentenceContainingSelection("窓辺で眠っている", "眠って"),
    "窓辺で眠っている",
  );
});

test("Japanese sentence context follows the actual occurrence and keeps quoted continuations", () => {
  const repeated = "天皇は手紙を送った。翌日、天皇は『平和だ。』と語った。次の文。";
  const secondOccurrence = repeated.lastIndexOf("天皇");

  assert.equal(
    extractSentenceAtOffset(repeated, secondOccurrence),
    "翌日、天皇は『平和だ。』と語った。",
  );
  assert.deepEqual(splitSentenceSegments("彼は言った。『平和だ。』次の文。"), [
    "彼は言った。",
    "『平和だ。』",
    "次の文。",
  ]);
  assert.deepEqual(splitSentenceSegments("価格は3.14円。次の文。"), [
    "価格は3.14円。",
    "次の文。",
  ]);
});

test("audio dialogue source ids are scoped by material", () => {
  const first = buildAudioDialogueSourceId("lesson-a", "1");
  const second = buildAudioDialogueSourceId("lesson-b", "1");

  assert.notEqual(first, second);
  assert.deepEqual(parseAudioDialogueSourceId(first), {
    materialId: "lesson-a",
    stableId: "1",
  });
  assert.equal(parseAudioDialogueSourceId("1"), null);
});

test("management routes use one prefix and obsolete page routes are gone", async () => {
  const required = [
    "app/(admin)/manage/page.tsx",
    "app/(admin)/manage/import/page.tsx",
    "app/(admin)/manage/shadowing/page.tsx",
    "app/(admin)/manage/practice/page.tsx",
    "app/(admin)/manage/listening/page.tsx",
    "app/(admin)/manage/vocabulary/page.tsx",
    "app/(admin)/manage/grammar/page.tsx",
    "app/(admin)/manage/system/page.tsx",
    "app/(admin)/manage/system/audio/page.tsx",
    "app/(admin)/manage/system/review/page.tsx",
  ];
  const removed = [
    "app/(admin)/upload/page.tsx",
    "app/(admin)/manage/collections/page.tsx",
    "app/(admin)/manage/collections/[id]/page.tsx",
    "app/(admin)/manage/collections/article/[id]/page.tsx",
    "app/(admin)/manage/collections/quiz/[id]/page.tsx",
    "app/(admin)/papers/manage/page.tsx",
    "app/(study)/listening/manage/page.tsx",
    "app/(library)/collections/page.tsx",
    "app/(study)/exam/page.tsx",
    "app/(study)/shadowing/page.tsx",
    "app/(library)/media-subtitles/page.tsx",
    "app/(knowledge)/wordbooks/page.tsx",
    "app/(tools)/anki/page.tsx",
    "app/(tools)/settings/page.tsx",
    "app/(tools)/search/result/page.tsx",
  ];

  for (const file of required) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true);
  }
  for (const file of removed) {
    await assert.rejects(stat(path.join(ROOT, file)));
  }
});

test("listening management restores pagination and practice overview stays flat", async () => {
  const listeningList = await readFile(
    path.join(ROOT, "features/listening/ui/ListeningListClient.tsx"),
    "utf8",
  );
  const listeningPage = await readFile(
    path.join(ROOT, "app/(admin)/manage/listening/page.tsx"),
    "utf8",
  );
  const listeningDetail = await readFile(
    path.join(ROOT, "app/(admin)/manage/listening/[id]/page.tsx"),
    "utf8",
  );
  const practiceOverview = await readFile(
    path.join(ROOT, "app/(study)/practice/[id]/page.tsx"),
    "utf8",
  );

  assert.match(listeningList, /returnPage=\$\{normalizedManagePage\}/);
  assert.match(listeningPage, /initialManagePage=\{initialManagePage\}/);
  assert.match(listeningDetail, /`\/manage\/listening\?page=\$\{returnPage\}`/);
  assert.match(listeningDetail, /href=\{material\.audioFile\}\s*download/);
  assert.match(listeningDetail, /下载音频/);
  assert.doesNotMatch(
    practiceOverview,
    /试卷详情|类型:|语言:|排序:|更新于|每题独立音频/,
  );
  assert.doesNotMatch(practiceOverview, /rounded-\[|shadow-/);
  assert.match(practiceOverview, /divide-y divide-slate-200 border-y/);
  assert.match(practiceOverview, /readingSections/);
  assert.match(practiceOverview, /問題7｜文章の文法/);
  assert.match(practiceOverview, /isReadingGrammarQuestion/);
  assert.match(practiceOverview, /groupQuestionsByMaterial/);
  assert.match(practiceOverview, /篇的小问/);
  assert.match(practiceOverview, /段音频的小问/);

  const examRepository = await readFile(
    path.join(ROOT, "lib/repositories/exam/index.ts"),
    "utf8",
  );
  assert.match(examRepository, /languageQs\.sort\(bySectionThenSource\)/);
  assert.match(examRepository, /listeningQs\.sort\(bySectionThenSource\)/);
});

test("reading management keeps live filters and return state", async () => {
  const readingList = await readFile(
    path.join(ROOT, "features/reading/ui/ReadingListClient.tsx"),
    "utf8",
  );
  const readingDetail = await readFile(
    path.join(ROOT, "app/(admin)/manage/reading/[id]/page.tsx"),
    "utf8",
  );

  assert.match(readingList, /搜索标题 \/ 作者 \/ 试卷/);
  assert.match(readingList, /缺少题目/);
  assert.match(readingList, /独立材料/);
  assert.match(readingList, /window\.history\.replaceState/);
  assert.match(readingList, /returnTo=/);
  assert.match(readingDetail, /rawReturnTo\?\.startsWith\('\/manage\/reading'\)/);
  assert.match(readingList, /divide-y divide-slate-200 border-y/);
});

test("review scheduling explains status before exposing diagnostics", async () => {
  const page = await readFile(
    path.join(ROOT, "app/(admin)/manage/system/review/page.tsx"),
    "utf8",
  );

  assert.match(page, /等待复习数据/);
  assert.match(page, /目前不需要处理/);
  assert.match(page, /<details className=/);
  assert.match(page, /高级调度信息/);
  assert.match(
    page,
    /eventCount7d \? `\$\{data\.stats\.successRate7d\}%` : '—'/,
  );
  assert.equal(page.includes("value={data.profile.lastEngineMode"), false);
});

test("route surfaces use the shared editorial visual language", async () => {
  const rootLayout = await readFile(path.join(ROOT, "app/layout.tsx"), "utf8");
  const globalStyles = await readFile(
    path.join(ROOT, "app/globals.css"),
    "utf8",
  );
  const studyNavigation = await readFile(
    path.join(ROOT, "components/layout/StudyNavigation.tsx"),
    "utf8",
  );
  const manageShell = await readFile(
    path.join(ROOT, "components/layout/ManageShell.tsx"),
    "utf8",
  );
  const pageHeader = await readFile(
    path.join(ROOT, "components/layout/PageHeader.tsx"),
    "utf8",
  );

  assert.match(rootLayout, /className='editorial-ui'/);
  assert.doesNotMatch(rootLayout, /flat-ui/);
  assert.doesNotMatch(globalStyles, /\.flat-ui main/);
  assert.match(globalStyles, /--font-editorial-display/);
  assert.match(globalStyles, /--editorial-paper: #f6f5f1/);
  assert.match(globalStyles, /--editorial-paper-raised: #ffffff/);
  assert.match(studyNavigation, /max-w-7xl/);
  assert.match(manageShell, /max-w-7xl/);
  assert.match(globalStyles, /body\.editorial-ui main h1/);
  assert.match(
    globalStyles,
    /main\[class\*='min-h-screen'\][\s\S]*padding-top: 0/,
  );
  assert.equal(globalStyles.includes("padding-top: clamp(2.75rem"), false);
  assert.match(globalStyles, /--modern-radius-lg: 1rem/);
  assert.match(
    globalStyles,
    /border-radius: var\(--modern-radius-lg\) !important/,
  );
  assert.match(globalStyles, /border-radius: var\(--modern-radius-sm\)/);
  assert.match(studyNavigation, /editorial-nav/);
  assert.match(manageShell, /editorial-nav/);
  assert.equal(studyNavigation.includes("border-b-2"), false);
  assert.equal(manageShell.includes("border-b-2"), false);
  assert.equal(pageHeader.includes("border-y border-slate-200"), false);
});

test("reading sibling navigation uses the shared editorial listbox", async () => {
  const [siblingNav, customSelect] = await Promise.all([
    readFile(
      path.join(ROOT, "features/reading/ui/ArticleSiblingNav.tsx"),
      "utf8",
    ),
    readFile(path.join(ROOT, "components/ui/CustomSelect.tsx"), "utf8"),
  ]);

  assert.match(siblingNav, /import CustomSelect/);
  assert.match(siblingNav, /<CustomSelect/);
  assert.doesNotMatch(siblingNav, /<select/);
  assert.match(siblingNav, /font-reading-ja/);
  assert.match(siblingNav, /h-10 w-full rounded-lg border/);
  assert.match(customSelect, /ui-pop ui-pop-surface/);
  assert.match(customSelect, /role='listbox'/);
  assert.match(customSelect, /isValidElement\(node\)/);
  assert.doesNotMatch(
    customSelect,
    /Children\.toArray\(node\)\.map\(textFromNode\)/,
  );
});

test("body copy uses language-aware sans-serif font stacks", async () => {
  const globalStyles = await readFile(
    path.join(ROOT, "app/globals.css"),
    "utf8",
  );
  const managePage = await readFile(
    path.join(ROOT, "app/(admin)/manage/page.tsx"),
    "utf8",
  );
  const reviewPage = await readFile(
    path.join(ROOT, "app/(study)/review/page.tsx"),
    "utf8",
  );
  const articleReader = await readFile(
    path.join(ROOT, "features/reading/ui/ArticleReaderClient.tsx"),
    "utf8",
  );

  assert.match(globalStyles, /'PingFang SC'/);
  assert.match(globalStyles, /'Hiragino Kaku Gothic ProN'/);
  assert.doesNotMatch(
    `${globalStyles}\n${managePage}\n${reviewPage}`,
    /font-serif|Songti|STSong|Mincho|Noto Serif|Source Serif|Times New Roman/,
  );
  assert.match(articleReader, /className='font-reading-body-ja /);
  assert.doesNotMatch(articleReader, /className='font-reading-ja /);
});

test("listening import accepts MP3 uploads and presets database-informed questions", async () => {
  const uploadForm = await readFile(
    path.join(ROOT, "features/import/ui/UploadForm.tsx"),
    "utf8",
  );
  const uploadAction = await readFile(
    path.join(ROOT, "features/import/actions.ts"),
    "utf8",
  );
  const questionEditor = await readFile(
    path.join(ROOT, "features/collections/ui/LessonQuestionsPanel.tsx"),
    "utf8",
  );
  const importPage = await readFile(
    path.join(ROOT, "app/(admin)/manage/import/page.tsx"),
    "utf8",
  );
  const paperEditorDomain = await readFile(
    path.join(ROOT, "modules/questions/domain/paper-editor.ts"),
    "utf8",
  );
  const manageRepository = await readFile(
    path.join(ROOT, "lib/repositories/manage/index.ts"),
    "utf8",
  );

  assert.match(uploadForm, /accept='\.mp3,audio\/mpeg'/);
  assert.match(uploadForm, /normalizeListeningAudioPath/);
  assert.match(uploadForm, /name='collectionIds'/);
  assert.match(uploadForm, /autoSuggestedTitleRef/);
  assert.match(
    uploadForm,
    /if \(!isBatchAss \|\| !suggestedTitle \|\| title !== suggestedTitle\) return/,
  );
  assert.match(
    uploadForm,
    /autoSuggestedTitleRef\.current = null\s*setTitle\(e\.target\.value\)/,
  );
  assert.match(
    uploadForm,
    /!subtitleNoAudio &&\s*!isBatchAss &&\s*previewRows\.length > 0/,
  );
  assert.doesNotMatch(uploadForm, /找不到匹配时可在下方预览中手动调整/);
  assert.match(uploadForm, /继续添加其他\$\{destinationName\}/);
  assert.doesNotMatch(uploadForm, /当前仅显示正式试卷/);
  assert.doesNotMatch(uploadForm, /批量录入说明/);
  assert.doesNotMatch(uploadForm, /继续添加题目|无需离开上传页|材料已创建/);
  assert.match(uploadForm, /appearance='import'/);
  assert.doesNotMatch(questionEditor, /快速填写题目与选项/);
  assert.match(
    questionEditor,
    /appearance\?: 'default' \| 'practice' \| 'import'/,
  );
  assert.match(questionEditor, /handleParseBulk/);
  assert.match(questionEditor, /parseMultiQuizText\(bulkText\)/);
  assert.match(questionEditor, /正确答案/);
  assert.match(
    questionEditor,
    /const isEditing = draftMode \|\| editingQuestionId === q\.id/,
  );
  assert.match(questionEditor, /length: resolvedQuestionsPerMaterial/);
  assert.match(importPage, /defaultQuestionsPerMaterial=/);
  assert.match(manageRepository, /getDefaultListeningQuestionsPerMaterial/);
  assert.match(manageRepository, /ORDER BY "materialCount" DESC, "questionCount" DESC/);
  assert.match(
    questionEditor,
    /batchMode && q\.questionType === 'TOEIC_QUESTION_RESPONSE'/,
  );
  assert.match(questionEditor, /aria-pressed=\{opt\.isCorrect\}/);
  assert.match(importPage, /选择日语听力题型/);
  assert.match(importPage, /japaneseListeningSection/);
  assert.match(paperEditorDomain, /PAPER_LISTENING_SECTIONS/);
  assert.match(paperEditorDomain, /概要理解/);
  assert.equal(
    uploadForm.includes("paper.materialType === materialType"),
    false,
  );
  assert.match(
    uploadForm,
    /isCollectionTypeAllowedForMaterial\(\s*materialType/,
  );
  assert.match(uploadAction, /getAll\('collectionIds'\)/);
  assert.match(uploadAction, /getMaterialCollectionTypeError\(/);
  assert.match(uploadAction, /mp3Only && ext !== '\.mp3'/);
  assert.match(uploadAction, /collectionIds\.map\(targetCollectionId/);
  assert.doesNotMatch(uploadAction, /MaterialType=/);
});

test("reading upload distinguishes article-local numbering from JLPT sections", async () => {
  const panel = await readFile(
    path.join(ROOT, "modules/import/components/ArticleImportPanel.tsx"),
    "utf8",
  );

  assert.match(
    panel,
    /`問題\$\{section\.sectionNumber\}｜\$\{section\.title\}`/,
  );
  assert.match(panel, /题目 \{qIndex \+ 1\}/);
  assert.match(panel, /添加\/取消下划线/);
  assert.match(panel, /toggleUnderlineSelection/);
  assert.match(panel, /识别并加入阅读题/);
  assert.match(panel, /选择圆点设置正确答案/);
  assert.match(panel, /border-l-\[3px\]/);
  assert.doesNotMatch(panel, /articleParsedPreviewRows/);
  assert.doesNotMatch(panel, /articleParsedDrafts/);
  assert.doesNotMatch(panel, /识别预览/);
  assert.doesNotMatch(panel, /padStart\(2, '0'\)/);

  const uploadCenter = await readFile(
    path.join(ROOT, "features/import/ui/UploadCenterUI.tsx"),
    "utf8",
  );
  assert.match(
    uploadCenter,
    /commitArticleDrafts\(normalizedDrafts, previewRows\)/,
  );

  const builder = await readFile(
    path.join(ROOT, "modules/import/domain/article-question-builder.ts"),
    "utf8",
  );
  assert.match(builder, /detectedType === 'FILL_BLANK'[\s\S]*: ''/);
});

test("paper reading materials keep their authored import order", async () => {
  const materialActions = await readFile(
    path.join(ROOT, "modules/content/actions/materials.ts"),
    "utf8",
  );
  const examRepository = await readFile(
    path.join(ROOT, "lib/repositories/exam/index.ts"),
    "utf8",
  );
  const exportRepository = await readFile(
    path.join(ROOT, "features/practice/export/paper-export-data.ts"),
    "utf8",
  );

  assert.match(materialActions, /collectionMaterial\.aggregate/);
  assert.match(
    materialActions,
    /const nextMaterialOrder = \(lastMaterial\._max\.sortOrder \?\? -1\) \+ 1/,
  );
  assert.match(materialActions, /sortOrder: nextMaterialOrder/);
  assert.doesNotMatch(
    materialActions,
    /collectionMaterials:\s*\{\s*create:\s*\{\s*collectionId,\s*sortOrder: 0/,
  );
  assert.match(
    examRepository,
    /orderBy: \[\{ sortOrder: "asc" \}, \{ createdAt: "asc" \}, \{ id: "asc" \}\]/,
  );
  assert.match(
    exportRepository,
    /orderBy: \[\{ sortOrder: 'asc' \}, \{ createdAt: 'asc' \}, \{ id: 'asc' \}\]/,
  );
});

test("reading editor can move a whole cloze article to another paper", async () => {
  const page = await readFile(
    path.join(ROOT, "app/(admin)/manage/reading/[id]/page.tsx"),
    "utf8",
  );
  const editor = await readFile(
    path.join(ROOT, "features/content/ui/EditArticleUI.tsx"),
    "utf8",
  );
  const actions = await readFile(
    path.join(ROOT, "modules/content/actions/materials.ts"),
    "utf8",
  );

  assert.match(page, /getManagePaperMoveTargets/);
  assert.match(editor, /aria-label='移动到其他试卷'/);
  assert.match(editor, /整篇文章及其 \$\{questions\.length\} 道题/);
  assert.match(editor, /moveReadingMaterialToPaper/);
  assert.match(actions, /export async function moveReadingMaterialToPaper/);
  assert.match(actions, /collectionId: targetPaperId/);
  assert.match(actions, /material\.type !== MaterialType\.READING/);
});

test("paper attributes are normalized across every creation and edit path", async () => {
  assert.deepEqual(
    normalizePaperAttributes({ title: "2024年12月N1", language: "ja" }),
    {
      language: "ja",
      level: "N1",
      acceptedMaterialTypes: ["LISTENING", "READING", "VOCAB_GRAMMAR"],
    },
  );
  assert.deepEqual(normalizePaperAttributes({ title: "TOEIC L&R 問題集" }), {
    language: "en",
    level: "TOEIC",
    acceptedMaterialTypes: ["LISTENING", "READING", "VOCAB_GRAMMAR"],
  });

  const materialActions = await readFile(
    path.join(ROOT, "modules/content/actions/materials.ts"),
    "utf8",
  );
  const importActions = await readFile(
    path.join(ROOT, "features/import/actions.ts"),
    "utf8",
  );
  const paperActions = await readFile(
    path.join(ROOT, "features/practice/actions.ts"),
    "utf8",
  );
  const collectionActions = await readFile(
    path.join(ROOT, "features/collections/actions.ts"),
    "utf8",
  );
  for (const source of [
    materialActions,
    importActions,
    paperActions,
    collectionActions,
  ]) {
    assert.match(source, /normalizePaperAttributes/);
  }
  assert.doesNotMatch(
    materialActions,
    /targetPaperId,[\s\S]{0,120}acceptedMaterialTypes: \{ has: MaterialType\.READING \}/,
  );
});

test("search results use domain editors instead of the hidden JSON tool", async () => {
  const searchHrefBuilder = await readFile(
    path.join(ROOT, "features/search/domain.ts"),
    "utf8",
  );
  const searchActions = await readFile(
    path.join(ROOT, "features/search/actions.ts"),
    "utf8",
  );
  const searchPage = await readFile(
    path.join(ROOT, "app/(tools)/search/page.tsx"),
    "utf8",
  );
  const vocabularyTabs = await readFile(
    path.join(ROOT, "app/(knowledge)/vocabulary/VocabularyTabs.tsx"),
    "utf8",
  );
  const vocabularyNavigation = await readFile(
    path.join(ROOT, "modules/knowledge/vocabulary/domain/navigation.ts"),
    "utf8",
  );

  assert.match(
    searchHrefBuilder,
    /`\/manage\/reading\/\$\{encodeURIComponent\(id\)\}`/,
  );
  assert.match(
    searchHrefBuilder,
    /`\/manage\/questions\/\$\{encodeURIComponent\(id\)\}`/,
  );
  assert.equal(searchHrefBuilder.includes("/manage/search/"), false);
  assert.match(searchActions, /vocabularyResultsByWord/);
  assert.match(searchActions, /select:\s*\{[\s\S]*sentenceLinks:/);
  assert.match(searchActions, /sourceId:\s*true,[\s\S]*sourceUrl:\s*true/);
  assert.match(searchActions, /sentence\.links\.forEach/);
  assert.doesNotMatch(searchActions, /\.\.\.sentenceResults/);
  assert.match(searchActions, /buildQuestionTargetHref/);
  assert.match(searchActions, /collectionType: 'PAPER'/);
  assert.match(
    searchHrefBuilder,
    /`\/practice\/\$\{encodeURIComponent\(input\.paperId\)\}\/do\?qid=/,
  );
  assert.match(searchHrefBuilder, /`\/manage\/questions\/\$\{encodeURIComponent\(input\.materialId\)\}\?focus=/);
  assert.match(searchHrefBuilder, /buildVocabularyFocusHref/);
  assert.doesNotMatch(searchHrefBuilder, /params\.set\('q', word\)/);
  assert.match(searchPage, /释义、读音、关联例句/);
  assert.match(searchPage, /resultCacheRef/);
  assert.match(searchPage, /missingTypes = nextTypes\.filter/);
  assert.match(searchPage, /resultCacheRef\.current\.size > 20/);
  assert.match(searchPage, /searchGlobalContent\(q, \{ types: missingTypes \}\)/);
  assert.doesNotMatch(searchPage, /key: 'sentence', label: '句子'/);
  assert.match(
    vocabularyTabs,
    /flashList\.findIndex\(item => item\.id === initialFocusId\)/,
  );
  assert.match(vocabularyTabs, /useSearchParams/);
  assert.match(vocabularyTabs, /searchParams\.get\('view'\)/);
  assert.match(vocabularyNavigation, /params\.set\('view', 'card'\)/);
  assert.match(vocabularyTabs, /initialViewMode === 'card' \? 'flashcard' : 'list'/);
  const vocabularyToolbar = await readFile(
    path.join(ROOT, "modules/knowledge/vocabulary/components/VocabularyPageToolbar.tsx"),
    "utf8",
  );
  assert.match(vocabularyTabs, /<VocabularyPageToolbar/);
  assert.match(vocabularyToolbar, /mode: 'flashcard', label: '单词卡'/);
});

test("vocabulary cards continue across paginated server results", async () => {
  const vocabularyTabs = await readFile(
    path.join(ROOT, "app/(knowledge)/vocabulary/VocabularyTabs.tsx"),
    "utf8",
  );
  const cardControls = await readFile(
    path.join(
      ROOT,
      "modules/knowledge/vocabulary/components/MemoryCardControls.tsx",
    ),
    "utf8",
  );

  assert.match(vocabularyTabs, /navigateCardPage\(currentPage \+ 1, 0\)/);
  assert.match(vocabularyTabs, /navigateCardPage\(currentPage - 1, pageSize - 1\)/);
  assert.match(vocabularyTabs, /overallTotal=\{effectiveGroupTotal\}/);
  assert.match(cardControls, /disabled=\{!canNext \|\| transitioning\}/);
  assert.match(cardControls, /\{currentPosition\} \/ \{overallTotal\}/);
});

test("responsive and component-boundary regressions remain guarded", async () => {
  const subtitlePage = await readFile(
    path.join(ROOT, "app/(library)/subtitles/page.tsx"),
    "utf8",
  );
  assert.match(subtitlePage, /min-w-0 divide-y divide-slate-200/);

  const boundaries = [
    "modules/knowledge/vocabulary/components/VocabularySentenceText.tsx",
    "modules/import/audio/hooks/useAudioFileCatalog.ts",
    "modules/media-subtitles/components/SubtitleReaderControls.tsx",
    "features/content/ui/EditArticleUI.tsx",
    "features/practice/ui/PracticeVocabularyAnalyticsDialog.tsx",
    "modules/progress/exam-scores/components/ExamScoreManager.tsx",
    "components/AudioPlayer/ListeningPlayerHeader.tsx",
    "components/AudioPlayer/ListeningSentenceRow.tsx",
  ];
  for (const file of boundaries) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true);
  }
});

test("practice player keeps one compact action bar", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );
  const copyActions = player.match(
    /onClick=\{\(\) => void handleCopyCurrentQuestion\(\)\}/g,
  );

  assert.equal(copyActions?.length, 1);
  assert.match(player, /role='progressbar'/);
  assert.match(player, /mode !== 'single' && !session\.isSubmitted/);
  assert.match(player, /\{exitLabel\}/);
  assert.match(player, /aria-label='上一题'/);
  assert.match(player, /aria-label='下一题'/);
  assert.match(player, /event\.key === 'ArrowLeft'/);
  assert.match(player, /event\.key === 'ArrowRight'/);
  assert.match(player, /Numpad\[1-9\]/);
  assert.doesNotMatch(player, /\^\[a-i\]\$\/i/);
  assert.match(player, /event\.code === 'Space'/);
  assert.match(player, /audio\[data-practice-audio="current"\]/);
  assert.match(player, /isInteractiveSpaceTarget/);
  assert.match(
    player,
    /target\.closest\('\[data-context-role="question-option"\]'\)/,
  );
  assert.equal(player.includes("<footer"), false);
  assert.equal(
    player.includes("className='flex flex-col gap-3 md:flex-row"),
    false,
  );
});

test("paper practice restores an unfinished local draft", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );
  const session = await readFile(
    path.join(ROOT, "hooks/usePracticeSession.ts"),
    "utf8",
  );
  const paperSession = await readFile(
    path.join(ROOT, "app/(study)/practice/[id]/do/page.tsx"),
    "utf8",
  );
  const sortingQuestion = await readFile(
    path.join(
      ROOT,
      "components/exam/question-renderer/SortingQuestion.tsx",
    ),
    "utf8",
  );

  assert.match(paperSession, /draftKey={`practice:draft:paper:\${id}`}/);
  assert.match(paperSession, /restoreDraftIndex={!qid}/);
  assert.match(session, /userStorageKey\(currentUser\.id, draftKey\)/);
  assert.match(session, /window\.localStorage\.setItem\(scopedDraftKey/);
  assert.match(session, /currentQuestionId/);
  assert.match(session, /hasProgress:/);
  assert.match(player, /onClick={handleExit}/);
  assert.match(player, /router\.back\(\)/);
  assert.match(player, /session\.clearDraft\(\)/);
  assert.match(sortingQuestion, /window\.addEventListener\('keydown'/);
  assert.match(sortingQuestion, /options\[optionNumber - 1\]/);
});

test("practice counts only complete paper submissions and can reset statistics", async () => {
  const schema = await readFile(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const attemptService = await readFile(
    path.join(ROOT, "modules/practice/server/attempt-service.ts"),
    "utf8",
  );
  const attemptRoute = await readFile(
    path.join(ROOT, "app/api/quiz-attempts/route.ts"),
    "utf8",
  );
  const paperItem = await readFile(
    path.join(ROOT, "features/practice/ui/PaperLibraryItem.tsx"),
    "utf8",
  );
  const dialog = await readFile(
    path.join(ROOT, "features/practice/ui/PerformanceStatsDialog.tsx"),
    "utf8",
  );
  const paperDetail = await readFile(
    path.join(ROOT, "app/(study)/practice/[id]/page.tsx"),
    "utf8",
  );
  const submissionReview = await readFile(
    path.join(
      ROOT,
      "features/practice/ui/PracticeSubmissionReviewClient.tsx",
    ),
    "utf8",
  );

  assert.match(schema, /model PracticePaperSubmission/);
  assert.match(attemptService, /paperQuestionIds\.size !== uniqueQuestionIds\.length/);
  assert.match(attemptService, /practicePaperSubmission\.create/);
  assert.match(attemptRoute, /export async function DELETE\(request: Request\)/);
  assert.match(attemptRoute, /body\.scope === 'language'/);
  assert.match(attemptRoute, /body\.scope === 'paper'/);
  assert.match(attemptService, /export type QuizAttemptResetScope/);
  assert.match(attemptService, /questionAttempt\.deleteMany\(\{/);
  assert.match(attemptService, /collectionId: \{ in: papers\.map/);
  assert.match(paperItem, /completedPracticeCount/);
  assert.match(paperItem, /hasDraftProgress \? '继续练习' : '开始练习'/);
  assert.match(paperDetail, /查看错题/);
  assert.match(paperDetail, /submissions\/\$\{encodeURIComponent\(submission\.id\)\}/);
  assert.match(submissionReview, /<PracticePlayer/);
  assert.match(submissionReview, /mode='history'/);
  assert.match(submissionReview, /initialSubmitted/);
  assert.match(dialog, /重置统计/);
  assert.match(dialog, /按语言/);
  assert.match(dialog, /按试卷/);
  assert.match(dialog, /role='alertdialog'/);
  assert.match(dialog, /仅清除统计记录/);
  assert.equal(dialog.includes('window.confirm'), false);
});

test("practice papers default to newest and expose sort controls", async () => {
  const client = await readFile(
    path.join(ROOT, "app/(study)/practice/PapersListClient.tsx"),
    "utf8",
  );
  const state = await readFile(
    path.join(ROOT, "features/practice/hooks/usePaperLibraryState.ts"),
    "utf8",
  );
  const library = await readFile(
    path.join(ROOT, "features/practice/domain/paper-library.ts"),
    "utf8",
  );

  assert.match(state, /sort: 'newest'/);
  assert.match(client, /排序方式/);
  assert.match(client, /最新试卷优先/);
  assert.match(client, /最早试卷优先/);
  assert.match(client, /按名称排序/);
  assert.match(library, /resolvePaperTime/);
  assert.match(library, /filters\.sort/);
  assert.match(library, /return '日语'/);
  assert.match(library, /return '英语'/);
  assert.match(library, /paperLanguageUsesLevels/);
  assert.match(library, /language !== '英语'/);
  assert.equal(client.includes('groupPapersByLanguageAndLevel'), false);
  assert.equal(client.includes("group.language"), false);
});

test("practice performance separates language and level before question type", async () => {
  const performanceRoute = await readFile(
    path.join(ROOT, "app/api/practice/performance/route.ts"),
    "utf8",
  );
  const launcher = await readFile(
    path.join(ROOT, "features/practice/ui/PracticeInsightsLaunchers.tsx"),
    "utf8",
  );
  const dialog = await readFile(
    path.join(ROOT, "features/practice/ui/PerformanceStatsDialog.tsx"),
    "utf8",
  );
  const repository = await readFile(
    path.join(ROOT, "lib/repositories/exam/index.ts"),
    "utf8",
  );

  assert.match(performanceRoute, /getPracticePerformanceGroups/);
  assert.match(launcher, /fetch\('\/api\/practice\/performance'/);
  assert.match(dialog, /语言与等级/);
  assert.match(dialog, /group\.level \? ` · \$\{group\.level\}` : ''/);
  assert.match(dialog, /平均用时/);
  assert.match(dialog, /平均用时不计入未记录时长的作答/);
  assert.match(repository, /\bgroupKey\b/);
  assert.match(repository, /timedAttemptCount/);
  assert.match(repository, /getReadingQuestionSection/);
  assert.match(repository, /resolveListeningSection/);
  assert.match(repository, /isEnglish\s*\?\s*""/);
});

test("custom practice selects JLPT groups or individual problem sections", async () => {
  const builder = await readFile(
    path.join(ROOT, "app/(study)/practice/custom/CustomPaperBuilderClient.tsx"),
    "utf8",
  );
  const customSession = await readFile(
    path.join(ROOT, "app/(study)/practice/custom/do/page.tsx"),
    "utf8",
  );
  const repository = await readFile(
    path.join(ROOT, "lib/repositories/exam/index.ts"),
    "utf8",
  );

  assert.match(builder, /'unattempted' \| 'attempted' \| 'all'/);
  assert.match(builder, /params\.set\('scope', selectedScope\)/);
  assert.match(builder, /params\.set\('sections', selectedKeys\.join\(','\)\)/);
  assert.match(builder, /选择分类，或只选择具体問題/);
  assert.match(builder, /开始练未做题/);
  assert.match(builder, /开始复习已做题/);
  assert.match(builder, /fixed inset-x-0 bottom-0/);
  assert.match(
    customSession,
    /rawScope === 'attempted' \|\| rawScope === 'all'/,
  );
  assert.match(repository, /attempts: \{ none: \{ userId \} \}/);
  assert.match(repository, /attempts: \{ some: \{ userId \} \}/);
  assert.match(repository, /LANGUAGE:1/);
  assert.match(repository, /LISTENING:5/);
});

test("form controls share styled selects and an explicit number stepper", async () => {
  const globalStyles = await readFile(
    path.join(ROOT, "app/globals.css"),
    "utf8",
  );
  const numberStepper = await readFile(
    path.join(ROOT, "components/ui/NumberStepper.tsx"),
    "utf8",
  );
  const builder = await readFile(
    path.join(ROOT, "app/(study)/practice/custom/CustomPaperBuilderClient.tsx"),
    "utf8",
  );

  assert.match(globalStyles, /select:not\(\[multiple\]\)/);
  assert.match(globalStyles, /background-image: url\(/);
  assert.match(
    globalStyles,
    /input\[type='number'\]::-webkit-inner-spin-button/,
  );
  assert.match(numberStepper, /aria-label=\{`\$\{ariaLabel\}减少`\}/);
  assert.match(numberStepper, /aria-label=\{`\$\{ariaLabel\}增加`\}/);
  assert.match(builder, /<NumberStepper/);
});

test("project dropdowns use the custom listbox instead of native select menus", async () => {
  const customSelect = await readFile(
    path.join(ROOT, "components/ui/CustomSelect.tsx"),
    "utf8",
  );
  const migratedFiles = [
    "features/listening/ui/ShadowingLibraryManager.tsx",
    "app/(admin)/manage/import/AnkiImportPanel.tsx",
    "app/(admin)/manage/vocabulary/VocabularyManageClient.tsx",
    "features/import/ui/UploadCenterUI.tsx",
    "features/import/ui/UploadForm.tsx",
    "features/listening/ui/ListeningListClient.tsx",
    "features/listening/ui/ListeningQuickClassifyForm.tsx",
    "features/practice/ui/PaperAttributeForm.tsx",
    "app/(study)/practice/PapersListClient.tsx",
    "app/(study)/practice/custom/CustomPaperBuilderClient.tsx",
    "modules/import/components/BulkQuizPanel.tsx",
    "modules/media-subtitles/components/SubtitleReaderControls.tsx",
  ];

  assert.match(customSelect, /createPortal/);
  assert.match(customSelect, /role='listbox'/);
  assert.match(customSelect, /event\.key === 'ArrowDown'/);
  assert.match(customSelect, /<input type='hidden' name=\{name\}/);
  for (const file of migratedFiles) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("<select"), false);
    assert.match(source, /<CustomSelect/);
  }
});

test("practice review reveals answers only for submitted questions", async () => {
  const player = await readFile(
    path.join(ROOT, "components/exam/PracticePlayer.tsx"),
    "utf8",
  );
  const readingPassage = await readFile(
    path.join(ROOT, "components/exam/question-renderer/readingPassage.ts"),
    "utf8",
  );
  const optionsList = await readFile(
    path.join(ROOT, "components/exam/question-renderer/OptionsList.tsx"),
    "utf8",
  );

  assert.match(
    player,
    /isSubmitted=\{session\.isQuestionSubmitted\(currentQuestion\.id\)\}/,
  );
  assert.match(player, /isInteractionLocked=\{session\.isSubmitted\}/);
  assert.match(
    readingPassage,
    /submittedQuestionIdSet\.has\(fillQuestion\.id\)/,
  );
  assert.match(optionsList, /if \(isInteractionLocked\)/);
});

test("listening practice keeps compact controls and readable transcript", async () => {
  const renderer = await readFile(
    path.join(ROOT, "components/exam/QuestionRenderer.tsx"),
    "utf8",
  );
  const optionsList = await readFile(
    path.join(ROOT, "components/exam/question-renderer/OptionsList.tsx"),
    "utf8",
  );
  const transcript = await readFile(
    path.join(
      ROOT,
      "components/exam/question-renderer/ListeningTranscript.tsx",
    ),
    "utf8",
  );

  assert.equal(renderer.includes("每段音频对应一道题"), false);
  assert.equal(renderer.includes("单题音频"), false);
  assert.equal(renderer.includes("该听力题未填写文字题干"), false);
  assert.match(renderer, /normalizeQuestionDisplayText/);
  assert.match(renderer, /data-practice-audio='current'/);
  assert.match(optionsList, /if \(audioOnly\)/);
  assert.match(optionsList, /flex flex-wrap items-center gap-3/);
  assert.match(optionsList, /aria-keyshortcuts/);
  assert.doesNotMatch(optionsList, /String\.fromCharCode\(65 \+ index\)/);
  assert.doesNotMatch(optionsList, />\{`选项 \$\{label\}`\}<\/span>/);
  assert.match(transcript, /divide-y divide-slate-100/);
  assert.equal(transcript.includes("max-h-[45vh]"), false);
});

test("listening detail avoids idle animation work and uses scoped vocabulary sources", async () => {
  const controller = await readFile(
    path.join(ROOT, "components/AudioPlayer/useAudioController.ts"),
    "utf8",
  );
  const detailPage = await readFile(
    path.join(ROOT, "app/(study)/listening/[id]/page.tsx"),
    "utf8",
  );
  const player = await readFile(
    path.join(ROOT, "components/AudioPlayer/AudioPlayer.tsx"),
    "utf8",
  );
  const pronunciationHook = await readFile(
    path.join(ROOT, "hooks/usePronunciationSource.ts"),
    "utf8",
  );
  const sentenceRow = await readFile(
    path.join(ROOT, "components/AudioPlayer/ListeningSentenceRow.tsx"),
    "utf8",
  );
  const listeningLanding = await readFile(
    path.join(ROOT, "app/(study)/listening/page.tsx"),
    "utf8",
  );
  const listeningEntryCards = await readFile(
    path.join(ROOT, "features/listening/ui/LibraryEntryCards.tsx"),
    "utf8",
  );
  const listeningRepository = await readFile(
    path.join(ROOT, "features/listening/server/repository.ts"),
    "utf8",
  );
  const listeningFilter = await readFile(
    path.join(ROOT, "features/listening/ui/ListeningViewSwitcher.tsx"),
    "utf8",
  );
  const playerHeader = await readFile(
    path.join(ROOT, "components/AudioPlayer/ListeningPlayerHeader.tsx"),
    "utf8",
  );

  assert.match(controller, /if \(audio\.paused\)/);
  assert.match(controller, /animationFrameId = null/);
  assert.match(detailPage, /buildAudioDialogueSourceId\(/);
  assert.equal(
    detailPage.includes("buildAudioDialogueSourceIdCandidates"),
    false,
  );
  assert.equal(
    detailPage.includes("listListeningMaterialsForShadowing"),
    false,
  );
  assert.match(player, /useTextSelection\(\)/);
  assert.equal(player.includes("onClick={closeSelection}"), false);
  assert.equal(player.includes("scrollIntoView"), false);
  assert.match(player, /targetCenter - visibleCenter/);
  assert.match(player, /max-w-5xl/);
  assert.match(player, /annotateJapaneseTextWithSudachi/);
  assert.match(player, /formatJapaneseTextWithSudachiRubyNotation/);
  assert.match(player, /fetch\('\/api\/pronunciation'/);
  // Preference state lives in the shared hook; the player only consumes it.
  assert.match(player, /usePronunciationSource\(sudachiAvailable\)/);
  assert.match(pronunciationHook, /PRONUNCIATION_SOURCE_STORAGE_KEY/);
  assert.equal(player.includes("播放一句后显示词汇"), false);
  assert.equal(player.includes("lg:grid-cols-[minmax(0,1fr)_20rem]"), false);
  assert.match(sentenceRow, /data-context-sentence='true'/);
  assert.match(sentenceRow, /data-context-ignore='true'/);
  assert.match(sentenceRow, /select-none/);
  assert.equal(sentenceRow.includes("activeVocabulary"), false);
  assert.equal(
    sentenceRow.includes("isActive && currentState === 'idle'"),
    false,
  );
  assert.match(listeningRepository, /lastPlayedAt: true/);
  assert.equal(listeningLanding.includes("最近收听"), false);
  assert.match(listeningEntryCards, /group\/chapter/);
  assert.match(listeningEntryCards, /group\/section/);
  assert.match(listeningEntryCards, /max-h-\[min\(28rem,70vh\)\]/);
  assert.match(listeningLanding, /ListeningViewSwitcher/);
  assert.match(listeningFilter, /ui-section-head'>筛选/);
  assert.match(listeningFilter, /教材、章节或材料名/);
  assert.match(listeningFilter, /filters\.kind !== 'all'/);
  assert.match(listeningFilter, /filters\.language !== 'all'/);
  assert.match(listeningFilter, /entry\.languages\.includes/);
  assert.match(listeningFilter, /entry\.searchText/);
  assert.match(listeningLanding, /materialLanguageLabel/);
  assert.equal(
    listeningLanding.includes("grid-cols-[auto_minmax(0,1fr)_auto]"),
    false,
  );
  assert.equal(playerHeader.includes("· 累计{' '}"), false);
  assert.match(playerHeader, /PronunciationSourceSelector/);
  assert.match(playerHeader, /sudachiAvailable/);
});

test("vocabulary language groups use pronunciation and source evidence", async () => {
  const languageResolver = await readFile(
    path.join(ROOT, "modules/knowledge/vocabulary/domain/language.ts"),
    "utf8",
  );
  const vocabularyPage = await readFile(
    path.join(ROOT, "app/(knowledge)/vocabulary/page.tsx"),
    "utf8",
  );
  const vocabularyRepository = await readFile(
    path.join(ROOT, "modules/knowledge/vocabulary/server/repository.ts"),
    "utf8",
  );

  assert.match(languageResolver, /pronunciations\.some\(containsKana\)/);
  assert.match(languageResolver, /JAPANESE_SOURCE_TYPES\.has\(sourceType\)/);
  assert.match(vocabularyPage, /resolveVocabularyLanguageCode/);
  assert.match(vocabularyRepository, /pronunciations: true/);
  assert.match(vocabularyRepository, /sourceType: true/);
});

test("selection popover supports pointer, keyboard and dialog semantics", async () => {
  const hook = await readFile(
    path.join(ROOT, "hooks/useTextSelection.ts"),
    "utf8",
  );
  const tooltip = await readFile(
    path.join(ROOT, "components/exam/WordTooltip.tsx"),
    "utf8",
  );

  assert.match(hook, /selectionchange/);
  assert.match(hook, /pointerup/);
  assert.match(hook, /event\.pointerType === 'touch'/);
  assert.equal(hook.includes("touchend"), false);
  assert.match(hook, /getSelectionFingerprint\(\) === previousSelection/);
  assert.match(hook, /lastKeyboardSelectionAtRef\.current > 500/);
  assert.match(hook, /scheduleSelectionCommit\(240\)/);
  assert.match(hook, /window\.addEventListener\('scroll', handleWindowScroll/);
  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(tooltip, /role=\{panelOpen \? 'dialog' : undefined\}/);
  assert.match(tooltip, /aria-label='关闭记录面板'/);
  assert.match(tooltip, /window\.visualViewport/);
});
