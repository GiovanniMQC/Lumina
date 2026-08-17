# Lumina: Spotify Dashboard & Lyrics

Um dashboard estilo Google Nest Hub (SPA web) projetado para rodar em modo kiosk em tablets e celulares. Ele exibe a música atualmente tocando no Spotify com letras sincronizadas, fundo ambientado com a capa do álbum ou fotos (via Immich), um relógio elegante, widget de clima, suporte a timers e transições suaves.

> **Nota de Autoria e Desenvolvimento:** Todo o planejamento, concepção de ideias e design (UI/UX) deste projeto foram feitos por mim. O desenvolvimento e a escrita do código contaram extensivamente com o auxílio de Inteligência Artificial.

## ✨ Funcionalidades

- **Spotify Currently Playing:** Mostra em tempo real a música em reprodução via Spotify Connect. (Este é um *companion display*, a reprodução em si acontece no dispositivo ativo).
- **Letras Sincronizadas:** Busca automática de letras usando a [API do lrclib.net](https://lrclib.net/). A linha atual é destacada e sincronizada com o progresso da música.
- **Modo Kiosk / Smart Display:** Desenvolvido para rodar dentro de navegadores que fornecem interface em modo kiosk ou exclusivo, transformando o dispositivo em um *smart display*.
- **Autenticação no Cliente (PKCE):** Funciona 100% no client-side usando o fluxo de Authorization Code + PKCE do Spotify, não sendo necessário um backend para autenticação.
- **Integração com Immich:** Suporte a proxy embutido no Vite para consumir mídias de um servidor Immich (útil para slideshow e descanso de tela).
- **Clima e Timers:** Exibe um widget de clima atualizado e suporta timers.
- **Relógio e Estado Idle:** Quando nenhuma música está tocando, funciona como um *smart display* minimalista com um relógio grande.

## 🚀 Tecnologias e Arquitetura

- **Frontend:** [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/) + Vanilla JS/DOM puro.
- **APIs:** 
  - Spotify Web API (`user-read-currently-playing`, `user-read-playback-state`)
  - lrclib.net (Letras grátis)
- **Infraestrutura/Deploy alvo:** Servidor local, rede Tailscale ou rede local.

## 🛠️ Como executar localmente

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) ou [Bun](https://bun.sh/) instalados.
- Uma conta no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
  - Crie um aplicativo no dashboard do Spotify.
  - Adicione a **Redirect URI** correspondente ao seu ambiente de desenvolvimento nas configurações do App (por padrão, o Vite roda em `https://localhost:5173/callback` ou o IP/domínio específico).

### 2. Instalação

Clone este repositório e instale as dependências:

```bash
git clone https://github.com/SeuUsuario/Lumina.git
cd Lumina
npm install
# ou usando bun:
bun install
```

### 3. Executando o servidor de desenvolvimento

Inicie o servidor de desenvolvimento do Vite (configurado para usar SSL básico e rodar na porta 5173):

```bash
npm run dev
# ou
bun run dev
```

Acesse o endereço `https://localhost:5173` no seu navegador e proceda com o login na sua conta do Spotify.

> **Nota:** Como o projeto usa certificados SSL locais e autoassinados (`@vitejs/plugin-basic-ssl`), o seu navegador exibirá um aviso de segurança. Você precisará permitir e prosseguir para acessar a aplicação.

### 4. Build para Produção

Para compilar o projeto para produção:

```bash
npm run build
```

Os arquivos compilados estarão no diretório `dist/`. Você pode hospedá-los de forma estática usando um servidor web como Nginx (há um arquivo de exemplo `nginx.conf` no projeto) ou hospedá-los usando um serviço estático qualquer.

## 📱 Dicas de Deploy

- Aponte a URL do navegador no dispositivo em modo kiosk para o IP/URL na rede (ou VPN/Tailscale) onde a aplicação está rodando.
- Para habilitar certas facilidades do navegador, uma conexão **HTTPS é obrigatória**, exigida também pelo Spotify para o Redirect URI (a não ser que seja rodado em 127.0.0.1).
- **Nota de Privacidade:** O aplicativo não solicita nem possui funcionalidades que utilizem microfone ou câmera.

## 📝 Documentação e Plano de Projeto

Para ver a documentação original, o plano de desenvolvimento em fases e os riscos, consulte [plano-dashboard-spotify-nest-hub.md](./plano-dashboard-spotify-nest-hub.md).

## 📄 Licença

Consulte o arquivo [LICENSE](./LICENSE) para mais detalhes.
