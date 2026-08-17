// ================================================================
//  timers.ts — Timers de Cozinha (Material 3 / Android 16 style)
//  Timer único em tela cheia, painel retrátil, overlays discretos
// ================================================================

import { getSettings } from './settings'
import { navigateTo } from './navigation'

// ── Constants ─────────────────────────────────────────────────────

const RING_R = 120
const RING_CIRC = 2 * Math.PI * RING_R   // 753.98
const RING_ARC_LEN = RING_CIRC * 0.75        // 270° = 565.49
const WARN_MS = 10_000

// ── Types ─────────────────────────────────────────────────────────

interface KitchenTimer {
  id: string
  durationMs: number
  remainingMs: number
  /** performance.now() snapshot at last measurement point */
  anchorTime: number | null
  state: 'running' | 'paused' | 'done'
  alertFired: boolean
}

// ── State ─────────────────────────────────────────────────────────

const _timers: Map<string, KitchenTimer> = new Map()
let _activeId: string | null = null
let _sheetOpen = true   // starts open when no timers
let _customSecs = 300    // 5 min default
let _rafId = 0
let _overlayIntervalId = 0
let _audioCtx: AudioContext | null = null

// ── Audio ─────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return _audioCtx
}

function playAlertSound(): void {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    const beeps: Array<{ t: number; f: number; d: number }> = [
      { t: now + 0.00, f: 880, d: 0.12 },
      { t: now + 0.18, f: 880, d: 0.12 },
      { t: now + 0.36, f: 1046.5, d: 0.35 },
    ]
    for (const b of beeps) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(b.f, b.t)
      gain.gain.setValueAtTime(0, b.t)
      gain.gain.linearRampToValueAtTime(0.45, b.t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, b.t + b.d)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(b.t)
      osc.stop(b.t + b.d + 0.05)
    }
  } catch { /* silently fail */ }
}

function vibrateIfEnabled(): void {
  try {
    const s = getSettings()
    if ((s as any).timerVibrate && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400])
    }
  } catch { /* silently fail */ }
}

let alarmIntervalId: number | undefined
let activeAlarmTimerId: string | null = null

function startAlarm(t: KitchenTimer): void {
  if (alarmIntervalId) return // already ringing
  activeAlarmTimerId = t.id

  playAlertSound()
  alarmIntervalId = window.setInterval(playAlertSound, 1500)
  vibrateIfEnabled()

  const banner = document.getElementById('alarm-banner')
  const textEl = banner?.querySelector('.alarm-text')
  if (textEl) textEl.textContent = msToDisplay(t.durationMs)
  banner?.classList.remove('alarm-banner-hidden')
}

