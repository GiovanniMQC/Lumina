// ================================================================
//  ui.ts — Renderização DOM e animações (com karaoke palavra-a-palavra)
// ================================================================

import type { CurrentlyPlaying } from './spotify'
import type { LyricsResult, LyricLineWithWords } from './lyrics'
import { formatMs, getBestImage }               from './spotify'
import { getActiveLineIndex, getLyricScrollOffset } from './sync'

// ── Screen Management ─────────────────────────────────────────

type ScreenId = 'login-screen' | 'player-screen' | 'idle-screen'

let _currentScreen: ScreenId | null = null

export function showScreen(id: ScreenId): void {
  if (_currentScreen === id) return
  _currentScreen = id

  document.querySelectorAll<HTMLElement>('.screen').forEach(el => {
    el.classList.remove('active')
  })

  const target = document.getElementById(id)
  target?.classList.add('active')
}

// ── Background ────────────────────────────────────────────────

let _lastBgUrl = ''

export function setBackground(imageUrl: string): void {
  if (imageUrl === _lastBgUrl) return
  _lastBgUrl = imageUrl

  const bg = document.getElementById('bg-image')
  if (!bg) return
  bg.style.backgroundImage = imageUrl ? `url(${imageUrl})` : 'none'
}

export function extractAccentColor(imageUrl: string): void {
  if (!imageUrl) return

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = imageUrl

  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(img, 0, 0, 16, 16)
    const data = ctx.getImageData(0, 0, 16, 16).data

    let r = 0, g = 0, b = 0, count = 0

    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2]
      const brightness = (pr + pg + pb) / 3
      if (brightness < 30 || brightness > 220) continue
      r += pr; g += pg; b += pb; count++
    }

    if (count === 0) return

    r = Math.round(r / count)
    g = Math.round(g / count)
    b = Math.round(b / count)

    const max   = Math.max(r, g, b)
    const scale = Math.max(max, 160) / max
    r = Math.min(255, Math.round(r * scale))
    g = Math.min(255, Math.round(g * scale))
    b = Math.min(255, Math.round(b * scale))

    const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
    document.documentElement.style.setProperty('--clr-dynamic', hex)
    document.documentElement.style.setProperty('--clr-dynamic-rgb', `${r} ${g} ${b}`)
    document.documentElement.style.setProperty(
      '--clr-dynamic-dim',
      `rgba(${r} ${g} ${b} / 0.15)`
    )
  }
}

// ── Track Info ────────────────────────────────────────────────

let _lastTrackId = ''

export function updateTrackInfo(state: CurrentlyPlaying): boolean {
  const track = state.item!
  const isNewTrack = track.id !== _lastTrackId

  if (isNewTrack) {
    _lastTrackId = track.id

    const albumArt = document.getElementById('album-art') as HTMLImageElement
    albumArt.classList.add('changing')

    setTimeout(() => {
      const imageUrl = getBestImage(track.album.images)
      albumArt.src = imageUrl
      albumArt.classList.remove('changing')
      albumArt.classList.add('track-entering')
      albumArt.addEventListener('animationend', () => {
        albumArt.classList.remove('track-entering')
      }, { once: true })

      setBackground(imageUrl)
      extractAccentColor(imageUrl)
    }, 250)
  }

  const titleEl  = document.getElementById('track-title')
  const artistEl = document.getElementById('track-artist')

  if (titleEl)  titleEl.textContent  = track.name
  if (artistEl) artistEl.textContent = track.artists.map(a => a.name).join(', ')

  return isNewTrack
}

// ── Progress Bar ──────────────────────────────────────────────

export function updateProgress(progressMs: number, durationMs: number): void {
  const fill    = document.getElementById('progress-fill')
  const current = document.getElementById('progress-current')
  const total   = document.getElementById('progress-total')

  const pct = durationMs > 0 ? (progressMs / durationMs) * 100 : 0
  if (fill)    fill.style.width    = `${pct}%`
  if (current) current.textContent = formatMs(progressMs)
  if (total)   total.textContent   = formatMs(durationMs)
}

// ── Lyrics Renderer ───────────────────────────────────────────

// Armazena referências para atualização eficiente no rAF
let _lyricLineEls: HTMLElement[]    = []
let _wordEls: HTMLElement[][]       = []  // [lineIdx][wordIdx]
let _lastActiveLineIdx              = -1
let _lastActiveWordIdx              = -1

