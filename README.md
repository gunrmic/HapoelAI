# Hapoel AI Agent

Node.js agent that uses Google Gemini FileSearch to answer questions about Hapoel Tel Aviv's basketball and football clubs.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `example.env` to `.env` and fill in the values:
   - `GEMINI_API_KEY`: Gemini API key (generate in Google AI Studio).
   - `GEMINI_FILE_SEARCH_STORE_ID`: Optional. Set if reusing an existing FileSearch store.
3. Review [FileSearch limits and workflows](https://ai.google.dev/gemini-api/docs/file-search?hl=he).

After setup you will be able to ask questions via `npm run ask -- "Who is the coach?"` (CLI implementation provided later).

## Managing FileSearch Stores

- Create a store once and reuse it by adding its resource name (for example `fileSearchStores/hapoel-store-123`) to `GEMINI_FILE_SEARCH_STORE_ID`.
- You can programmatically create a store:
  ```bash
  node --env-file=.env -e "import('./src/services/fileSearchService.js').then(async ({ createFileSearchStore }) => { const store = await createFileSearchStore('Hapoel knowledge base'); console.log(store.name); });"
  ```
- Upload and index documents directly into a store:
  ```bash
  node --env-file=.env <<'EOF'
  import { uploadFileToStore } from './src/services/fileSearchService.js';

  const store = process.env.GEMINI_FILE_SEARCH_STORE_ID;
  if (!store) throw new Error('Set GEMINI_FILE_SEARCH_STORE_ID to your store resource name.');

  await uploadFileToStore({
    fileSearchStoreName: store,
    filePath: './data/Paper_hta_foot_first_years_2015.pdf',
    displayName: 'Hapoel TA first years',
  });

  console.log('Upload complete');
  EOF
  ```
- Long-running uploads are automatically polled until completion through the shared helper in `src/utils/operations.js`.

## Data Preparation Guidelines

- Supported formats include plain text, HTML, PDF, Markdown and common office document types (see the official FileSearch MIME list) with a maximum file size of **100 MB** per document and up to **1 GB** of indexed content on the free tier [docs](https://ai.google.dev/gemini-api/docs/file-search?hl=he).
- Break large dossiers into thematic files (≤20 GB per store is recommended for low latency) and ensure consistent naming via the `displayName` parameter when uploading.
- Add `customMetadata` (e.g. `{ season: '2023-24', sport: 'basketball' }`) when calling `uploadFileToStore` to enable metadata filtering via `--metadataFilter` in the CLI.
- Maintain a `data/` directory under source control ignore rules to store raw Hapoel material locally and re-run uploads if documents change; FileSearch de-duplicates by resource ID, so new uploads with the same file name create new document versions rather than mutating previous ones.

