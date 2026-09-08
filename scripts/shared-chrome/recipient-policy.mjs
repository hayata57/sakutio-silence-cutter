#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  containsLegacyChromeScript,
  PACKAGE_METADATA_FILES,
  RECIPIENT_FILES,
  TARGET_BRANCH,
  TARGET_REPOSITORY,
  VERSION_PATH,
  parseProvenance,
  validateIntegration,
  validatePackageMetadata,
  validateRecipientPolicy,
  verifyRecipientFiles,
} from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_FILE_BYTES = 65_536;
const MAX_PACKAGE_METADATA_BYTES = 524_288;
const STATUS_CONTEXT = 'shared-chrome/recipient-policy';
const API = 'https://api.github.com';
const PROTECTED_CONTROL_FILES = new Set([
  '.github/workflows/shared-chrome-policy.yml',
  '.github/workflows/shared-chrome-ci.yml',
]);

function fail(message) { throw new Error(message); }
function validPath(value) {
  return typeof value === 'string' && value.length <= 240
    && /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]+$/u.test(value);
}
function maxBytesFor(filename) {
  return PACKAGE_METADATA_FILES.includes(filename) ? MAX_PACKAGE_METADATA_BYTES : MAX_FILE_BYTES;
}

export function validateEvent(event, expectedActorId) {
  const pr = event?.pull_request;
  if (!Number.isSafeInteger(expectedActorId) || expectedActorId < 1) fail('EXPECTED_SYNC_ACTOR_ID must be numeric');
  if (!pr || !Number.isSafeInteger(pr.number ?? event.number) || !/^[a-f0-9]{40}$/u.test(pr.head?.sha ?? '')
    || !/^[a-f0-9]{40}$/u.test(pr.base?.sha ?? '') || event.repository?.full_name !== TARGET_REPOSITORY
    || !Number.isSafeInteger(event.repository?.id) || event.repository.id < 1
    || pr.base?.repo?.full_name !== TARGET_REPOSITORY || pr.base?.repo?.id !== event.repository.id
    || pr.base?.ref !== TARGET_BRANCH || !Number.isSafeInteger(pr.user?.id) || !pr.user?.login) {
    fail('pull_request_target event/base/repository identity is invalid');
  }
  return pr;
}

export function isAutomationPull(event, expectedActorId) {
  const pr = event.pull_request;
  return pr.user.id === expectedActorId;
}

export function validatePullFileMetadata(files, automation) {
  if (!Array.isArray(files) || files.length > 3000) fail('PR file enumeration is invalid or oversized');
  const seen = new Set();
  for (const file of files) {
    if (!validPath(file.filename) || seen.has(file.filename)) fail('PR contains duplicate or anomalous paths');
    seen.add(file.filename);
    if (file.previous_filename !== undefined || file.status === 'renamed') fail('renames are not allowed');
    if (!Number.isSafeInteger(file.changes) || file.changes < 0
      || (automation && file.changes > MAX_FILE_BYTES)) {
      fail(`file metadata is oversized or ambiguous: ${file.filename}`);
    }
  }
  if (automation) {
    if (files.some((file) => !RECIPIENT_FILES.includes(file.filename)
      || !['added', 'modified'].includes(file.status))) {
      fail('automation PR diff must stay inside the five allowlisted generated files');
    }
  } else if (files.some((file) => RECIPIENT_FILES.includes(file.filename))) {
    fail('normal PRs may not edit generated shared-chrome files');
  } else if (files.some((file) => file.filename.startsWith('scripts/shared-chrome/')
    || PROTECTED_CONTROL_FILES.has(file.filename))) {
    fail('normal PRs may not edit base-owned shared-chrome controls; use the documented protected-maintenance bypass');
  }
}

export function treeMap(response, label) {
  if (!response || response.truncated !== false || !Array.isArray(response.tree)) fail(`${label} git tree is missing or truncated`);
  const result = new Map();
  for (const entry of response.tree) {
    if (!validPath(entry.path) || result.has(entry.path)) fail(`${label} tree contains an anomalous path`);
    result.set(entry.path, entry);
  }
  return result;
}

