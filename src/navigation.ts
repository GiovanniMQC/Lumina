// ================================================================
//  navigation.ts — Sistema de páginas deslizantes (swipe)
// ================================================================

import { setSheetOpen } from './timers'

let _currentPage  = 0
let _totalPages   = 0
let _wrapper: HTMLElement | null = null
let _dots: HTMLElement[]         = []
let _onPageChange: ((page: number) => void) | null = null

// Touch state
let _touchStartX  = 0
let _touchStartY  = 0
let _touchDeltaX  = 0
let _dragging     = false
let _isHorizontal: boolean | null = null

export function initNavigation(
  wrapperId: string,
  dotsSelector: string,
  totalPages: number,
  onPageChange?: (page: number) => void
): void {
  _wrapper      = document.getElementById(wrapperId)
  _totalPages   = totalPages
  _onPageChange = onPageChange ?? null

  if (!_wrapper) return

  // Dots
  _dots = Array.from(document.querySelectorAll<HTMLElement>(dotsSelector))
  _dots.forEach((dot, i) => {
    dot.addEventListener('click', () => navigateTo(i))
  })

  // Touch (tablet)
  _wrapper.addEventListener('touchstart',  onTouchStart,  { passive: true })
  _wrapper.addEventListener('touchmove',   onTouchMove,   { passive: false })
  _wrapper.addEventListener('touchend',    onTouchEnd,    { passive: true })

  // Mouse drag (dev desktop)
  _wrapper.addEventListener('mousedown',   onMouseDown)
  window.addEventListener('mousemove',    onMouseMove)
  window.addEventListener('mouseup',      onMouseUp)

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  navigateTo(_currentPage - 1)
    if (e.key === 'ArrowRight') navigateTo(_currentPage + 1)
  })

  navigateTo(0, false)
}

export function navigateTo(page: number, animated = true): void {
  if (!_wrapper) return
  page = Math.max(0, Math.min(page, _totalPages - 1))
  const previousPage = _currentPage
  _currentPage = page

  if (previousPage !== page) {
    setSheetOpen(false)
  }

  _wrapper.style.transition = animated
    ? 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    : 'none'
  _wrapper.style.transform = `translateX(-${page * 100}vw)`

  _dots.forEach((d, i) => d.classList.toggle('active', i === page))
  
  if (previousPage !== _currentPage) {
    _onPageChange?.(_currentPage)
  }
}

export function getCurrentPage(): number {
  return _currentPage
}

// ── Touch handlers ────────────────────────────────────────────

function onTouchStart(e: TouchEvent): void {
  _touchStartX  = e.touches[0].clientX
  _touchStartY  = e.touches[0].clientY
  _touchDeltaX  = 0
  _dragging     = true
  _isHorizontal = null
  if (_wrapper) _wrapper.style.transition = 'none'
}

function onTouchMove(e: TouchEvent): void {
  if (!_dragging || !_wrapper) return

  const dx = e.touches[0].clientX - _touchStartX
  const dy = e.touches[0].clientY - _touchStartY

  // Determina direção do swipe na primeira vez
  if (_isHorizontal === null) {
    _isHorizontal = Math.abs(dx) > Math.abs(dy)
  }

  if (!_isHorizontal) return

  e.preventDefault() // evita scroll vertical durante swipe horizontal
  _touchDeltaX = dx

  // Feedback de drag em tempo real (com resistência nas bordas)
  const base   = -_currentPage * 100
  const resist = (_currentPage === 0 && dx > 0) || (_currentPage === _totalPages - 1 && dx < 0)
  const pct    = resist ? dx * 0.15 : dx
  const vw     = _wrapper.parentElement?.clientWidth ?? window.innerWidth
  _wrapper.style.transform = `translateX(calc(${base}% + ${pct / vw * 100}%))`
}

function onTouchEnd(_e: TouchEvent): void {
  if (!_dragging) return
  _dragging = false

  const threshold = 60
  if (_touchDeltaX < -threshold)       navigateTo(_currentPage + 1)
  else if (_touchDeltaX > threshold)   navigateTo(_currentPage - 1)
  else                                  navigateTo(_currentPage) // snap back
}

// ── Mouse drag ────────────────────────────────────────────────

let _mouseStartX = 0
let _mouseDragging = false

function onMouseDown(e: MouseEvent): void {
  _mouseStartX   = e.clientX
  _mouseDragging = true
  if (_wrapper) _wrapper.style.transition = 'none'
}

function onMouseMove(e: MouseEvent): void {
  if (!_mouseDragging || !_wrapper) return
  const dx  = e.clientX - _mouseStartX
  const base = -_currentPage * 100
  const vw   = _wrapper.parentElement?.clientWidth ?? window.innerWidth
  _wrapper.style.transform = `translateX(calc(${base}% + ${dx / vw * 100}%))`
}

function onMouseUp(e: MouseEvent): void {
  if (!_mouseDragging) return
  _mouseDragging = false
  const dx = e.clientX - _mouseStartX
  if (dx < -60)       navigateTo(_currentPage + 1)
  else if (dx > 60)   navigateTo(_currentPage - 1)
  else                navigateTo(_currentPage)
}
