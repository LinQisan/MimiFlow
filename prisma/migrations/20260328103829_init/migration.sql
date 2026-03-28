-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonNum" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audioFile" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "Lesson_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dialogue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sequenceId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start" REAL NOT NULL,
    "end" REAL NOT NULL,
    "lessonId" TEXT NOT NULL,
    CONSTRAINT "Dialogue_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