function stopAlarm(): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId)
    alarmIntervalId = undefined
  }
  const banner = document.getElementById('alarm-banner')
  banner?.classList.add('alarm-banner-hidden')

  if (activeAlarmTimerId) {
    removeTimer(activeAlarmTimerId)
    activeAlarmTimerId = null
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function generateId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

function msToDisplay(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function getActive(): KitchenTimer | null {
  return _activeId ? (_timers.get(_activeId) ?? null) : null
}

function getCurrentRemaining(t: KitchenTimer): number {
  if (t.state !== 'running' || t.anchorTime === null) return t.remainingMs
  return Math.max(0, t.remainingMs - (performance.now() - t.anchorTime))
}

// ── Timer Operations ──────────────────────────────────────────────

function createTimer(durationSecs: number): KitchenTimer {
  const id = generateId()
  const t: KitchenTimer = {
    id,
    durationMs: durationSecs * 1000,
    remainingMs: durationSecs * 1000,
    anchorTime: performance.now(),
    state: 'running',
    alertFired: false,
  }
  _timers.set(id, t)
  return t
}

/** Creates a brand new timer, makes it active, collapses sheet */
export function addNewTimer(durationSecs: number): void {
  const t = createTimer(durationSecs)
  _activeId = t.id
  setSheetOpen(false)
  renderAll()
  ensureRaf()
  if ('vibrate' in navigator) navigator.vibrate(30)
}

/** Adds time to the active timer; if none exists, creates one */
function addTimeToActive(secs: number): void {
  const t = getActive()
  if (!t) {
    addNewTimer(secs)
    return
  }
  const addMs = secs * 1000
  if (t.state === 'done') {
    // Revive with new duration
    t.durationMs = addMs
    t.remainingMs = addMs
    t.anchorTime = performance.now()
    t.state = 'running'
    t.alertFired = false
    setSheetOpen(false)
  } else {
    t.durationMs += addMs
    t.remainingMs += addMs
    // If paused, remainingMs is already captured; if running, next frame recomputes
    if (t.state === 'paused') {
      // Nothing extra needed
    }
  }
  renderAll()
  ensureRaf()
  if ('vibrate' in navigator) navigator.vibrate(30)
}

function selectTimer(id: string): void {
  if (!_timers.has(id)) return
  _activeId = id
  renderAll()
}

function toggleActive(): void {
  const t = getActive()
  if (!t || t.state === 'done') return
  if (t.state === 'running') {
    const elapsed = performance.now() - (t.anchorTime ?? performance.now())
    t.remainingMs = Math.max(0, t.remainingMs - elapsed)
    t.anchorTime = null
    t.state = 'paused'
  } else {
    t.anchorTime = performance.now()
    t.state = 'running'
    ensureRaf()
  }
  renderMainControls()
  renderChips()
}

function resetActive(): void {
  const t = getActive()
  if (!t) return
  t.remainingMs = t.durationMs
  t.alertFired = false
  t.anchorTime = performance.now()
  t.state = 'running'
  setSheetOpen(false)
  renderAll()
  ensureRaf()
}

function removeTimer(id: string): void {
  if (!_timers.has(id)) return
  _timers.delete(id)
  if (_activeId === id) {
    const ids = [..._timers.keys()]
    _activeId = ids.length > 0 ? ids[0] : null
  }
  renderAll()
  if (_timers.size === 0) stopRaf()
}

function removeActive(): void {
  if (_activeId) removeTimer(_activeId)
}

// ── rAF loop ──────────────────────────────────────────────────────

function ensureRaf(): void {
  if (!_rafId) _rafId = requestAnimationFrame(rafLoop)
}

function stopRaf(): void {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0 }
}

function rafLoop(now: number): void {
  let anyRunning = false

  for (const [, t] of _timers) {
    if (t.state !== 'running') continue
    anyRunning = true

    const remaining = Math.max(0, t.remainingMs - (now - (t.anchorTime ?? now)))

    if (remaining <= 0 && !t.alertFired) {
      // Freeze remaining at 0
      t.remainingMs = 0
      t.anchorTime = null
      t.state = 'done'
      t.alertFired = true
      startAlarm(t)
      renderAll()
      setSheetOpen(true)
    }
  }

  // Fast-path update for active timer display
  const active = getActive()
  if (active && active.state !== 'done') {
    const rem = getCurrentRemaining(active)
    const ratio = active.durationMs > 0 ? rem / active.durationMs : 0
    const warn = active.state === 'running' && rem <= WARN_MS

    updateMainTimeDisplay(rem)
    updateArcProgress(ratio, warn)
    updateWarnState(warn)
  }

  // Update time on non-active running chips
  for (const [id, t] of _timers) {
    if (id === _activeId || t.state !== 'running') continue
    const rem = getCurrentRemaining(t)
    const chipTimeEl = document.getElementById(`chip-time-${id}`)
    if (chipTimeEl) chipTimeEl.textContent = msToDisplay(rem)
  }

  _rafId = anyRunning ? requestAnimationFrame(rafLoop) : 0
}

// ── Arc helpers ───────────────────────────────────────────────────

function updateArcProgress(ratio: number, warn: boolean): void {
  const fg = document.getElementById('timer-arc-fg') as SVGCircleElement | null
  if (!fg) return

  const clamped = Math.max(0, Math.min(1, ratio))
  fg.style.strokeDashoffset = String(RING_ARC_LEN * (1 - clamped))

  const active = getActive()
  if (active?.state === 'done') {
    fg.style.stroke = 'var(--timer-done)'
  } else {
    fg.style.stroke = warn ? 'var(--timer-warn)' : 'var(--timer-accent)'
  }
}

function updateWarnState(warn: boolean): void {
  const stage = document.getElementById('timer-stage')
  if (!stage) return
  stage.classList.toggle('timer-stage--warning', warn)
}

// ── Display helpers (fast-path, no DOM rebuild) ───────────────────

function updateMainTimeDisplay(ms: number): void {
  const el = document.getElementById('timer-main-time')
  if (el) el.textContent = msToDisplay(ms)
}

// ── Full render ───────────────────────────────────────────────────

function renderAll(): void {
  const hasTimers = _timers.size > 0
  const active = getActive()

  // Empty vs active state on the page
  const page = document.getElementById('timers-page')
  page?.classList.toggle('has-timers', hasTimers)

  // If no active but has timers, pick first
  if (hasTimers && !_activeId) {
    _activeId = [..._timers.keys()][0]
  }

  // Active display
  if (active) {
    const rem = getCurrentRemaining(active)
    const ratio = active.durationMs > 0 ? rem / active.durationMs : 0
    const warn = active.state === 'running' && rem <= WARN_MS

    updateMainTimeDisplay(rem)
    updateArcProgress(ratio, warn)
    updateWarnState(warn)
    renderMainControls()
    renderMainState()
    updateGlow(active.state === 'done' ? 'done' : warn ? 'warn' : 'normal')
  } else {
    updateGlow('none')
    // Reset arc
    const fg = document.getElementById('timer-arc-fg') as SVGCircleElement | null
    if (fg) fg.style.strokeDashoffset = String(RING_ARC_LEN)
  }

  renderChips()
  updateSheetTitle()
}

function renderMainControls(): void {
  const t = getActive()
  if (!t) return

  const toggleBtn = document.getElementById('timer-ctrl-toggle') as HTMLButtonElement | null
  const resetBtn = document.getElementById('timer-ctrl-reset') as HTMLButtonElement | null

  if (toggleBtn) {
    if (t.state === 'done') {
      toggleBtn.style.display = 'none'
    } else {
      toggleBtn.style.display = ''
      toggleBtn.innerHTML = t.state === 'running' ? pauseIcon() : playIcon()
      toggleBtn.setAttribute('aria-label', t.state === 'running' ? 'Pausar timer' : 'Iniciar timer')
    }
  }

  if (resetBtn) {
    resetBtn.style.display = t.state === 'done' ? 'none' : ''
  }
}

function renderMainState(): void {
  const t = getActive()
  if (!t) return

  const stateEl = document.getElementById('timer-main-state')
  if (!stateEl) return

  const labels: Record<KitchenTimer['state'], string> = {
    running: 'contando...',
    paused: 'pausado',
    done: '✓ concluído',
  }
  stateEl.textContent = labels[t.state]
  stateEl.className = `timer-main-state timer-state--${t.state}`
}

function renderChips(): void {
  const chipsEl = document.getElementById('timer-chips')
  if (!chipsEl) return

  const otherIds = [..._timers.keys()].filter(id => id !== _activeId)

  if (otherIds.length === 0) {
    chipsEl.innerHTML = ''
    return
  }

  // Re-render only if count changed (avoid flicker during rAF)
  if (chipsEl.children.length !== otherIds.length) {
    chipsEl.innerHTML = ''
    for (const id of otherIds) {
      const t = _timers.get(id)!
      const rem = getCurrentRemaining(t)
      const chip = document.createElement('button')
      chip.className = `timer-chip timer-chip--${t.state}`
      chip.id = `chip-${id}`
      chip.setAttribute('aria-label', `Selecionar timer: ${msToDisplay(rem)}`)
      chip.innerHTML = `<span class="chip-dot chip-dot--${t.state}"></span><span class="chip-time" id="chip-time-${id}">${msToDisplay(rem)}</span>`
      chip.addEventListener('click', () => selectTimer(id))
      chipsEl.appendChild(chip)
    }
  } else {
    // Just update chip states + times
    for (const id of otherIds) {
      const t = _timers.get(id)!
      const rem = getCurrentRemaining(t)
      const chip = document.getElementById(`chip-${id}`)
      if (chip) {
        chip.className = `timer-chip timer-chip--${t.state}`
        const dot = chip.querySelector('.chip-dot')
        if (dot) dot.className = `chip-dot chip-dot--${t.state}`
      }
      const timeEl = document.getElementById(`chip-time-${id}`)
      if (timeEl) timeEl.textContent = msToDisplay(rem)
    }
  }
}

function updateGlow(mode: 'normal' | 'warn' | 'done' | 'none'): void {
  const glow = document.getElementById('timer-glow')
  if (!glow) return
  const map: Record<typeof mode, string> = {
    normal: 'radial-gradient(ellipse at center, rgba(109,184,255,0.14) 0%, transparent 65%)',
    warn: 'radial-gradient(ellipse at center, rgba(255,112,67,0.18) 0%, transparent 65%)',
    done: 'radial-gradient(ellipse at center, rgba(76,175,80,0.18) 0%, transparent 65%)',
    none: 'none',
  }
  glow.style.background = map[mode]
  glow.style.opacity = mode === 'none' ? '0' : '1'
}

function updateSheetTitle(): void {
  const el = document.getElementById('timer-sheet-title')
  if (!el) return
  const active = getActive()
  el.textContent = !active
    ? 'Criar Timer'
    : active.state === 'done'
      ? 'Timer Concluído'
      : 'Adicionar Tempo'
}

// ── Sheet ─────────────────────────────────────────────────────────

export function setSheetOpen(open: boolean): void {
  _sheetOpen = open
  const sheet = document.getElementById('timer-sheet')
  sheet?.classList.toggle('sheet-open', open)
  const handle = document.getElementById('timer-sheet-handle')
  if (handle) handle.setAttribute('aria-expanded', String(open))

  // Slide nav-dots away when sheet is open so they don't cover the content
  const navDots = document.getElementById('nav-dots')
  if (navDots) {
    navDots.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease'
    if (open) {
      navDots.style.transform = 'translateY(60px)'
      navDots.style.opacity = '0'
      navDots.style.pointerEvents = 'none'
    } else {
      navDots.style.transform = ''
      navDots.style.opacity = ''
      navDots.style.pointerEvents = ''
    }
  }
}

function initSheetDrag(): void {
  const handle = document.getElementById('timer-sheet-handle')
  const sheet = document.getElementById('timer-sheet')
  if (!handle || !sheet) return

  // Approximate height of sheet content (minus handle)
  const DRAG_RANGE = 248

  let startY = 0
  let startOpen = false
  let dragging = false

  const onTouchStart = (e: TouchEvent) => {
    e.stopPropagation()
    startY = e.touches[0].clientY
    startOpen = _sheetOpen
    dragging = true
    sheet.style.transition = 'none'
  }

  const onTouchMove = (e: TouchEvent) => {
    if (!dragging) return
    e.stopPropagation()
    const dy = e.touches[0].clientY - startY
    const base = startOpen ? 0 : DRAG_RANGE
    const clampedY = Math.max(0, Math.min(DRAG_RANGE, base + dy))
    sheet.style.transform = `translateY(${clampedY}px)`
  }

  const onTouchEnd = (e: TouchEvent) => {
    if (!dragging) return
    dragging = false
    sheet.style.transition = ''
    sheet.style.transform = ''
    const dy = e.changedTouches[0].clientY - startY
    if (startOpen && dy > 60) setSheetOpen(false)
    else if (!startOpen && dy < -60) setSheetOpen(true)
    else setSheetOpen(startOpen)
  }

  handle.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true })

  handle.addEventListener('click', (e) => {
    e.stopPropagation()
    setSheetOpen(!_sheetOpen)
  })
}

