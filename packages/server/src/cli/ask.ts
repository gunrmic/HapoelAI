#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { answerQuestion } from '../agent/fileSearchAgent.js';
import type { QueryFileSearchOptions } from '../types/fileSearch.js';

type AskCliArgs = QueryFileSearchOptions & {
  _: (string | number)[];
  $0: string;
};

async function main(): Promise<void> {
  const argv = await yargs<AskCliArgs>(hideBin(process.argv))
    .scriptName('ask')
    .usage('$0 <question...>')
    .option('store', {
      alias: 's',
      type: 'string',
      describe: 'Existing FileSearch store name (overrides GEMINI_FILE_SEARCH_STORE_ID)',
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      describe: 'Gemini model to query (defaults to GEMINI_MODEL or gemini-2.5-flash)',
    })
    .option('topK', {
      alias: 'k',
      type: 'number',
      describe: 'Number of retrieval chunks to request from FileSearch',
    })
    .option('metadataFilter', {
      alias: 'f',
      type: 'string',
      describe: 'Metadata filter expression to narrow retrieval results',
    })
    .demandCommand(1, 'Provide a question to ask about Hapoel Tel Aviv.')
    .strict()
    .help()
    .parseAsync();

  const questionParts = argv._.filter((value): value is string => typeof value === 'string');
  const question = questionParts.join(' ').trim();

  try {
    if (!question) {
      throw new Error('A non-empty question is required.');
    }

    const result = await answerQuestion(question, {
      fileSearchStoreName: argv.store,
      model: argv.model,
      topK: argv.topK,
      metadataFilter: argv.metadataFilter,
    });

    if (!result.answer) {
      console.log('No answer returned.');
    } else {
      console.log(result.answer);
    }

    if (result.citations.length > 0) {
      console.log('\nReferences:');
      result.citations.forEach((citation) => {
        const title = citation.title ?? citation.uri;
        console.log(`[${citation.label}] ${title ?? 'Unknown source'}`);
        if (citation.uri) {
          console.log(`    ${citation.uri}`);
        }
        if (citation.text) {
          console.log(`    “${citation.text}”`);
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

void main();

