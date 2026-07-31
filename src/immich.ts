// ================================================================
//  immich.ts — Integração com Immich + lógica de slideshow
// ================================================================

import { getSettings } from './settings'

// ── Types ─────────────────────────────────────────────────────

interface ImmichAsset {
  id:   string
  type: string
}

// ── Asset Cache ───────────────────────────────────────────────

let _assetIds:    string[] = []
let _currentIdx:  number   = 0
let _slideshowTimer: ReturnType<typeof setInterval> | null = null
let _objectUrls:  string[] = [] // para revogar e evitar vazamento de memória

// ── Fetch de assets ───────────────────────────────────────────

export async function loadImmichAssets(): Promise<void> {
  const s = getSettings()
  if (!s.immichUrl || !s.immichApiKey || !s.immichAlbumIds.length) return

  try {
    const allIds: string[] = []
    const baseUrl = s.immichUrl.replace(/\/$/, '')
    for (const albumId of s.immichAlbumIds) {
      const ids = await fetchAlbumAssetIds(baseUrl, s.immichApiKey, albumId)
      allIds.push(...ids)
    }

    // Embaralha as fotos
    _assetIds = shuffleArray(allIds)
    _currentIdx = 0
    console.log(`[immich] ${_assetIds.length} fotos carregadas de ${s.immichAlbumIds.length} álbum(ns)`)
  } catch (err: any) {
    console.warn('[immich] Erro ao carregar assets:', err)
    _assetIds = []
    const el = document.getElementById('track-title')
    if (el) el.textContent = `Erro Fatal API: ${err.message}`
  }
}

async function fetchAlbumAssetIds(baseUrl: string, key: string, albumId: string): Promise<string[]> {
  const headers = { 
    'x-api-key': key, 
    'Accept': 'application/json',
    'x-immich-url': baseUrl 
  }
  
  const res = await fetch(`/immich-proxy/api/albums/${albumId}`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  
  let assets: ImmichAsset[] = data.assets ?? []

  // Tenta endpoint de pesquisa se o álbum veio sem assets embeddados (Immich moderno v1.114+)
  if (!assets.length) {
    const res2 = await fetch(`/immich-proxy/api/search/metadata`, { 
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumIds: [albumId] })
    })
    if (res2.ok) {
      const data2 = await res2.json()
      if (Array.isArray(data2)) {
         assets = data2
      } else if (data2.assets) {
         if (Array.isArray(data2.assets)) {
            assets = data2.assets
         } else if (data2.assets.items && Array.isArray(data2.assets.items)) {
            assets = data2.assets.items
         }
      } else if (data2.items && Array.isArray(data2.items)) {
         assets = data2.items
      }
    } else {
       console.warn(`[immich] Erro /search/metadata: ${res2.status}`)
    }
  }

  const ids = assets
    .filter(a => a.type === 'IMAGE' || !a.type)
    .map(a => a.id)

  return ids
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Slideshow ─────────────────────────────────────────────────

export async function startSlideshow(): Promise<void> {
  if (!_assetIds.length) {
    await loadImmichAssets()
  }
  if (!_assetIds.length) return

  if (_slideshowTimer) clearInterval(_slideshowTimer)

  const s = getSettings()
  // Mostra a primeira foto imediatamente
  advanceSlideshow()

  // Intervalo de troca
  _slideshowTimer = setInterval(() => advanceSlideshow(), s.slideshowInterval * 1000)
}

export function stopSlideshow(): void {
  if (_slideshowTimer) {
    clearInterval(_slideshowTimer)
    _slideshowTimer = null
  }
  // Limpa as imagens
  setSlideImage('slideshow-img-a', '')
  setSlideImage('slideshow-img-b', '')
}

// Controla qual <img> está visível (crossfade A/B)
let _activeSlot: 'a' | 'b' = 'a'

async function advanceSlideshow(): Promise<void> {
  if (!_assetIds.length) return

  const s = getSettings()
  const assetId = _assetIds[_currentIdx % _assetIds.length]
  _currentIdx++

  try {
    const baseUrl = s.immichUrl.replace(/\/$/, '')
    const objectUrl = await fetchAssetBlob(baseUrl, s.immichApiKey, assetId)

    const nextSlot = _activeSlot === 'a' ? 'b' : 'a'
    const nextImg  = document.getElementById(`slideshow-img-${nextSlot}`) as HTMLImageElement | null
    const prevImg  = document.getElementById(`slideshow-img-${_activeSlot}`) as HTMLImageElement | null

    if (!nextImg) return

    nextImg.src = objectUrl
    nextImg.onload = () => {
      nextImg.classList.add('visible')
      prevImg?.classList.remove('visible')
      _activeSlot = nextSlot

      // Revoga o ObjectURL antigo após a troca para liberar memória
      setTimeout(() => {
        const old = _objectUrls.shift()
        if (old) URL.revokeObjectURL(old)
      }, 3000)
    }

    _objectUrls.push(objectUrl)
  } catch (err) {
    console.warn('[immich] Erro ao carregar foto:', err)
  }
}

async function fetchAssetBlob(baseUrl: string, key: string, assetId: string): Promise<string> {
  const res = await fetch(`/immich-proxy/api/assets/${assetId}/thumbnail?size=preview`, {
    headers: { 
      'x-api-key': key,
      'x-immich-url': baseUrl
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

function setSlideImage(id: string, src: string): void {
  const el = document.getElementById(id) as HTMLImageElement | null
  if (el) {
    el.classList.remove('visible')
    el.src = src
  }
}
