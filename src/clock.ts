// ================================================================
//  clock.ts — Relógio digital atualizado a cada segundo
// ================================================================

const DAYS_PT   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(d: Date): string {
  const day   = DAYS_PT[d.getDay()]
  const month = MONTHS_PT[d.getMonth()]
  const date  = d.getDate()
  return `${day}, ${date} ${month}`
}

interface ClockElements {
  time: HTMLElement
  date: HTMLElement
}

const clocks: ClockElements[] = []

function tick(): void {
  const now = new Date()
  const timeStr = formatTime(now)
  const dateStr = formatDate(now)

  for (const { time, date } of clocks) {
    time.textContent = timeStr
    date.textContent = dateStr
  }
}

export function initClock(): void {
  const playerTime  = document.getElementById('clock-time')
  const playerDate  = document.getElementById('clock-date')
  const idleTime    = document.getElementById('idle-time')
  const idleDate    = document.getElementById('idle-date')
  const weatherTime = document.getElementById('weather-clock-time')
  const weatherDate = document.getElementById('weather-clock-date')

  if (playerTime  && playerDate)  clocks.push({ time: playerTime,  date: playerDate  })
  if (idleTime    && idleDate)    clocks.push({ time: idleTime,    date: idleDate    })
  if (weatherTime && weatherDate) clocks.push({ time: weatherTime, date: weatherDate })

  tick() // imediato
  setInterval(tick, 1000)
}
