// ================================================================
//  weather.ts — Clima via Open-Meteo (gratuito, sem API key)
//               + Nominatim para nome da cidade
// ================================================================

const OPEN_METEO  = 'https://api.open-meteo.com/v1/forecast'
const NOMINATIM   = 'https://nominatim.openstreetmap.org/reverse'
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

import { getSettings } from './settings'

// ── WMO Weather Code → PT-BR ──────────────────────────────────

interface WeatherCode {
  desc:  string
  emoji: string
}

const WMO: Record<number, WeatherCode> = {
  0:  { desc: 'Céu limpo',             emoji: '☀️'  },
  1:  { desc: 'Pouco nublado',          emoji: '🌤️' },
  2:  { desc: 'Parcialmente nublado',   emoji: '⛅'  },
  3:  { desc: 'Nublado',               emoji: '☁️'  },
  45: { desc: 'Nevoeiro',              emoji: '🌫️' },
  48: { desc: 'Nevoeiro com gelo',     emoji: '🌫️' },
  51: { desc: 'Chuvisco leve',         emoji: '🌦️' },
  53: { desc: 'Chuvisco moderado',     emoji: '🌦️' },
  55: { desc: 'Chuvisco intenso',      emoji: '🌧️' },
  61: { desc: 'Chuva leve',            emoji: '🌧️' },
  63: { desc: 'Chuva moderada',        emoji: '🌧️' },
  65: { desc: 'Chuva forte',           emoji: '🌧️' },
  71: { desc: 'Neve leve',             emoji: '🌨️' },
  73: { desc: 'Neve moderada',         emoji: '❄️'  },
  75: { desc: 'Neve forte',            emoji: '❄️'  },
  77: { desc: 'Granizo',              emoji: '🌨️' },
  80: { desc: 'Pancadas leves',        emoji: '🌦️' },
  81: { desc: 'Pancadas moderadas',    emoji: '🌧️' },
  82: { desc: 'Pancadas fortes',       emoji: '⛈️'  },
  85: { desc: 'Neve em pancadas',      emoji: '🌨️' },
  86: { desc: 'Neve forte',            emoji: '❄️'  },
  95: { desc: 'Tempestade',            emoji: '⛈️'  },
  96: { desc: 'Tempestade c/ granizo', emoji: '⛈️'  },
  99: { desc: 'Tempestade severa',     emoji: '🌩️' },
}

function getWMO(code: number): WeatherCode {
  return WMO[code] ?? { desc: 'Desconhecido', emoji: '🌡️' }
}

// ── Wind direction ────────────────────────────────────────────

function windDir(deg: number): string {
  const dirs = ['N','NE','L','SE','S','SO','O','NO']
  return dirs[Math.round(deg / 45) % 8]
}

// ── Geolocation ───────────────────────────────────────────────

// Localização padrão de fallback (Porto, Portugal)
const DEFAULT_COORDS = { latitude: 41.1496, longitude: -8.6110 }

async function getCoords(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_COORDS)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos  => resolve(pos.coords),
      err  => {
        console.warn('Geolocalização falhou/negada, usando local padrão:', err.message)
        resolve(DEFAULT_COORDS)
      },
      { timeout: 5000, maximumAge: 300_000 }
    )
  })
}