export function assertRegularFiles(tree, paths, label) {
  for (const filename of paths) {
    const entry = tree.get(filename);
    if (!entry || entry.type !== 'blob' || entry.mode !== '100644' || !/^[a-f0-9]{40}$/u.test(entry.sha ?? '')
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > maxBytesFor(filename)) {
      fail(`${label} is not a bounded regular 100644 blob: ${filename}`);
    }
  }
}

export function decodeBlob(blob, filename) {
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string'
    || !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > maxBytesFor(filename)) {
    fail(`invalid bounded blob response: ${filename}`);
  }
  const buffer = Buffer.from(blob.content.replace(/\n/gu, ''), 'base64');
  if (buffer.length !== blob.size || buffer.includes(0)) fail(`blob encoding/size is invalid: ${filename}`);
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) fail(`blob is not valid UTF-8: ${filename}`);
  return text;
}

export function evaluateAutomation({ event, files, headTree, baseTree, headContents, baseVersion }) {
  const pr = event.pull_request;
  if (pr.head.repo?.full_name !== TARGET_REPOSITORY || pr.head.repo?.id !== event.repository.id
    || pr.head.label?.split(':')[0] !== TARGET_REPOSITORY.split('/')[0]) fail('automation PR must originate from the same repository');
  validatePullFileMetadata(files, true);
  assertRegularFiles(headTree, RECIPIENT_FILES, 'candidate');
  const { provenance } = verifyRecipientFiles(headContents);
  const expectedBranch = `automation/shared-chrome-g${provenance.sourceGeneration}-${provenance.version.slice(0, 12)}-base-${pr.base.sha}`;
  if (pr.head.ref !== expectedBranch) fail('automation branch name/version prefix is not exact');
  if (baseVersion) {
    const current = baseTree.contents
      ? verifyRecipientFiles(baseTree.contents).provenance
      : parseProvenance(baseVersion, `base:${VERSION_PATH}`);
    if (provenance.sourceGeneration < current.sourceGeneration) fail('stale generation/replay rejected');
    if (provenance.sourceGeneration === current.sourceGeneration) {
      const identical = RECIPIENT_FILES.every((filename) => headContents[filename] === baseTree.contents?.[filename]);
      if (!identical) fail('same generation is not byte-identical to base');
    }
  }
  return `Validated shared chrome generation ${provenance.sourceGeneration}`;
}

export function evaluateNormal({
  files,
  headTree,
  candidateContents,
  baseContents,
  entryFiles,
  integration,
}) {
  validatePullFileMetadata(files, false);
  for (const entry of entryFiles) {
    if (!validPath(entry)) fail(`configured entry path is invalid: ${entry}`);
    assertRegularFiles(headTree, [entry], 'candidate entry');
    if (containsLegacyChromeScript(candidateContents[entry])) fail(`legacy external shared Header/Footer script found: ${entry}`);
  }
  validateIntegration(candidateContents, integration);
  validatePackageMetadata(candidateContents, baseContents);
  return 'No protected shared-chrome edit or legacy script reinsertion';
}

class GitHubClient {
  constructor(token) {
    if (!token) fail('GH_TOKEN is required');
    this.token = token;
  }
  async request(method, endpoint, body) {
    const options = {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sakutio-recipient-policy' },
    };
    if (body !== undefined) options.body = JSON.stringify(body);
    const response = await fetch(`${API}${endpoint}`, options);
    if (!response.ok) fail(`GitHub ${method} ${endpoint} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return response.status === 204 ? null : response.json();
  }
  get(endpoint) { return this.request('GET', endpoint); }
  post(endpoint, body) { return this.request('POST', endpoint, body); }
}
async function allPullFiles(client, number) {
  const result = [];
  for (let page = 1; page <= 30; page += 1) {
    const batch = await client.get(`/repos/${TARGET_REPOSITORY}/pulls/${number}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) fail('PR files response is invalid');
    result.push(...batch);
    if (batch.length < 100) return result;
  }
  fail('PR exceeds 3,000-file limit');
}
async function getTree(client, sha, label) {
  return treeMap(await client.get(`/repos/${TARGET_REPOSITORY}/git/trees/${sha}?recursive=1`), label);
}
async function contentsFor(client, tree, paths) {
  return Object.fromEntries(await Promise.all(paths.map(async (filename) => {
    const entry = tree.get(filename);
    const blob = await client.get(`/repos/${TARGET_REPOSITORY}/git/blobs/${entry.sha}`);
    return [filename, decodeBlob(blob, filename)];
  })));
}

