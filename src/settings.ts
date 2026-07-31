// ================================================================
//  settings.ts — Gerenciamento de configurações persistentes
//                (localStorage) + UI do painel de Settings
// ================================================================

import { exportRefreshToken, importRefreshToken } from './auth'

// ── Estrutura das Configurações ────────────────────────────────

export interface AppSettings {
  // Immich
  immichUrl:      string   // ex: "http://192.168.1.100:2283"
  immichApiKey:   string
  immichAlbumIds: string[] // IDs dos álbuns selecionados
  slideshowInterval: number // segundos entre fotos (default 20)

  // Player
  karaokeMode: boolean // true = destaque por palavra, false = apenas linha
  keepScreenOn: boolean // true = impede a tela de desligar
  photoModeLyrics: boolean // true = mostra a linha atual da letra no canto inferior no modo foto
}

const STORAGE_KEY = 'tabhub_settings'

const DEFAULTS: AppSettings = {
  immichUrl:         '',
  immichApiKey:      '',
  immichAlbumIds:    [],
  slideshowInterval: 20,
  karaokeMode:       true,
  keepScreenOn:      false,
  photoModeLyrics:   true,
}

// ── Leitura / Escrita ─────────────────────────────────────────

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings()
  const updated  = { ...current, ...settings }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

  // Dispara evento customizado para outros módulos reagirem
  window.dispatchEvent(new CustomEvent('tabhub:settings-changed', { detail: updated }))
}

// ── Settings Modal UI ─────────────────────────────────────────

interface ImmichAlbum {
  id:   string
  albumName: string
  assetCount: number
}

let _onSettingsSaved: (() => void) | null = null

export function setOnSettingsSaved(cb: () => void): void {
  _onSettingsSaved = cb
}

export function initSettings(): void {
  const btn   = document.getElementById('settings-btn')
  const modal = document.getElementById('settings-modal')
  const overlay = document.getElementById('settings-overlay')
  const closeBtn = document.getElementById('settings-close')

  if (!btn || !modal || !overlay || !closeBtn) return

  btn.addEventListener('click', () => openSettings())
  closeBtn.addEventListener('click', () => closeSettings())
  overlay.addEventListener('click', () => closeSettings())

  // Carrega valores salvos nos campos
  populateFields()

  // Listener de busca de álbuns
  const fetchBtn = document.getElementById('settings-fetch-albums')
  fetchBtn?.addEventListener('click', () => handleFetchAlbums())

  // Salvar ao alterar os toggles/inputs
  document.getElementById('settings-save')?.addEventListener('click', () => saveAndClose())

  // Toggle karaoke — aplica imediatamente via CSS class no body
  const karaokeToggle = document.getElementById('settings-karaoke') as HTMLInputElement | null
  karaokeToggle?.addEventListener('change', () => {
    document.body.classList.toggle('no-karaoke', !karaokeToggle.checked)
  })

  // Toggle letras no modo foto
  const photoLyricsToggle = document.getElementById('settings-photo-lyrics') as HTMLInputElement | null
  photoLyricsToggle?.addEventListener('change', () => {
    document.body.classList.toggle('no-photo-lyrics', !photoLyricsToggle.checked)
  })

  // Exportar Token para Hub/Assistente
  const exportBtn = document.getElementById('settings-export-token')
  exportBtn?.addEventListener('click', () => {
    const token = exportRefreshToken()
    if (!token) {
      alert('Você precisa fazer o login no Spotify primeiro!')
      return
    }
    // Sempre forçamos o path para '/' pois o Nginx não tem roteamento SPA configurado por padrão
    const url = `${window.location.origin}/?refresh_token=${token}`
    
    navigator.clipboard.writeText(url)
      .then(() => alert('Link copiado com sucesso! Cole na sua rotina do Google ou envie para o Nest Hub.'))
      .catch(() => prompt('Copie o link abaixo:', url))
  })

  // Importar Token Manualmente
  const importBtn = document.getElementById('settings-import-btn')
  const importInput = document.getElementById('settings-import-token') as HTMLInputElement | null
  importBtn?.addEventListener('click', () => {
    const val = importInput?.value.trim()
    if (!val) return alert('Cole o link ou o token primeiro!')
    
    let token = val
    // Se colou o link inteiro, extrai o token
    if (val.includes('refresh_token=')) {
      try {
        const parsedUrl = new URL(val)
        token = parsedUrl.searchParams.get('refresh_token') || val
      } catch {
        // Fallback se não for uma URL válida
        token = val.split('refresh_token=')[1]?.split('&')[0] || val
      }
    }
    
    importRefreshToken(token)
    alert('Token importado! A página será recarregada para aplicar.')
    window.location.reload()
  })
}

function openSettings(): void {
  document.getElementById('settings-modal')?.classList.add('open')
  document.getElementById('settings-overlay')?.classList.add('open')
  populateFields()
}

function closeSettings(): void {
  document.getElementById('settings-modal')?.classList.remove('open')
  document.getElementById('settings-overlay')?.classList.remove('open')
}