// ── Overlay (other pages) ─────────────────────────────────────────

function updateOverlays(): void {
  const active = getActive()
  const ids = ['timer-overlay-player', 'timer-overlay-idle']

  for (const id of ids) {
    const overlay = document.getElementById(id)
    if (!overlay) continue

    if (!active) {
      overlay.classList.remove('timer-overlay--visible')
      continue
    }

    const rem = getCurrentRemaining(active)
    const warn = active.state === 'running' && rem <= WARN_MS
    const isDone = active.state === 'done'

    // Update text
    const timeEl = overlay.querySelector('.ov-time')
    if (timeEl) timeEl.textContent = msToDisplay(rem)

    // Update dot state class
    overlay.classList.remove('ov--running', 'ov--paused', 'ov--warn', 'ov--done')
    if (isDone) overlay.classList.add('ov--done')
    else if (warn) overlay.classList.add('ov--warn')
    else if (active.state === 'running') overlay.classList.add('ov--running')
    else overlay.classList.add('ov--paused')

    overlay.classList.add('timer-overlay--visible')
  }
}

function startOverlayTick(): void {
  if (_overlayIntervalId) clearInterval(_overlayIntervalId)
  _overlayIntervalId = window.setInterval(updateOverlays, 1000)
  updateOverlays() // immediate first update
}

