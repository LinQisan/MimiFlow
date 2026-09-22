# MimiFlow design system

MimiFlow uses a calm editorial workspace style: warm paper backgrounds, dark ink,
restrained dividers, compact controls, and generous reading space. It should feel closer
to a well-edited study notebook than a colorful consumer dashboard.

The implemented source of truth is `app/globals.css`; shared interactive controls
live in `components/ui/`. This document defines the visual language, interaction
patterns, and composition rules that new and existing screens should follow.

Numeric values in this document describe the current implementation. If a value
differs from `app/globals.css`, the implemented design token or shared component
is authoritative.

---

## 1. Design principles

1. **Content is primary.**
   Long Japanese passages, transcripts, questions, vocabulary, and notes must remain
   more prominent than navigation or decoration.

2. **Hierarchy comes from whitespace, indentation, and typography.**
   Prefer whitespace and indentation to nested containers. Avoid stacking cards
   inside cards.

3. **The frame is neutral.**
   Use color for actions, state, correctness, warnings, and learning meaning—not as
   general decoration.

4. **Controls are compact but comfortable.**
   Dense management screens may show more information, but interactive targets should
   remain at least 40px where practical.

5. **Focused study removes distraction.**
   Listening, reading, practice, and review modes may remove global navigation and use
   the full viewport.

6. **Reuse before inventing.**
   Prefer shared `ui-*` primitives and `components/ui/` controls over route-specific
   visual systems.

---

## 2. Color

### Editorial foundation

| Role         | Current value | Usage                                        |
| ------------ | ------------- | -------------------------------------------- |
| Paper canvas | `#f6f5f1`     | Page and navigation background               |
| Raised paper | `#ffffff`     | Inputs, dialogs, deliberate content surfaces |
| Muted paper  | `#efeee9`     | Secondary rows, hover, grouped controls      |
| Ink          | `#20242b`     | Headings, primary text, primary buttons      |
| Muted ink    | `#667085`     | Descriptions and metadata                    |
| Faint ink    | `#98a0ad`     | De-emphasized labels                         |
| Rule         | `#dde1e6`     | Standard dividers                            |
| Strong rule  | `#bcc3cc`     | Inputs and emphasized boundaries             |

Dark mode follows the same hierarchy. Current dark values include `#111318` paper,
`#191c22` raised paper, `#22262e` muted paper, and `#edf0f4` ink.

### Semantic color

* Indigo is the primary interactive accent.
* Teal is the secondary or success accent.
* Emerald means correct or successful.
* Rose means incorrect, destructive, or failed.
* Amber means warning.
* Blue means informational.
* Violet is reserved for a distinct learning category.
* JLPT badges remain visually quiet and should not compete with semantic states.

Never use semantic colors merely as decoration. Every colored surface should
communicate an action, state, category, or learning meaning.

---

## 3. Typography

MimiFlow uses installed system fonts so Chinese, Japanese, and English render
quickly and naturally.

* Chinese UI: PingFang SC, Hiragino Sans GB, Noto/Source Han Sans, Microsoft YaHei.
* Japanese UI and reading: Hiragino Kaku Gothic ProN, Yu Gothic, BIZ UDPGothic,
  Noto Sans JP, Meiryo.
* English UI: Inter, Avenir Next, Segoe UI, Helvetica Neue, Arial.
* Monospace: system UI monospace stack.

The active interface language sets `data-lang` on `<html>` and selects the appropriate
font stack.

Content whose language differs from the interface should use the matching
`font-word-*`, `font-reading-*`, or `font-reading-body-*` utility.

### Hierarchy

* Page title: strong weight and tight tracking, normally 28–36px on desktop and
  24–30px on mobile.
* Section title: 18–24px, semibold or bold.
* Body and reading text: 14–18px depending on density.
* Long passages and explanations use relaxed line height.
* UI labels: 12–14px, semibold.
* Metadata: 11–12px and visually muted.
* Essential instructions must never rely on metadata styling.
* Brand labels may use uppercase and wide tracking intentionally.

