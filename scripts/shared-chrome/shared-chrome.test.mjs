import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_METADATA_FILES, RECIPIENT_FILES, SOURCE_MARKERS, TARGET_REPOSITORY, VERSION_PATH,
  buildArtifacts, containsLegacyChromeScript, parseProvenance, stripSourceMarker,
  validateCss, validateHtml, validateIntegration, validatePackageMetadata,
  validateRecipientPolicy, verifyRecipientFiles,
} from './lib.mjs';
import {
  assertRegularFiles, decodeBlob, evaluateAutomation, evaluateNormal, treeMap,
  validateEvent, validatePullFileMetadata,
} from './recipient-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installed = Object.fromEntries(await Promise.all(RECIPIENT_FILES.map(async (name) => [
  name, await readFile(path.join(root, ...name.split('/')), 'utf8'),
])));
const policy = JSON.parse(await readFile(path.join(root, 'scripts/shared-chrome/recipient-policy.json'), 'utf8'));
const integrationContents = Object.fromEntries(await Promise.all([
  policy.integration.mountPath,
  ...policy.integration.components.map((component) => component.wrapperPath),
].map(async (name) => [name, await readFile(path.join(root, ...name.split('/')), 'utf8')])));
const packageContents = Object.fromEntries(await Promise.all(PACKAGE_METADATA_FILES.map(async (name) => [
  name, await readFile(path.join(root, name), 'utf8'),
])));
const sources = {
  'header.html': stripSourceMarker(installed[RECIPIENT_FILES[0]], 'header.html'),
  'footer.html': stripSourceMarker(installed[RECIPIENT_FILES[1]], 'footer.html'),
  'chrome.css': installed[RECIPIENT_FILES[3]].replace(/^.*\n.*\n/u, ''),
};

function rejectHtml(name, transform, filename = 'header.html') {
  test(`HTML validator rejects ${name}`, () => assert.throws(() => validateHtml(transform(sources[filename]), filename)));
}
rejectHtml('scripts', (v) => v.replace('</header>', '<script>alert(1)</script></header>'));
rejectHtml('event attributes', (v) => v.replace('<header ', '<header onclick="x" '));
rejectHtml('forms', (v) => v.replace('</header>', '<form></form></header>'));
rejectHtml('media', (v) => v.replace('</header>', '<video></video></header>'));
rejectHtml('relative links', (v) => v.replace('https://sakutio.com/#tools', '/#tools'));
rejectHtml('query strings', (v) => v.replace('https://sakutio.com/about/', 'https://sakutio.com/about/?x=1'));
rejectHtml('unapproved fragments', (v) => v.replace('https://sakutio.com/about/', 'https://sakutio.com/about/#x'));
rejectHtml('userinfo', (v) => v.replace('https://sakutio.com/about/', 'https://user@sakutio.com/about/'));
rejectHtml('odd ports', (v) => v.replace('https://sakutio.com/about/', 'https://sakutio.com:444/about/'));
rejectHtml('duplicate attributes', (v) => v.replace('<header ', '<header class="sakutio-chrome" '));
rejectHtml('duplicate classes', (v) => v.replace('sakutio-chrome sakutio-chrome--header', 'sakutio-chrome sakutio-chrome sakutio-chrome--header'));
rejectHtml('unknown classes', (v) => v.replace('sakutio-chrome--header', 'sakutio-chrome--header sakutio-chrome--overlay'));
rejectHtml('defacement', (v) => v.replace('ツール一覧', '危険'));
rejectHtml('oversized attributes', (v) => v.replace('aria-label="メインナビゲーション"', `aria-label="${'x'.repeat(769)}"`));
rejectHtml('oversized bytes', (v) => `${v}${' '.repeat(33_000)}`);
rejectHtml('excessive nodes', (v) => v.replace('<span class="sakutio-chrome__brand-text">Sakutio</span>', `${'<span class="sakutio-chrome__brand"></span>'.repeat(121)}<span class="sakutio-chrome__brand-text">Sakutio</span>`));
rejectHtml('excessive depth', (v) => v.replace('<span class="sakutio-chrome__brand-text">Sakutio</span>', `${'<span class="sakutio-chrome__brand">'.repeat(12)}Sakutio${'</span>'.repeat(12)}`));
rejectHtml('wrong root', () => sources['header.html'], 'footer.html');
rejectHtml('semantic parent', (v) => v.replace('<nav class="sakutio-chrome__header-nav"', '<span class="sakutio-chrome__brand"><nav class="sakutio-chrome__header-nav"').replace('</nav>', '</nav></span>'));
rejectHtml('SVG path', (v) => v.replace('M20 2v4', 'M20 2v5'));
rejectHtml('SVG viewBox', (v) => v.replace('viewBox="0 0 24 24"', 'viewBox="0 0 25 25"'));
rejectHtml('SVG range', (v) => v.replace('cx="4"', 'cx="999"'));