function populateFields(): void {
  const s = getSettings()

  const urlInput = document.getElementById('settings-immich-url') as HTMLInputElement | null
  const keyInput = document.getElementById('settings-immich-key') as HTMLInputElement | null
  const intInput = document.getElementById('settings-slideshow-interval') as HTMLInputElement | null
  const karaokeToggle = document.getElementById('settings-karaoke') as HTMLInputElement | null
  const wakelockToggle = document.getElementById('settings-wakelock') as HTMLInputElement | null
  const photoLyricsToggle = document.getElementById('settings-photo-lyrics') as HTMLInputElement | null

  if (urlInput) urlInput.value = s.immichUrl
  if (keyInput) keyInput.value = s.immichApiKey
  if (intInput) intInput.value = String(s.slideshowInterval)
  if (karaokeToggle) karaokeToggle.checked = s.karaokeMode
  if (wakelockToggle) wakelockToggle.checked = s.keepScreenOn
  if (photoLyricsToggle) photoLyricsToggle.checked = s.photoModeLyrics

  // Aplica a classe no body já ao carregar
  document.body.classList.toggle('no-karaoke', !s.karaokeMode)
  document.body.classList.toggle('no-photo-lyrics', !s.photoModeLyrics)

  // Oculta a lista de álbuns até clicar em buscar (ou podemos mantê-la vazia)
  const listEl = document.getElementById('settings-albums-list')
  if (listEl) listEl.innerHTML = ''
}

function saveAndClose(): void {
  const urlInput = document.getElementById('settings-immich-url') as HTMLInputElement | null
  const keyInput = document.getElementById('settings-immich-key') as HTMLInputElement | null
  const intInput = document.getElementById('settings-slideshow-interval') as HTMLInputElement | null
  const karaokeToggle = document.getElementById('settings-karaoke') as HTMLInputElement | null
  const wakelockToggle = document.getElementById('settings-wakelock') as HTMLInputElement | null
  const photoLyricsToggle = document.getElementById('settings-photo-lyrics') as HTMLInputElement | null

  let finalUrl = urlInput?.value.trim() ?? ''
  if (finalUrl && !finalUrl.startsWith('http')) {
    finalUrl = 'http://' + finalUrl
  }

  const newSettings: Partial<AppSettings> = {
    immichUrl:         finalUrl,
    immichApiKey:      keyInput?.value.trim() ?? '',
    slideshowInterval: parseInt(intInput?.value ?? '20', 10) || 20,
    karaokeMode:       karaokeToggle?.checked ?? true,
    keepScreenOn:      wakelockToggle?.checked ?? false,
    photoModeLyrics:   photoLyricsToggle?.checked ?? true,
  }

  // Salva também os álbuns selecionados (apenas se a lista estiver preenchida no DOM)
  const listEl = document.getElementById('settings-albums-list')
  if (listEl && listEl.children.length > 0) {
    const checkedAlbums = document.querySelectorAll<HTMLInputElement>('#settings-albums-list input[type="checkbox"]:checked')
    newSettings.immichAlbumIds = Array.from(checkedAlbums).map(cb => cb.value)
  } else {
    // Se não carregou a lista no DOM nesta sessão, mantém os álbuns que já estavam salvos
    newSettings.immichAlbumIds = getSettings().immichAlbumIds
  }

  saveSettings(newSettings)
  document.body.classList.toggle('no-karaoke', !newSettings.karaokeMode)
  document.body.classList.toggle('no-photo-lyrics', !newSettings.photoModeLyrics)
  _onSettingsSaved?.()
  closeSettings()
}

async function handleFetchAlbums(): Promise<void> {
  const urlInput = document.getElementById('settings-immich-url') as HTMLInputElement | null
  const keyInput = document.getElementById('settings-immich-key') as HTMLInputElement | null
  const listEl   = document.getElementById('settings-albums-list')
  const statusEl = document.getElementById('settings-albums-status')

  const url = urlInput?.value.trim() ?? ''
  const key = keyInput?.value.trim() ?? ''

  if (!url || !key) {
    if (statusEl) statusEl.textContent = '⚠ Informe a URL e a API Key primeiro.'
    return
  }

  if (statusEl) statusEl.textContent = 'Buscando álbuns...'
  if (listEl)   listEl.innerHTML = ''

  try {
    let baseUrl = url.replace(/\/$/, '')
    if (!baseUrl.startsWith('http')) baseUrl = 'http://' + baseUrl

    const albums = await fetchImmichAlbums(baseUrl, key)
    const saved  = getSettings().immichAlbumIds

    if (!albums.length) {
      if (statusEl) statusEl.textContent = 'Nenhum álbum encontrado.'
      return
    }

    if (statusEl) statusEl.textContent = `${albums.length} álbuns encontrados. Selecione os que deseja no slideshow:`

    if (listEl) {
      listEl.innerHTML = albums.map(a => `
        <label class="album-checkbox-label">
          <input type="checkbox" value="${a.id}" ${saved.includes(a.id) ? 'checked' : ''} />
          <span class="album-checkbox-name">${a.albumName}</span>
          <span class="album-checkbox-count">${a.assetCount} fotos</span>
        </label>
      `).join('')
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Failed to fetch') {
      if (statusEl) statusEl.textContent = 'Erro de Rede. Verifique se o IP e a Porta (ex: :2283) estão corretos.'
    } else if (msg.includes('500')) {
      if (statusEl) statusEl.textContent = 'Erro 500: Falha ao conectar. Você esqueceu da porta? (ex: http://192.168.1.x:2283)'
    } else {
      if (statusEl) statusEl.textContent = `Erro ao conectar: ${msg}`
    }
  }
}

async function fetchImmichAlbums(baseUrl: string, key: string): Promise<ImmichAlbum[]> {
  const proxyUrl = '/immich-proxy'
  const headers = { 
    'x-api-key': key, 
    'Accept': 'application/json',
    'x-immich-url': baseUrl 
  }

  const res = await fetch(`${proxyUrl}/api/albums`, { headers })
  if (!res.ok) {
    if (res.status === 404) {
      // Fallback para versões mais antigas do Immich
      const resOld = await fetch(`${proxyUrl}/api/album`, { headers })
      if (resOld.ok) return resOld.json()
    }
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}
