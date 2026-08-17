// ================================================================
//  amoled.ts — Gerenciamento do Modo AMOLED (Tela Preta)
// ================================================================

import { getSettings } from './settings'
import { navigateTo } from './navigation'

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
  window.addEventListener('lumina:settings-changed', checkAmoledState)
  
  checkAmoledState()
}

function wakeUp(): void {
  const s = getSettings()
  if (!s.amoledMode) return
  
  if (document.body.classList.contains('amoled-active')) {
    // Desativa a transição de posição do relógio ANTES de remover a classe
    // para evitar o flash de "relógio voando" pelo canto
    const clock = document.getElementById('clock-widget')
    if (clock) {
      clock.style.transition = 'none'
      clock.style.animation = 'none'
      document.body.classList.remove('amoled-active')
      // Força reflow para garantir que o navegador aplique a remoção instantaneamente
      void clock.offsetHeight
      // Re-habilita a transição e a animação
      requestAnimationFrame(() => {
        clock.style.transition = ''
        clock.style.animation = ''
      })
    } else {
      document.body.classList.remove('amoled-active')
    }
  }
  if (document.body.classList.contains('amoled-pitch-black')) {
    document.body.classList.remove('amoled-pitch-black')
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
    document.body.classList.remove('amoled-pitch-black')
    return
  }
  
  if (isNightTime(s.amoledStartTime, s.amoledEndTime)) {
    if (!document.body.classList.contains('amoled-active')) {
      document.body.classList.add('amoled-active')
      navigateTo(0, false) // Força voltar para a página do player onde está o relógio
    }
    
    // Ativa modo breu total de acordo com as configurações do usuário
    if (s.pitchBlackMode && isNightTime(s.pitchBlackStartTime, s.pitchBlackEndTime)) {
      document.body.classList.add('amoled-pitch-black')
    } else {
      document.body.classList.remove('amoled-pitch-black')
    }
  } else {
    document.body.classList.remove('amoled-active')
    document.body.classList.remove('amoled-pitch-black')
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