Do not introduce display fonts, artificially condensed typography, or decorative
serifs without deliberately changing the global system.

---

## 4. Layout

* General screens use centered containers up to `max-w-7xl`.
* Use approximately 16px mobile and 32px desktop gutters.
* Reading and focused forms use narrower measures appropriate to their content.
* Global navigation is a compact editorial rule on the paper canvas and may become
  sticky on desktop.
* Route-level headers use `editorial-page-header` where a visible page header is
  necessary.
* Major sections normally use 24–32px vertical separation.
* Related form rows normally use 12–20px spacing.
* Mobile layouts stack first.
* Horizontal toolbars must wrap or scroll rather than clip labels.

Do not duplicate navigation labels with redundant page titles.

Library, review, and management screens normally follow:

`navigation → toolbar → content`

When navigation already makes the page identity obvious, begin with filters,
actions, metadata, or content rather than repeating the same title and description.

---

## 5. Surfaces and depth

* Prefer flat sections separated by 24–32px of whitespace. Nested groups use 32–40px indentation, smaller headings, and 12–16px spacing. Avoid repeated row borders and vertical divider lines; use a very subtle background for expanded groups when helpful. Reserve borders for controls, data tables, and boundaries needed to understand interaction.
* Use raised paper where containment improves comprehension:

  * inputs
  * dialogs
  * menus
  * answer blocks
  * selected working surfaces
* Standard interactive radius is approximately 6–10px.
* Popovers and dialogs may use approximately 12–14px.
* Large rounded cards are not the default.
* Existing editorial overrides intentionally flatten large `rounded-xl`,
  `rounded-2xl`, and `rounded-3xl` content containers.
* Shadows are reserved primarily for floating layers such as menus, popovers,
  inspectors, and dialogs.

Prefer:

`whitespace + indentation + typography`

over:

`card + card + card + shadow`

---

## 6. Shared components

### Page structure

Use:

* `.ui-toolbar` for filters and action bars.
* `.ui-section-head` for section headings that content alone cannot express.
* `.ui-meta` for counts, units, scope, and short metadata.
* `.ui-row` for browsable hairline list rows.
* `.ui-empty` for empty states.

Keep empty-state guidance concise.

### Buttons

* Use `.ui-btn` for standard actions.
* Use `.ui-btn-primary` for the single main action in a local task area.
* Use `.ui-btn-danger` only for destructive actions.
* Material deletion requires confirmation.
* `.ui-btn-sm` is suitable for secondary toolbar actions.
* Do not make `.ui-btn-sm` the only important mobile CTA.
* Icon-only buttons require an accessible name.

Avoid presenting several equally prominent primary buttons in the same local task.

### Inputs

* Inputs use raised paper, a strong neutral border, and a visible focus state.
* Use `CustomSelect` for normal application selection flows.
* Keep native selects only when native platform behavior is itself required, such
  as multiple selection.
* Use `DatePicker` for date input.
* Number inputs may use `.ui-number-stepper` where increment/decrement controls matter.
* Labels remain visible.
* Placeholder text is an example, not a replacement for a label or format explanation.
* Validation belongs next to the relevant field and uses concise semantic styling.

### Tags and status

* `.ui-tag` is a compact pill for metadata.
* Use semantic tag variants according to meaning.
* Use `.ui-tag-jlpt` and its level variants for JLPT badges.
* JLPT badges should remain quieter than informational blue.
* Avoid long sentences inside pills.
* Avoid rows composed almost entirely of badges.

---

## 7. Dialogs, menus, and floating surfaces

* Use the shared dialog context for alerts, confirmations, and toasts.
* Floating surfaces use `.ui-pop`, `.ui-pop-surface`, or equivalent shared styling.
* Floating surfaces use an opaque background, visible border, and restrained shadow.
* Dialogs expose:

  * a clear title
  * sensible initial focus
  * Escape behavior
  * keyboard navigation
