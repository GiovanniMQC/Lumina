// ================================================================
//  settings.ts — Gerenciamento de configurações persistentes
//                (localStorage) + UI do painel de Settings
// ================================================================

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
}

const STORAGE_KEY = 'tabhub_settings'

const DEFAULTS: AppSettings = {
  immichUrl:         '',
  immichApiKey:      '',
  immichAlbumIds:    [],
  slideshowInterval: 20,
  karaokeMode:       true,
  keepScreenOn:      false,
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

  if (urlInput) urlInput.value = s.immichUrl
  if (keyInput) keyInput.value = s.immichApiKey
  if (intInput) intInput.value = String(s.slideshowInterval)
  if (karaokeToggle) karaokeToggle.checked = s.karaokeMode
  if (wakelockToggle) wakelockToggle.checked = s.keepScreenOn

  // Aplica a classe no body já ao carregar
  document.body.classList.toggle('no-karaoke', !s.karaokeMode)

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

  const newSettings: Partial<AppSettings> = {
    immichUrl:         urlInput?.value.trim() ?? '',
    immichApiKey:      keyInput?.value.trim() ?? '',
    slideshowInterval: parseInt(intInput?.value ?? '20', 10) || 20,
    karaokeMode:       karaokeToggle?.checked ?? true,
    keepScreenOn:      wakelockToggle?.checked ?? false,
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
    const baseUrl = url.replace(/\/$/, '')
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
