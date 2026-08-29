# MimiFlow design system

MimiFlow uses a calm editorial workspace style: warm paper backgrounds, dark ink,
clear rules, compact controls, and generous reading space. It should feel closer
to a well-edited study notebook than a colorful consumer dashboard.

The implemented source of truth is `app/globals.css`. This document describes the
current system and the rules new screens should follow.

## Principles

1. Content is primary. Long Japanese passages, transcripts, questions, and notes
   must remain more prominent than navigation or decoration.
2. Hierarchy comes from typography, spacing, and divider lines. Avoid stacking
   cards inside cards.
3. The frame is neutral. Use color only for actions, state, correctness, warnings,
   and learning meaning.
4. Controls should be compact but comfortable. A dense management screen may show
   more information without reducing touch targets below 40px.
5. Focus modes remove global navigation so listening, reading, practice, and review
   can use the full viewport without distraction.

## Color

### Editorial foundation

| Role | Light value | Usage |
| --- | --- | --- |
| Paper canvas | `#f6f5f1` | Page and navigation background |
| Raised paper | `#ffffff` | Inputs, dialogs, deliberate content surfaces |
| Muted paper | `#efeee9` | Secondary rows, hover and grouped controls |
| Ink | `#20242b` | Headings, primary text, primary buttons |
| Muted ink | `#667085` | Descriptions and metadata |
| Faint ink | `#98a0ad` | De-emphasized labels |
| Rule | `#dde1e6` | Standard dividers |
| Strong rule | `#bcc3cc` | Input and emphasized boundaries |

Dark mode uses the same hierarchy with `#111318` paper, `#191c22` raised paper,
`#22262e` muted paper, and `#edf0f4` ink.

### Semantic color

- Indigo is the primary interactive accent: `--color-primary` and its surface,
  border, and text variants.
- Teal is the secondary/success accent: `--color-secondary` and its variants.
- Emerald means correct or successful; rose means incorrect, destructive, or
  failed; amber means warning; blue means informational; violet is reserved for a
  distinct learning category.
- Never use semantic color as general decoration. Every colored surface must convey
  a state or category.

## Typography

MimiFlow uses installed system fonts so Chinese, Japanese, and English render
quickly and naturally.

- Chinese UI: PingFang SC, Hiragino Sans GB, Noto/Source Han Sans, Microsoft YaHei.
- Japanese UI and reading: Hiragino Kaku Gothic ProN, Yu Gothic, BIZ UDPGothic,
  Noto Sans JP, Meiryo.
- English UI: Inter, Avenir Next, Segoe UI, Helvetica Neue, Arial.
- Monospace: the system UI monospace stack.

The active interface language sets `data-lang` on `<html>` and selects the correct
stack. Content whose language differs from the interface must use the matching
`font-word-*`, `font-reading-*`, or `font-reading-body-*` utility.

### Hierarchy

- Page title: strong weight, tight tracking, normally 28–36px on desktop and
  24–30px on mobile.
- Section title: 18–24px, semibold or bold.
- Body and reading text: 14–18px depending on density; use relaxed line height for
  passages and explanations.
- UI labels: 12–14px, semibold.
- Metadata: 11–12px, muted; never use it for essential instructions.
- Brand label: uppercase with wide tracking, intentionally small.

Do not introduce a display font, artificial condensed text, or decorative serif
without changing the global system deliberately.

## Layout

- General screens use centered containers up to `max-w-7xl` with 16px mobile and
  32px desktop gutters.
- Reading and focused forms use narrower measures appropriate to their content.
- Global navigation is a compact editorial rule on the paper canvas and becomes
  sticky on desktop.
- Route-level headers use `editorial-page-header`: title and actions separated by a
  bottom rule.
- Major sections normally use 24–32px vertical separation. Related form rows use
  12–20px.
- Mobile layouts stack first; horizontal toolbars must wrap or scroll without
  clipping their labels.

## Surfaces and depth

- Prefer flat sections separated by `border-slate-200` rules.
- Use white raised paper only where containment improves comprehension: inputs,
  dialogs, menus, answer blocks, and selected working surfaces.
