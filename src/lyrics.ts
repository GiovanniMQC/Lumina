// ================================================================
//  lyrics.ts — Busca e parse de letras via lrclib.net
// ================================================================

const LRCLIB_BASE = 'https://lrclib.net/api'

export interface LyricLine {
  timeMs: number
  text: string
}

// Palavra individual com timestamp calculado
export interface LyricWord {
  timeMs: number
  text: string
}

// Linha com palavras distribuídas no tempo
export interface LyricLineWithWords {
  timeMs: number
  text: string
  words: LyricWord[]
}

export type LyricsResult =
  | { type: 'synced'; lines: LyricLine[] }
  | { type: 'plain';  lines: string[] }
  | { type: 'none' }

// ── Word Timing Distributor ────────────────────────────────────
// Distribui o tempo de cada linha entre suas palavras,
// ponderando pelo número de caracteres de cada palavra
// para um efeito mais natural.

export function computeWordTimings(lines: LyricLine[]): LyricLineWithWords[] {
  return lines.map((line, i) => {
    const nextTimeMs = lines[i + 1]?.timeMs ?? (line.timeMs + 6000)
    const duration   = Math.max(nextTimeMs - line.timeMs, 500)

    // Separa em palavras ignorando espaços múltiplos
    const wordTexts = line.text.split(/\s+/).filter(w => w.length > 0)

    if (wordTexts.length === 0) {
      return { timeMs: line.timeMs, text: line.text, words: [] }
    }

    const charCounts  = wordTexts.map(w => w.length)
    const totalChars  = charCounts.reduce((a, b) => a + b, 0)

    // Reserva 15% do tempo no início da linha antes da primeira palavra
    const leadMs    = Math.round(duration * 0.15)
    const speakMs   = duration - leadMs

    let cumulative = 0
    const words: LyricWord[] = wordTexts.map((text, wi) => {
      const offset  = leadMs + Math.round((cumulative / totalChars) * speakMs)
      cumulative   += charCounts[wi]
      return { timeMs: line.timeMs + offset, text }
    })

    return { timeMs: line.timeMs, text: line.text, words }
  })
}

// ── LRC Parser ────────────────────────────────────────────────
// Formato: [mm:ss.xx]texto  ou  [mm:ss.xxx]texto

const LRC_REGEX = /^\[(\d{1,2}):(\d{2})[.:](\d{1,3})\](.*)/

export function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const raw of lrc.split('\n')) {
    const match = raw.trim().match(LRC_REGEX)
    if (!match) continue

    const minutes = parseInt(match[1], 10)
    const seconds = parseInt(match[2], 10)
    // Normaliza centésimos/milissegundos para ms
    const fracStr = match[3].padEnd(3, '0').slice(0, 3)
    const frac    = parseInt(fracStr, 10)

    const timeMs = minutes * 60_000 + seconds * 1_000 + frac
    const text   = match[4].trim()

    lines.push({ timeMs, text })
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

// ── lrclib.net Search ─────────────────────────────────────────

interface LrclibResult {
  id:             number
  trackName:      string
  artistName:     string
  albumName:      string
  duration:       number
  syncedLyrics:   string | null
  plainLyrics:    string | null
}

async function searchLrclib(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<LrclibResult | null> {
  const params = new URLSearchParams({
    track_name:  trackName,
    artist_name: artistName,
    album_name:  albumName,
    duration:    String(Math.round(durationMs / 1000)),
  })

  try {
    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
      headers: { 'Lrclib-Client': 'TabHub/0.1 (github.com/user/tabhub)' },
    })

    if (res.status === 404) {
      // Tenta busca mais ampla sem duração
      return searchLrclibFuzzy(trackName, artistName)
    }

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function searchLrclibFuzzy(
  trackName: string,
  artistName: string
): Promise<LrclibResult | null> {
  const params = new URLSearchParams({
    track_name:  trackName,
    artist_name: artistName,
  })

  try {
    const res = await fetch(`${LRCLIB_BASE}/search?${params}`, {
      headers: { 'Lrclib-Client': 'TabHub/0.1 (github.com/user/tabhub)' },
    })

    if (!res.ok) return null
    const results: LrclibResult[] = await res.json()
    return results[0] ?? null
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<LyricsResult> {
  const result = await searchLrclib(trackName, artistName, albumName, durationMs)

  if (!result) {
    return { type: 'none' }
  }

  // Prefere letras sincronizadas
  if (result.syncedLyrics) {
    const lines = parseLRC(result.syncedLyrics)
    if (lines.length > 0) {
      return { type: 'synced', lines }
    }
  }

  // Fallback: letra plana
  if (result.plainLyrics) {
    const lines = result.plainLyrics
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)

    if (lines.length > 0) {
      return { type: 'plain', lines }
    }
  }

  return { type: 'none' }
}