const cssCases = [
  ['unscoped', 'body { color: red }'], ['lookalike', '.sakutio-chrome-evil { color: red }'],
  ['descendant root', '.sakutio-chrome__copy { color: red }'], ['imports', '@import "x";'],
  ['URLs', '.sakutio-chrome { background: url(x) }'], ['variables', '.sakutio-chrome { color: var(--x) }'],
  ['fixed', '.sakutio-chrome { position: fixed }'], ['absolute', '.sakutio-chrome { position: absolute }'],
  ['viewport', '.sakutio-chrome { width: 100dvw }'], ['z-index', '.sakutio-chrome { z-index: 101 }'],
  ['attributes', '.sakutio-chrome[data-x] { color: red }'], ['animation', '.sakutio-chrome { animation: x 1s }'],
  ['content', '.sakutio-chrome::before { content: "x" }'], ['pointer', '.sakutio-chrome { pointer-events: none }'],
  ['calc', '.sakutio-chrome { width: calc(100% - 1px) }'],
  ['media', '@media (max-width: 481px) { .sakutio-chrome { color: red } }'],
  ['pseudo', '.sakutio-chrome:has(a) { color: red }'], ['font face', '@font-face { font-family: x; src: url(x) }'],
  ['sibling combinator', '.sakutio-chrome ~ * { display: none }'],
  ['adjacent sibling', '.sakutio-chrome + * { display: none }'],
  ['child combinator', '.sakutio-chrome > * { color: red }'],
];
for (const [name, css] of cssCases) test(`CSS validator rejects ${name}`, () => assert.throws(() => validateCss(css)));
test('canonical chrome CSS stays inside .sakutio-chrome and descendants', () => {
  assert.doesNotThrow(() => validateCss(sources['chrome.css']));
});

