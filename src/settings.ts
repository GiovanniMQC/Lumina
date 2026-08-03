// ================================================================
//  settings.ts — Gerenciamento de configurações persistentes
//                (localStorage) + UI do painel de Settings
// ================================================================

import { exportRefreshToken, importRefreshToken, clearTokens } from './auth'

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
  amoledMode: boolean // true = tela preta com apenas relógio à noite
  amoledStartTime: string // ex: "22:00"
  amoledEndTime: string // ex: "06:00"
  amoledLargeClock: boolean // true = relógio 2x maior no modo amoled
  pitchBlackMode: boolean // true = apaga até o relógio na madrugada
  pitchBlackStartTime: string // ex: "00:00"
  pitchBlackEndTime: string // ex: "05:00"
  // Relógio Idle
  idleClockTopRight: boolean // true = canto, false = tela cheia
  idleClockLarge: boolean // true = tamanho aumentado no modo canto
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
  idleClockTopRight: false,
  idleClockLarge:    false,
  amoledMode:        true,
  amoledStartTime:   '22:00',
  amoledEndTime:     '06:00',
  amoledLargeClock:  false,
  pitchBlackMode:    true,
  pitchBlackStartTime: '00:00',
  pitchBlackEndTime:   '05:00',
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

  // Importar Token(s) Manualmente
  const importBtn = document.getElementById('settings-import-btn')
  const importInput = document.getElementById('settings-import-token') as HTMLTextAreaElement | null
  importBtn?.addEventListener('click', () => {
    const val = importInput?.value.trim()
    if (!val) return alert('Cole os links ou tokens primeiro!')
    
    const lines = val.split('\n').map(l => l.trim()).filter(Boolean)
    const tokens: string[] = []

    for (const line of lines) {
      let token = line
      if (line.includes('refresh_token=')) {
        try {
          const parsedUrl = new URL(line)
          token = parsedUrl.searchParams.get('refresh_token') || line
        } catch {
          token = line.split('refresh_token=')[1]?.split('&')[0] || line
        }
      }
      if (token && !tokens.includes(token)) {
        tokens.push(token)
      }
    }
    
    if (tokens.length === 0) return alert('Nenhum token válido encontrado.')

    // Assume importRefreshToken is updated in auth.ts to handle array
    importRefreshToken(tokens)
    alert(`${tokens.length} token(s) importado(s)! A página será recarregada para aplicar.`)
    window.location.reload()
  })

  // Re-autenticar / Terminar Sessão
  const reloginBtn = document.getElementById('settings-relogin-btn')
  reloginBtn?.addEventListener('click', () => {
    if (!confirm('Tem certeza que deseja terminar a sessão do Spotify?\nSerá necessário fazer login novamente.')) return
    clearTokens()
    window.location.reload()
  })
} // fim de initSettings