export function renderLyrics(result: LyricsResult, linesWithWords?: LyricLineWithWords[]): void {
  const inner = document.getElementById('lyrics-inner')
  if (!inner) return

  inner.innerHTML  = ''
  _lyricLineEls    = []
  _wordEls         = []
  _lastActiveLineIdx = -1
  _lastActiveWordIdx = -1

  inner.className = ''

  if (result.type === 'none') {
    inner.classList.add('no-lyrics')
    const msg = document.createElement('p')
    msg.className   = 'lyrics-unavailable'
    msg.textContent = '♪ Letra não disponível ♪'
    inner.appendChild(msg)
    return
  }

  if (result.type === 'plain') {
    inner.classList.add('plain-mode')
    for (const line of result.lines) {
      const el = document.createElement('div')
      el.className   = 'lyric-line upcoming'
      el.textContent = line || ''
      inner.appendChild(el)
      _lyricLineEls.push(el)
      _wordEls.push([])
    }
    return
  }

  // ── Synced lyrics com palavras ─────────────────────────────
  const src = linesWithWords ?? []

  for (let li = 0; li < src.length; li++) {
    const lineData = src[li]
    const lineEl   = document.createElement('div')
    lineEl.className = 'lyric-line upcoming'

    const lineWordEls: HTMLElement[] = []

    if (lineData.words.length === 0) {
      // Linha vazia / instrumental
      lineEl.innerHTML = '<span class="lyric-word">· · ·</span>'
      const span = lineEl.querySelector<HTMLElement>('.lyric-word')!
      lineWordEls.push(span)
    } else {
      for (let wi = 0; wi < lineData.words.length; wi++) {
        const span = document.createElement('span')
        span.className   = 'lyric-word upcoming-word'
        span.textContent = lineData.words[wi].text
        lineEl.appendChild(span)

        // Espaço entre palavras (exceto na última)
        if (wi < lineData.words.length - 1) {
          lineEl.appendChild(document.createTextNode(' '))
        }

        lineWordEls.push(span)
      }
    }

    inner.appendChild(lineEl)
    _lyricLineEls.push(lineEl)
    _wordEls.push(lineWordEls)
  }
}

// ── Karaoke Sync (synced lyrics) ──────────────────────────────

export function syncKaraokeHighlight(
  lines: LyricLineWithWords[],
  progressMs: number
): void {
  if (!_lyricLineEls.length || !lines.length) return

  const activeLineIdx = getActiveLineIndex(lines, progressMs)

  // ── Atualiza classes de linha ─────────────────────────────
  if (activeLineIdx !== _lastActiveLineIdx) {
    // Reseta palavras da linha que acabou de sair
    if (_lastActiveLineIdx >= 0) {
      const prevWordEls = _wordEls[_lastActiveLineIdx] ?? []
      prevWordEls.forEach(el => {
        el.classList.remove('sung', 'current-word', 'upcoming-word')
        el.classList.add('sung') // linha passada: todas as palavras sung
      })
    }

    _lastActiveLineIdx = activeLineIdx
    _lastActiveWordIdx = -1

    _lyricLineEls.forEach((el, i) => {
      el.classList.remove('active', 'past', 'near', 'upcoming')
      const dist = i - activeLineIdx
      if (dist < 0)        el.classList.add('past')
      else if (dist === 0) el.classList.add('active')
      else if (dist === 1) el.classList.add('near')
      else                 el.classList.add('upcoming')
    })

    // Palavras de linhas passadas: todas sung
    for (let i = 0; i < activeLineIdx; i++) {
      const wEls = _wordEls[i] ?? []
      wEls.forEach(el => {
        el.classList.remove('sung', 'current-word', 'upcoming-word')
        el.classList.add('sung')
      })
    }

    // Palavras de linhas futuras: upcoming
    for (let i = activeLineIdx + 1; i < _wordEls.length; i++) {
      const wEls = _wordEls[i] ?? []
      wEls.forEach(el => {
        el.classList.remove('sung', 'current-word', 'upcoming-word')
        el.classList.add('upcoming-word')
      })
    }

    scrollToActiveLine(activeLineIdx)
  }

  // ── Atualiza palavra ativa dentro da linha ────────────────
  const activeLine = lines[activeLineIdx]
  if (!activeLine?.words.length) return

  const words = activeLine.words
  let activeWordIdx = -1
  for (let i = 0; i < words.length; i++) {
    if (progressMs >= words[i].timeMs) activeWordIdx = i
    else break
  }

  if (activeWordIdx === _lastActiveWordIdx) return
  _lastActiveWordIdx = activeWordIdx

  const lineWordEls = _wordEls[activeLineIdx] ?? []
  lineWordEls.forEach((el, wi) => {
    el.classList.remove('sung', 'current-word', 'upcoming-word')
    if (wi < activeWordIdx)        el.classList.add('sung')
    else if (wi === activeWordIdx) el.classList.add('current-word')
    else                           el.classList.add('upcoming-word')
  })
}

// ── Plain Lyrics Progression ──────────────────────────────────

export function syncPlainLyrics(
  totalLines: number,
  progressMs: number,
  durationMs: number
): void {
  if (!_lyricLineEls.length || durationMs <= 0) return

  const ratio     = progressMs / durationMs
  const activeIdx = Math.min(Math.floor(ratio * totalLines), totalLines - 1)

  if (activeIdx === _lastActiveLineIdx) return
  _lastActiveLineIdx = activeIdx

  _lyricLineEls.forEach((el, i) => {
    el.classList.remove('active', 'past', 'near', 'upcoming')
    const dist = i - activeIdx
    if (dist < 0)        el.classList.add('past')
    else if (dist === 0) el.classList.add('active')
    else if (dist === 1) el.classList.add('near')
    else                 el.classList.add('upcoming')
  })

  scrollToActiveLine(activeIdx)
}

// ── Scroll ────────────────────────────────────────────────────

function scrollToActiveLine(activeIdx: number): void {
  const inner      = document.getElementById('lyrics-inner')
  const container  = document.getElementById('lyrics-container')
  const activeLine = _lyricLineEls[activeIdx]

  if (!inner || !container || !activeLine) return

  const offset = getLyricScrollOffset(container, activeLine)
  inner.style.transform = `translateY(-${offset}px)`
}
