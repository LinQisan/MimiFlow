-- Persist sorting positions as semantic tokens. Imported papers historically
-- used both parentheses and underline glyphs, and "★＿＿＿" could be read as
-- two positions by the practice UI.
UPDATE "public"."questions"
SET "prompt" = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            "prompt",
            '[★＊][ 　]*[＿_]{2,}',
            '[[sort:star]]',
            'g'
          ),
          '[★＊]',
          '[[sort:star]]',
          'g'
        ),
        '[＿_]{2,}',
        '[[sort]]',
        'g'
      ),
      '[（(][[:space:]　]*[）)]',
      '[[sort]]',
      'g'
    ),
    '[（(][[:space:]　]*[0-9]+[[:space:]　]*[）)]',
    '[[sort]]',
    'g'
  ),
  '[［\[][[:space:]　]*[0-9]+[[:space:]　]*[]］]',
  '[[sort]]',
  'g'
),
"updated_at" = CURRENT_TIMESTAMP
WHERE "question_type" = 'SORTING'
  AND "prompt" IS NOT NULL;
