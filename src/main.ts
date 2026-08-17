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
  importRefreshToken,
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
import { initAmoled }     from './amoled'
import { initUpdater }    from './updater'
import { initSettings, setOnSettingsSaved } from './settings'
import { loadImmichAssets, startSlideshow, stopSlideshow, advanceSlideshow } from './immich'
import { initWakeLock, updateWakeLock } from './wakelock'
import { initTimers } from './timers'

// ── State ─────────────────────────────────────────────────────

let _tokens: TokenSet | null             = null
let _lyricsResult: LyricsResult          = { type: 'none' }
let _syncedLines: LyricLineWithWords[]   = []
let _plainLines: string[]                = []
let _lastTrackId                         = ''
let _rafId: number                       = 0
let _isIdle                              = false
let _photoMode                           = false

// ── Token Management ──────────────────────────────────────────

async function ensureFreshToken(force = false): Promise<string> {
  // Sincroniza sempre com a storage local, pois a rotação de token pode ter ocorrido
  const stored = getStoredTokens()
  if (stored) _tokens = stored

  if (!_tokens) throw new Error('Não autenticado')

  if (force || isTokenExpired(_tokens)) {
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

import { navigateTo } from './navigation'
import { isRateLimited, forcePoll } from './spotify'

async function handlePlayback(state: CurrentlyPlaying | null): Promise<void> {

  // Atualiza UI de erro de API
  const apiErrorEl = document.getElementById('api-error-message')
  if (apiErrorEl) {
    apiErrorEl.style.display = isRateLimited() ? 'block' : 'none'
  }

  // Nada tocando → modo idle
  if (!state || !state.item || !state.is_playing) {
    document.getElementById('idle-page')?.classList.remove('playing')
    document.getElementById('player-page')?.classList.add('not-playing')
    stopAnimationLoop()
    if (!_isIdle) {
      _isIdle = true
      // Desliza automaticamente para a tela do meio (Fotos) quando parar de tocar
      navigateTo(1, true)
    }
    return
  }

  document.getElementById('idle-page')?.classList.add('playing')
  document.getElementById('player-page')?.classList.remove('not-playing')

  // Nova faixa detectada
  const isNewTrack = state.item.id !== _lastTrackId
  if (isNewTrack) {
    _lastTrackId = state.item.id
    stopAnimationLoop()
    updateTrackInfo(state)
    // Limpa letras antigas e mostra carregando imediatamente
    renderLyrics({ type: 'none' })
    // Carrega letras em background — sem bloquear a UI
    loadLyrics(state).catch(err => console.warn('[lyrics] Erro async:', err))
  }

  setPlaybackState(state.progress_ms, state.is_playing, state.item.duration_ms)

  if (_isIdle) {
    _isIdle = false
    // Desliza automaticamente para a tela da esquerda (Mídia) quando começar a tocar
    navigateTo(0, true)
  }

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
  initSettings()
  initWakeLock()
  initAmoled()
  initUpdater()
  initTimers()

  setOnSettingsSaved(() => {
    loadImmichAssets()
    updateWakeLock()
    // Se o slideshow estiver ativo, reinicia para aplicar o novo intervalo
    if (_isIdle || _photoMode) {
      stopSlideshow()
      startSlideshow()
    }
  })

  // Pré-carrega metadados do Immich
  loadImmichAssets()

  // Clicar na capa do álbum entra na tela de Fotos
  const albumArt = document.getElementById('album-art')
  albumArt?.addEventListener('click', () => {
    navigateTo(1)
  })

  // Clicar na capa compacta na tela de fotos volta para Letras
  const photoAlbumArt = document.getElementById('photo-album-art')
  photoAlbumArt?.addEventListener('click', () => {
    navigateTo(0)
  })

  // Clicar no relógio (Player) dá zoom nele
  const clockWidget = document.getElementById('clock-widget')
  clockWidget?.addEventListener('click', () => {
    clockWidget.classList.toggle('clock-zoomed')
  })

  // Clicar no relógio (Idle/Fotos) dá zoom nele (quando está no modo canto superior)
  const idleClock = document.getElementById('idle-clock')
  idleClock?.addEventListener('click', () => {
    idleClock.classList.toggle('clock-zoomed')
  })

  // Clicar nas zonas dedicadas para avançar/voltar (como stories)
  document.getElementById('slideshow-left-zone')?.addEventListener('click', () => {
    advanceSlideshow(-1)
  })
  
  document.getElementById('slideshow-right-zone')?.addEventListener('click', () => {
    advanceSlideshow(1)
  })

  const urlParams = new URLSearchParams(window.location.search)
  const code      = urlParams.get('code')
  const error     = urlParams.get('error')
  const extToken  = urlParams.get('refresh_token')

  // Se recebemos um token via URL (exportado de outro dispositivo local), importamos
  if (extToken) {
    importRefreshToken(extToken)
    window.history.replaceState({}, '', window.location.pathname)
  }

  if (error) {
    console.error('[auth] Erro na autorização:', error)
    // Continua sem Spotify
  } else if (code) {
    window.history.replaceState({}, '', window.location.pathname)
    try {
      _tokens = await handleCallback(code)
    } catch (err) {
      console.error('[auth] Falha no callback:', err)
      // Continua sem Spotify
    }
  } else {
    _tokens = getStoredTokens()
  }

  let hasSpotify = false

  if (_tokens) {
    if (isTokenExpired(_tokens)) {
      try {
        _tokens = await refreshAccessToken(_tokens.refreshToken)
        hasSpotify = true
      } catch {
        console.warn('[auth] Token expirado e falha no refresh. Modo offline ativado.')
      }
    } else {
      hasSpotify = true
    }
  }

  setupLoginButton(hasSpotify)

  if (hasSpotify && _tokens) {
    initSpotify(_tokens.accessToken, ensureFreshToken)
  }

  // Inicia navegação swipe (4 páginas: Mídia, Fotos, Clima, Timers)
  initNavigation('swipe-container', '.nav-dot', 4, (page) => {
    if (page === 0) {
      // Se entrar na aba de mídia, força uma atualização para pegar status na hora,
      // desde que não estejamos em cooldown de erro da API.
      forcePoll()
    }
    
    // O slideshow deve tocar apenas na página do meio (1)
    if (page === 1) {
      startSlideshow()
    } else {
      stopSlideshow()
    }
  })

  // Carrega clima em background (não bloqueia)
  initWeather().catch(err => console.warn('[weather] Init error:', err))

  showScreen('player-screen')
  
  if (hasSpotify) {
    startPolling(handlePlayback, 10000)
    // Se não estiver tocando inicialmente, vai dar navigateTo(1) lá no handlePlayback
  } else {
    // Modo sem Spotify logado: mostra a tela idle e vai pra página 1
    _isIdle = true
    startSlideshow()
    setTimeout(() => {
      navigateTo(1, false) // Começa no modo fotos sem animação
    }, 50)
  }
}

function setupLoginButton(hasSpotify: boolean): void {
  const btn = document.getElementById('login-btn')
  if (!btn) return

  if (hasSpotify) {
    btn.style.display = 'none'
    return
  } else {
    btn.style.display = ''
  }

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
})
