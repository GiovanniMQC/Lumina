# Plano de Projeto: Dashboard estilo Nest Hub para Spotify + Letras

## 1. Objetivo

Construir uma SPA web estilo Google Nest Hub que mostra a música tocando no momento (via Spotify Connect) com letra sincronizada em destaque, fundo ambientado com a capa do álbum, relógio e transições suaves. Vai rodar em modo kiosk no Lenovo Tab P11 5G (LineageOS + GApps).

**Importante:** este painel é um *companion display*, não um player. Ele lê o que está tocando via Spotify Web API e exibe bonito — a reprodução em si continua acontecendo no dispositivo Spotify Connect ativo (celular, PC, etc). Controle de play/pause é opcional/bônus.

## 2. Ambiente-alvo

- **Exibição:** Lenovo Tab P11 5G, LineageOS + GApps, rodando dentro do Fully Kiosk Browser apontado para uma URL.
- **Rede:** tablet e servidor (provavelmente a máquina Fedora) na mesma tailnet Tailscale.
- 100% web — nada nativo Android precisa ser instalado além do Fully Kiosk.

## 3. Arquitetura proposta

- SPA estática: **Vite + TypeScript** (vanilla ou Web Components; React é overkill pra uma tela só, mas é opção se preferir componentização).
- **Sem backend obrigatório**: o fluxo Authorization Code + PKCE do Spotify não exige client secret, então dá pra rodar 100% client-side.
- Único "servidor" necessário: hospedar os arquivos estáticos buildados (nginx simples, ou `serve`) na máquina Fedora, exposto na tailnet.
- Opcional: usar `tailscale cert` para emitir HTTPS válido no node — necessário porque o Spotify exige redirect URI em HTTPS (exceto loopback `127.0.0.1` para dev).

## 4. Fluxo de dados

1. App carrega → checa token salvo (localStorage). Se válido, pula auth.
2. Se não autenticado → redireciona para autorização Spotify (PKCE) → volta com `code` → troca por `access_token` + `refresh_token`.
3. Poll a cada 3–5s em `GET /v1/me/player/currently-playing`.
4. Ao detectar troca de faixa → busca letra sincronizada na lrclib.net.
5. Renderiza letra com destaque na linha atual, comparando timestamps do LRC com `progress_ms` retornado pelo Spotify.
6. Refresh automático do `access_token` via `refresh_token` quando expirar (~1h).

## 5. Autenticação Spotify

- Criar app em developer.spotify.com/dashboard.
- Scopes: `user-read-currently-playing`, `user-read-playback-state` (+ `user-modify-playback-state` só se quiser controles).
- Redirect URI: URL de callback via Tailscale HTTPS, ou `http://127.0.0.1:PORT/callback` para testes locais.
- Fluxo: Authorization Code + PKCE (code_verifier/code_challenge via `crypto.subtle`, sem lib externa necessária).

## 6. Fonte de letras sincronizadas: lrclib.net

- API pública e gratuita, sem key: `GET https://lrclib.net/api/search?track_name=...&artist_name=...`
- Retorna `syncedLyrics` em formato LRC (`[mm:ss.xx]texto`).
- Fallback: se não houver `syncedLyrics`, tentar `plainLyrics` (sem timestamp) ou exibir "letra não disponível".

## 7. Design / UI (estética Nest Hub)

- Fundo: capa do álbum em blur + overlay escuro.
- Centro/inferior: título + artista + letra em destaque (fonte grande, linha atual mais brilhante, linhas adjacentes esmaecidas, scroll suave).
- Canto: relógio digital grande.
- Transições suaves (fade/scale) entre linhas e entre faixas.
- Estado idle (nada tocando): vira modo "smart display" — relógio grande, e futuramente slideshow de fotos.

## 8. Roadmap por fases

### Fase 1 — Esqueleto e autenticação
- [ ] Setup do projeto Vite + TS
- [ ] Fluxo PKCE completo (login, callback, refresh token)
- [ ] Poll básico do `currently-playing`, exibindo JSON cru pra validar

### Fase 2 — Letras sincronizadas
- [ ] Integração com busca na lrclib.net
- [ ] Parser de LRC → array de `{timestamp, linha}`
- [ ] Sincronização do destaque com `progress_ms`
- [ ] Tratamento de faixas sem letra / instrumentais

### Fase 3 — Visual Nest Hub
- [ ] Fundo com blur da capa
- [ ] Tipografia/layout grandes, pensados pra visualização à distância
- [ ] Relógio
- [ ] Animações de transição
- [ ] Estado idle

### Fase 4 — Deploy e kiosk
- [ ] Build de produção (`vite build`)
- [ ] Servir estático via Tailscale (nginx ou `serve`)
- [ ] `tailscale cert` se necessário pro redirect URI
- [ ] Configurar Fully Kiosk Browser no tablet (tela sempre ligada, sem chrome de navegador)

### Fase 5 — Bônus (opcional)
- [ ] Widget de clima (Open-Meteo, sem key)
- [ ] Controles play/pause/skip via API
- [ ] Slideshow de fotos no estado idle

## 9. Riscos e limitações

- Rate limit do Spotify no polling — intervalo de 3–5s evita throttle.
- Cobertura de letra sincronizada na lrclib varia bastante, especialmente pra músicas mais nichadas/brasileiras.
- Exigência de HTTPS no redirect URI — resolver via Tailscale cert ou usar `127.0.0.1` como workaround em dev.
- O painel não controla o áudio por padrão; reflete o que está tocando em qualquer dispositivo Connect ativo.

## 10. Decisões em aberto

- Vanilla TS ou React, mesmo sendo uma tela só?
- Onde hospedar o servidor estático: a máquina Fedora sempre ligada, ou outro host na tailnet?
- Incluir clima/slideshow já na v1, ou só depois que música + letra estiverem redondas?
