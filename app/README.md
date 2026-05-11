# App Route Structure

This project uses Next.js route groups to keep source routes semantic without
changing public URLs.

- `(home)`: dashboard and first-screen entry points.
- `(study)`: active learning flows, practice, review, retry, shadowing, and exams.
- `(knowledge)`: reusable knowledge systems such as vocabulary, wordbooks, and grammar.
- `(library)`: browsable content libraries such as articles, ebooks, media subtitles, and collections.
- `(tools)`: supporting utilities such as search, Anki import, and settings.
- `(admin)`: operational management screens such as uploads, audio management, paper management, and FSRS admin.
- `actions`: shared server actions used across route groups.
- `api`: route handlers.

Route group names in parentheses are omitted from the URL. For example,
`app/(study)/shadowing/page.tsx` still serves `/shadowing`.
