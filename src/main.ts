// ================================================================
//  main.ts — Orquestrador principal do TabHub Dashboard
// ================================================================

import './style.css'

import {
  CLIENT_ID,
  getStoredTokens,
  handleCallback,
  initiateLogin,
  isTokenExpired,
  refreshAccessToken,
  type TokenSet,
} from './auth'

import {
  initSpotify,
  startPolling,
  updateToken,
  type CurrentlyPlaying,
} from './spotify'

import {
  fetchLyrics,
  computeWordTimings,
  type LyricsResult,
  type LyricLineWithWords,
} from './lyrics'

import {
  setPlaybackState,
  getInterpolatedProgress,
} from './sync'

import {
  renderLyrics,
  showScreen,
  syncKaraokeHighlight,
  syncPlainLyrics,
  updateProgress,
  updateTrackInfo,
} from './ui'

import { initClock }      from './clock'
import { initNavigation } from './navigation'
import { initWeather }    from './weather'
import { initFullscreen } from './fullscreen'

// ── State ─────────────────────────────────────────────────────

let _tokens: TokenSet | null             = null
let _lyricsResult: LyricsResult          = { type: 'none' }
let _syncedLines: LyricLineWithWords[]   = []
let _plainLines: string[]                = []
let _lastTrackId                         = ''
let _rafId: number                       = 0

// ── Token Management ──────────────────────────────────────────

async function ensureFreshToken(): Promise<string> {
  if (!_tokens) throw new Error('Não autenticado')

  if (isTokenExpired(_tokens)) {
    _tokens = await refreshAccessToken(_tokens.refreshToken)
    updateToken(_tokens.accessToken)
  }

  return _tokens.accessToken
}

// ── Lyrics Fetch ──────────────────────────────────────────────

async function loadLyrics(state: CurrentlyPlaying): Promise<void> {
  const track = state.item!

  _lyricsResult = await fetchLyrics(
    track.name,
    track.artists[0]?.name ?? '',
    track.album.name,
    track.duration_ms
  )

  if (_lyricsResult.type === 'synced') {
    // Computa timings por palavra para o efeito karaoke
    _syncedLines = computeWordTimings(_lyricsResult.lines)
    _plainLines  = []
    renderLyrics(_lyricsResult, _syncedLines)
  } else if (_lyricsResult.type === 'plain') {
    _syncedLines = []
    _plainLines  = _lyricsResult.lines
    renderLyrics(_lyricsResult)
  } else {
    _syncedLines = []
    _plainLines  = []
    renderLyrics(_lyricsResult)
  }
}

// ── Playback Handler ──────────────────────────────────────────

async function handlePlayback(state: CurrentlyPlaying | null): Promise<void> {
  // Nada tocando → idle
  if (!state || !state.item || !state.is_playing) {
    stopAnimationLoop()
    showScreen('idle-screen')
    return
  }

  // Nova faixa detectada
  const isNewTrack = state.item.id !== _lastTrackId
  if (isNewTrack) {
    _lastTrackId = state.item.id
    stopAnimationLoop()
    updateTrackInfo(state)
    await loadLyrics(state) // Fetch lyrics
  }

  setPlaybackState(state.progress_ms, state.is_playing, state.item.duration_ms)

  showScreen('player-screen')
  startAnimationLoop(state)
}

// ── Animation Loop (rAF 60fps) ────────────────────────────────

let _animTrackDuration = 0

function startAnimationLoop(state: CurrentlyPlaying): void {
  _animTrackDuration = state.item?.duration_ms ?? 0
  stopAnimationLoop()
  animFrame()
}

function stopAnimationLoop(): void {
  if (_rafId) {
    cancelAnimationFrame(_rafId)
    _rafId = 0
  }
}

function animFrame(): void {
  const progressMs = getInterpolatedProgress()

  updateProgress(progressMs, _animTrackDuration)

  if (_lyricsResult.type === 'synced') {
    syncKaraokeHighlight(_syncedLines, progressMs)
  } else if (_lyricsResult.type === 'plain' && _animTrackDuration > 0) {
    syncPlainLyrics(_plainLines.length, progressMs, _animTrackDuration)
  }

  _rafId = requestAnimationFrame(animFrame)
}

// ── Auth Flow ─────────────────────────────────────────────────

function isConfigured(): boolean {
  const id = CLIENT_ID as string
  return id !== 'YOUR_SPOTIFY_CLIENT_ID' && id.trim() !== ''
}

async function bootstrap(): Promise<void> {
  initClock()
  initFullscreen()

  const urlParams = new URLSearchParams(window.location.search)
  const code      = urlParams.get('code')
  const error     = urlParams.get('error')

  if (error) {
    console.error('[auth] Erro na autorização:', error)
    showScreen('login-screen')
    return
  }

  if (code) {
    window.history.replaceState({}, '', window.location.pathname)
    try {
      _tokens = await handleCallback(code)
    } catch (err) {
      console.error('[auth] Falha no callback:', err)
      showScreen('login-screen')
      return
    }
  } else {
    _tokens = getStoredTokens()
  }

  if (!_tokens) {
    showScreen('login-screen')
    setupLoginButton()
    return
  }

  if (isTokenExpired(_tokens)) {
    try {
      _tokens = await refreshAccessToken(_tokens.refreshToken)
    } catch {
      showScreen('login-screen')
      setupLoginButton()
      return
    }
  }

  initSpotify(_tokens.accessToken, ensureFreshToken)

  // Inicia navegação swipe (2 páginas: player + clima)
  initNavigation('swipe-container', '.nav-dot', 2)

  // Carrega clima em background (não bloqueia)
  initWeather().catch(err => console.warn('[weather] Init error:', err))

  showScreen('idle-screen')
  startPolling(handlePlayback, 4000)
}

function setupLoginButton(): void {
  const btn = document.getElementById('login-btn')
  if (!btn) return

  if (!isConfigured()) {
    btn.textContent = '⚠ Configure o Client ID em src/auth.ts'
    btn.setAttribute('disabled', 'true')
    ;(btn as HTMLButtonElement).style.opacity = '0.6'
    return
  }

  btn.addEventListener('click', () => {
    initiateLogin().catch(console.error)
  })
}

// ── Start ──────────────────────────────────────────────────────

bootstrap().catch(err => {
  console.error('[main] Falha na inicialização:', err)
  showScreen('login-screen')
})