- Standard interactive radius is 6–10px. Popovers and dialogs may use 12–14px.
- Large rounded cards are not the default. Editorial overrides intentionally flatten
  bordered `rounded-xl`, `rounded-2xl`, and `rounded-3xl` content containers.
- Shadows are reserved for floating layers such as menus and popovers. Do not add
  shadows to every section.

## Components

### Buttons

- Use `.ui-btn` for standard actions: 40px tall, neutral border, compact label.
- Use `.ui-btn-primary` for the single main action in a local area: dark ink surface
  with white text.
- Use `.ui-btn-danger` only for destructive actions and pair material deletion with
  confirmation.
- `.ui-btn-sm` is suitable for secondary toolbar actions, not the only mobile CTA.
- Icon-only buttons require an accessible name.

### Inputs

- Inputs use raised paper, a strong neutral border, and a visible ink/focus ring.
- Use `CustomSelect` for application selection flows that require consistent
  rendering; native selects retain a shared chevron and padding.
- Number inputs use `.ui-number-stepper` when increment/decrement controls matter.
- Labels remain visible. Placeholder text is an example, never a replacement for a
  label or format explanation.
- Validation belongs next to the relevant field and uses concise semantic color.

### Tags and status

- `.ui-tag` is a compact pill for metadata.
- Use `.ui-tag-muted`, `.ui-tag-info`, `.ui-tag-success`, and `.ui-tag-warn`
  according to meaning.
- Avoid long sentences inside pills and avoid rows made entirely of badges.

### Dialogs and menus

- Use the shared dialog context for alerts, confirms, and toasts.
- Floating surfaces use `.ui-pop`/`.ui-pop-surface` or equivalent shared menu
  styling, with a border and restrained shadow.
- Dialogs must expose a clear title, initial focus, Escape behavior, and keyboard
  navigation. Menus and listboxes must use their correct semantic role.

### Questions and reading

- Preserve the authored question order and the visual relationship between passage,
  prompt, options, answer, and explanation.
- Reading passages use `.reading-passage-body`; paragraphs have visible rhythm and
  Japanese text may be justified with language-aware wrapping.
- Structured tables scroll horizontally on narrow screens rather than shrinking to
  illegibility.
- Ruby annotations must not pollute text selection. `rt` is non-selectable and
  pronunciation placement stays centered.
- Sorting slots, the starred slot, underlines, footnotes, and cloze blanks are
  semantic content. Their styling must not change stored text or copy behavior.
- Correct, wrong, selected, mastered, and pending states must differ by more than
  color alone through labels, borders, icons, or placement.

## Motion and interaction

- Use 150–200ms color and border transitions for controls.
- Avoid idle animation on study and reading pages.
- Theme switching temporarily disables transitions to prevent flicker.
- Respect reduced-motion preferences for any newly introduced movement.
- Keep keyboard focus visible and preserve native text selection in passages.

## Responsive rules

- Mobile breakpoint behavior starts below 768px; inputs use at least 16px text to
  prevent iOS zoom.
- Primary actions may become full width on mobile.
- Dense tables, tabs, and question navigation should scroll horizontally with a
  hidden scrollbar rather than compressing content.
- Desktop sticky elements must degrade to normal document flow on small screens.
- Test Japanese wrapping, long Chinese labels, and English labels independently.

## Do and do not

Do:

- Reuse the editorial variables and `ui-*` primitives.
- Use one clear page title and one primary action per local task.
- Prefer dividers and whitespace to nested card decoration.
- Keep study content readable and management content scan-friendly.
- Check light, dark, mobile, keyboard, and mixed-language rendering.

Do not:

- Reintroduce a generic blue-gradient dashboard style.
- Use arbitrary colors or shadows when an existing semantic token applies.
- wrap every row in a rounded card.
- Hide required information in hover-only UI.
- Mix native and custom controls without a functional reason.
- Allow decorative markup to alter copied Japanese text or answer parsing.
