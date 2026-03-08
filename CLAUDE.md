# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev      # Vite dev server at localhost:5173
bun run build    # Static build to dist/
bun run deploy   # Build + deploy to Cloudflare Pages
```

No separate test scripts. The runtime is **Bun** — do not use Node.js or npm.

Environment: copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` (optional, for Google Drive sync).

## Architecture

**Frontend-only** TypeScript app: React + Vite, deployed as a static site to Cloudflare Pages. There is no server.

### Frontend (`src/`)

- `src/App.tsx` — root component, owns global state (selected entry, filters, view mode)
- `src/hooks/` — all data logic lives here; components are mostly presentational
- `src/lib/api.ts` — same interface as a backend API but backed by `db.ts` directly (no fetch calls)
- `src/lib/db.ts` — sql.js singleton, SQLite schema, all query functions, IndexedDB persistence, Drive export/import
- `src/lib/googleDrive.ts` — GIS OAuth2, Drive API v3 upload/download, autosave
- `src/lib/types.ts` — shared types
- `src/components/DriveStatusBar.tsx` — Drive UI (connect/save/load/disconnect)
- Path alias: `@/` → `src/`

### Data Storage

SQLite runs **in the browser** via [sql.js](https://sql-js.github.io/sql.js/) (WASM). The database is persisted to **IndexedDB** (db name: `curio`, key: `curio-db`). Google Drive sync is optional — saves `curio.db` to the user's Drive.

`public/sql-wasm.wasm` is copied from node_modules by a `postinstall` script.

### Data Model

Three SQLite tables:

- **entries** — core items (name, category, subcategory, tags as JSON, rating, ai_metadata as JSON)
- **relationships** — bidirectional links between entries; deduplication prevents A→B and B→A duplicates
- **pending_links** — AI-suggested relationships to entries that don't exist yet; resolved when the target entry is later created

### AI Integration

AI categorization runs **client-side** via the [Puter SDK](https://puter.com) (`puter.ai.chat()`), loaded from CDN in `index.html`. No API key needed. The hook `src/hooks/useCategorise.ts` wraps the Puter API and parses the response into `Entry` + relationship suggestions.

### Key Data Flow

1. User adds an item → `AddItemModal` → `useCategorise()` calls `puter.ai.chat()` for categorization + relationship suggestions
2. Result written directly to SQLite via `src/lib/api.ts` → db creates entry, resolves pending links, creates new pending links for not-yet-existing suggestions
3. `useEntries` hook refreshes; UI updates

Bulk import (`useImport`) processes items in batches of 5 to avoid overwhelming the AI.

### Fixed Categories

Movies, Music, Books, Games, TV, Food, Art, Travel, Podcasts, People, Other — these are the only valid category values.
