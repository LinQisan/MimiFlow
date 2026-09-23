import { normalizeQuestionSectionTitle } from '../../questions/domain/section-heading.ts'
import { getToeicPartByNumber, getToeicPartByQuestionType } from '../../questions/domain/toeic.ts'

export const LISTENING_SECTION_FALLBACK = {
  key: "listening",
  title: "听力",
  partNumber: null,
};

function normalizeSectionKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return "";
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === "string" && value.trim()) {
    const match = value.trim().match(/\d+/);
    if (!match) return null;
    const normalized = Number(match[0]);
    return Number.isFinite(normalized) && normalized > 0
      ? Math.floor(normalized)
      : null;
  }
  return null;
}

export function resolveListeningSection({
  content,
  payload,
  chapterName,
  questionType,
  language,
}: {
  content: Record<string, unknown>;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  chapterName?: string | null;
  questionType?: string | null;
  language?: string | null;
}) {
  const typedToeicPart = getToeicPartByQuestionType(questionType || "");
  if (typedToeicPart) {
    return {
      key: `toeic-part-${typedToeicPart.part}`,
      title: `Part ${typedToeicPart.part} · ${typedToeicPart.title}`,
      partNumber: typedToeicPart.part,
    };
  }

  const explicitTitle = firstString(
    payload.listeningSectionTitle,
    content.listeningSectionTitle,
  );
  const normalizedLanguage = (language || "").trim().toLowerCase();
  const isEnglish =
    normalizedLanguage === "en" || normalizedLanguage.startsWith("en-");
  const toeicPartMatch = isEnglish
    ? [
        chapterName,
        explicitTitle,
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .match(/\b(?:pt|part)\s*([1-7])\b/i)
    : null;
  const inferredToeicPart = toeicPartMatch
    ? getToeicPartByNumber(Number(toeicPartMatch[1]))
    : null;
  if (inferredToeicPart) {
    return {
      key: `toeic-part-${inferredToeicPart.part}`,
      title: `Part ${inferredToeicPart.part} · ${inferredToeicPart.title}`,
      partNumber: inferredToeicPart.part,
    };
  }
  const titleFromChapter = chapterName
    ?.match(/(?:問題|问题)\s*\d+(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i)?.[1]
    ?.trim();
  const explicitPart = toPositiveInteger(
    content.listeningSectionNumber ?? payload.listeningSectionNumber,
  );
  if (explicitPart) {
    return {
      key: `listening-part-${explicitPart}`,
      title: isEnglish ? explicitTitle || titleFromChapter || "听力" : normalizeQuestionSectionTitle(explicitTitle || titleFromChapter || "听力", explicitPart),
      partNumber: explicitPart,
    };
  }

  const title = firstString(
    content.listeningSectionTitle,
    payload.listeningSectionTitle,
    chapterName,
  );

  if (!title) return LISTENING_SECTION_FALLBACK;
  const canonicalTitle = title.match(
    /(?:問題|问题)\s*(\d+)(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i,
  );
  if (canonicalTitle) {
    const sectionNumber = toPositiveInteger(canonicalTitle[1]);
    const sectionTitle = canonicalTitle[2]?.trim();
    if (sectionNumber && sectionTitle) {
      return {
        key: `listening-part-${sectionNumber}`,
        title: normalizeQuestionSectionTitle(sectionTitle, sectionNumber),
        partNumber: sectionNumber,
      };
    }
  }
  const titlePart = toPositiveInteger(title);
  if (titlePart && /部分|part|問題|问题|大题/i.test(title)) {
    return {
      key: `listening-part-${titlePart}`,
      title: "听力",
      partNumber: titlePart,
    };
  }

  return {
    key: normalizeSectionKey(title) || LISTENING_SECTION_FALLBACK.key,
    title,
    partNumber: null,
  };
}

