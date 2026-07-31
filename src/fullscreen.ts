// ================================================================
//  fullscreen.ts — Botão de tela cheia com auto-ocultação
// ================================================================

let _hideTimer: ReturnType<typeof setTimeout> | null = null
const HIDE_DELAY_MS = 2500

export function initFullscreen(): void {
  const btn = document.getElementById('fullscreen-btn')
  if (!btn) return

  btn.addEventListener('click', toggleFullscreen)
  document.addEventListener('fullscreenchange', onFullscreenChange)

  // Qualquer movimento ou toque mostra o botão brevemente
  document.addEventListener('mousemove',  showBriefly)
  document.addEventListener('touchstart', showBriefly, { passive: true })

  // Atualiza ícone inicial
  updateIcon()
  scheduleHide() // Esconde inicialmente após o delay
}

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(console.warn)
  } else {
    document.exitFullscreen().catch(console.warn)
  }
}

function onFullscreenChange(): void {
  updateIcon()
  showBriefly()
}

function showBriefly(): void {
  showButton()
  scheduleHide()
}

function showButton(): void {
  const btn = document.getElementById('fullscreen-btn')
  btn?.classList.remove('fs-hidden')
}

function scheduleHide(): void {
  clearHideTimer()
  _hideTimer = setTimeout(() => {
    document.getElementById('fullscreen-btn')?.classList.add('fs-hidden')
  }, HIDE_DELAY_MS)
}

function clearHideTimer(): void {
  if (_hideTimer !== null) {
    clearTimeout(_hideTimer)
    _hideTimer = null
  }
}

function updateIcon(): void {
  const btn      = document.getElementById('fullscreen-btn')
  const iconEl   = btn?.querySelector<HTMLElement>('.fs-icon')
  if (!iconEl) return

  if (document.fullscreenElement) {
    // Ícone "minimizar"
    iconEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
        <polyline points="8 3 3 3 3 8"></polyline>
        <polyline points="21 8 21 3 16 3"></polyline>
        <polyline points="3 16 3 21 8 21"></polyline>
        <polyline points="16 21 21 21 21 16"></polyline>
      </svg>`
  } else {
    // Ícone "expandir"
    iconEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>`
  }
}