test('deterministic generator reproduces installed bytes', () => {
  const artifacts = buildArtifacts(sources);
  assert.equal(artifacts.files['SharedChrome.tsx'], installed[RECIPIENT_FILES[2]]);
  assert.equal(artifacts.files['shared-chrome.css'], installed[RECIPIENT_FILES[3]]);
  assert.deepEqual(buildArtifacts(sources), artifacts);
});
test('source marker must be exact and unique', () => {
  assert.throws(() => stripSourceMarker(installed[RECIPIENT_FILES[0]].replace('AUTO-GENERATED', 'generated'), 'header.html'));
  assert.throws(() => stripSourceMarker(`${SOURCE_MARKERS['header.html']}${installed[RECIPIENT_FILES[0]]}`, 'header.html'));
});
test('installed tamper and provenance tamper fail', () => {
  for (const filename of RECIPIENT_FILES.slice(0, 4)) {
    assert.throws(() => verifyRecipientFiles({ ...installed, [filename]: `${installed[filename]} ` }));
  }
  for (const transform of [
    (p) => { p.targetRepository = 'hayata57/other'; },
    (p) => { p.sourceGeneration = 0; },
    (p) => { p.sourceHashes['header.html'] = '0'.repeat(64); },
    (p) => { p.artifactHashes[RECIPIENT_FILES[0]] = '0'.repeat(64); },
  ]) {
    const p = parseProvenance(installed[VERSION_PATH]);
    transform(p);
    assert.throws(() => verifyRecipientFiles({ ...installed, [VERSION_PATH]: `${JSON.stringify(p, null, 2)}\n` }));
  }
});
test('legacy external scripts are detected structurally', () => {
  assert.equal(containsLegacyChromeScript('<script defer src="https://sakutio.com/shared/sakutio-global-header.js"></script>'), true);
  assert.equal(containsLegacyChromeScript('<script src="//sakutio.com/shared/sakutio-global-footer.js"></script>'), true);
  assert.equal(containsLegacyChromeScript('<script src="/shared-pinned/sakutio-global-header-deadbeef.js"></script>'), true);
  assert.equal(containsLegacyChromeScript('<script src="/local.js"></script>'), false);
});
test('file metadata rejects extras, renames, deletions and paths', () => {
  const files = RECIPIENT_FILES.map((filename) => ({ filename, status: 'modified', changes: 1 }));
  assert.doesNotThrow(() => validatePullFileMetadata(files, true));
  const cssOnly = [
    { filename: 'src/shared-chrome/generated/SharedChrome.tsx', status: 'modified', changes: 1 },
    { filename: 'src/shared-chrome/generated/shared-chrome.css', status: 'modified', changes: 1 },
    { filename: 'public/shared-chrome/version.json', status: 'modified', changes: 1 },
  ];
  const headerOnly = [
    { filename: 'src/shared-chrome/generated/source/header.html', status: 'modified', changes: 1 },
    { filename: 'src/shared-chrome/generated/SharedChrome.tsx', status: 'modified', changes: 1 },
    { filename: 'src/shared-chrome/generated/shared-chrome.css', status: 'modified', changes: 1 },
    { filename: 'public/shared-chrome/version.json', status: 'modified', changes: 1 },
  ];
  assert.doesNotThrow(() => validatePullFileMetadata(cssOnly, true));
  assert.doesNotThrow(() => validatePullFileMetadata(headerOnly, true));
  assert.doesNotThrow(() => validatePullFileMetadata([], true));
  for (const altered of [
    [...files, { filename: 'extra', status: 'added', changes: 1 }],
    files.map((f, i) => i ? f : { ...f, status: 'renamed', previous_filename: 'old' }),
    files.map((f, i) => i ? f : { ...f, status: 'removed' }),
    files.map((f, i) => i ? f : { ...f, filename: '../escape' }),
  ]) assert.throws(() => validatePullFileMetadata(altered, true));
});
test('css-only and header-only diffs still require all five generated files on HEAD', () => {
  const current = parseProvenance(installed[VERSION_PATH]);
  const cssOnly = [
    { filename: 'src/shared-chrome/generated/SharedChrome.tsx', status: 'modified', changes: 1 },
    { filename: 'src/shared-chrome/generated/shared-chrome.css', status: 'modified', changes: 1 },
    { filename: 'public/shared-chrome/version.json', status: 'modified', changes: 1 },
  ];
  const tree = new Map(RECIPIENT_FILES.map((filename) => [filename, {
    mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: Buffer.byteLength(installed[filename]),
  }]));
  tree.contents = installed;
  const event = {
    repository: { full_name: TARGET_REPOSITORY, id: 7 },
    pull_request: {
      user: { id: 9 },
      base: { sha: 'b'.repeat(40) },
      head: {
        repo: { full_name: TARGET_REPOSITORY, id: 7 },
        label: 'hayata57:x',
        ref: `automation/shared-chrome-g${current.sourceGeneration}-${current.version.slice(0, 12)}-base-${'b'.repeat(40)}`,
      },
    },
  };
  assert.doesNotThrow(() => evaluateAutomation({
    event, files: cssOnly, headTree: tree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH],
  }));
  assert.doesNotThrow(() => evaluateAutomation({
    event, files: [], headTree: tree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH],
  }));
  const incompleteTree = new Map([...tree.entries()].filter(([filename]) => filename !== RECIPIENT_FILES[0]));
  assert.throws(() => evaluateAutomation({
    event, files: cssOnly, headTree: incompleteTree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH],
  }));
});
test('tree rejects symlink, submodule and truncation', () => {
  assert.throws(() => treeMap({ truncated: true, tree: [] }, 'head'));
  const make = (mode, type) => new Map([[RECIPIENT_FILES[0], { mode, type, sha: 'a'.repeat(40), size: 1 }]]);
  const files = [{ filename: RECIPIENT_FILES[0], status: 'modified', changes: 1 }];
  assert.throws(() => evaluateNormal({ files, headTree: make('120000', 'blob'), entryFiles: [RECIPIENT_FILES[0]], entryContents: { [RECIPIENT_FILES[0]]: '' } }));
  assert.throws(() => evaluateNormal({ files, headTree: make('160000', 'commit'), entryFiles: [RECIPIENT_FILES[0]], entryContents: { [RECIPIENT_FILES[0]]: '' } }));
});
test('package metadata has a separate bounded size allowance', () => {
  const size = 100_000;
  const packageTree = new Map([['package-lock.json', {
    mode: '100644', type: 'blob', sha: 'a'.repeat(40), size,
  }]]);
  assert.doesNotThrow(() => assertRegularFiles(packageTree, ['package-lock.json'], 'package'));
  assert.throws(() => assertRegularFiles(new Map([['index.html', {
    mode: '100644', type: 'blob', sha: 'a'.repeat(40), size,
  }]]), ['index.html'], 'entry'));
  const bytes = Buffer.alloc(size, 0x20);
  assert.doesNotThrow(() => decodeBlob({
    encoding: 'base64', content: bytes.toString('base64'), size,
  }, 'package-lock.json'));
});
test('normal PR rejects direct generated edits and legacy reinsertion', () => {
  assert.throws(() => validatePullFileMetadata([{ filename: RECIPIENT_FILES[0], status: 'modified', changes: 1 }], false));
  assert.doesNotThrow(() => validatePullFileMetadata([{ filename: 'src/large-data.ts', status: 'modified', changes: 100_000 }], false));
  const tree = new Map([['index.html', { mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: 100 }]]);
  assert.throws(() => evaluateNormal({ files: [{ filename: 'index.html', status: 'modified', changes: 1 }], headTree: tree, entryFiles: ['index.html'], candidateContents: { 'index.html': '<script src="https://sakutio.com/shared/sakutio-global-footer.js"></script>' } }));
});
test('event identity and actor id fail closed', () => {
  const event = { repository: { full_name: TARGET_REPOSITORY, id: 7 }, pull_request: { number: 1, user: { id: 9, login: 'bot' }, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40), ref: 'main', repo: { full_name: TARGET_REPOSITORY, id: 7 } } } };
  assert.doesNotThrow(() => validateEvent(event, 9));
  assert.throws(() => validateEvent(event, Number.NaN));
  assert.throws(() => validateEvent({ ...event, repository: { ...event.repository, id: 8 } }, 9));
});
test('automation stale, race and branch mismatch fail', () => {
  const current = parseProvenance(installed[VERSION_PATH]);
  const files = RECIPIENT_FILES.map((filename) => ({ filename, status: 'modified', changes: 1 }));
  const tree = new Map(RECIPIENT_FILES.map((filename) => [filename, { mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: Buffer.byteLength(installed[filename]) }]));
  tree.contents = installed;
  const event = { repository: { full_name: TARGET_REPOSITORY, id: 7 }, pull_request: { user: { id: 9 }, base: { sha: 'b'.repeat(40) }, head: { repo: { full_name: TARGET_REPOSITORY, id: 7 }, label: 'hayata57:x', ref: 'wrong' } } };
  assert.throws(() => evaluateAutomation({ event, files, headTree: tree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH] }));
  const older = structuredClone(current); older.sourceGeneration += 1;
  const staleBase = `${JSON.stringify(older, null, 2)}\n`;
  event.pull_request.head.ref = `automation/shared-chrome-g${current.sourceGeneration}-${current.version.slice(0, 12)}-base-${event.pull_request.base.sha}`;
  assert.throws(() => evaluateAutomation({ event, files, headTree: tree, baseTree: { contents: { ...installed, [VERSION_PATH]: staleBase } }, headContents: installed, baseVersion: staleBase }));
  const raced = { ...installed, [RECIPIENT_FILES[2]]: `${installed[RECIPIENT_FILES[2]]} ` };
  assert.throws(() => evaluateAutomation({ event, files, headTree: tree, baseTree: { ...tree, contents: raced }, headContents: installed, baseVersion: installed[VERSION_PATH] }));
});

