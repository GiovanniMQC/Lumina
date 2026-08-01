import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'immich-proxy-middleware',
      configureServer(server) {
        server.middlewares.use('/immich-proxy', async (req, res) => {
          try {
            let target = req.headers['x-immich-url'] as string;
            if (!target) {
              res.statusCode = 400;
              res.end('Missing x-immich-url header');
              return;
            }
            if (!target.startsWith('http')) target = 'http://' + target;

            const finalUrl = new URL(req.originalUrl.replace(/^\/immich-proxy/, ''), target).toString();
            console.log(`[proxy] Fetching: ${finalUrl}`);

            const headers = new Headers();
            if (req.headers['x-api-key']) headers.set('x-api-key', req.headers['x-api-key'] as string);
            if (req.headers['content-type']) headers.set('Content-Type', req.headers['content-type'] as string);
            headers.set('Accept', 'application/json');

            // Lê o corpo da requisição para repassar (para o POST search)
            const chunks: Buffer[] = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
              try {
                const bodyStr = Buffer.concat(chunks).toString();
                const body = req.method !== 'GET' && req.method !== 'HEAD' && bodyStr ? bodyStr : undefined;

                const fetchRes = await fetch(finalUrl, { method: req.method, headers, body });

                res.statusCode = fetchRes.status;
                const forbiddenHeaders = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'];
                fetchRes.headers.forEach((value, key) => {
                  if (!forbiddenHeaders.includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                  }
                });

                const buffer = await fetchRes.arrayBuffer();
                res.end(Buffer.from(buffer));
              } catch (err: any) {
                console.error('[proxy] Erro na requisição:', err.message);
                res.statusCode = 500;
                res.end(err.message);
              }
            });

          } catch (err: any) {
            console.error('[proxy] Erro setup:', err.message);
            res.statusCode = 500;
            res.end(err.message);
          }
        });
      }
    }
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
    https: {},
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