async function getCityName(lat: number, lon: number): Promise<string> {
  try {
    const res  = await fetch(
      `${NOMINATIM}?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
    )
    const data = await res.json()
    const a    = data.address ?? {}
    return a.city ?? a.town ?? a.village ?? a.county ?? 'Localização desconhecida'
  } catch {
    return 'Localização desconhecida'
  }
}

// ── Open-Meteo API ────────────────────────────────────────────

interface WeatherData {
  city:          string
  temp:          number
  feelsLike:     number
  humidity:      number
  windSpeed:     number
  windDir:       string
  weatherCode:   number
  tempMax:       number
  tempMin:       number
  hourly: Array<{
    time:        string   // "HH:MM"
    temp:        number
    weatherCode: number
    isCurrent:   boolean
  }>
}

async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude:  String(lat),
    longitude: String(lon),
    current:   [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    hourly:         'temperature_2m,weather_code',
    daily:          'temperature_2m_max,temperature_2m_min',
    timezone:       'auto',
    forecast_days:  '1',
    wind_speed_unit:'kmh',
  })

  const res  = await fetch(`${OPEN_METEO}?${params}`)
  const data = await res.json()

  const cur = data.current
  const now = new Date()
  const currentHour = now.getHours()

  // Filtra as próximas 12h da previsão horária
  const hourlyTimes: string[]   = data.hourly.time
  const hourlyTemps: number[]   = data.hourly.temperature_2m
  const hourlyCodes: number[]   = data.hourly.weather_code

  const hourly = hourlyTimes
    .map((iso, i) => ({
      time:        new Date(iso).getHours(),
      temp:        Math.round(hourlyTemps[i]),
      weatherCode: hourlyCodes[i],
    }))
    .map(h => ({
      time:        `${String(h.time).padStart(2, '0')}:00`,
      temp:        h.temp,
      weatherCode: h.weatherCode,
      isCurrent:   h.time === currentHour
    }))

  return {
    city:        '',  // preenchido depois
    temp:        Math.round(cur.temperature_2m),
    feelsLike:   Math.round(cur.apparent_temperature),
    humidity:    cur.relative_humidity_2m,
    windSpeed:   Math.round(cur.wind_speed_10m),
    windDir:     windDir(cur.wind_direction_10m),
    weatherCode: cur.weather_code,
    tempMax:     Math.round(data.daily.temperature_2m_max[0]),
    tempMin:     Math.round(data.daily.temperature_2m_min[0]),
    hourly,
  }
}

// ── Weather Animation Engine ──────────────────────────────────

type WeatherEffect = 'rain' | 'drizzle' | 'snow' | 'fog' | 'storm' | 'clear-day' | 'clear-night' | 'cloudy' | 'none'

let _animRaf = 0

function wmoToEffect(code: number): WeatherEffect {
  if ([0, 1].includes(code)) {
    const hour = new Date().getHours()
    return hour >= 6 && hour < 20 ? 'clear-day' : 'clear-night'
  }
  if ([2, 3].includes(code))           return 'cloudy'
  if ([45, 48].includes(code))         return 'fog'
  if ([51, 53, 55].includes(code))     return 'drizzle'
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code))     return 'storm'
  return 'none'
}

function effectToBgClass(e: WeatherEffect): string {
  const map: Record<WeatherEffect, string> = {
    'clear-day':   'wx-clear-day',
    'clear-night': 'wx-clear-night',
    'cloudy':      'wx-cloudy',
    'drizzle':     'wx-rain',
    'rain':        'wx-rain',
    'storm':       'wx-storm',
    'snow':        'wx-snow',
    'fog':         'wx-fog',
    'none':        '',
  }
  return map[e] ?? ''
}

const BACKGROUND_IMAGES: Record<WeatherEffect, string> = {
  'clear-day':   'https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1920&auto=format&fit=crop',
  'clear-night': 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1920&auto=format&fit=crop',
  'cloudy':      'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?q=80&w=1920&auto=format&fit=crop',
  'drizzle':     'https://images.unsplash.com/photo-1541692641319-981cc79ee10a?q=80&w=1920&auto=format&fit=crop',
  'rain':        'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=1920&auto=format&fit=crop',
  'storm':       'https://images.unsplash.com/photo-1531265726475-52ad60219627?q=80&w=1920&auto=format&fit=crop',
  'snow':        'https://images.unsplash.com/photo-1491002052546-bf38f186af56?q=80&w=1920&auto=format&fit=crop',
  'fog':         'https://images.unsplash.com/photo-1487621167305-5d248087c724?q=80&w=1920&auto=format&fit=crop',
  'none':        '',
}

let _bgImageUrl = ''

function setBgImage(bgImage: HTMLElement, url: string): void {
  _bgImageUrl = url
  if (!url) {
    bgImage.style.backgroundImage = ''
    return
  }
  const img = new Image()
  img.onload = () => {
    if (_bgImageUrl === url) bgImage.style.backgroundImage = `url('${url}')`
  }
  img.onerror = () => {
    console.warn('[weather] Falha ao carregar imagem de fundo:', url)
  }
  img.src = url
}

function applyWeatherAnimation(effect: WeatherEffect): void {
  const canvas = document.getElementById('weather-canvas') as HTMLCanvasElement | null
  const overlay = document.getElementById('weather-bg-overlay')
  const emojiEl = document.getElementById('weather-emoji')
  const bgImage = document.getElementById('weather-bg-image')

  // Aplica gradiente de fundo
  if (overlay) {
    overlay.className = ''
    const cls = effectToBgClass(effect)
    if (cls) overlay.classList.add(cls)
  }

  // Aplica imagem real de fundo (só se carregar com sucesso)
  if (bgImage) {
    setBgImage(bgImage, BACKGROUND_IMAGES[effect] ?? '')
  }

  // Aplica animacao no emoji com efeitos mais ricos
  if (emojiEl) {
    emojiEl.style.animation = ''
    emojiEl.style.filter = ''
    void emojiEl.offsetWidth // force reflow

    if (effect === 'clear-day') {
      emojiEl.style.animation = 'wx-spin 20s linear infinite, wx-spin-glow 4s ease-in-out infinite'
    } else if (effect === 'clear-night') {
      emojiEl.style.animation = 'wx-clear-night 4s ease-in-out infinite'
    } else if (effect === 'rain') {
      emojiEl.style.animation = 'wx-shake 1s ease-in-out infinite'
    } else if (effect === 'drizzle') {
      emojiEl.style.animation = 'wx-shake 1.8s ease-in-out infinite'
    } else if (effect === 'storm') {
      emojiEl.style.animation = 'wx-flash 1.4s ease-in-out infinite'
    } else if (effect === 'snow') {
      emojiEl.style.animation = 'wx-snow-drift 4s ease-in-out infinite, wx-float 3s ease-in-out infinite'
    } else if (effect === 'fog') {
      emojiEl.style.animation = 'wx-pulse-opacity 3.5s ease-in-out infinite'
    } else if (effect === 'cloudy') {
      emojiEl.style.animation = 'wx-sway 5s ease-in-out infinite'
    }
  }

  if (!canvas) return

  cancelAnimationFrame(_animRaf)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Fit canvas to parent
  const resize = () => {
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  resize()

  if (effect === 'none' || effect === 'cloudy' || effect === 'clear-night' || effect === 'clear-day') {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (effect === 'clear-day') startSunRays(canvas, ctx)
    return
  }

  if (effect === 'rain' || effect === 'drizzle' || effect === 'storm') startRain(canvas, ctx, effect)
  else if (effect === 'snow')   startSnow(canvas, ctx)
  else if (effect === 'fog')    startFog(canvas, ctx)
}

// ── Sun Rays ──────────────────────────────────────────────────
function startSunRays(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const NUM_RAYS = 12
  let rotation = 0

  const draw = () => {
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, w, h)

    // Centro do sol: canto superior direito (onde fica o emoji do sol)
    const cx = w * 0.78
    const cy = h * 0.10

    const maxLen = Math.max(w, h) * 1.2
    rotation += 0.002 // rotação lenta

    for (let i = 0; i < NUM_RAYS; i++) {
      const angle = rotation + (i / NUM_RAYS) * Math.PI * 2
      const halfWidth = Math.PI / NUM_RAYS / 2 // meio ângulo de cada raio

      const grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * maxLen, cy + Math.sin(angle) * maxLen)
      grd.addColorStop(0,   'rgba(255, 220, 80, 0.12)')
      grd.addColorStop(0.4, 'rgba(255, 200, 50, 0.06)')
      grd.addColorStop(1,   'rgba(255, 180, 30, 0)')

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, maxLen, angle - halfWidth, angle + halfWidth)
      ctx.closePath()
      ctx.fillStyle = grd
      ctx.fill()
    }

    _animRaf = requestAnimationFrame(draw)
  }
  draw()
}

// ── Rain / Storm ──────────────────────────────────────────────
function startRain(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, type: WeatherEffect): void {
  const count = type === 'drizzle' ? 80 : type === 'storm' ? 300 : 180
  const angleX = type === 'storm' ? 3.5 : 0.8
  const drops = Array.from({ length: count }, () => {
    const z = Math.random() // Profundidade: 0 (fundo) a 1 (frente)
    return {
      x: Math.random() * 2000 - 500,
      y: Math.random() * 1200 - 200,
      z,
      speed: (type === 'drizzle' ? 4 + Math.random() * 4 : 10 + Math.random() * 12) * (z * 0.8 + 0.2),
      len:   (type === 'drizzle' ? 6 + Math.random() * 8 : 14 + Math.random() * 18) * (z * 0.8 + 0.2),
      alpha: (type === 'drizzle' ? 0.12 + Math.random() * 0.15 : 0.2 + Math.random() * 0.35) * z,
      width: (type === 'drizzle' ? 0.5 : 0.8 + Math.random() * 0.6) * z,
    }
  })

  let lightningTimer = 0
  let lightningAlpha = 0

  const draw = () => {
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    if (canvas.width !== w) { canvas.width = w; canvas.height = h }
    ctx.clearRect(0, 0, w, h)

    // Lightning flash for storms
    if (type === 'storm') {
      lightningTimer++
      if (lightningTimer > 180 + Math.random() * 240) {
        lightningTimer = 0
        lightningAlpha = 0.2 + Math.random() * 0.3
      }
      if (lightningAlpha > 0) {
        ctx.fillStyle = `rgba(180, 200, 255, ${lightningAlpha})`
        ctx.fillRect(0, 0, w, h)
        lightningAlpha = Math.max(0, lightningAlpha - 0.04)
      }
    }

    drops.forEach(d => {
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x + angleX * 2, d.y + d.len)
      const grad = ctx.createLinearGradient(d.x, d.y, d.x + angleX * 2, d.y + d.len)
      grad.addColorStop(0, `rgba(180, 210, 255, 0)`)
      grad.addColorStop(0.3, `rgba(180, 210, 255, ${d.alpha})`)
      grad.addColorStop(1, `rgba(180, 210, 255, 0)`)
      ctx.strokeStyle = grad
      ctx.lineWidth = d.width
      ctx.stroke()
      
      d.x += angleX * (d.z * 0.8 + 0.2)
      d.y += d.speed
      if (d.y > h + 100) {
        d.y = -50
        d.x = Math.random() * (w + 400) - 200
      }
    })
    _animRaf = requestAnimationFrame(draw)
  }
  draw()
}

// ── Snow ──────────────────────────────────────────────────────
function startSnow(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const flakes = Array.from({ length: 150 }, () => {
    const z = Math.random()
    return {
      x:     Math.random() * 2000 - 500,
      y:     Math.random() * 1200 - 200,
      z,
      r:     (1.5 + Math.random() * 3) * (z * 0.8 + 0.2),
      speed: (0.5 + Math.random() * 1.5) * (z * 0.8 + 0.2),
      drift: (Math.random() - 0.5) * 0.5 * (z * 0.8 + 0.2),
      alpha: (0.4 + Math.random() * 0.5) * z,
      t:     Math.random() * Math.PI * 2,
    }
  })
  const draw = () => {
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    if (canvas.width !== w) { canvas.width = w; canvas.height = h }
    ctx.clearRect(0, 0, w, h)
    flakes.forEach(f => {
      f.t += 0.01
      f.x += f.drift + Math.sin(f.t) * 0.3
      f.y += f.speed
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`
      ctx.fill()
      if (f.y > h + 20) { f.y = -20; f.x = Math.random() * (w + 400) - 200 }
    })
    _animRaf = requestAnimationFrame(draw)
  }
  draw()
}