test('automation branch binds exact base SHA', () => {
  const current = parseProvenance(installed[VERSION_PATH]);
  const files = RECIPIENT_FILES.map((filename) => ({ filename, status: 'modified', changes: 1 }));
  const tree = new Map(RECIPIENT_FILES.map((filename) => [filename, {
    mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: Buffer.byteLength(installed[filename]),
  }]));
  tree.contents = installed;
  const event = {
    repository: { full_name: TARGET_REPOSITORY, id: 7 },
    pull_request: {
      user: { id: 9 },
      base: { sha: 'b'.repeat(40) },
      head: {
        repo: { full_name: TARGET_REPOSITORY, id: 7 },
        label: 'hayata57:x',
        ref: `automation/shared-chrome-g${current.sourceGeneration}-${current.version.slice(0, 12)}-base-${'b'.repeat(40)}`,
      },
    },
  };
  assert.doesNotThrow(() => evaluateAutomation({
    event, files, headTree: tree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH],
  }));
  event.pull_request.head.ref = `automation/shared-chrome-g${current.sourceGeneration}-${current.version.slice(0, 12)}-b${'b'.repeat(12)}`;
  assert.throws(() => evaluateAutomation({
    event, files, headTree: tree, baseTree: tree, headContents: installed, baseVersion: installed[VERSION_PATH],
  }));
});

