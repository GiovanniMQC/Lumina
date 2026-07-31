// ================================================================
//  lyrics.ts — Busca e parse de letras via lrclib.net
//  Estratégia em cascata para máxima cobertura:
//   1. GET exato (título + artista + álbum + duração)
//   2. SEARCH estruturado (título + artista) → pick melhor resultado
//   3. SEARCH por q= (texto livre, remove acentos)
// ================================================================

const LRCLIB_BASE = 'https://lrclib.net/api'
const HEADERS     = { 'Lrclib-Client': 'TabHub/1.0 (dashboard)' }

export interface LyricLine {
  timeMs: number
  text: string
}

export interface LyricWord {
  timeMs: number
  text: string
}

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

export function computeWordTimings(lines: LyricLine[]): LyricLineWithWords[] {
  return lines.map((line, i) => {
    const nextTimeMs = lines[i + 1]?.timeMs ?? (line.timeMs + 6000)
    const duration   = Math.max(nextTimeMs - line.timeMs, 500)
    const wordTexts  = line.text.split(/\s+/).filter(w => w.length > 0)

    if (wordTexts.length === 0) {
      return { timeMs: line.timeMs, text: line.text, words: [] }
    }

    const charCounts = wordTexts.map(w => w.length)
    const totalChars = charCounts.reduce((a, b) => a + b, 0)

    // Reserva 10% do tempo antes da primeira palavra (era 15%)
    const leadMs   = Math.round(duration * 0.10)
    const speakMs  = duration - leadMs

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

const LRC_REGEX = /^\[(\d{1,2}):(\d{2})[.:](\d{1,3})\](.*)/

export function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const raw of lrc.split('\n')) {
    const match = raw.trim().match(LRC_REGEX)
    if (!match) continue

    const minutes = parseInt(match[1], 10)
    const seconds = parseInt(match[2], 10)
    const fracStr = match[3].padEnd(3, '0').slice(0, 3)
    const frac    = parseInt(fracStr, 10)
    const timeMs  = minutes * 60_000 + seconds * 1_000 + frac
    const text    = match[4].trim()

    // Ignora linhas de metadados vazias ou tags internas [xx:xx]
    if (text.startsWith('[') || text === '') continue

    lines.push({ timeMs, text })
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

// ── Helpers ───────────────────────────────────────────────────

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sanitize(s: string): string {
  return s
    .replace(/\s*[\(\[].+?[\)\]]/g, '') // (feat. X), [Ao Vivo], etc.
    .replace(/\s*-\s*(single|ao vivo|live|version|remix).*/gi, '')
    .trim()
}

// ── lrclib.net ────────────────────────────────────────────────

interface LrclibResult {
  id:           number
  trackName:    string
  artistName:   string
  albumName:    string
  duration:     number
  syncedLyrics: string | null
  plainLyrics:  string | null
}

/** Prioriza syncedLyrics, depois escolhe duração mais próxima */
function pickBest(results: LrclibResult[], durationSec: number): LrclibResult | null {
  if (!results.length) return null
  const synced = results.filter(r => r.syncedLyrics && r.syncedLyrics.length > 0)
  const pool   = synced.length > 0 ? synced : results
  return pool.reduce((best, cur) => {
    const bestDiff = Math.abs((best.duration ?? 0) - durationSec)
    const curDiff  = Math.abs((cur.duration  ?? 0) - durationSec)
    return curDiff < bestDiff ? cur : best
  })
}

// 1. Busca exata: GET com título + artista + álbum + duração
async function searchExact(
  track: string, artist: string, album: string, durationSec: number
): Promise<LrclibResult | null> {
  const params = new URLSearchParams({
    track_name: track, artist_name: artist, album_name: album,
    duration: String(durationSec),
  })
  try {
    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, { headers: HEADERS })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// 2. Search estruturado: título + artista, pick melhor
async function searchStructured(
  track: string, artist: string, durationSec: number
): Promise<LrclibResult | null> {
  const params = new URLSearchParams({ track_name: track, artist_name: artist })
  try {
    const res = await fetch(`${LRCLIB_BASE}/search?${params}`, { headers: HEADERS })
    if (!res.ok) return null
    return pickBest(await res.json(), durationSec)
  } catch { return null }
}

// 3. Texto livre sem acentos (fallback para música brasileira)
async function searchFreeText(
  track: string, artist: string, durationSec: number
): Promise<LrclibResult | null> {
  const q = removeAccents(`${sanitize(track)} ${sanitize(artist)}`).toLowerCase()
  const params = new URLSearchParams({ q })
  try {
    const res = await fetch(`${LRCLIB_BASE}/search?${params}`, { headers: HEADERS })
    if (!res.ok) return null
    return pickBest(await res.json(), durationSec)
  } catch { return null }
}

// ── Public API ────────────────────────────────────────────────

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<LyricsResult> {
  const durationSec = Math.round(durationMs / 1000)
  const cleanTrack  = sanitize(trackName)
  const cleanArtist = sanitize(artistName)

  // Cascata: exato → estruturado → texto livre
  const result =
    (await searchExact(cleanTrack, cleanArtist, albumName, durationSec)) ??
    (await searchStructured(cleanTrack, cleanArtist, durationSec)) ??
    (await searchFreeText(cleanTrack, cleanArtist, durationSec))

  if (!result) return { type: 'none' }

  if (result.syncedLyrics) {
    const lines = parseLRC(result.syncedLyrics)
    if (lines.length > 0) return { type: 'synced', lines }
  }

  if (result.plainLyrics) {
    const lines = result.plainLyrics
      .split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length > 0) return { type: 'plain', lines }
  }

  return { type: 'none' }
}