// ── Fog ───────────────────────────────────────────────────────
function startFog(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const layers = Array.from({ length: 8 }, (_, i) => ({
    y:     50 + i * 80,
    speed: 0.1 + (i % 3) * 0.1,
    alpha: 0.05 + i * 0.02,
    offset: Math.random() * 1000,
  }))
  const draw = () => {
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    if (canvas.width !== w) { canvas.width = w; canvas.height = h }
    ctx.clearRect(0, 0, w, h)
    layers.forEach(l => {
      l.offset = (l.offset + l.speed) % (w * 2)
      const grd = ctx.createLinearGradient(0, l.y - 60, 0, l.y + 60)
      grd.addColorStop(0,   `rgba(180,190,210,0)`)
      grd.addColorStop(0.5, `rgba(180,190,210,${l.alpha})`)
      grd.addColorStop(1,   `rgba(180,190,210,0)`)
      ctx.fillStyle = grd
      ctx.fillRect(-(w) + l.offset, l.y - 60, w * 2, 120)
    })
    _animRaf = requestAnimationFrame(draw)
  }
  draw()
}

// ── UI Rendering ──────────────────────────────────────────────

function renderWeather(d: WeatherData): void {
  const wmo = getWMO(d.weatherCode)

  setText('weather-location-name', d.city)
  setText('weather-emoji',         wmo.emoji)
  setText('weather-temp-display',  `${d.temp}°`)
  setText('weather-desc-text',     wmo.desc)
  setText('weather-feels',         `${d.feelsLike}°`)
  setText('weather-humidity',      `${d.humidity}%`)
  setText('weather-wind',          `${d.windSpeed} km/h ${d.windDir}`)
  setText('weather-maxmin',        `${d.tempMax}° / ${d.tempMin}°`)
  setText('weather-updated',       `Atualizado às ${new Date().getHours().toString().padStart(2,'0')}:${new Date().getMinutes().toString().padStart(2,'0')}`)

  // Mini-clima no player (abaixo do relógio principal) e idle (abaixo do relógio modo foto)
  setText('mini-weather-emoji', wmo.emoji)
  setText('mini-weather-temp',  `${d.temp}° ${wmo.desc}`)
  setText('idle-weather-emoji', wmo.emoji)
  setText('idle-weather-temp',  `${d.temp}° ${wmo.desc}`)

  // Animação de fundo baseada no código WMO
  applyWeatherAnimation(wmoToEffect(d.weatherCode))

  // Hourly forecast
  const hourlyEl = document.getElementById('weather-hourly')
  if (hourlyEl) {
    hourlyEl.innerHTML = d.hourly.map(h => {
      const hw = getWMO(h.weatherCode)
      const currentClass = h.isCurrent ? 'current-hour' : ''
      return `
        <div class="hourly-item ${currentClass}">
          <div class="hourly-time">${h.time}</div>
          <div class="hourly-emoji">${hw.emoji}</div>
          <div class="hourly-temp">${h.temp}°</div>
        </div>
      `
    }).join('')

    // Auto-scroll para a hora atual
    setTimeout(() => {
      const currentEl = hourlyEl.querySelector('.current-hour') as HTMLElement
      if (currentEl && hourlyEl.parentElement) {
        hourlyEl.parentElement.scrollTo({
          left: currentEl.offsetLeft - (hourlyEl.parentElement.clientWidth / 2) + (currentEl.clientWidth / 2),
          behavior: 'smooth'
        })
      }
    }, 100)
  }
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function showWeatherError(msg: string): void {
  setText('weather-location-name', msg)
  setText('weather-temp-display', '--°')
  setText('weather-desc-text', 'Sem dados')
}

// ── Public API ────────────────────────────────────────────────

let _refreshTimer: ReturnType<typeof setInterval> | null = null
let _isWeatherListenerAdded = false

export async function initWeather(): Promise<void> {
  setText('weather-location-name', 'Obtendo localização...')

  const drawer = document.getElementById('weather-drawer')
  if (drawer) {
    drawer.addEventListener('click', () => drawer.classList.toggle('open'))
  }

  const load = async () => {
    try {
      const s = getSettings()
      let lat, lon, city

      setText('weather-location-name', 'Atualizando clima...')

      if (s.weatherLocation && s.weatherLocation.trim() !== '') {
        // Busca coordenadas por nome da cidade
        try {
          const res = await fetch(`${NOMINATIM_SEARCH}?q=${encodeURIComponent(s.weatherLocation)}&format=json&limit=1`, {
            headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' }
          })
          const data = await res.json()
          if (data && data.length > 0) {
            lat = parseFloat(data[0].lat)
            lon = parseFloat(data[0].lon)
            city = data[0].display_name.split(',')[0]
          } else {
            throw new Error(`Localização "${s.weatherLocation}" não encontrada`)
          }
        } catch (e) {
          console.warn('[weather] Erro ao buscar cidade manualmente:', e)
          throw new Error('Localização não encontrada')
        }
      } else {
        // Usa geolocalizacao (com fallback para Porto)
        const coords  = await getCoords()
        lat = coords.latitude
        lon = coords.longitude
        city = await getCityName(lat, lon)
      }

      const data = await fetchWeatherData(lat, lon)
      data.city = city
      renderWeather(data)
    } catch (err) {
      console.warn('[weather]', err)
      showWeatherError(
        err instanceof GeolocationPositionError
          ? 'Localização negada — ative o GPS'
          : 'Erro ao carregar clima'
      )
    }
  }

  await load()

  // Atualiza a cada 10 minutos
  if (_refreshTimer) clearInterval(_refreshTimer)
  _refreshTimer = setInterval(load, 10 * 60 * 1000)

  // Atualiza imediatamente caso as configurações mudem
  if (!_isWeatherListenerAdded) {
    window.addEventListener('lumina:settings-changed', () => {
      load()
    })
    _isWeatherListenerAdded = true
  }
}
