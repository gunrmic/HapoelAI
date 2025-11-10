#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { env } from '../config/env.js';
import {
  uploadFileToStore,
  listDocumentsInStore,
} from '../services/fileSearchService.js';

type CliArguments = {
  dir: string;
  store?: string;
  dryRun: boolean;
};

async function parseArgs(): Promise<CliArguments> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultDataDir = path.resolve(moduleDir, '../../../../data');

  const argv = await yargs(hideBin(process.argv))
    .option('dir', {
      type: 'string',
      default: defaultDataDir,
      describe: 'Directory to scan for PDF files.',
    })
    .option('store', {
      type: 'string',
      default: env.fileSearchStoreId,
      describe: 'Full resource name of the target Google File Search store.',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'List PDFs without uploading them.',
    })
    .help()
    .alias('h', 'help')
    .parse();

  return {
    dir: argv.dir,
    store: argv.store,
    dryRun: argv.dryRun ?? false,
  };
}

async function collectPdfFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') {
        results.push(absolutePath);
      }
    }
  }

  await walk(rootDir);

  return results.sort((a, b) => a.localeCompare(b));
}

function sanitizeDisplayName(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const asciiOnly = normalized.replace(/[^\x20-\x7E]/g, '_');
  const trimmed = asciiOnly.trim();
  if (trimmed.length === 0) {
    return 'file.pdf';
  }
  if (trimmed.length <= 120) {
    return trimmed;
  }
  const extension = path.extname(trimmed);
  const base = path.basename(trimmed, extension);
  const maxBaseLength = Math.max(1, 120 - extension.length);
  const truncatedBase = base.slice(0, maxBaseLength);
  return `${truncatedBase}${extension}`;
}

async function main() {
  const args = await parseArgs();
  const baseDir = path.resolve(args.dir);
  const stats = await fs.stat(baseDir);

  if (!stats.isDirectory()) {
    throw new Error(`Specified path is not a directory: ${baseDir}`);
  }

  const storeName = args.store;
  if (!storeName) {
    throw new Error(
      'No File Search store specified. Pass --store or set GEMINI_FILE_SEARCH_STORE_ID.',
    );
  }

  console.info(`[upload-pdfs] Scanning ${baseDir} for PDFs...`);
  const pdfFiles = await collectPdfFiles(baseDir);

  if (pdfFiles.length === 0) {
    console.info('[upload-pdfs] No PDF files found.');
    return;
  }

  console.info(`[upload-pdfs] Fetching existing documents from ${storeName}...`);
  let existingDocuments: Awaited<ReturnType<typeof listDocumentsInStore>>;
  try {
    existingDocuments = await listDocumentsInStore(storeName, { pageSize: 1000 });
  } catch (error) {
    console.error(
      '[upload-pdfs] Failed to list existing documents:',
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  const existingDisplayNames = new Set(
    existingDocuments
      .map((doc) => doc.displayName)
      .filter((name): name is string => Boolean(name))
      .map((name) => sanitizeDisplayName(name)),
  );

  console.info(
    `[upload-pdfs] ${existingDisplayNames.size} existing document(s) detected in the store.`,
  );

  console.info(`[upload-pdfs] Found ${pdfFiles.length} PDF file(s).`);

  let hadErrors = false;

  for (const [index, filePath] of pdfFiles.entries()) {
    const relativePath = path.relative(baseDir, filePath);
    const originalDisplayName = path.basename(filePath);
    const displayName = sanitizeDisplayName(originalDisplayName);
    const sanitizedForComparison = displayName;
    const iterationLabel = `[upload-pdfs] (${index + 1}/${pdfFiles.length})`;

    if (existingDisplayNames.has(sanitizedForComparison)) {
      console.info(
        `${iterationLabel} Skipping ${relativePath}; already present in store as ${displayName}.`,
      );
      continue;
    }

    if (displayName !== originalDisplayName) {
      console.info(
        `[upload-pdfs] Sanitized display name "${originalDisplayName}" -> "${displayName}"`,
      );
    }

    if (args.dryRun) {
      console.info(
        `${iterationLabel} [dry-run] Would upload ${relativePath} as ${displayName}.`,
      );
      continue;
    }

    console.info(`${iterationLabel} Uploading ${relativePath} to ${storeName}...`);

    try {
      await uploadFileToStore({
        fileSearchStoreName: storeName,
        filePath,
        displayName,
        mimeType: 'application/pdf',
      });
      existingDisplayNames.add(sanitizedForComparison);
    } catch (error) {
      console.error(
        `[upload-pdfs] Failed to upload ${relativePath}:`,
        error instanceof Error ? error.message : error,
      );
      hadErrors = true;
      continue;
    }
  }

  if (hadErrors) {
    console.info('[upload-pdfs] Completed with errors. See logs above for details.');
    process.exitCode = 1;
  } else {
    console.info('[upload-pdfs] Upload complete.');
  }
}

main().catch((error) => {
  console.error('[upload-pdfs] Fatal error:', error);
  process.exitCode = 1;
});