// ── Icons ─────────────────────────────────────────────────────────

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
}

function resetIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`
}

function closeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="22" height="22" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
}

// ── Custom input ──────────────────────────────────────────────────

function updateCustomDisplay(): void {
  const el = document.getElementById('timer-custom-display')
  if (!el) return
  const m = Math.floor(_customSecs / 60)
  const s = _customSecs % 60
  el.textContent = s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

function adjustCustom(delta: number): void {
  _customSecs = Math.max(60, Math.min(7200, _customSecs + delta))
  updateCustomDisplay()
}

function startAdjRepeat(delta: number): void {
  adjustCustom(delta)
  let timeout: ReturnType<typeof setTimeout>
  let interval: ReturnType<typeof setInterval>

  const stop = () => {
    clearTimeout(timeout)
    clearInterval(interval)
    window.removeEventListener('mouseup', stop)
    window.removeEventListener('touchend', stop)
  }

  timeout = setTimeout(() => {
    interval = setInterval(() => adjustCustom(delta), 80)
  }, 400)

  window.addEventListener('mouseup', stop, { once: true })
  window.addEventListener('touchend', stop, { once: true })
}

// ── Init ──────────────────────────────────────────────────────────

export function initTimers(): void {
  // Configure arc SVG: set dasharray in CSS (already done) but
  // also init the fg offset to "empty" state
  const fg = document.getElementById('timer-arc-fg') as SVGCircleElement | null
  if (fg) fg.style.strokeDashoffset = String(RING_ARC_LEN)

  // Populate control buttons with icons
  const resetBtn = document.getElementById('timer-ctrl-reset')
  const closeBtn = document.getElementById('timer-ctrl-remove')
  const toggleBtn = document.getElementById('timer-ctrl-toggle')
  if (resetBtn) resetBtn.innerHTML = resetIcon()
  if (closeBtn) closeBtn.innerHTML = closeIcon()
  if (toggleBtn) toggleBtn.innerHTML = playIcon()

  // Quick-add buttons (in the bottom sheet)
  document.querySelectorAll<HTMLButtonElement>('.tq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addTimeToActive(parseInt(btn.dataset.secs ?? '60', 10))
    })
  })

  // +1:00 button (main controls)
  document.getElementById('timer-ctrl-add')?.addEventListener('click', () => {
    addTimeToActive(60)
  })

  // Custom sheet add button
  document.getElementById('timer-sheet-add-btn')?.addEventListener('click', () => {
    addTimeToActive(_customSecs)
  })

  // Adj buttons (long-press repeat)
  document.querySelectorAll<HTMLButtonElement>('.timer-adj-btn').forEach(btn => {
    const delta = parseInt(btn.dataset.delta ?? '60', 10)
    btn.addEventListener('mousedown', () => startAdjRepeat(delta))
    btn.addEventListener('touchstart', () => startAdjRepeat(delta), { passive: true })
  })

  // New Timer button
  document.getElementById('timer-new-btn')?.addEventListener('click', () => {
    addNewTimer(_customSecs)
  })

  // Active timer controls
  document.getElementById('timer-ctrl-toggle')?.addEventListener('click', toggleActive)
  document.getElementById('timer-ctrl-reset')?.addEventListener('click', resetActive)
  document.getElementById('timer-ctrl-remove')?.addEventListener('click', removeActive)

  // Alarm stop banner
  document.getElementById('alarm-stop-btn')?.addEventListener('click', stopAlarm)

  // Overlay: click navigates to timers page
  document.getElementById('timer-overlay-player')?.addEventListener('click', () => navigateTo(3))
  document.getElementById('timer-overlay-idle')?.addEventListener('click', () => navigateTo(3))

  // Sheet drag
  initSheetDrag()

  // Initial render & tick
  updateCustomDisplay()
  renderAll()
  startOverlayTick()

  // Notification permission (best-effort)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}
