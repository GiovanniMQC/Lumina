// ================================================================
//  wakelock.ts — Gerenciamento de tela sempre ligada
// ================================================================

import { getSettings } from './settings'

let wakeLockSentinel: WakeLockSentinel | null = null

export async function updateWakeLock(): Promise<void> {
  const { keepScreenOn } = getSettings()

  if (keepScreenOn) {
    if (!wakeLockSentinel) {
      await requestWakeLock()
    }
  } else {
    releaseWakeLock()
  }
}

async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen')
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null
      })
      console.log('[wakelock] Tela mantida ligada ativada.')
    } else {
      console.warn('[wakelock] API não suportada neste navegador.')
    }
  } catch (err: any) {
    console.error(`[wakelock] Erro ao solicitar wake lock: ${err.name}, ${err.message}`)
  }
}

function releaseWakeLock(): void {
  if (wakeLockSentinel) {
    wakeLockSentinel.release()
      .then(() => {
        wakeLockSentinel = null
        console.log('[wakelock] Wake lock liberado.')
      })
      .catch((err: any) => {
        console.error(`[wakelock] Erro ao liberar wake lock: ${err.message}`)
      })
  }
}

export function initWakeLock(): void {
  // Configuração inicial
  updateWakeLock()

  // Se a aba for colocada em background e voltar, o wake lock pode ser perdido
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateWakeLock()
    }
  })
}
