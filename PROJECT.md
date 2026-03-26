# mbox2csv — Project Knowledge

## Purpose

A browser-based utility that converts `.mbox` email archive files into CSV format. All processing happens entirely client-side — no data ever leaves the user's browser.

**Live app**: https://magnusfoldager.github.io/mbox2csv/

---

## Project Structure

```
mbox2csv/
├── src/
│   ├── App.tsx                  # Main React component — UI, state, file handling
│   ├── App.css                  # App styles
│   ├── main.tsx                 # React entry point
│   ├── index.css                # Global styles (Tailwind + dark mode)
│   ├── components/ui/
│   │   ├── button.tsx           # CVA-based button with variants
│   │   └── card.tsx             # Card layout component
│   ├── lib/
│   │   ├── mbox-parser.ts       # Core mbox parsing and CSV generation
│   │   └── utils.ts             # cn() utility for Tailwind class merging
│   └── assets/
│       ├── gh-logo.svg
│       └── gh-logo-white.svg
├── public/                      # Static assets, favicons, site.webmanifest
├── dist/                        # Built output (git-tracked, deployed to GH Pages)
├── .github/                     # GitHub Actions workflows (CI/CD)
├── index.html                   # HTML entry point
├── vite.config.ts               # Vite config — base: /mbox2csv/, path alias @/→src/
├── tsconfig*.json               # TypeScript configs (strict, ES2022, ESNext)
├── components.json              # shadcn config (base-nova style, lucide icons)
├── eslint.config.js             # ESLint with TS + React hooks rules
└── package.json
```

---

## Tech Stack

| Category | Libraries |
|---|---|
| Framework | React 19, TypeScript ~5.8 |
| Styling | Tailwind CSS 4, tw-animate-css, tailwind-merge |
| Components | shadcn (base-nova), @base-ui/react, lucide-react |
| Variants | class-variance-authority, clsx |
| Fonts | @fontsource-variable/geist |
| Build | Vite 7, @vitejs/plugin-react |
| Lint | ESLint 9, TypeScript ESLint 8 |
| Deploy | gh-pages → GitHub Pages |

---

## Core Logic: mbox-parser.ts

### Main functions

- **`processMboxFile(file, userEmail, onProgress)`** — reads the file in 512KB chunks, splits on `From ` separators, invokes `parseEmailMessage` per message, reports progress
- **`parseEmailMessage(raw)`** — parses raw message text into a `ParsedEmail` object
- **`extractFromMultipart(body, boundary, isHtml)`** — handles multipart MIME messages recursively
- **`parseHeaders(raw)`** — extracts header key/value pairs, handles folded headers
- **`decodeEncodedWords(str)`** — decodes RFC 2047 `=?charset?encoding?text?=` sequences
- **`decodeQuotedPrintable(str)`** — decodes QP-encoded content
- **`decodeBase64Body(str, charset)`** — decodes base64 content with charset conversion
- **`stripHtml(html)`** — converts HTML to plain text
- **`parseDateHeader(dateStr)`** — parses email dates into `{ date: 'DD-MM-YYYY', time: 'HH:MM' }`
- **`generateCSV(emails)`** — serializes `ParsedEmail[]` to UTF-8 BOM CSV string

### ParsedEmail interface

```typescript
interface ParsedEmail {
  email: string        // primary sender or recipient
  subject: string
  body: string         // plain text body
  bodyHtml: string     // HTML body
  cc: string
  bcc: string
  date: string         // DD-MM-YYYY
  time: string         // HH:MM
  direction: 'Incoming' | 'Outgoing'
}
```

### Direction detection (Incoming vs Outgoing)

Checks (in order):
1. `From` header matches the user-supplied email address
2. Gmail `X-Gmail-Labels` contains "sent"
3. `X-Folder` header contains "sent"

---

## CSV Output

Columns (fixed order): `email, subject, body, body_html, cc, bcc, date, time, direction`

- UTF-8 with BOM for broad spreadsheet compatibility
- Fields are quoted and internal quotes are escaped

---

## App States (App.tsx)

| State | Description |
|---|---|
| `idle` | Initial state — file drop zone visible |
| `processing` | Parsing in progress — shows progress bar and email count |
| `done` | Parsing complete — shows download CSV button |
| `error` | Parse failure — shows error message with reset option |

User also inputs their own email address so the parser can determine message direction.

---

## Development Commands

```bash
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build → /dist
npm run lint      # ESLint
npm run preview   # Preview production build locally
npm run deploy    # npm run build + gh-pages push to GitHub Pages
```

No test framework is currently configured.

---

## Key Design Decisions

- **Privacy-first**: zero server calls, all parsing in browser via Web File API
- **Chunked reading**: 512KB chunks prevent memory issues with large mbox files
- **Full MIME support**: multipart, base64, quoted-printable, RFC 2047 headers, multiple charsets
- **Streaming progress**: `onProgress` callback provides real-time UI feedback
- **dist is git-tracked**: deployment pushes `dist/` directly to the `gh-pages` branch via `gh-pages` package

---

## Deployment

GitHub Actions workflow triggers on push to `main`, builds, and deploys to GitHub Pages. The Vite `base` is set to `/mbox2csv/` to match the GH Pages subdirectory URL.