* Menus and listboxes use their correct semantic roles.
* Portal-based controls must reposition or close when the viewport changes.
* Keep floating controls inside approximately a 12px mobile viewport gutter.

Do not create route-specific dialog or menu systems when a shared implementation
already exists.

---

## 8. Reading-context inspectors

A word, annotation, or learning-point inspector opened from reading content should
remain local to that content.

### Reading state

* Use an anchored, non-modal popover.
* Keep it near the selected text.
* Do not add a global backdrop.
* Keep it within the viewport gutter.
* Use fully opaque raised paper with a visible border and shadow.
* Passage text, ruby, or highlights must not show through the surface.
* Exclude the inspector from text-highlight processing where needed.

The initial state should be compact and optimized for reading.

It may show:

* word
* pronunciation
* part of speech
* concise meaning
* collection membership
* sourced definitions

Do not expose a full edit form immediately.

### Editing state

Editing is a deliberate secondary state inside the same inspector.

* Use compact fields.
* Use an internally scrolling body when necessary.
* Keep Save and Cancel actions persistent.
* Outside click may close the reading state.
* Outside click must not silently discard active edits.
* Escape should leave editing before closing the inspector.

Collection membership is secondary metadata.

Display selected collections quietly in reading mode and use checkboxes or a compact
list when editing. Do not turn every collection into a competing action button.

### Size

On desktop, reading inspectors are normally about 360–400px wide and should not
exceed the available viewport height.

On narrow screens, they may expand to the available viewport width minus the
standard gutter while preserving local, non-blocking behavior.

---

## 9. Study highlights

Learning points and wordbook matches appear as overlays on authored text.

They must not visually or interactively interfere with:

* ruby
* text selection
* copying
* answer parsing
* passage interaction

### Visual language

* Learning-point fills use semantic category colors.
* Wordbook membership uses a restrained underline.
* A legend or adjacent label explains meaning.
* Color alone must not carry essential information.

### Interaction

* Highlight computation is opt-in.
* Scope computation to the visible chapter, question, or subtitle page.
* Rebuild ranges when editable text changes.
* Overlay nodes must not block text selection or pointer interaction.
* Learning-point explanations open from the highlighted text in an anchored inspector.
* Keep category legends compact.
* Keep the active-content locator keyboard accessible.
* When a range also has a vocabulary annotation, preserve access to the word inspector.
* Legends and inspectors must work on both light and dark paper surfaces.

---

## 10. Vocabulary UI

Vocabulary details should preserve a natural reading flow.

Within each sense, use:

`definition → examples → translations → supporting details`

Definitions should appear directly before the examples they explain.

Do not interrupt that reading sequence with usage notes or unrelated reference
information.

### Supporting information

Patterns, collocations, idioms, usage restrictions, and related reference details
appear after the examples in a visually quieter area.

* Use a lightly tinted or otherwise secondary surface when containment helps.
* Align small category labels in a narrow left rail when practical.
* Let content wrap naturally.
* Do not put a border around every category.
* Do not use warning colors for ordinary explanatory notes.

Pronunciation, sentence sources, grammatical forms, and playback controls should
stay close to the content they describe while remaining visually secondary.

Hide empty reference categories in reading mode.

Editing mode may expose controls for adding missing categories.

Separate distinct senses or sources with deliberate whitespace rather than excessive
card decoration.

### Vocabulary navigation

Vocabulary navigation has two visible levels:

`series → wordbook`

* Series labels are organizational and visually quiet.
* Leaf wordbooks are selectable and carry counts, coverage, or selection state.
* Show the full `series / wordbook` path where ambiguity is possible.
* Coverage views prioritize matched vocabulary rather than decorative chart chrome.
* Reveal actual matched words on demand.

---

## 11. Questions and reading

* Preserve the visual relationship between passage, prompt, options, answer, and
  explanation.
* Reading passages use `.reading-passage-body`.
* Paragraphs should have visible rhythm.
* Japanese text may use language-aware justification and wrapping.
* Structured tables scroll horizontally on narrow screens rather than shrinking
  into illegibility.

