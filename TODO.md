# TODO

## Bugs / Correctness

- [ ] **`From ` line detection too broad** (`mbox-parser.ts:362`) — any body line starting with `From ` triggers a message split. Validate against the mbox envelope format (email address + date) to avoid false splits.
- [ ] **`>From ` unescaping missing from `bodyHtml`** (`mbox-parser.ts:286`) — mbox-escaped `>From ` lines are only unescaped in `body`, not `bodyHtml`.
- [ ] **`parseDateHeader` uses local timezone** (`mbox-parser.ts:159-164`) — `d.getDate()`, `d.getHours()` etc. reflect the user's local timezone, not the email's. Use UTC methods or offset-aware parsing.
- [ ] **Outgoing `email` field silently blank when `To` is missing** (`mbox-parser.ts:266`) — `extractEmail('')` returns `''` with no indication of the missing header.
- [ ] **CSV uses `\n` instead of `\r\n`** (`mbox-parser.ts:308`) — RFC 4180 requires `\r\n`; some parsers (especially on Windows) may not handle `\n`-only files.

## Data Loss / Truncation

- [ ] **Body collapsed to single line** (`mbox-parser.ts:287`) — all newlines replaced with spaces, discarding paragraph structure. Consider preserving line breaks or making this configurable.
- [ ] **Only first `text/plain` and `text/html` parts kept** (`mbox-parser.ts:211-214`) — subsequent parts (e.g. quoted reply text) are silently dropped.
- [ ] **BOM responsibility split** (`App.tsx:71`) — BOM is added in `handleDownload`, not in `generateCSV`, making the function's output incomplete if called independently.

## UX / Logic

- [ ] **Email input not validated on convert** (`App.tsx:173`) — button is only gated on non-empty string; any non-empty value (e.g. `"x"`) is accepted, causing silent direction detection failure.
- [ ] **No cancellation during processing** (`App.tsx:43-67`) — once started, processing cannot be cancelled without closing the tab.
- [ ] **All results held in memory** (`App.tsx:59`) — entire parsed email array accumulates in state; could cause memory pressure on large mailboxes.

## Minor

- [ ] **`extractEmail` regex not RFC 5321 compliant** (`mbox-parser.ts:27`) — won't match multi-level subdomains or TLDs like `.co.uk`; may partially match unexpected strings.
- [ ] **Q-encoding ignores charset** (`mbox-parser.ts:42-47`) — `=XX` bytes are converted with `String.fromCharCode` instead of being collected and decoded via `TextDecoder`, producing mojibake for non-ASCII charsets (e.g. `=?utf-8?Q?...`).
