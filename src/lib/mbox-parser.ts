export interface ParsedEmail {
  email: string
  subject: string
  body: string
  bodyHtml: string
  cc: string
  bcc: string
  date: string
  time: string
  direction: 'Incoming' | 'Outgoing'
}

interface BodyParts {
  plain: string
  html: string
}

export interface ProcessingCallbacks {
  onProgress: (bytesProcessed: number, totalBytes: number, emailsProcessed: number) => void
  onDone: (emails: ParsedEmail[]) => void
  onError: (error: Error) => void
}

function extractEmail(header: string): string {
  const angleMatch = header.match(/<([^>]+)>/)
  if (angleMatch) return angleMatch[1].trim()
  const emailMatch = header.match(/[\w.+\-]+@[\w.\-]+\.\w+/)
  if (emailMatch) return emailMatch[0]
  return header.trim()
}

function decodeEncodedWords(header: string): string {
  if (!header) return ''
  return header.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
          return new TextDecoder(charset).decode(bytes)
        } else {
          const qp = text
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            )
          return qp
        }
      } catch {
        return text
      }
    },
  )
}

function getCharset(contentType: string): string {
  const m = contentType.match(/charset\s*=\s*(?:"([^"]+)"|([^\s;]+))/i)
  return (m?.[1] || m?.[2] || 'utf-8').toLowerCase()
}

function decodeQuotedPrintable(text: string, charset = 'utf-8'): string {
  const noSoftBreaks = text.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  let i = 0
  while (i < noSoftBreaks.length) {
    if (
      noSoftBreaks[i] === '=' &&
      i + 2 < noSoftBreaks.length &&
      /^[0-9A-Fa-f]{2}$/.test(noSoftBreaks.substring(i + 1, i + 3))
    ) {
      bytes.push(parseInt(noSoftBreaks.substring(i + 1, i + 3), 16))
      i += 3
    } else {
      bytes.push(noSoftBreaks.charCodeAt(i))
      i++
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes))
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  }
}

function decodeBase64Body(text: string, charset = 'utf-8'): string {
  try {
    const cleaned = text.replace(/\s/g, '')
    const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0))
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  } catch {
    return text
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  // These headers may appear multiple times; concatenate instead of dropping duplicates.
  const CONCAT_KEYS = new Set(['cc', 'bcc'])
  let currentKey = ''
  const lines = text.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    // Folded continuation line
    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      headers[currentKey] = (headers[currentKey] ?? '') + ' ' + line.trim()
      continue
    }
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).toLowerCase().trim()
      const value = line.substring(colonIdx + 1).trim()
      currentKey = key
      if (key in headers) {
        if (CONCAT_KEYS.has(key) && value) headers[key] += ', ' + value
      } else {
        headers[key] = value
      }
    } else {
      currentKey = ''
    }
  }
  return headers
}

function decodeBodyContent(text: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase().trim()
  if (enc === 'base64') return decodeBase64Body(text, charset)
  if (enc === 'quoted-printable') return decodeQuotedPrintable(text, charset)
  return text
}

function parseDateHeader(dateStr: string): { date: string; time: string } {
  if (!dateStr) return { date: '', time: '' }
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return { date: '', time: '' }
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return { date: `${day}-${month}-${year}`, time: `${hours}:${minutes}` }
  } catch {
    return { date: '', time: '' }
  }
}

function extractFromMultipart(body: string, boundary: string): BodyParts {
  const delimiter = '--' + boundary
  const closing = delimiter + '--'
  const lines = body.split('\n')

  const parts: string[][] = []
  let current: string[] | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    if (line === delimiter || line === closing) {
      if (current !== null) parts.push(current)
      if (line === closing) break
      current = []
    } else if (current !== null) {
      current.push(rawLine)
    }
  }

  let plainText = ''
  let htmlRaw = ''

  for (const partLines of parts) {
    const emptyIdx = partLines.findIndex((l) => l.replace(/\r$/, '') === '')
    if (emptyIdx === -1) continue

    const headerText = partLines.slice(0, emptyIdx).join('\n')
    const bodyText = partLines.slice(emptyIdx + 1).join('\n')
    const ph = parseHeaders(headerText)
    const ct = ph['content-type'] || 'text/plain'
    const enc = ph['content-transfer-encoding'] || '7bit'
    const cs = getCharset(ct)

    if (ct.includes('multipart/')) {
      const m = ct.match(/boundary=(?:"([^"]+)"|([^;\s\r\n]+))/i)
      const nb = m?.[1] || m?.[2]
      if (nb) {
        const nested = extractFromMultipart(bodyText, nb)
        if (nested.plain) plainText = plainText || nested.plain
        if (nested.html) htmlRaw = htmlRaw || nested.html
      }
    } else if (ct.includes('text/plain') && !plainText) {
      plainText = decodeBodyContent(bodyText, enc, cs).trim()
    } else if (ct.includes('text/html') && !htmlRaw) {
      htmlRaw = decodeBodyContent(bodyText, enc, cs).trim()
    }
  }

  return { plain: plainText, html: htmlRaw }
}

