# 📚 LinguaBook - EPUB Translator (English → Indonesian)

**LinguaBook** is a modern, high-performance web application designed to translate `.epub` ebooks from **English to natural, fluent Indonesian** using the **Google Gemini API**, while preserving 100% of the book's original typography, HTML formatting, images, CSS stylesheets, and structural metadata.

---

## ✨ Features

- **End-to-End EPUB Processing**:
  - Unpacks and parses standard EPUB 2 and EPUB 3 archives.
  - Automatically extracts cover images, titles, authors, and language metadata.
  - Sequential chapter-by-chapter and paragraph batch translation.
- **Strict Formatting & Styling Preservation**:
  - Translates only text content nodes.
  - Preserves HTML tags (`<p>`, `<h1>`-`<h6>`, `<em>`, `<strong>`, `<blockquote>`, `<ul>`, `<ol>`, `<li>`, `<a>`, `<img>`, etc.), CSS classes, IDs, and attributes.
  - Retains all images, fonts, and stylesheets without corruption.
- **Literary & Context-Aware Translation**:
  - Batches paragraphs to maintain narrative context, character voices, dialogue nuances, and idiomatic expressions.
  - Avoids stiff, mechanical translations (e.g. produces natural Indonesian like *"Watson, sahabatku, kau datang pada waktu yang benar-benar tepat."* instead of literal phrasing).
- **Genre-Specific Translation Styles**:
  - **Natural / Literary (Default)**: Optimized for novels, fiction, dialogues, and character voices.
  - **Non-fiction**: Clear, authoritative prose for essays, self-help, biographies, and articles.
  - **Academic**: Formal standard Indonesian (PUEBI), preserving scholarly terms and citations.
  - **Technical**: Accurate technical terminology, preserving code snippets and parameters.
- **Robust Queue & Error Handling**:
  - Concurrency limit (`MAX_CONCURRENT_TRANSLATIONS = 2`) to respect API quotas and rate limits.
  - Automatic 3-stage retry with exponential backoff for failed batches.
  - Manual retry button per batch without re-translating completed sections.
  - Cancel button to stop translations immediately.
- **In-App Reader / Preview Mode**:
  - Preview translated chapters before or after full completion.
  - Chapter selector with previous/next navigation.
  - Adjustable font size (`A-` / `A+`), line height, and reading themes (Light, Warm Sepia, Dark).
  - Side-by-side mode comparing Indonesian translation with original English.
- **100% EPUB Specification Compliant**:
  - Repackages valid EPUB zip archives with uncompressed `mimetype` at offset 0 (`STORE` mode).
  - Ready to open in **ReadEra**, **Apple Books**, **Calibre**, **Kobo**, and **Moon+ Reader**.
- **Privacy-First & Secure**:
  - Temporary in-memory processing.
  - Books and files are never stored permanently on the server.
  - API keys are strictly kept server-side and never exposed to the client.

---

## 🛠️ Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [@lucide/svelte](https://lucide.dev/)
- **EPUB & DOM Processing**: [JSZip](https://stuk.github.io/jszip/) & [Cheerio](https://cheerio.js.org/)
- **AI Engine**: [Google Gen AI SDK](https://www.npmjs.com/package/@google/genai) (`gemini-2.5-flash`)

---

## 🚀 Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher (v20+ recommended)
- Google Gemini API Key (Get one free from [Google AI Studio](https://aistudio.google.com/))

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd jolly-shannon
npm install
```

### 3. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Google Gemini API Key (Required)
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini Model (Default: gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash

# Maximum concurrent translation batches
MAX_CONCURRENT_TRANSLATIONS=2
```

*(Note: You can also enter or override the API key directly in the web UI via the Settings icon)*

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for Production

```bash
npm run build
npm run preview
```

---

## 📖 How to Use

1. **Upload Book**: Drag and drop your `.epub` file (up to 50 MB) into the dropzone.
2. **Review Overview**: LinguaBook will display detected metadata (cover, title, author, chapter count, word count, and estimated batches).
3. **Select Style**: Choose from *Natural/Literary*, *Non-fiction*, *Academic*, or *Technical*.
4. **Start Translation**: Click **Start Translation**. Watch live progress by chapter and batch.
5. **Preview & Read**: Click **Read Online** to preview translated chapters in the comfortable reader mode with font and theme controls.
6. **Download**: Click **Download Indonesian EPUB** to obtain your ready-to-read `.epub` file.

---

## 📁 Project Architecture

```text
src/
├── routes/
│   ├── +layout.svelte              # Theme, header, settings modal, API status
│   ├── +page.svelte                # Upload, book overview, progress dashboard, reader preview
│   ├── layout.css                  # Tailwind styles & reader typography
│   └── api/
│       ├── upload/+server.ts       # EPUB validation & session creation
│       ├── translate/
│       │   ├── start/+server.ts    # Start translation queue
│       │   ├── status/+server.ts   # SSE & polling progress stream
│       │   ├── cancel/+server.ts   # Cancel translation queue
│       │   └── retry/+server.ts    # Retry single failed batch
│       ├── preview/+server.ts      # Reader preview endpoint
│       ├── download/+server.ts     # EPUB repackaging & streaming
│       └── config/+server.ts       # Server configuration check
│
├── lib/
│   ├── epub/
│   │   ├── types.ts                # EPUB and translation TypeScript interfaces
│   │   ├── parser.ts               # JSZip container & OPF parser
│   │   └── builder.ts              # Valid EPUB ZIP generator (mimetype STORE)
│   │
│   └── translation/
│       ├── gemini.ts               # Google Gen AI client with retry backoff
│       ├── prompts.ts              # Literary, non-fiction, academic system prompts
│       ├── chunker.ts              # Cheerio DOM extractor & XHTML re-assembler
│       └── queue.ts                # In-memory session manager & concurrency queue
```

---

## 📜 License

MIT License.
