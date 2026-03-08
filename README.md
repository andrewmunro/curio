# Curio

A personal interest tracker that maps connections between the things you love — movies, music, books, games, travel, and more.

Add items and let AI categorize them, suggest relationships, and build a graph of your taste over time.

## Features

- Add entries across 11 categories (Movies, Music, Books, Games, TV, Food, Art, Travel, Podcasts, People, Other)
- AI-powered categorization and relationship suggestions via [Puter](https://puter.com)
- Interactive graph view of connections between entries
- Bulk import support
- Optional Google Drive sync — your data stays in your browser (SQLite via WASM), with Drive as a backup

## Getting Started

```bash
bun install
cp .env.example .env   # set VITE_GOOGLE_CLIENT_ID if you want Drive sync
bun run dev            # starts Vite at localhost:5173
```

## Google Drive Sync (optional)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the Google Drive API
3. Create an OAuth 2.0 Client ID (Web application)
4. Add `http://localhost:5173` to authorized JavaScript origins
5. Set `VITE_GOOGLE_CLIENT_ID` in your `.env`

## Deployment

Deploys as a static site to Cloudflare Pages:

```bash
bun run deploy
```

Add `VITE_GOOGLE_CLIENT_ID` as an environment variable in the Pages dashboard, and add your Pages domain to the OAuth client's authorized origins.

## Tech

- React + Vite (TypeScript)
- SQLite in the browser via [sql.js](https://sql-js.github.io/sql.js/) (WASM), persisted to IndexedDB
- AI via [Puter SDK](https://puter.com) (client-side, no API key needed)
- Google Drive API v3 for optional cloud backup
- Deployed to Cloudflare Pages
