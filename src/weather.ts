// ================================================================
//  weather.ts — Clima via Open-Meteo (gratuito, sem API key)
//               + Nominatim para nome da cidade
// ================================================================

const OPEN_METEO  = 'https://api.open-meteo.com/v1/forecast'
const NOMINATIM   = 'https://nominatim.openstreetmap.org/reverse'

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

async function getCoords(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não disponível'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos  => resolve(pos.coords),
      err  => reject(err),
      { timeout: 10000, maximumAge: 300_000 }
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
    .filter(h => h.time >= currentHour)
    .slice(0, 12)
    .map(h => ({
      time:        `${String(h.time).padStart(2, '0')}:00`,
      temp:        h.temp,
      weatherCode: h.weatherCode,
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

  // Mini-clima no player (abaixo do relógio)
  setText('mini-weather-emoji', wmo.emoji)
  setText('mini-weather-temp',  `${d.temp}° ${wmo.desc}`)

  // Hourly forecast
  const hourlyEl = document.getElementById('weather-hourly')
  if (hourlyEl) {
    hourlyEl.innerHTML = d.hourly.map(h => {
      const hw = getWMO(h.weatherCode)
      return `
        <div class="hourly-item">
          <div class="hourly-time">${h.time}</div>
          <div class="hourly-emoji">${hw.emoji}</div>
          <div class="hourly-temp">${h.temp}°</div>
        </div>
      `
    }).join('')
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

export async function initWeather(): Promise<void> {
  setText('weather-location-name', 'Obtendo localização...')

  const load = async () => {
    try {
      const coords  = await getCoords()
      const [city, data] = await Promise.all([
        getCityName(coords.latitude, coords.longitude),
        fetchWeatherData(coords.latitude, coords.longitude),
      ])
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
}
