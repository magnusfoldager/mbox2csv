import { useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { processMboxFile, generateCSV, type ParsedEmail } from '@/lib/mbox-parser'
import { Upload, FileText, CheckCircle } from 'lucide-react'
import './App.css'

import ghLogo from './assets/gh-logo.svg'
import ghLogoWhite from './assets/gh-logo-white.svg'

type AppState = 'idle' | 'processing' | 'done' | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [progress, setProgress] = useState(0)
  const [bytesProcessed, setBytesProcessed] = useState(0)
  const [emailsFound, setEmailsFound] = useState(0)
  const [results, setResults] = useState<ParsedEmail[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) setFile(selected)
  }

  const handleProcess = async () => {
    if (!file) return
    setAppState('processing')
    setProgress(0)
    setBytesProcessed(0)
    setEmailsFound(0)
    setResults([])
    setError('')

    await processMboxFile(file, userEmail.trim(), {
      onProgress: (bytes, total, emails) => {
        setProgress(Math.round((bytes / total) * 100))
        setBytesProcessed(bytes)
        setEmailsFound(emails)
      },
      onDone: (emails) => {
        setResults(emails)
        setAppState('done')
      },
      onError: (err) => {
        setError(err.message)
        setAppState('error')
      },
    })
  }

  const handleDownload = () => {
    const csv = generateCSV(results)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (file?.name.replace(/\.mbox$/i, '') ?? 'emails') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setAppState('idle')
    setFile(null)
    setProgress(0)
    setBytesProcessed(0)
    setEmailsFound(0)
    setResults([])
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <main className="bg-zinc-100 dark:bg-zinc-950 min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex flex-row items-between">
            <span className='flex-1'>mbox2csv</span>
            <span className='flex-1 text-right'>
              <a href="https://github.com/magnusfoldager/mbox2csv/" target="_blank" rel="noopener noreferrer" className="opacity-50 hover:opacity-100 transition-opacity">
              <img src={ghLogoWhite} alt="GitHub" className="hidden dark:inline-block h-5 w-5" />
              <img src={ghLogo} alt="GitHub" className="inline-block dark:hidden  h-5 w-5" />
              </a>
            </span>
          </CardTitle>
          <CardDescription className='max-w-[70%]'>
            {appState === 'idle' && 'Convert an .mbox file to CSV, without any data ever leaving your browser.'}
            {appState === 'processing' && 'Converting your mailbox…'}
            {appState === 'done' &&
              `Done. ${results.length.toLocaleString()} emails converted.`}
            {appState === 'error' && 'Something went wrong.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* ── Idle ── */}
          {appState === 'idle' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="user-email" className="text-sm font-medium">
                  Your email address
                </label>
                <input
                  id="user-email"
                  type="email"
                  placeholder="you@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  required
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/40'
                }`}
              >
                {file ? (
                  <FileText className="h-10 w-10 text-sky-200 dark:text-sky-700" />
                ) : (
                  <Upload className="h-10 w-10 text-muted-foreground" />
                )}
                {file ? (
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground">
                      Drop your .mbox file here
                    </span>
                    <span className="text-xs text-muted-foreground">or click to browse</span>
                  </>
                )}
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".mbox"
                className="hidden"
                onChange={handleFileChange}
              />

              {file && (
                <Button onClick={handleProcess} className="w-full" disabled={!userEmail.trim()}>
                  Convert to CSV
                </Button>
              )}
            </>
          )}

          {/* ── Processing ── */}
          {appState === 'processing' && (
            <div className="flex flex-col gap-5 py-2">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatBytes(bytesProcessed)}
                    {file ? ` / ${formatBytes(file.size)}` : ''}
                  </span>
                  <span className="font-medium tabular-nums">{progress}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-150 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">
                    {emailsFound.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">emails found</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{progress}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">complete</p>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Processing entirely in your browser.
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {appState === 'done' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>
                  {results.length.toLocaleString()} email
                  {results.length !== 1 ? 's' : ''} ready to download
                </span>
              </div>
              <Button onClick={handleDownload} className="w-full">
                Download CSV
              </Button>
              <Button variant="outline" onClick={handleReset} className="w-full">
                Convert another file
              </Button>
            </div>
          )}

          {/* ── Error ── */}
          {appState === 'error' && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error || 'An unexpected error occurred.'}
              </div>
              <Button variant="outline" onClick={handleReset} className="w-full">
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

export default App
