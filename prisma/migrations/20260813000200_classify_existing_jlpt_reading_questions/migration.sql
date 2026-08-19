WITH classified(material_id, question_type, material_title) AS (
  VALUES
    ('ae4c8ab5-1003-5376-bad7-bebd8cc6241b', 'FILL_BLANK'::"QuestionType", '問題7｜文章の文法'),
    ('161e83c3-9b2b-5c71-a2e5-ba41f8ae848b', 'READING_SHORT'::"QuestionType", '問題8｜内容理解（短文）'),
    ('9534d7f7-aa39-5fbf-b174-87581353c310', 'READING_SHORT'::"QuestionType", '問題8｜内容理解（短文）'),
    ('9f5d6b49-0c80-5e03-ab82-35447659a3b9', 'READING_SHORT'::"QuestionType", '問題8｜内容理解（短文）'),
    ('a1ddf2b0-c287-5abb-95b7-8f8b5660a2c1', 'READING_SHORT'::"QuestionType", '問題8｜内容理解（短文）'),
    ('4d3a0c16-d4e7-5fa0-a42b-51f488348e86', 'READING_MEDIUM'::"QuestionType", '問題9｜内容理解（中文）'),
    ('74b3f5e4-301d-5693-b517-558edb7dc63a', 'READING_MEDIUM'::"QuestionType", '問題9｜内容理解（中文）'),
    ('22a15efd-87b2-503e-a9fb-249f1ba59e08', 'READING_MEDIUM'::"QuestionType", '問題9｜内容理解（中文）'),
    ('b1c905b5-31d6-582d-b8f2-0af2a5dd4615', 'READING_MEDIUM'::"QuestionType", '問題9｜内容理解（中文）'),
    ('b782b626-ffd0-5d0b-83ac-004c01eeb060', 'READING_LONG'::"QuestionType", '問題10｜内容理解（長文）'),
    ('a3c0f6f9-6ade-57b5-a87b-bf61a13eac5d', 'READING_INTEGRATED'::"QuestionType", '問題11｜統合理解'),
    ('dd3dbe1b-d51f-5c3d-8877-aafe079dc46a', 'READING_ARGUMENT'::"QuestionType", '問題12｜主張理解（長文）'),
    ('4bb2b125-2818-5961-9574-75116d1dc0fe', 'READING_INFORMATION'::"QuestionType", '問題13｜情報検索'),
    ('66f1466e-ed8f-5b10-8a9e-5d0e075d66d2', 'FILL_BLANK'::"QuestionType", '問題7｜文章の文法')
)
UPDATE "questions" AS question
SET "question_type" = classified.question_type
FROM classified
WHERE question."material_id" = classified.material_id;

WITH classified(material_id, material_title) AS (
  VALUES
    ('ae4c8ab5-1003-5376-bad7-bebd8cc6241b', '問題7｜文章の文法'),
    ('161e83c3-9b2b-5c71-a2e5-ba41f8ae848b', '問題8｜内容理解（短文）'),
    ('9534d7f7-aa39-5fbf-b174-87581353c310', '問題8｜内容理解（短文）'),
    ('9f5d6b49-0c80-5e03-ab82-35447659a3b9', '問題8｜内容理解（短文）'),
    ('a1ddf2b0-c287-5abb-95b7-8f8b5660a2c1', '問題8｜内容理解（短文）'),
    ('4d3a0c16-d4e7-5fa0-a42b-51f488348e86', '問題9｜内容理解（中文）'),
    ('74b3f5e4-301d-5693-b517-558edb7dc63a', '問題9｜内容理解（中文）'),
    ('22a15efd-87b2-503e-a9fb-249f1ba59e08', '問題9｜内容理解（中文）'),
    ('b1c905b5-31d6-582d-b8f2-0af2a5dd4615', '問題9｜内容理解（中文）'),
    ('b782b626-ffd0-5d0b-83ac-004c01eeb060', '問題10｜内容理解（長文）'),
    ('a3c0f6f9-6ade-57b5-a87b-bf61a13eac5d', '問題11｜統合理解'),
    ('dd3dbe1b-d51f-5c3d-8877-aafe079dc46a', '問題12｜主張理解（長文）'),
    ('4bb2b125-2818-5961-9574-75116d1dc0fe', '問題13｜情報検索'),
    ('66f1466e-ed8f-5b10-8a9e-5d0e075d66d2', '問題7｜文章の文法')
)
UPDATE "materials" AS material
SET "title" = classified.material_title
FROM classified
WHERE material."id" = classified.material_id;
