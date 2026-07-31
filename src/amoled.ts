// ================================================================
//  amoled.ts — Gerenciamento do Modo AMOLED (Tela Preta)
// ================================================================

import { getSettings } from './settings'

const CHECK_INTERVAL_MS = 10000 // Checa a cada 10s
const WAKE_DURATION_MS = 10000  // Fica aceso por 10s após interação

let wakeTimeout: ReturnType<typeof setTimeout> | null = null
let isAwake = false

export function initAmoled(): void {
  // Configura a checagem periódica
  setInterval(checkAmoledState, CHECK_INTERVAL_MS)
  
  // Ouve interações globais para despertar a tela
  document.addEventListener('touchstart', wakeUp, { passive: true })
  document.addEventListener('click', wakeUp, { passive: true })
  
  // Re-checa quando as configurações mudam
  window.addEventListener('tabhub:settings-changed', checkAmoledState)
  
  checkAmoledState()
}

function wakeUp(): void {
  const s = getSettings()
  if (!s.amoledMode) return
  
  if (document.body.classList.contains('amoled-active')) {
    document.body.classList.remove('amoled-active')
  }
  
  isAwake = true
  
  if (wakeTimeout) clearTimeout(wakeTimeout)
  
  wakeTimeout = setTimeout(() => {
    isAwake = false
    checkAmoledState()
  }, WAKE_DURATION_MS)
}

function checkAmoledState(): void {
  const s = getSettings()
  
  if (!s.amoledMode || isAwake) {
    document.body.classList.remove('amoled-active')
    return
  }
  
  if (isNightTime(s.amoledStartTime, s.amoledEndTime)) {
    document.body.classList.add('amoled-active')
  } else {
    document.body.classList.remove('amoled-active')
  }
}

function isNightTime(startStr: string, endStr: string): boolean {
  if (!startStr || !endStr) return false
  
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  
  const [startH, startM] = startStr.split(':').map(Number)
  const [endH, endM] = endStr.split(':').map(Number)
  
  if (isNaN(startH) || isNaN(endH)) return false
  
  const startTotal = startH * 60 + startM
  const endTotal = endH * 60 + endM
  
  if (startTotal <= endTotal) {
    // Ex: 22:00 até 23:59 (Mesmo dia)
    return currentMinutes >= startTotal && currentMinutes <= endTotal
  } else {
    // Ex: 22:00 até 06:00 (Cruza a meia-noite)
    return currentMinutes >= startTotal || currentMinutes <= endTotal
  }
}