function parseEmailMessage(raw: string, userEmail: string): ParsedEmail | null {
  const lines = raw.split('\n')
  let i = 0

  if (lines[0]?.replace(/\r$/, '').startsWith('From ')) i = 1

  const headerLines: string[] = []
  for (; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (line === '') {
      i++
      break
    }
    headerLines.push(lines[i])
  }

  const headers = parseHeaders(headerLines.join('\n'))
  const bodyText = lines.slice(i).join('\n')

  const from = headers['from'] || ''
  const to = headers['to'] || headers['x-original-to'] || ''
  const cc = decodeEncodedWords(headers['cc'] || headers['x-cc'] || '')
  const bcc = decodeEncodedWords(
    headers['bcc'] || headers['x-bcc'] || headers['x-mozilla-bcc'] || headers['x-original-bcc'] || '',
  )
  const subject = decodeEncodedWords(headers['subject'] || '(No Subject)')
  const contentType = headers['content-type'] || 'text/plain'
  const contentTransferEncoding = headers['content-transfer-encoding'] || '7bit'
  const charset = getCharset(contentType)
  const gmailLabels = (headers['x-gmail-labels'] || '').toLowerCase()
  const xFolder = (headers['x-folder'] || headers['x-folder-name'] || '').toLowerCase()
  const { date, time } = parseDateHeader(headers['date'] || '')

  const fromEmail = extractEmail(from)

  let isOutgoing = false
  if (userEmail && fromEmail.toLowerCase() === userEmail.toLowerCase()) {
    isOutgoing = true
  } else if (gmailLabels.includes('sent')) {
    isOutgoing = true
  } else if (xFolder.includes('sent')) {
    isOutgoing = true
  }

  const direction: 'Incoming' | 'Outgoing' = isOutgoing ? 'Outgoing' : 'Incoming'
  const emailField = isOutgoing ? extractEmail(to) : fromEmail

  let body = ''
  let bodyHtml = ''
  if (contentType.includes('multipart/')) {
    const m = contentType.match(/boundary=(?:"([^"]+)"|([^;\s\r\n]+))/i)
    const boundary = m?.[1] || m?.[2]
    if (boundary) {
      const parts = extractFromMultipart(bodyText, boundary)
      body = parts.plain || stripHtml(parts.html)
      bodyHtml = parts.html
    }
  } else if (contentType.includes('text/html')) {
    const decoded = decodeBodyContent(bodyText, contentTransferEncoding, charset)
    body = stripHtml(decoded)
    bodyHtml = decoded.trim()
  } else {
    body = decodeBodyContent(bodyText, contentTransferEncoding, charset).trim()
  }

  body = body.replace(/^>From /gm, 'From ')
  body = body.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  bodyHtml = bodyHtml.replace(/\r\n/g, '\n').trim()

  if (!from && !to) return null

  return { email: emailField, subject, body, bodyHtml, cc, bcc, date, time, direction }
}

function escapeCSV(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function generateCSV(emails: ParsedEmail[]): string {
  const rows = ['email,subject,body,body_html,cc,bcc,date,time,direction']
  for (const e of emails) {
    rows.push(
      [e.email, e.subject, e.body, e.bodyHtml, e.cc, e.bcc, e.date, e.time, e.direction]
        .map(escapeCSV)
        .join(','),
    )
  }
  return rows.join('\n')
}

export async function processMboxFile(
  file: File,
  userEmail: string,
  callbacks: ProcessingCallbacks,
): Promise<void> {
  const CHUNK_SIZE = 512 * 1024

  let lineBuffer = ''
  let messageLines: string[] = []
  let emailsProcessed = 0
  let offset = 0
  let seenFirstEnvelope = false
  const results: ParsedEmail[] = []

  const flushMessage = () => {
    if (messageLines.length === 0) return
    const parsed = parseEmailMessage(messageLines.join('\n'), userEmail)
    if (parsed) {
      results.push(parsed)
      emailsProcessed++
    }
    messageLines = []
  }

  try {
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const chunk = await file.slice(offset, end).text()
      offset = end

      const text = lineBuffer + chunk

      let processText: string
      if (offset < file.size) {
        const lastNL = text.lastIndexOf('\n')
        if (lastNL !== -1) {
          processText = text.substring(0, lastNL + 1)
          lineBuffer = text.substring(lastNL + 1)
        } else {
          lineBuffer = text
          callbacks.onProgress(offset, file.size, emailsProcessed)
          await new Promise((r) => setTimeout(r, 0))
          continue
        }
      } else {
        processText = text
        lineBuffer = ''
      }

      for (const rawLine of processText.split('\n')) {
        const line = rawLine.replace(/\r$/, '')
        if (line.startsWith('From ')) {
          if (seenFirstEnvelope) {
            flushMessage()
          } else {
            seenFirstEnvelope = true
          }
        }
        messageLines.push(line)
      }

      callbacks.onProgress(offset, file.size, emailsProcessed)
      await new Promise((r) => setTimeout(r, 0))
    }

    if (lineBuffer) messageLines.push(lineBuffer.replace(/\r$/, ''))
    flushMessage()

    callbacks.onDone(results)
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
  }
}