export async function runPolicy({ event, token, expectedActorId, policy }) {
  const pr = validateEvent(event, expectedActorId);
  validateRecipientPolicy(policy);
  const client = new GitHubClient(token);
  const [files, headTree, baseTree] = await Promise.all([
    allPullFiles(client, pr.number ?? event.number),
    getTree(client, pr.head.sha, 'head'),
    getTree(client, pr.base.sha, 'base'),
  ]);
  if (isAutomationPull(event, expectedActorId)) {
    const currentBase = await client.get(`/repos/${TARGET_REPOSITORY}/git/ref/heads/${TARGET_BRANCH}`);
    if (currentBase?.object?.sha !== pr.base.sha) fail('base branch moved; stale/race policy evaluation rejected');
    assertRegularFiles(baseTree, [VERSION_PATH], 'base provenance');
    assertRegularFiles(headTree, RECIPIENT_FILES, 'candidate');
    const [headContents, baseContents] = await Promise.all([
      contentsFor(client, headTree, RECIPIENT_FILES),
      contentsFor(client, baseTree, RECIPIENT_FILES),
    ]);
    baseTree.contents = baseContents;
    return evaluateAutomation({ event, files, headTree, baseTree, headContents, baseVersion: baseContents[VERSION_PATH] });
  }
  const integrationFiles = [
    policy.integration.mountPath,
    ...policy.integration.components.map((component) => component.wrapperPath),
  ];
  const candidatePaths = [...new Set([...policy.entryFiles, ...integrationFiles, ...PACKAGE_METADATA_FILES])];
  assertRegularFiles(headTree, candidatePaths, 'candidate policy input');
  assertRegularFiles(baseTree, PACKAGE_METADATA_FILES, 'base package metadata');
  const [candidateContents, baseContents] = await Promise.all([
    contentsFor(client, headTree, candidatePaths),
    contentsFor(client, baseTree, PACKAGE_METADATA_FILES),
  ]);
  return evaluateNormal({
    files,
    headTree,
    candidateContents,
    baseContents,
    entryFiles: policy.entryFiles,
    integration: policy.integration,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let event;
  let client;
  let result = { state: 'failure', description: 'Shared-chrome recipient policy failed closed' };
  try {
    event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const actorText = process.env.EXPECTED_SYNC_ACTOR_ID ?? '';
    if (!/^[1-9]\d*$/u.test(actorText)) fail('EXPECTED_SYNC_ACTOR_ID must be numeric');
    const expectedActorId = Number(actorText);
    validateEvent(event, expectedActorId);
    client = new GitHubClient(process.env.GH_TOKEN);
    const policy = JSON.parse(await readFile(path.join(ROOT, 'scripts/shared-chrome/recipient-policy.json'), 'utf8'));
    result = { state: 'success', description: (await runPolicy({ event, token: process.env.GH_TOKEN, expectedActorId, policy })).slice(0, 140) };
  } catch (error) {
    console.error(`Shared chrome recipient policy failed closed: ${error.message}`);
    result.description = error.message.slice(0, 140);
    process.exitCode = 1;
  } finally {
    const sha = event?.pull_request?.head?.sha;
    const repository = event?.repository?.full_name;
    if (/^[a-f0-9]{40}$/u.test(sha ?? '') && repository === TARGET_REPOSITORY) {
      try {
        client ??= new GitHubClient(process.env.GH_TOKEN);
        await client.post(`/repos/${TARGET_REPOSITORY}/statuses/${sha}`, {
          ...result, context: STATUS_CONTEXT,
          target_url: `${process.env.GITHUB_SERVER_URL}/${TARGET_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        });
      } catch (error) {
        console.error(`Could not post recipient-policy status: ${error.message}`);
        process.exitCode = 1;
      }
    } else {
      console.error('Could not safely identify exact head SHA for required failure status');
      process.exitCode = 1;
    }
  }
}
