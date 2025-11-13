# Hapoel Tel Aviv AI

This repository powers an AI assistant for Hapoel Tel Aviv supporters. It is a PNPM monorepo with two main parts:

- `apps/web`: a Next.js 15 application that hosts the public chatbot experience.
- `packages/server`: a TypeScript library that connects to Google Gemini File Search and serves as the question–answering backend used by both the web app and the CLI utilities.

The project lets fans ask about club history, rosters and match stats through a polished web UI or scripted workflows.

## Prerequisites

- Node.js 20+
- PNPM 9 (the repo declares `packageManager: "pnpm@9.12.0"`)
- A Google Gemini API key with File Search enabled

## Setup

1. Install all workspace dependencies:
   ```bash
   pnpm install
   ```
2. Copy `example.env` to `.env` (or `.env.local`) and provide the following:
   - `GEMINI_API_KEY` – required
   - `GEMINI_FILE_SEARCH_STORE_ID` – optional existing store to reuse
3. (Optional) download raw PDFs or articles into `data/` and use the provided scripts to upload them to Gemini File Search.

## Running Locally

- Start the Next.js experience:
  ```bash
  pnpm --filter @aihapoel/web dev
  ```
  Visit `http://localhost:3000` to chat with the assistant.

- Use the CLI to ask questions directly against the agent:
  ```bash
  pnpm --filter @aihapoel/server run ask -- "מי היה הקפטן בעונת 2015/16?"
  ```

## Production Build

```bash
pnpm build        # compiles the server package and Next.js app
pnpm --filter @aihapoel/web start  # serves the production build
```

Deployments on Vercel set the project root to `apps/web` so the Next.js output is detected automatically.

## Managing File Search Content

The `packages/server` workspace exposes utilities for maintaining your Gemini File Search store.

### Storage Limits

Each file search store has a 1GB storage limit. If you need more storage:

1. **Create a new store** for additional documents:
   ```bash
   pnpm --filter @aihapoel/server run manage-stores create "Store Name"
   ```

2. **List all stores** to see what you have:
   ```bash
   pnpm --filter @aihapoel/server run manage-stores list
   ```

3. **Check store usage** to see how much space is used:
   ```bash
   pnpm --filter @aihapoel/server run manage-stores info
   ```

4. **Upload to the new store**:
   ```bash
   pnpm --filter @aihapoel/server run upload-pdfs --store "stores/your-new-store-id"
   ```

5. **Use multiple stores** by setting `GEMINI_FILE_SEARCH_STORE_ID` to a comma-separated list:
   ```bash
   GEMINI_FILE_SEARCH_STORE_ID="stores/store1,stores/store2" pnpm --filter @aihapoel/server run ask -- "Your question"
   ```

   Or in your `.env` file:
   ```
   GEMINI_FILE_SEARCH_STORE_ID=stores/store1,stores/store2
   ```

The query system will automatically search across all specified stores, so you can keep all your documents accessible without hitting the 1GB limit per store.

- Upload PDF files listed in `data/`:
  ```bash
  pnpm --filter @aihapoel/server run upload-pdfs
  ```
- Programmatic helpers live in `packages/server/src/services/fileSearchService.ts` and `packages/server/src/utils/operations.ts`.
- Long-running uploads are polled until completion; metadata such as season or sport can be attached to documents for richer filtering.

## Archiving Wiki Content

- Crawl and archive the Hapoel supporters' wiki to HTML under `data/wiki.red-fans.com`:
  ```bash
  pnpm --filter @aihapoel/server run scrape-wiki
  ```
  Pass `--output`, `--delay`, or `--max-pages` flags to customize the destination directory, throttle interval (ms), or page limit. Each stored HTML file is capped at 1 GB; oversized responses are skipped automatically.

## Project Structure

- `apps/web` – UI built with the Next.js App Router, SCSS modules, and an `/api/ask` route that proxies to the shared server package.
- `packages/server` – Gemini client, rate limiting helpers, CLI entry points, and shared typing.
- `scripts/` – utility scripts (for example `download_pdfs.py`) that prepare source documents.
- `data/` – local storage for raw source material (excluded from git).

## Contributing

1. Create a feature branch.
2. Run `pnpm lint` and `pnpm build` to ensure quality.
3. Open a pull request describing the change and any data additions.

## License

This project is provided for internal club use. Contact the maintainers before redistributing or deploying a fork publicly.

