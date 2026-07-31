// ================================================================
//  spotify.ts — Spotify Web API polling
// ================================================================

const API_BASE = 'https://api.spotify.com/v1'

export interface SpotifyImage {
  url: string
  width: number
  height: number
}

export interface SpotifyArtist {
  name: string
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: {
    name: string
    images: SpotifyImage[]
  }
  duration_ms: number
}

export interface CurrentlyPlaying {
  is_playing: boolean
  progress_ms: number
  item: SpotifyTrack | null
  timestamp: number
}

export type PollingState = 'playing' | 'paused' | 'idle'

let _accessToken = ''
let _onTokenExpired: (() => Promise<string>) | null = null

export function initSpotify(
  token: string,
  onTokenExpired: () => Promise<string>
): void {
  _accessToken = token
  _onTokenExpired = onTokenExpired
}

export function updateToken(token: string): void {
  _accessToken = token
}

async function spotifyFetch(path: string): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${_accessToken}` },
  })

  if (res.status === 401 && _onTokenExpired) {
    // Token expirado → refresh e retry
    _accessToken = await _onTokenExpired()
    return fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    })
  }

  return res
}

export async function getCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
  const res = await spotifyFetch('/me/player/currently-playing?market=from_token')

  if (res.status === 204 || res.status === 404) {
    // Nada tocando
    return null
  }

  if (!res.ok) {
    console.warn('[spotify] Erro ao buscar currently-playing:', res.status)
    return null
  }

  const data = await res.json()
  if (!data || !data.item) return null

  return {
    is_playing:  data.is_playing,
    progress_ms: data.progress_ms ?? 0,
    item:        data.item,
    timestamp:   data.timestamp ?? Date.now(),
  }
}

// ── Polling Manager ───────────────────────────────────────────

export type PlaybackHandler = (state: CurrentlyPlaying | null) => void

let _pollTimer: ReturnType<typeof setInterval> | null = null

export function startPolling(
  handler: PlaybackHandler,
  intervalMs: number = 4000
): void {
  stopPolling()

  const poll = async () => {
    try {
      const state = await getCurrentlyPlaying()
      handler(state)
    } catch (err) {
      console.error('[spotify] Polling error:', err)
    }
  }

  poll() // chamada imediata
  _pollTimer = setInterval(poll, intervalMs)
}

export function stopPolling(): void {
  if (_pollTimer !== null) {
    clearInterval(_pollTimer)
    _pollTimer = null
  }
}

// ── Helpers ───────────────────────────────────────────────────

export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function getBestImage(images: SpotifyImage[]): string {
  if (!images.length) return ''
  // Pega a imagem de tamanho médio (índice 1) ou a primeira disponível
  return (images[1] ?? images[0]).url
}
