// ================================================================
//  wakelock.ts — Gerenciamento de tela sempre ligada
// ================================================================

import { getSettings } from './settings'
import NoSleep from 'nosleep.js'

const noSleep = new NoSleep()

export async function updateWakeLock(): Promise<void> {
  const { keepScreenOn } = getSettings()

  if (keepScreenOn) {
    if (!noSleep.isEnabled) {
      try {
        await noSleep.enable()
        console.log('[wakelock] Tela mantida ligada ativada via NoSleep.')
      } catch (err: any) {
        console.warn(`[wakelock] NoSleep.enable falhou (requer clique do usuário?): ${err.message}`)
      }
    }
  } else {
    if (noSleep.isEnabled) {
      noSleep.disable()
      console.log('[wakelock] Wake lock liberado.')
    }
  }
}

export function initWakeLock(): void {
  // Tenta ativar logo no início (pode falhar se precisar de clique)
  updateWakeLock()

  // Se a aba for colocada em background e voltar, o wake lock pode ser perdido
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateWakeLock()
    }
  })

  // Garante que o NoSleep seja ativado no primeiro toque do usuário na tela
  document.addEventListener('click', () => {
    const { keepScreenOn } = getSettings()
    if (keepScreenOn && !noSleep.isEnabled) {
      updateWakeLock()
    }
  }, { passive: true })

  document.addEventListener('touchstart', () => {
    const { keepScreenOn } = getSettings()
    if (keepScreenOn && !noSleep.isEnabled) {
      updateWakeLock()
    }
  }, { passive: true })
}
