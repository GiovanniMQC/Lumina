// ================================================================
//  auth.ts — Spotify Authorization Code + PKCE flow
//  Configure CLIENT_ID e REDIRECT_URI abaixo
// ================================================================

// ⚠️  Substitua pelo seu Client ID do Spotify Developer Dashboard
export const CLIENT_ID = '28c0b3d50ace452caa9cca99e24c3f6f'

// Redirect URI — dinâmico baseado na origem atual.
// Isso funciona tanto no host (127.0.0.1) quanto no tablet (192.168.x.x).
// ⚠️  Registre TODOS os origins no Spotify Dashboard (Settings → Redirect URIs):
//     http://127.0.0.1:5173/callback
//     http://192.168.1.131:5173/callback   ← IP do tablet na sua rede
// Para produção via Tailscale, defina VITE_REDIRECT_URI no .env.local
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI ?? `${window.location.origin}/callback`

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
].join(' ')

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'

// Keys para localStorage
const STORAGE_ACCESS_TOKEN = 'sp_access_token'
const STORAGE_REFRESH_TOKEN = 'sp_refresh_token'
const STORAGE_EXPIRES_AT = 'sp_expires_at'
const STORAGE_CODE_VERIFIER = 'sp_code_verifier'

// ── PKCE Helpers ──────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join('')
}

// SHA-256 via Web Crypto (contexto seguro) ou fallback puro JS
// crypto.subtle só existe em HTTPS/localhost — no tablet via IP local, usa fallback
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle.digest('SHA-256', data)
  }
  return sha256Pure(data)
}

// Implementação pura de SHA-256 (sem Web Crypto API)
function sha256Pure(data: Uint8Array): ArrayBuffer {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  const l = data.length
  const bitLen = l * 8
  const padLen = ((l + 64 >> 6) + 1) << 6
  const padded = new Uint8Array(padLen)
  padded.set(data)
  padded[l] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padLen - 4, bitLen >>> 0, false)
  dv.setUint32(padLen - 8, Math.floor(bitLen / 2 ** 32), false)
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a
  let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19
  const w = new Uint32Array(64)
  for (let i = 0; i < padLen; i += 64) {
    const chunk = new DataView(padded.buffer, i, 64)
    for (let j = 0;  j < 16; j++) w[j] = chunk.getUint32(j * 4, false)
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j-15],7)  ^ rotr(w[j-15],18) ^ (w[j-15]>>>3)
      const s1 = rotr(w[j-2], 17) ^ rotr(w[j-2], 19) ^ (w[j-2] >>>10)
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7
    for (let j = 0; j < 64; j++) {
      const S1  = rotr(e,6)^rotr(e,11)^rotr(e,25)
      const ch  = (e&f)^(~e&g)
      const t1  = (h+S1+ch+K[j]+w[j])>>>0
      const S0  = rotr(a,2)^rotr(a,13)^rotr(a,22)
      const maj = (a&b)^(a&c)^(b&c)
      const t2  = (S0+maj)>>>0
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0
    }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0
    h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0
  }
  const out = new DataView(new ArrayBuffer(32))
  ;[h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => out.setUint32(i*4, v, false))
  return out.buffer
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier)
  return base64UrlEncode(hashed)
}

// ── Token Storage ─────────────────────────────────────────────

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function saveTokens(data: {
  access_token: string
  refresh_token?: string
  expires_in: number
}): void {
  const expiresAt = Date.now() + data.expires_in * 1000 - 60_000 // -1min buffer
  localStorage.setItem(STORAGE_ACCESS_TOKEN, data.access_token)
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_REFRESH_TOKEN, data.refresh_token)
  }
  localStorage.setItem(STORAGE_EXPIRES_AT, String(expiresAt))
}

export function getStoredTokens(): TokenSet | null {
  const accessToken = localStorage.getItem(STORAGE_ACCESS_TOKEN)
  const refreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN)
  const expiresAt = localStorage.getItem(STORAGE_EXPIRES_AT)

  if (!accessToken || !refreshToken || !expiresAt) return null
  
  return {
    accessToken,
    refreshToken,
    expiresAt: parseInt(expiresAt, 10),
  }
}

export function importRefreshToken(token: string): void {
  localStorage.setItem(STORAGE_ACCESS_TOKEN, 'import_dummy') // Passa na checagem inicial
  localStorage.setItem(STORAGE_REFRESH_TOKEN, token)
  localStorage.setItem(STORAGE_EXPIRES_AT, '0') // Força o refresh na próxima verificação
}

export function exportRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_REFRESH_TOKEN)
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_REFRESH_TOKEN)
  localStorage.removeItem(STORAGE_EXPIRES_AT)
  localStorage.removeItem(STORAGE_CODE_VERIFIER)
}

export function isTokenExpired(tokens: TokenSet): boolean {
  return Date.now() >= tokens.expiresAt
}

// ── Auth Flow ─────────────────────────────────────────────────

export async function initiateLogin(): Promise<void> {
  const verifier = generateRandomString(64)
  const challenge = await generateCodeChallenge(verifier)

  localStorage.setItem(STORAGE_CODE_VERIFIER, verifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'false',
  })

  window.location.href = `${SPOTIFY_AUTH_URL}?${params}`
}

export async function handleCallback(code: string): Promise<TokenSet> {
  const verifier = localStorage.getItem(STORAGE_CODE_VERIFIER)
  if (!verifier) throw new Error('Code verifier não encontrado. Faça login novamente.')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Falha ao trocar código: ${err.error_description || res.status}`)
  }

  const data = await res.json()
  saveTokens(data)
  localStorage.removeItem(STORAGE_CODE_VERIFIER)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  })

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    clearTokens()
    throw new Error('Refresh token inválido. Re-autentique.')
  }

  const data = await res.json()
  saveTokens(data)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  }
}
