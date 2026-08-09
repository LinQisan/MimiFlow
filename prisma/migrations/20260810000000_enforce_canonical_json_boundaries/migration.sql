-- Material IDs have one canonical representation after the data migration.
ALTER TABLE "materials"
  ADD CONSTRAINT "materials_id_uuid_format_check"
  CHECK (
    "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) NOT VALID;

ALTER TABLE "materials"
  VALIDATE CONSTRAINT "materials_id_uuid_format_check";

-- Canonical question data lives in typed columns. `content` is extension-only.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_content_extension_only_check"
  CHECK (
    NOT ("content" ?| ARRAY[
      'prompt',
      'context',
      'contextSentence',
      'options',
      'answer',
      'analysis',
      'explanation',
      'note',
      'questionType'
    ])
  ) NOT VALID;

ALTER TABLE "questions"
  VALIDATE CONSTRAINT "questions_content_extension_only_check";
