# Deployment

## Single server (recommended for personal use)

```bash
cd grandmaster
cp .env.example .env    # set PUBLIC_URL (https://…), JWT_SECRET, TOKEN_ENC_KEY, optionally DATABASE_URL, ANTHROPIC_API_KEY
npm ci
NODE_ENV=production npm start
```

The Node process serves the API and the built PWA on `PORT`. Put it behind HTTPS (Caddy, nginx, Cloudflare Tunnel,
Tailscale Funnel…). HTTPS is required for a Secure session cookie and recommended for iPhone home-screen use.

Example Caddyfile:
```
chess.example.com {
  reverse_proxy localhost:8787
}
```

## Database

* Default: embedded PGlite in `DATA_DIR` (back it up like any file).
* PostgreSQL/Supabase: set `DATABASE_URL`; migrations run automatically on start (`npm run migrate` to run them alone).

## Engine

The bundled Stockfish 18 lite WASM build runs anywhere Node runs. For deeper analysis install native Stockfish
(e.g. `apt install stockfish` or an official binary from stockfishchess.org) and set `STOCKFISH_PATH`, `ENGINE_THREADS`,
`ENGINE_HASH_MB`, `ENGINE_DEPTH` (18–22 recommended).

## Lichess OAuth

No registration is needed (PKCE). The redirect URI is `${PUBLIC_URL}/api/integrations/lichess/oauth/callback`, so
`PUBLIC_URL` must be the address your browser uses.

## Native app stores (optional, future)

Wrap `apps/web/dist` with Capacitor (`npx cap add ios`) and point it at your deployed API; Stockfish WASM keeps working
inside WKWebView.
