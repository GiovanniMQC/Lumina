// ================================================================
//  sync.ts — Sincronização de letras com progress_ms
// ================================================================

export interface SyncState {
  activeIndex: number
  progressMs:  number
}

// Retorna o índice da linha ativa dado progress_ms
// Aceita qualquer array com propriedade timeMs (LyricLine | LyricLineWithWords)
export function getActiveLineIndex(
  lines: ReadonlyArray<{ timeMs: number }>,
  progressMs: number
): number {
  if (!lines.length) return -1

  let active = 0
  for (let i = 0; i < lines.length; i++) {
    if (progressMs >= lines[i].timeMs) {
      active = i
    } else {
      break
    }
  }

  return active
}

// ── Progress Interpolation ────────────────────────────────────
// Compensa a latência do polling (4s) interpolando progress_ms localmente

let _baseProgressMs = 0
let _baseTimestamp  = 0
let _isPlaying      = false
let _durationMs     = 0

export function setPlaybackState(
  progressMs: number,
  isPlaying: boolean,
  durationMs: number
): void {
  _baseProgressMs = progressMs
  _baseTimestamp  = Date.now()
  _isPlaying      = isPlaying
  _durationMs     = durationMs
}

export function getInterpolatedProgress(): number {
  if (!_isPlaying) return _baseProgressMs

  const elapsed = Date.now() - _baseTimestamp
  return Math.min(_baseProgressMs + elapsed, _durationMs)
}

// ── Lyric Scroll ──────────────────────────────────────────────

export function getLyricScrollOffset(
  container: HTMLElement,
  activeLine: HTMLElement | null
): number {
  if (!activeLine) return 0

  const containerHeight = container.clientHeight
  const lineTop         = activeLine.offsetTop
  const lineHeight      = activeLine.offsetHeight

  return lineTop - containerHeight / 2 + lineHeight / 2
}