function openSettings(): void {
  document.getElementById('settings-modal')?.classList.add('open')
  document.getElementById('settings-overlay')?.classList.add('open')
  populateFields()
  
  // Atualiza o texto da versão no rodapé
  const versionEl = document.getElementById('settings-version')
  if (versionEl) {
    versionEl.textContent = 'Carregando versão...'
    fetch(`/version.json?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.version) {
          const d = new Date(data.version)
          versionEl.textContent = `Última atualização: ${d.toLocaleDateString()} às ${d.toLocaleTimeString()}`
        } else {
          versionEl.textContent = 'Versão não encontrada (Modo Dev)'
        }
      })
      .catch(() => {
        versionEl.textContent = 'Versão não encontrada (Modo Dev)'
      })
  }
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
  
  const idleClockTopRightToggle = document.getElementById('settings-idle-clock-top-right') as HTMLInputElement | null
  const idleClockLargeToggle = document.getElementById('settings-idle-clock-large') as HTMLInputElement | null
  
  const amoledToggle = document.getElementById('settings-amoled') as HTMLInputElement | null
  const amoledStart = document.getElementById('settings-amoled-start') as HTMLInputElement | null
  const amoledEnd = document.getElementById('settings-amoled-end') as HTMLInputElement | null
  const amoledLargeClock = document.getElementById('settings-amoled-large') as HTMLInputElement | null
  const pitchBlackToggle = document.getElementById('settings-pitchblack') as HTMLInputElement | null
  const pitchBlackStart = document.getElementById('settings-pitchblack-start') as HTMLInputElement | null
  const pitchBlackEnd = document.getElementById('settings-pitchblack-end') as HTMLInputElement | null

  if (urlInput) urlInput.value = s.immichUrl
  if (keyInput) keyInput.value = s.immichApiKey
  if (intInput) intInput.value = String(s.slideshowInterval)
  if (karaokeToggle) karaokeToggle.checked = s.karaokeMode
  if (wakelockToggle) wakelockToggle.checked = s.keepScreenOn
  if (photoLyricsToggle) photoLyricsToggle.checked = s.photoModeLyrics
  if (idleClockTopRightToggle) idleClockTopRightToggle.checked = s.idleClockTopRight
  if (idleClockLargeToggle) idleClockLargeToggle.checked = s.idleClockLarge
  
  if (amoledToggle) amoledToggle.checked = s.amoledMode
  if (amoledStart) amoledStart.value = s.amoledStartTime
  if (amoledEnd) amoledEnd.value = s.amoledEndTime
  if (amoledLargeClock) amoledLargeClock.checked = s.amoledLargeClock
  if (pitchBlackToggle) pitchBlackToggle.checked = s.pitchBlackMode
  if (pitchBlackStart) pitchBlackStart.value = s.pitchBlackStartTime
  if (pitchBlackEnd) pitchBlackEnd.value = s.pitchBlackEndTime

  // Aplica a classe no body já ao carregar
  document.body.classList.toggle('no-karaoke', !s.karaokeMode)
  document.body.classList.toggle('no-photo-lyrics', !s.photoModeLyrics)
  document.body.classList.toggle('idle-clock-top-right', s.idleClockTopRight)
  document.body.classList.toggle('idle-clock-large', s.idleClockLarge)
  document.body.classList.toggle('amoled-large-clock', s.amoledLargeClock)

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
  const amoledToggle = document.getElementById('settings-amoled') as HTMLInputElement | null
  const amoledStart = document.getElementById('settings-amoled-start') as HTMLInputElement | null
  const amoledEnd = document.getElementById('settings-amoled-end') as HTMLInputElement | null
  const amoledLargeClock = document.getElementById('settings-amoled-large') as HTMLInputElement | null
  const pitchBlackToggle = document.getElementById('settings-pitchblack') as HTMLInputElement | null
  const pitchBlackStart = document.getElementById('settings-pitchblack-start') as HTMLInputElement | null
  const pitchBlackEnd = document.getElementById('settings-pitchblack-end') as HTMLInputElement | null

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
    
    idleClockTopRight: (document.getElementById('settings-idle-clock-top-right') as HTMLInputElement)?.checked ?? false,
    idleClockLarge:    (document.getElementById('settings-idle-clock-large') as HTMLInputElement)?.checked ?? false,
    
    amoledMode:        amoledToggle?.checked ?? false,
    amoledStartTime:   amoledStart?.value || '22:00',
    amoledEndTime:     amoledEnd?.value || '06:00',
    amoledLargeClock:  amoledLargeClock?.checked ?? false,
    pitchBlackMode:    pitchBlackToggle?.checked ?? true,
    pitchBlackStartTime: pitchBlackStart?.value || '00:00',
    pitchBlackEndTime:   pitchBlackEnd?.value || '05:00',
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
  document.body.classList.toggle('idle-clock-top-right', !!newSettings.idleClockTopRight)
  document.body.classList.toggle('idle-clock-large', !!newSettings.idleClockLarge)
  document.body.classList.toggle('amoled-large-clock', !!newSettings.amoledLargeClock)
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
