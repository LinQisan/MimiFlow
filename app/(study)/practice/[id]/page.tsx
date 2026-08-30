// Practice paper overview.
import { notFound } from "next/navigation";
import Link from "next/link";
import { findPaperDetailById } from "@/lib/repositories/exam";
import { getQuestionTypeDisplay } from "@/utils/questions/typeLabels";
import {
  getReadingQuestionSection,
  getVocabGrammarQuestionSection,
  isReadingGrammarQuestion,
} from "@/modules/questions/domain/paper-editor";
import { getToeicPartByQuestionType } from "@/modules/questions/domain/toeic";
import { groupQuestionsByMaterial } from "@/modules/practice/domain/material-question-groups";
import { buildAnswerCardSections } from "@/modules/practice/domain/answer-card-sections";
import PaperWordFrequencyDialog from "@/features/practice/ui/PaperWordFrequencyDialog";
import { formatTokyoDateTime } from "@/utils/time/format";

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paper = await findPaperDetailById(id);
  // 2. 错误处理：如果数据库中找不到该试卷，返回 404 页面
  if (!paper) {
    notFound();
  }
  const normalizedPaperLanguage = (paper.language || "").trim().toLowerCase();
  const isJapanesePaper =
    normalizedPaperLanguage === "ja" ||
    normalizedPaperLanguage.startsWith("ja-");
  const isEnglishPaper =
    normalizedPaperLanguage === "en" ||
    normalizedPaperLanguage.startsWith("en-");

  const listeningSections = Array.from(
    paper.lessons
      .flatMap((lesson) =>
        (lesson.questions || []).map((question) => ({
          ...question,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          audioFile: lesson.audioFile,
          sectionKey: question.sectionKey || "listening",
          sectionTitle: question.sectionTitle || "听力",
          sectionNumber: question.sectionNumber || null,
        })),
      )
      .reduce<
        Map<
          string,
          {
            key: string;
            title: string;
            sectionNumber: number | null;
            questions: Array<{
              id: string;
              lessonId: string;
              lessonTitle: string;
              audioFile: string | null;
              prompt: string | null;
              contextSentence: string | null;
              sectionKey: string;
              sectionTitle: string;
              sectionNumber: number | null;
            }>;
          }
        >
      >((acc, question) => {
        const key = question.sectionKey;
        const existing = acc.get(key) || {
          key,
          title: question.sectionTitle,
          sectionNumber: question.sectionNumber,
          questions: [],
        };
        existing.questions.push(question);
        acc.set(key, existing);
        return acc;
      }, new Map())
      .values(),
  ).sort((a, b) => {
    const aNumber = a.sectionNumber || Number.MAX_SAFE_INTEGER;
    const bNumber = b.sectionNumber || Number.MAX_SAFE_INTEGER;
    if (aNumber !== bNumber) return aNumber - bNumber;
    return a.title.localeCompare(b.title, "zh-CN");
  });

  const quizTypeSections = Array.from(
    paper.quizzes
      .flatMap((quiz) =>
        quiz.questions.map((question, index) => ({
          ...question,
          quizTitle: quiz.title,
          questionNumber: index + 1,
        })),
      )
      .reduce<
        Map<
          string,
          {
            questionType: string;
            questions: Array<{
              id: string;
              questionType: string;
              quizTitle: string;
              questionNumber: number;
              prompt: string | null;
              contextSentence: string | null;
            }>;
          }
        >
      >((acc, question) => {
        const key = question.questionType;
        const section = acc.get(key) || { questionType: key, questions: [] };
        section.questions.push(question);
        acc.set(key, section);
        return acc;
      }, new Map())
      .values(),
  )
    .map((section) => ({
      ...section,
      ...getVocabGrammarQuestionSection(section.questionType),
    }))
    .sort((a, b) => a.sectionNumber - b.sectionNumber);

  const passageQuestions = paper.passages.flatMap((passage, passageIndex) =>
    (passage.questions || []).map((question, questionIndex) => ({
      ...question,
      passageId: passage.id,
      passageTitle: passage.title,
      passageIndex,
      questionIndex,
    })),
  );
  const readingGrammarQuestions = passageQuestions
    .filter((question) => isReadingGrammarQuestion(question.questionType))
    .sort(
      (a, b) =>
        a.passageIndex - b.passageIndex ||
        a.order - b.order ||
        a.questionIndex - b.questionIndex,
    );
  const languageQuestionGroups = (isJapanesePaper
    ? [
        {
          key: "TEXT_VOCAB",
          title: "文字・語彙",
          sections: quizTypeSections.filter(
            (section) =>
              section.sectionNumber >= 1 && section.sectionNumber <= 4,
          ),
          readingGrammarQuestions: [] as typeof readingGrammarQuestions,
        },
        {
          key: "GRAMMAR",
          title: "文法",
          sections: quizTypeSections.filter(
            (section) =>
              section.sectionNumber >= 5 && section.sectionNumber <= 7,
          ),
          readingGrammarQuestions,
        },
      ]
    : [
        {
          key: "LANGUAGE",
          title: isEnglishPaper ? "Reading" : "语言",
          sections: quizTypeSections,
          readingGrammarQuestions,
        },
      ]
  ).filter(
    (group) =>
      group.sections.length > 0 || group.readingGrammarQuestions.length > 0,
  );
  const readingSections = Array.from(
    passageQuestions
      .filter((question) => !isReadingGrammarQuestion(question.questionType))
      .reduce<
        Map<
          number,
          {
            sectionNumber: number;
            title: string;
            questions: typeof passageQuestions;
          }
        >
      >((sections, question) => {
        const toeicPart = isEnglishPaper
          ? getToeicPartByQuestionType(question.questionType)
          : null;
        const section = toeicPart
          ? {
              sectionNumber: toeicPart.part,
              title: `Part ${toeicPart.part} · ${toeicPart.title}`,
            }
          : getReadingQuestionSection(question.questionType);
        const current = sections.get(section.sectionNumber) || {
          ...section,
          questions: [],
        };
        current.questions.push(question);
        sections.set(section.sectionNumber, current);
        return sections;
      }, new Map())
      .values(),
  ).sort((a, b) => a.sectionNumber - b.sectionNumber);
  const questionNumberMap = new Map(
    buildAnswerCardSections(
      [
        ...quizTypeSections.flatMap(section => section.questions),
        ...passageQuestions,
        ...listeningSections.flatMap(section =>
          section.questions.map(question => ({
            ...question,
            lesson: {
              sectionNumber: section.sectionNumber,
              sectionTitle: section.title,
            },
          })),
        ),
      ],
      paper.language,
    ).flatMap(section =>
      section.items.map(item => [item.question.id, item.localNumber] as const),
    ),
  );
  const totalQuestionCount =
    quizTypeSections.reduce(
      (total, section) => total + section.questions.length,
      0,
    ) +
    listeningSections.reduce(
      (total, section) => total + section.questions.length,
      0,
    ) +
    paper.passages.reduce(
      (total, passage) => total + (passage.questions?.length || 0),
      0,
    );

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <Link
            href="/practice"
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
          >
            ← 试卷
          </Link>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {paper.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {paper.level || "练习"} · {totalQuestionCount} 题
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PaperWordFrequencyDialog paperId={paper.id} />
              <Link
                href={`/practice/${encodeURIComponent(paper.id)}/do`}
                className="ui-btn ui-btn-primary"
              >
                开始答题
              </Link>
            </div>
          </div>
        </header>

        {paper.practiceSubmissions.length > 0 && (
          <section className="mb-10">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  做题记录
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  最近 {paper.practiceSubmissions.length} 次完整作答
                </p>
              </div>
              <span className="text-xs text-slate-400">满分 180</span>
            </div>
            <div className="overflow-x-auto border-y border-slate-200">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-3">完成时间</th>
                    <th className="px-3 py-3 text-center">文字・词汇・语法</th>
                    <th className="px-3 py-3 text-center">阅读</th>
                    <th className="px-3 py-3 text-center">听力</th>
                    <th className="px-3 py-3 text-center">总分</th>
                    <th className="px-3 py-3 text-right">结果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paper.practiceSubmissions.map(submission => {
                    const reviewHref = `/practice/${encodeURIComponent(paper.id)}/submissions/${encodeURIComponent(submission.id)}`;
                    return (
                    <tr key={submission.id} className="hover:bg-white/70">
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                        <Link href={reviewHref} className="block hover:text-slate-950">
                          {formatTokyoDateTime(submission.completedAt)}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">
                        {submission.languageScore ?? "—"}
                        {submission.languageScore !== null && (
                          <span className="font-normal text-slate-400">/60</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">
                        {submission.readingScore ?? "—"}
                        {submission.readingScore !== null && (
                          <span className="font-normal text-slate-400">/60</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">
                        {submission.listeningScore ?? "—"}
                        {submission.listeningScore !== null && (
                          <span className="font-normal text-slate-400">/60</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-black tabular-nums text-slate-950">
                        {submission.totalScore ?? "—"}
                        {submission.totalScore !== null && (
                          <span className="font-normal text-slate-400">/180</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold">
                        <Link href={reviewHref} className="inline-flex items-center gap-2 hover:underline">
                          {submission.passed === null ? (
                            <span className="text-slate-400">
                              答对 {submission.correctCount}/{submission.questionCount}
                            </span>
                          ) : submission.passed ? (
                            <span className="text-emerald-700">合格</span>
                          ) : (
                            <span className="text-rose-700">未合格</span>
                          )}
                          <span className="text-slate-600">
                            查看错题（{submission.questionCount - submission.correctCount}）→
                          </span>
                        </Link>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              N1 合格条件：总分至少 100 分，且三个部分均至少 19 分。
            </p>
          </section>
        )}

        {languageQuestionGroups.map((languageGroup) => (
          <section key={languageGroup.key} className="mt-8">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-950">
              {languageGroup.title}
            </h2>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {languageGroup.sections.map((section) => {
                const questionCount = section.questions.length;
                const typeDisplay = getQuestionTypeDisplay(
                  section.questionType,
                );
                const toeicPart = isEnglishPaper
                  ? getToeicPartByQuestionType(section.questionType)
                  : null;

                return (
                  <div key={section.questionType} className="py-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold text-slate-900">
                        {isJapanesePaper
                          ? `問題${section.sectionNumber}｜${typeDisplay.label}`
                          : toeicPart
                            ? `Part ${toeicPart.part} · ${toeicPart.title}`
                            : typeDisplay.label}
                      </h3>
                      <span className="text-xs font-semibold text-slate-400">
                        {questionCount} 题
                      </span>
                    </div>
                    <div className="mt-3 grid gap-x-8 md:grid-cols-2">
                      {section.questions.map((question) => (
                        <Link
                          href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                          key={question.id}
                          className="group flex gap-3 border-t border-slate-100 py-3 text-sm transition first:border-t-0 hover:text-slate-950"
                        >
                          <span className="w-6 shrink-0 font-semibold tabular-nums text-slate-400 group-hover:text-slate-700">
                            {questionNumberMap.get(question.id) || question.questionNumber}
                          </span>
                          <span className="line-clamp-2 font-medium text-slate-700 group-hover:text-slate-950">
                            {question.prompt ||
                              question.contextSentence ||
                              "进入练习"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              {languageGroup.readingGrammarQuestions.length > 0 && (
                <div className="py-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-slate-900">
                      {isJapanesePaper ? "問題7｜文章の文法" : "Grammar"}
                    </h3>
                    <span className="text-xs font-semibold text-slate-400">
                      {languageGroup.readingGrammarQuestions.length} 题
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {languageGroup.readingGrammarQuestions.map(
                      question => (
                        <Link
                          href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                          key={question.id}
                          aria-label={`文章の文法第 ${questionNumberMap.get(question.id) || 1} 题`}
                          className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          {questionNumberMap.get(question.id) || 1}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}

        {readingSections.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-950">
              {isEnglishPaper ? "Reading" : isJapanesePaper ? "読解" : "阅读"}
            </h2>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {readingSections.map((section) => {
                const questionCount = section.questions.length;
                const passageGroups = groupQuestionsByMaterial(
                  section.questions,
                  (question) => question.passageId,
                );

                return (
                  <div key={section.sectionNumber} className="py-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="truncate font-bold text-slate-900">
                        {isJapanesePaper
                          ? `問題${section.sectionNumber}｜${section.title}`
                          : section.title}
                      </h3>
                      <span className="shrink-0 text-xs font-semibold text-slate-400">
                        {questionCount} 题
                      </span>
                    </div>

                    {questionCount > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {passageGroups.map((passageGroup, passageIndex) => {
                          if (passageGroup.questions.length === 1) {
                            const question = passageGroup.questions[0];
                            return (
                              <Link
                                key={passageGroup.materialId}
                                href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                                aria-label={`${section.title}第 ${questionNumberMap.get(question.id) || passageIndex + 1} 题，${question.passageTitle}`}
                                className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                              >
                                {questionNumberMap.get(question.id) || passageIndex + 1}
                              </Link>
                            );
                          }

                          return (
                            <div
                              key={passageGroup.materialId}
                              className="flex items-center gap-2"
                            >
                              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-600">
                                {passageIndex + 1})
                              </span>
                              <div
                                className="flex flex-wrap items-center gap-2"
                                aria-label={`第 ${passageIndex + 1} 篇的小问`}
                              >
                                {passageGroup.questions.map(
                                  (question, questionIndex) => (
                                    <Link
                                      key={question.id}
                                      href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                                      aria-label={`第 ${questionNumberMap.get(question.id) || questionIndex + 1} 题`}
                                      className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                                    >
                                      {questionNumberMap.get(question.id) || questionIndex + 1}
                                    </Link>
                                  ),
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">暂无题目</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {listeningSections.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-950">
              {isEnglishPaper ? "Listening" : "听力"}
            </h2>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {listeningSections.map((section) => {
                const questionCount = section.questions.length;
                const firstQuestion = section.questions[0];
                const lessonGroups = groupQuestionsByMaterial(
                  section.questions,
                  (question) => question.lessonId,
                );

                return (
                  <div key={section.key} className="py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-baseline gap-3">
                        {section.sectionNumber && isJapanesePaper ? (
                          <span className="text-xs font-bold text-slate-400">
                            問題{section.sectionNumber}
                          </span>
                        ) : null}
                        <h3 className="truncate font-bold text-slate-900">
                          {section.title}
                        </h3>
                        <span className="shrink-0 text-xs font-semibold text-slate-400">
                          {questionCount} 题
                        </span>
                      </div>
                      {firstQuestion && (
                        <Link
                          href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(firstQuestion.id)}`}
                          className="text-xs font-bold text-slate-600 transition hover:text-slate-950"
                        >
                          开始 →
                        </Link>
                      )}
                    </div>
                    {questionCount > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {lessonGroups.map((lessonGroup, lessonIndex) => {
                          if (lessonGroup.questions.length === 1) {
                            const question = lessonGroup.questions[0];
                            return (
                              <Link
                                href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                                key={lessonGroup.materialId}
                                aria-label={`${section.title}第 ${questionNumberMap.get(question.id) || lessonIndex + 1} 题`}
                                className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                              >
                                {questionNumberMap.get(question.id) || lessonIndex + 1}
                              </Link>
                            );
                          }

                          return (
                            <div
                              key={lessonGroup.materialId}
                              className="flex items-center gap-2"
                            >
                              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-600">
                                {lessonIndex + 1})
                              </span>
                              <div
                                className="flex flex-wrap items-center gap-2"
                                aria-label={`第 ${lessonIndex + 1} 段音频的小问`}
                              >
                                {lessonGroup.questions.map(
                                  (question, questionIndex) => (
                                    <Link
                                      key={question.id}
                                      href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                                      aria-label={`第 ${questionNumberMap.get(question.id) || questionIndex + 1} 题`}
                                      className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                                    >
                                      {questionNumberMap.get(question.id) || questionIndex + 1}
                                    </Link>
                                  ),
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">暂无题目</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