test('recipient policy integration schema is exact and fail-closed', () => {
  assert.doesNotThrow(() => validateRecipientPolicy(policy));
  assert.throws(() => validateRecipientPolicy({ ...policy, extra: true }));
  assert.throws(() => validateRecipientPolicy({
    ...policy,
    integration: { ...policy.integration, mountPath: 'src/Other.tsx' },
  }));
  assert.throws(() => validateRecipientPolicy({
    ...policy,
    integration: {
      ...policy.integration,
      components: policy.integration.components.map((component, index) => (
        index ? component : { ...component, generatedExport: 'OtherHeader' }
      )),
    },
  }));
  assert.throws(() => validateRecipientPolicy({
    ...policy,
    integration: {
      ...policy.integration,
      components: policy.integration.components.map((component, index) => (
        index ? component : { ...component, wrapperPath: 'src/components/OtherHeader.tsx' }
      )),
    },
  }));
  const renamed = structuredClone(policy);
  renamed.integration.components[0] = {
    wrapperPath: 'src/components/SakutioGlobalHeader.tsx',
    wrapperExport: 'SakutioGlobalHeader',
    generatedImportSpecifier: '../shared-chrome/generated/SharedChrome',
    generatedExport: 'SharedChromeHeader',
    mountImportSpecifier: './components/SakutioGlobalHeader',
  };
  renamed.integration.components[1] = {
    wrapperPath: 'src/components/SakutioGlobalFooter.tsx',
    wrapperExport: 'SakutioGlobalFooter',
    generatedImportSpecifier: '../shared-chrome/generated/SharedChrome',
    generatedExport: 'SharedChromeFooter',
    mountImportSpecifier: './components/SakutioGlobalFooter',
  };
  assert.doesNotThrow(() => validateRecipientPolicy(renamed));
});

test('valid installed integration passes structural validation', () => {
  assert.doesNotThrow(() => validateIntegration(integrationContents, policy.integration));
});

const headerComponent = policy.integration.components[0];
const generatedImport = `import { ${headerComponent.generatedExport} } from '${headerComponent.generatedImportSpecifier}'`;
const wrapperJsx = `<${headerComponent.wrapperExport} />`;
function withoutGeneratedImport(source) {
  return source
    .replaceAll(`${generatedImport};\r\n`, '')
    .replaceAll(`${generatedImport}\r\n`, '')
    .replaceAll(`${generatedImport};\n`, '')
    .replaceAll(`${generatedImport}\n`, '');
}

for (const [name, transform] of [
  ['comment spoofing', (source) => `// ${generatedImport}\n${withoutGeneratedImport(source)}`],
  ['string spoofing', (source) => `const spoof = "${generatedImport}"\n${withoutGeneratedImport(source)}`],
  ['removed generated import', (source) => withoutGeneratedImport(source).replace(/^\n/u, '')],
  ['aliased generated import', (source) => source
    .replace(`{ ${headerComponent.generatedExport} }`, `{ ${headerComponent.generatedExport} as Header }`)
    .replace(`<${headerComponent.generatedExport} />`, '<Header />')],
  ['default wrapper export', (source) => source.replace(
    `export function ${headerComponent.wrapperExport}`,
    `export default function ${headerComponent.wrapperExport}`,
  )],
  ['async wrapper export', (source) => source.replace(
    `export function ${headerComponent.wrapperExport}`,
    `export async function ${headerComponent.wrapperExport}`,
  )],
]) {
  test(`integration rejects ${name}`, () => {
    const header = headerComponent.wrapperPath;
    assert.throws(() => validateIntegration({
      ...integrationContents,
      [header]: transform(integrationContents[header]),
    }, policy.integration));
  });
}

