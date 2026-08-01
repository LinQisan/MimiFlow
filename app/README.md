# App Route Structure

This project uses Next.js route groups to keep source routes semantic without
changing public URLs.

- `(home)`: dashboard and first-screen entry points.
- `(study)`: active learning flows for listening, practice, and the memory/mistake review center.
- `(knowledge)`: reusable knowledge systems such as vocabulary, wordbooks, and grammar.
- `(library)`: browsable reading and subtitle libraries.
- `(tools)`: supporting utilities such as global search.
- `(admin)`: the `/manage` operations area for imports, listening, practice, vocabulary, collections, search results, audio, and review settings.
- `actions`: shared server actions used across route groups.
- `api`: route handlers.

Route group names in parentheses are omitted from the URL. For example,
`app/(study)/listening/page.tsx` still serves `/listening`.
