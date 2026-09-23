import 'server-only'

import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readJsonRecord } from '@/lib/validation/schema'
import { getPaperQuestionSectionNumber } from '@/modules/questions/domain/paper-editor'
import { resolveListeningSection } from '@/modules/practice/domain/listening-section'
import { getQuestionGroupKey, type RandomPracticeFilters } from '@/modules/practice/domain/random-selection'

function shuffleList<T>(list: T[]): T[] {
  const copied = [...list];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

export async function getRandomExamQuestionIdsBySelections(
  selectionKeys: string[],
  requestedCount: number,
  filters?: RandomPracticeFilters,
) {
  const userId = await getCurrentUserId();
  const normalizedLanguage = (filters?.language || "").trim();
  const normalizedLevel = (filters?.level || "").trim();
  const scope = filters?.scope || "unattempted";
  const hasCollectionFilter = Boolean(normalizedLanguage || normalizedLevel);

  const selectedKeySet = new Set(selectionKeys);
  const selectedMaterialTypes = new Set<MaterialType>();
  for (const key of selectedKeySet) {
    if (key.startsWith("LISTENING:") || key === "MATERIAL:LISTENING") {
      selectedMaterialTypes.add(MaterialType.LISTENING);
    } else if (key === "MATERIAL:READING") {
      selectedMaterialTypes.add(MaterialType.READING);
    } else if (key === "MATERIAL:VOCAB_GRAMMAR") {
      selectedMaterialTypes.add(MaterialType.VOCAB_GRAMMAR);
    } else if (key.startsWith("LANGUAGE:")) {
      selectedMaterialTypes.add(MaterialType.VOCAB_GRAMMAR);
      selectedMaterialTypes.add(MaterialType.READING);
    }
  }

  const candidateRows = await prisma.question.findMany({
    where: {
      material: {
        type: { in: Array.from(selectedMaterialTypes) },
        ...(hasCollectionFilter
          ? {
              collectionMaterials: {
                some: {
                  collection: {
                    ...(normalizedLanguage
                      ? { language: normalizedLanguage }
                      : {}),
                    ...(normalizedLevel ? { level: normalizedLevel } : {}),
                  },
                },
              },
            }
          : {}),
      },
    },
    select: {
      id: true,
      materialId: true,
      questionType: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { attempts: { where: { userId } } } },
      material: {
        select: { type: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const materialRows = await prisma.material.findMany({
    where: { id: { in: Array.from(new Set(candidateRows.map(row => row.materialId))) } },
    select: { id: true, type: true, chapterName: true, contentPayload: true, metadata: true },
  });
  const materialById = new Map(materialRows.map(row => [row.id, row]));
  const needsListeningContent = Array.from(selectedKeySet).some(key => key.startsWith("LISTENING:"))
    && !selectedKeySet.has("MATERIAL:LISTENING");
  const firstListeningQuestionByMaterial = new Map<string, string>();
  if (needsListeningContent) {
    for (const row of candidateRows) {
      if (row.material.type === MaterialType.LISTENING && !firstListeningQuestionByMaterial.has(row.materialId)) {
        firstListeningQuestionByMaterial.set(row.materialId, row.id);
      }
    }
  }
  const firstListeningQuestionIds = Array.from(firstListeningQuestionByMaterial.values());
  const listeningContentRows = firstListeningQuestionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: firstListeningQuestionIds } },
        select: { id: true, content: true },
      })
    : [];
  const listeningContentById = new Map(listeningContentRows.map(row => [row.id, row.content]));

  const groupsMap = new Map<
    string,
    {
      groupKey: string;
      material: (typeof materialRows)[number];
      questions: typeof candidateRows;
    }
  >();

  for (const question of candidateRows) {
    const material = materialById.get(question.materialId);
    if (!material) continue;
    const groupKey = getQuestionGroupKey({ ...question, material });
    const existing = groupsMap.get(groupKey);
    if (existing) {
      existing.questions.push(question);
    } else {
      groupsMap.set(groupKey, {
        groupKey,
        material,
        questions: [question],
      });
    }
  }

  const matchingGroups = Array.from(groupsMap.values()).filter((group) => {
    const materialType = group.material.type;
    const firstQ = group.questions[0];
    let matchesSelection = false;

    if (selectedKeySet.has(`MATERIAL:${materialType}`)) {
      matchesSelection = true;
    } else if (materialType === MaterialType.LISTENING) {
      const section = resolveListeningSection({
        content: decodeQuestionContent(listeningContentById.get(firstQ.id)),
        payload: decodeMaterialPayloadRecord(
          materialType,
          group.material.contentPayload,
        ),
        metadata: readJsonRecord(group.material.metadata),
        chapterName: group.material.chapterName,
      });
      matchesSelection = selectedKeySet.has(
        `LISTENING:${section.partNumber || 1}`,
      );
    } else {
      const sectionNumber = getPaperQuestionSectionNumber(
        materialType,
        firstQ.questionType,
      );
      matchesSelection = selectedKeySet.has(`LANGUAGE:${sectionNumber}`);
    }

    if (!matchesSelection) return false;

    if (scope === "unattempted") {
      return group.questions.every((q) => q._count.attempts === 0);
    }
    if (scope === "attempted") {
      return group.questions.some((q) => q._count.attempts > 0);
    }
    return true;
  });

  const selectedGroups = shuffleList(matchingGroups).slice(
    0,
    Math.max(0, Math.floor(requestedCount)),
  );

  return selectedGroups.flatMap((group) => group.questions.map((q) => q.id));
}

