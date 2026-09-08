#!/usr/bin/env node
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  containsLegacyChromeScript,
  RECIPIENT_FILES,
  validateIntegration,
  validateRecipientPolicy,
  verifyRecipientFiles,
} from './lib.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_FILE_BYTES = 65_536;

async function readBoundedRegular(root, relative) {
  const filename = path.join(root, ...relative.split('/'));
  let metadata;
  try { metadata = await lstat(filename); } catch { throw new Error(`required installed file is missing: ${relative}`); }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_FILE_BYTES) {
    throw new Error(`required installed file is not a bounded regular file: ${relative}`);
  }
  const content = await readFile(filename, 'utf8');
  if (Buffer.byteLength(content) !== metadata.size || content.includes('\0')) {
    throw new Error(`required installed file is not valid bounded text: ${relative}`);
  }
  return content;
}

export async function verifyInstalled(root = ROOT) {
  const files = Object.fromEntries(await Promise.all(RECIPIENT_FILES.map(async (relative) => {
    return [relative, await readBoundedRegular(root, relative)];
  })));
  const result = verifyRecipientFiles(files);
  const policy = JSON.parse(await readFile(path.join(root, 'scripts/shared-chrome/recipient-policy.json'), 'utf8'));
  validateRecipientPolicy(policy);
  for (const entry of policy.entryFiles) {
    if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u.test(entry)) {
      throw new Error(`configured entry path is invalid: ${entry}`);
    }
    const html = await readBoundedRegular(root, entry);
    if (containsLegacyChromeScript(html)) throw new Error(`legacy external shared Header/Footer script found: ${entry}`);
  }
  const integrationPaths = [
    policy.integration.mountPath,
    ...policy.integration.components.map((component) => component.wrapperPath),
  ];
  const integrationContents = Object.fromEntries(await Promise.all(integrationPaths.map(async (relative) => [
    relative,
    await readBoundedRegular(root, relative),
  ])));
  validateIntegration(integrationContents, policy.integration);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { provenance } = await verifyInstalled();
    console.log(`[shared-chrome:verify] PASS generation ${provenance.sourceGeneration} (${provenance.version})`);
  } catch (error) {
    console.error(`[shared-chrome:verify] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