### Ruby

* Ruby annotations must not pollute copied or selected text.
* `rt` remains non-selectable.
* Pronunciation placement stays visually centered.

### Semantic question markup

Sorting slots, starred slots, underlines, footnotes, and cloze blanks are meaningful
study content.

Their presentation must not break:

* displayed text
* text selection
* copying
* answer interaction

Correct, wrong, selected, mastered, and pending states must differ by more than
color alone.

Use labels, borders, icons, placement, or other redundant cues where appropriate.

---

## 12. Motion and interaction

* Use approximately 150–200ms color and border transitions for controls.
* Avoid idle animation on reading and study pages.
* Theme switching may temporarily disable transitions to prevent flicker.
* Respect `prefers-reduced-motion` for newly introduced movement.
* Keep keyboard focus visible.
* Preserve native text selection inside passages.

Motion should communicate state change, not decorate otherwise static study content.

---

## 13. Responsive behavior

Responsive design starts from the content rather than from desktop compression.

* Mobile behavior begins below approximately 768px.
* Inputs use at least 16px text where necessary to avoid iOS zoom.
* Primary actions may become full width on mobile.
* Dense tables, tab bars, and question navigation may scroll horizontally.
* Prefer scrolling to compressing labels into illegibility.
* Desktop sticky elements degrade to normal document flow on small screens.
* Floating surfaces remain within the standard viewport gutter.

Test independently with:

* Japanese wrapping
* long Chinese labels
* English labels
* light mode
* dark mode
* keyboard navigation
* mobile layouts

Do not assume that a layout working in one language will work in the others.

---

## 14. Page composition

A route page establishes:

* the canvas
* page context
* task-level actions
* composition

It should not reimplement shared control behavior.

Persistent content sections should remain flat and use whitespace, indentation,
and heading size for grouping.

Floating controls use shared popover primitives.

Destructive confirmation uses the shared dialog system.

For large editors, extract independent:

* toolbars
* popovers
* inspectors
* result panels

into named reusable components when doing so avoids route-specific interaction
patterns.

Practice, reading, listening, and vocabulary should present shared pronunciation
controls as one coherent feature rather than separate visual systems.

---

## 15. Accessibility

* Keep keyboard focus visible.
* Icon-only controls require accessible names.
* Do not rely on color alone for correctness, state, or learning meaning.
* Required information must not exist only on hover.
* Menus, dialogs, listboxes, and inspectors must expose appropriate semantics.
* Preserve native text selection in reading content.
* Keep essential instructions visually prominent enough to be read.
* Avoid touch targets that become impractically small on dense screens.
* Respect reduced-motion preferences.
* Ensure floating surfaces remain usable within small viewports.

---

## 16. Do and do not

### Do

* Reuse editorial variables and `ui-*` primitives.
* Reuse shared controls before creating route-specific ones.
* Use one primary action per local task.
* Prefer whitespace, indentation, and typography to repeated dividers or nested cards.
* Keep study content readable.
* Keep management content scan-friendly.
* Keep typography and spacing responsible for most visual hierarchy.
* Use color to communicate meaning.
* Keep reading interactions local and non-blocking.
* Check light, dark, mobile, keyboard, and mixed-language rendering.

### Do not

* Turn MimiFlow into a generic SaaS or dashboard UI with gradients, oversized cards,
  decorative metrics, or excessive colored surfaces.
* Reintroduce a generic blue-gradient dashboard style.
* Wrap every row or section in a rounded card.
* Stack cards inside cards without a clear containment reason.
* Use arbitrary colors or shadows when an existing semantic token applies.
* Hide required information in hover-only UI.
* Mix native and custom controls without a functional reason.
* Create private route-specific controls when a shared implementation already fits.
* Use decorative markup that changes copied Japanese text or answer interaction.
* Add idle animation to study or reading surfaces.
* Make metadata compete visually with the content being studied.