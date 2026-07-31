// ================================================================
//  updater.ts — Sistema de auto-update
// ================================================================
// Verifica periodicamente se a versão do app mudou no servidor
// (via dist/version.json gerado no build) e recarrega a página.

const CHECK_INTERVAL_MS = 60000 // 1 minuto

let currentVersion: string | null = null

export function initUpdater(): void {
  // Apenas no modo produção (evita atrapalhar o dev server do Vite)
  if (import.meta.env.DEV) return

  checkVersion()
  setInterval(checkVersion, CHECK_INTERVAL_MS)
}

async function checkVersion(): Promise<void> {
  try {
    // Adiciona timestamp para evitar cache do navegador/proxy
    const res = await fetch(`/version.json?t=${Date.now()}`)
    if (!res.ok) return
    
    const data = await res.json()
    const newVersion = String(data.version)
    
    if (!currentVersion) {
      // Primeira checagem (define a versão base)
      currentVersion = newVersion
    } else if (currentVersion !== newVersion) {
      // Versão mudou no servidor, forçar recarregamento
      console.log(`[updater] Nova versão detectada (${newVersion}). Recarregando...`)
      window.location.reload()
    }
  } catch (err) {
    // Falha silenciosa em caso de erro de rede
  }
}