test('integration rejects removed and aliased App imports', () => {
  const mount = policy.integration.mountPath;
  const importPattern = new RegExp(
    `^import \\{ ${headerComponent.wrapperExport} \\} from '${headerComponent.mountImportSpecifier.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'\\s*;?\\r?\\n`,
    'mu',
  );
  assert.throws(() => validateIntegration({
    ...integrationContents,
    [mount]: integrationContents[mount].replace(importPattern, ''),
  }, policy.integration));
  assert.throws(() => validateIntegration({
    ...integrationContents,
    [mount]: integrationContents[mount]
      .replace(`{ ${headerComponent.wrapperExport} }`, `{ ${headerComponent.wrapperExport} as Header }`)
      .replace(wrapperJsx, '<Header />'),
  }, policy.integration));
});

test('integration rejects removed JSX mounts and comment/string spoofing', () => {
  const mount = policy.integration.mountPath;
  for (const replacement of [
    `{/* ${wrapperJsx} */}`,
    `{"${wrapperJsx}"}`,
    '',
  ]) {
    assert.throws(() => validateIntegration({
      ...integrationContents,
      [mount]: integrationContents[mount].replace(wrapperJsx, replacement),
    }, policy.integration));
  }
  assert.throws(() => validateIntegration({
    ...integrationContents,
    [mount]: `${integrationContents[mount].replace(wrapperJsx, '')}\nfunction Spoof() { return ${wrapperJsx} }\n`,
  }, policy.integration));
});

test('normal PRs reject protected policy controls', () => {
  for (const filename of [
    'scripts/shared-chrome/lib.mjs',
    'scripts/shared-chrome/new-control.mjs',
    '.github/workflows/shared-chrome-policy.yml',
    '.github/workflows/shared-chrome-ci.yml',
  ]) {
    assert.throws(() => validatePullFileMetadata([{ filename, status: 'modified', changes: 1 }], false));
  }
  assert.doesNotThrow(() => validatePullFileMetadata([
    { filename: 'src/components/ProgressPanel.tsx', status: 'modified', changes: 10 },
  ], false));
});

test('protected parser package metadata remains identical', () => {
  assert.doesNotThrow(() => validatePackageMetadata(packageContents, packageContents));
  const direct = JSON.parse(packageContents['package.json']);
  direct.devDependencies.typescript = 'latest';
  assert.throws(() => validatePackageMetadata({
    ...packageContents, 'package.json': JSON.stringify(direct),
  }, packageContents));
  const duplicateDirect = JSON.parse(packageContents['package.json']);
  duplicateDirect.dependencies.typescript = '6.0.2';
  assert.throws(() => validatePackageMetadata({
    ...packageContents, 'package.json': JSON.stringify(duplicateDirect),
  }, packageContents));
  const rootLock = JSON.parse(packageContents['package-lock.json']);
  rootLock.packages[''].devDependencies.parse5 = '^8.0.1';
  assert.throws(() => validatePackageMetadata({
    ...packageContents, 'package-lock.json': JSON.stringify(rootLock),
  }, packageContents));
});

test('protected transitive parser lock entries reject tampering', () => {
  for (const key of ['node_modules/parse5', 'node_modules/entities', 'node_modules/postcss-selector-parser', 'node_modules/cssesc']) {
    const lock = JSON.parse(packageContents['package-lock.json']);
    lock.packages[key].integrity = 'sha512-tampered';
    assert.throws(() => validatePackageMetadata({
      ...packageContents, 'package-lock.json': JSON.stringify(lock),
    }, packageContents));
  }
  const nested = JSON.parse(packageContents['package-lock.json']);
  nested.packages['node_modules/parse5/node_modules/entities'] = structuredClone(nested.packages['node_modules/entities']);
  assert.throws(() => validatePackageMetadata({
    ...packageContents, 'package-lock.json': JSON.stringify(nested),
  }, packageContents));
});

test('unrelated package metadata changes remain allowed', () => {
  const candidatePackage = JSON.parse(packageContents['package.json']);
  candidatePackage.scripts.test = 'vitest run --dir src --reporter=default';
  const candidateLock = JSON.parse(packageContents['package-lock.json']);
  candidateLock.packages[''].license = 'GPL-2.0-or-later';
  assert.doesNotThrow(() => validatePackageMetadata({
    'package.json': JSON.stringify(candidatePackage),
    'package-lock.json': JSON.stringify(candidateLock),
  }, packageContents));
});
