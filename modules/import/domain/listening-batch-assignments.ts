export function selectListeningQuestionEntriesForFile<
  Question extends { sourceFileName: string | null },
>(questions: Question[], fileName: string, isBatch: boolean) {
  return questions
    .map((question, globalIndex) => ({ question, globalIndex }))
    .filter(({ question }) =>
      isBatch ? question.sourceFileName === fileName : true,
    )
}
