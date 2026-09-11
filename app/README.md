# App Route Structure

`app/` mirrors public page paths directly: for example, `/listening` is defined
by `app/listening/page.tsx`, and `/manage` by `app/manage/page.tsx`.

- `manage`: the operations area for imports, listening, practice, vocabulary,
  grammar, system tools, and review settings. Its layout lives at
  `app/manage/layout.tsx` and applies only to this real URL segment.
- `vocabulary`: vocabulary pages and wordbook details. Its layout stays at
  `app/vocabulary/layout.tsx` for this route subtree.
- `api`: narrow route handlers. Shared Japanese pronunciation is exposed at
  `/api/pronunciation`; analytics remain under their public route paths.

Routes compose domain modules. Reusable business rules and business client components
do not live beside pages: shared question rules are in `modules/questions/domain`,
persistence stays in repositories/services, and client state belongs with its module.
