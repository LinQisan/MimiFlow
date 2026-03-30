# 🎧 MimiFlow

**An immersive, multi-language audio repeater and shadowing platform.**

Built with modern web technologies (Next.js & React), MimiFlow is designed to help language learners master pronunciation, rhythm, and vocabulary. What started as a dedicated Japanese learning app has evolved into a universal language engine, featuring intelligent word segmentation, spaced repetition, and an Apple-tier interactive UI.

## ✨ Key Features

- 🌍 **Universal Multi-Language Support**
  - **Auto-Language Detection:** Automatically sniffs the language of the transcript (English, Japanese, Chinese, Korean, etc.) using lightweight Regex algorithms.
  - **i18n Interface:** Seamlessly switch the UI language (e.g., English, 简体中文, 日本語) with a globally accessible, frosted-glass toggle.
- 👆 **"Tap-to-Translate" (Zero-Latency Mobile Experience)**
  - Powered by the native `Intl.Segmenter` API, sentences are intelligently tokenized into clickable words without heavy NLP libraries.
  - Bypasses clunky native mobile text-selection menus, allowing users to tap any word for instant vocabulary saving with a silky-smooth, layout-shift-free tooltip.
- 🧠 **FSRS Muscle Memory Training**
  - Integrates the state-of-the-art **Free Spaced Repetition Scheduler (FSRS)** algorithm to track your sentence shadowing progress.
  - Transforms abstract stability data into gamified, easy-to-understand fluency badges (e.g., "Needs Practice" ➡️ "Fluent").
- 🎵 **Interactive Audio-Text Sync**
  - The transcript automatically highlights in real-time as the audio plays, keeping your eyes perfectly synced with your ears.
- 🔁 **Single-Sentence Looping**
  - Click the loop icon on any sentence to repeat it endlessly. Perfect for intensive shadowing practice until you master the intonation.
- 🙈 **Blind Listening Mode**
  - Blurs the transcript to test your pure listening comprehension. The text only reveals itself when it's actively playing or when you intentionally hover over it.
- 💅 **Premium UX/UI Design**
  - Features a modern Bento-grid dashboard, Dark Glassmorphism tooltips, and absolute-positioned drawer animations to ensure **zero layout shift** across both desktop and mobile devices.

## 🛠 Tech Stack

- **Framework:** Next.js (App Router), React
- **Styling:** Tailwind CSS (Focus on fluid typography and micro-interactions)
- **Database:** Prisma ORM with LibSQL (SQLite)
- **Algorithms:** FSRS (Spaced Repetition), `Intl.Segmenter` (Tokenization)
