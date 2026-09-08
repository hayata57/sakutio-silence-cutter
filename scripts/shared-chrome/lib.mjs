import { createHash } from 'node:crypto';
import * as parse5 from 'parse5';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import ts from 'typescript';

export const GENERATOR_VERSION = 2;
export const CANONICAL_REPOSITORY = 'hayata57/sakutio-home';
export const TARGET_REPOSITORY = 'hayata57/sakutio-silence-cutter';
export const TARGET_BRANCH = 'main';
export const SOURCE_FILES = ['header.html', 'footer.html', 'chrome.css'];
export const SOURCE_MARKERS = Object.freeze({
  'header.html': '<!-- AUTO-GENERATED from sakutio-home shared-chrome/source/header.html. DO NOT EDIT. -->\n',
  'footer.html': '<!-- AUTO-GENERATED from sakutio-home shared-chrome/source/footer.html. DO NOT EDIT. -->\n',
});
export const RECIPIENT_FILE_MAP = Object.freeze({
  'src/shared-chrome/generated/source/header.html': 'source/header.html',
  'src/shared-chrome/generated/source/footer.html': 'source/footer.html',
  'src/shared-chrome/generated/SharedChrome.tsx': 'SharedChrome.tsx',
  'src/shared-chrome/generated/shared-chrome.css': 'shared-chrome.css',
  'public/shared-chrome/version.json': 'version.json',
});
export const RECIPIENT_FILES = Object.freeze(Object.keys(RECIPIENT_FILE_MAP));
export const ARTIFACT_FILES = Object.freeze(RECIPIENT_FILES.slice(0, 4));
export const VERSION_PATH = RECIPIENT_FILES[4];
export const PACKAGE_METADATA_FILES = Object.freeze(['package.json', 'package-lock.json']);
export const PROTECTED_DIRECT_PINS = Object.freeze([
  'parse5',
  'postcss',
  'postcss-selector-parser',
  'postcss-value-parser',
  'typescript',
]);

const HTML_TAGS = new Set(['a', 'circle', 'div', 'footer', 'header', 'nav', 'p', 'path', 'rect', 'span', 'svg']);
const HTML_CLASSES = new Set([
  'sakutio-chrome', 'sakutio-chrome--footer', 'sakutio-chrome--header',
  'sakutio-chrome__brand', 'sakutio-chrome__brand--inverted', 'sakutio-chrome__brand-icon',
  'sakutio-chrome__brand-text', 'sakutio-chrome__container', 'sakutio-chrome__copy',
  'sakutio-chrome__footer-brand', 'sakutio-chrome__footer-brand-block',
  'sakutio-chrome__footer-nav', 'sakutio-chrome__footer-top',
  'sakutio-chrome__header-inner', 'sakutio-chrome__header-link',
  'sakutio-chrome__header-nav', 'sakutio-chrome__logo', 'sakutio-chrome__tagline',
]);
const GLOBAL_ATTRIBUTES = new Set(['aria-hidden', 'aria-label', 'class']);
const TAG_ATTRIBUTES = {
  a: new Set(['href']), circle: new Set(['cx', 'cy', 'r']), path: new Set(['d']),
  rect: new Set(['height', 'rx', 'width', 'x', 'y']),
  svg: new Set(['fill', 'focusable', 'height', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'viewBox', 'width']),
};
const ALLOWED_URLS = new Set([
  'https://sakutio.com/', 'https://sakutio.com/#tools', 'https://sakutio.com/about/',
  'https://sakutio.com/contact/', 'https://sakutio.com/guides/',
  'https://sakutio.com/management/', 'https://sakutio.com/privacy/', 'https://sakutio.com/terms/',
]);
const EXPECTED_LINKS = {
  'header.html': [['https://sakutio.com/', 'Sakutio'], ['https://sakutio.com/#tools', 'ツール一覧'], ['https://sakutio.com/about/', 'Sakutioについて'], ['https://sakutio.com/contact/', 'お問い合わせ']],
  'footer.html': [['https://sakutio.com/', 'Sakutio'], ['https://sakutio.com/about/', 'Sakutioについて'], ['https://sakutio.com/guides/', 'ガイド'], ['https://sakutio.com/management/', '運営者情報'], ['https://sakutio.com/privacy/', 'プライバシー'], ['https://sakutio.com/terms/', '利用規約'], ['https://sakutio.com/contact/', 'お問い合わせ']],
};
const ALLOWED_TEXT = new Set(['Sakutio', 'ツール一覧', 'Sakutioについて', 'お問い合わせ', '無料のWebツールをシンプルに', 'ガイド', '運営者情報', 'プライバシー', '利用規約', '© 2026 Sakutio']);
const PATHS = [
  'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
  'm7 16.5-4.74-2.85', 'm7 16.5 5-3', 'M7 16.5v5.17',
  'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
  'm17 16.5-5-3', 'm17 16.5 4.74-2.85', 'M17 16.5v5.17',
  'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
  'M12 8 7.26 5.15', 'm12 8 4.74-2.85', 'M12 13.5V8',
  'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
  'M20 2v4', 'M22 4h-4', 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7',
];
const PATH_HASHES = new Set(PATHS.map((value) => sha256(value)));
const REACT_ATTRIBUTES = new Map([['class', 'className'], ['stroke-linecap', 'strokeLinecap'], ['stroke-linejoin', 'strokeLinejoin'], ['stroke-width', 'strokeWidth'], ['viewbox', 'viewBox']]);
const CSS_PROPERTIES = new Set([
  '-webkit-backdrop-filter', 'align-items', 'align-self', 'backdrop-filter', 'background',
  'border-bottom', 'border-radius', 'border-top', 'box-sizing', 'color', 'display',
  'flex-direction', 'flex-shrink', 'flex-wrap', 'font-family', 'font-size', 'font-weight',
  'gap', 'height', 'justify-content', 'letter-spacing', 'line-height', 'margin', 'margin-top',
  'max-width', 'min-height', 'min-width', 'opacity', 'outline', 'outline-color',
  'outline-offset', 'overflow-wrap', 'overflow-x', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'position', 'text-decoration', 'top',
  'transition', 'transition-duration', 'width', 'z-index',
]);
const CSS_FUNCTIONS = new Set(['blur', 'linear-gradient', 'rgba']);
const CSS_PSEUDOS = new Set(['::after', '::before', ':focus-visible', ':hover']);

function fail(message, location = '') {
  throw new Error(`${location ? `${location}: ` : ''}${message}`);
}
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function stripSourceMarker(content, filename) {
  const marker = SOURCE_MARKERS[filename];
  if (!marker || !content.startsWith(marker) || content.slice(marker.length).startsWith('<!-- AUTO-GENERATED')) {
    fail('missing or non-exact AUTO-GENERATED source marker', filename);
  }
  return content.slice(marker.length);
}
function text(node) {
  if (node.nodeName === '#text') return node.value.replace(/\s+/gu, ' ').trim();
  return (node.childNodes ?? []).map(text).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
}
function inspect(node, parent, depth, state, filename) {
  if (++state.nodes > 120) fail('node count exceeds 120', filename);
  if (depth > 10) fail('tree depth exceeds 10', filename);
  if (node.nodeName === '#comment') fail('comments are not allowed', filename);
  if (node.nodeName === '#text') {
    const value = text(node);
    if (value.length > 80 || (value && !ALLOWED_TEXT.has(value))) fail('text is not canonical', filename);
    return;
  }
  if (!node.tagName) {
    for (const child of node.childNodes ?? []) inspect(child, node, depth + 1, state, filename);
    return;
  }
  if (!HTML_TAGS.has(node.tagName)) fail(`element <${node.tagName}> is not allowed`, filename);
  const names = new Set();
  for (const attribute of node.attrs ?? []) {
    const name = attribute.name;
    if (names.has(name)) fail(`duplicate attribute ${name}`, filename);
    names.add(name);
    if (attribute.value.length > 768) fail(`attribute ${name} is too long`, filename);
    if (!GLOBAL_ATTRIBUTES.has(name) && !TAG_ATTRIBUTES[node.tagName]?.has(name)) fail(`attribute ${name} is not allowed`, filename);
    if (name === 'class') {
      const classes = attribute.value.split(/\s+/u).filter(Boolean);
      if (!classes.length || new Set(classes).size !== classes.length || classes.some((item) => !HTML_CLASSES.has(item))) fail('class list is not canonical', filename);
    }
    if (name === 'href' && !ALLOWED_URLS.has(attribute.value)) fail('href is not an approved canonical route', filename);
  }
  const p = parent?.tagName;
  if (['header', 'footer'].includes(node.tagName) && parent?.nodeName !== '#document-fragment') fail('chrome root must be fragment root', filename);
  if (['path', 'rect', 'circle'].includes(node.tagName) && p !== 'svg') fail('SVG child has invalid parent', filename);
  if (node.tagName === 'svg' && !['a', 'span'].includes(p)) fail('svg has invalid parent', filename);
  if (node.tagName === 'nav' && p !== 'div') fail('nav has invalid parent', filename);
  if (node.tagName === 'a' && !['div', 'nav', 'p'].includes(p)) fail('link has invalid parent', filename);
  if (node.tagName === 'span' && !['a', 'span'].includes(p)) fail('span has invalid parent', filename);
  if (node.tagName === 'p' && p !== 'div') fail('paragraph has invalid parent', filename);
  if (node.tagName === 'div' && !['header', 'footer', 'div'].includes(p)) fail('div has invalid parent', filename);
  const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name.toLowerCase(), a.value]));
  if (node.tagName === 'path' && !PATH_HASHES.has(sha256(attrs.d ?? ''))) fail('SVG path data is not allowlisted', filename);
  if (node.tagName === 'svg' && (attrs.viewbox !== '0 0 24 24' || !['15', '18'].includes(attrs.width) || attrs.height !== attrs.width
    || attrs.fill !== 'none' || attrs.stroke !== 'currentColor' || attrs['stroke-width'] !== '2'
    || attrs['stroke-linecap'] !== 'round' || attrs['stroke-linejoin'] !== 'round'
    || attrs['aria-hidden'] !== 'true' || attrs.focusable !== 'false')) fail('SVG presentation is not canonical', filename);
  if (['rect', 'circle'].includes(node.tagName) && Object.values(attrs).some((value) => !/^(?:0|[1-9]\d?)(?:\.\d+)?$/u.test(value) || Number(value) > 24)) fail('SVG numeric attribute is invalid', filename);
  for (const child of node.childNodes ?? []) inspect(child, node, depth + 1, state, filename);
}
export function validateHtml(source, filename) {
  if (!Object.hasOwn(EXPECTED_LINKS, filename)) fail('filename is not canonical', filename);
  if (Buffer.byteLength(source) > 32_768) fail('HTML exceeds 32768 bytes', filename);
  const errors = [];
  const document = parse5.parseFragment(source, { onParseError: ({ code }) => errors.push(code) });
  if (errors.length) fail(`HTML parse errors: ${[...new Set(errors)].join(', ')}`, filename);
  const roots = document.childNodes.filter((node) => node.nodeName !== '#text' || text(node));
  const root = filename === 'header.html' ? 'header' : 'footer';
  if (roots.length !== 1 || roots[0].tagName !== root) fail(`fragment must contain exactly one <${root}> root`, filename);
  inspect(document, null, 0, { nodes: 0 }, filename);
  const classes = roots[0].attrs.find((a) => a.name === 'class')?.value.split(/\s+/u) ?? [];
  if (!classes.includes('sakutio-chrome') || !classes.includes(`sakutio-chrome--${root}`)) fail('root classes are invalid', filename);
  const links = [];
  const visit = (node) => {
    if (node.tagName === 'a') links.push([node.attrs.find((a) => a.name === 'href')?.value, text(node)]);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  if (JSON.stringify(links) !== JSON.stringify(EXPECTED_LINKS[filename])) fail('link routes/order/text are not canonical', filename);
  return document;
}
function validateSelector(selector, filename) {
  selectorParser((root) => root.each((item) => {
    const first = item.nodes.find((node) => node.type !== 'comment');
    if (first?.type !== 'class' || first.value !== 'sakutio-chrome') fail(`selector is not rooted at .sakutio-chrome: ${selector}`, filename);
    item.walk((node) => {
      if (node.type === 'combinator' && node.value !== ' ') {
        fail(`selector combinator cannot target nodes outside .sakutio-chrome: ${selector}`, filename);
      }
      if (['id', 'attribute', 'nesting'].includes(node.type)) fail(`selector token ${node} is not allowed`, filename);
      if (node.type === 'class' && !HTML_CLASSES.has(node.value)) fail(`unknown class ${node.value}`, filename);
      if (node.type === 'tag' && !['a', 'svg'].includes(node.value)) fail(`tag selector ${node.value} is not allowed`, filename);
      if (node.type === 'pseudo' && !CSS_PSEUDOS.has(node.value)) fail(`pseudo ${node.value} is not allowed`, filename);
    });
  })).processSync(selector);
}
export function validateCss(source, filename = 'chrome.css') {
  if (Buffer.byteLength(source) > 32_768) fail('CSS exceeds 32768 bytes', filename);
  let root;
  try { root = postcss.parse(source, { from: filename }); } catch (error) { fail(`CSS parse error: ${error.message}`, filename); }
  root.walkAtRules((rule) => {
    if (rule.name.toLowerCase() !== 'media' || !['(prefers-reduced-motion: reduce)', '(max-width: 480px)'].includes(rule.params)) fail(`at-rule is not allowlisted: @${rule.name} ${rule.params}`, filename);
  });
  root.walkRules((rule) => rule.selectors.forEach((selector) => validateSelector(selector, filename)));
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    const value = declaration.value.toLowerCase();
    if (!CSS_PROPERTIES.has(property)) fail(`CSS property ${property} is not allowlisted`, filename);
    if (/(?:^|[^a-z])[-+]?(?:\d*\.)?\d+(?:d?vh|d?vw|svh|svw|lvh|lvw|vmin|vmax)\b/iu.test(value)) fail('viewport units are not allowed', filename);
    if (property === 'position' && value.trim() !== 'sticky') fail('position is not canonical', filename);
    if (property === 'z-index' && value.trim() !== '100') fail('z-index is not canonical', filename);
    if (declaration.important && !(property === 'transition-duration' && declaration.parent?.parent?.name === 'media' && declaration.parent.parent.params === '(prefers-reduced-motion: reduce)')) fail('!important is not allowed', filename);
    valueParser(declaration.value).walk((node) => {
      if (node.type === 'function' && !CSS_FUNCTIONS.has(node.value.toLowerCase())) fail(`CSS function ${node.value} is not allowlisted`, filename);
    });
  });
  return root;
}
function serialize(node, depth = 2, version = '') {
  if (node.nodeName === '#text') {
    const value = text(node);
    return value ? `${'  '.repeat(depth)}${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('{', '&#123;')}\n` : '';
  }
  if (!node.tagName) return (node.childNodes ?? []).map((child) => serialize(child, depth)).join('');
  const indent = '  '.repeat(depth);
  let attrs = (node.attrs ?? []).map((a) => ` ${REACT_ATTRIBUTES.get(a.name) ?? a.name}=${JSON.stringify(a.value)}`).join('');
  if (version) attrs += ' data-sakutio-chrome-version={SHARED_CHROME_VERSION}';
  const children = (node.childNodes ?? []).map((child) => serialize(child, depth + 1)).join('');
  return children ? `${indent}<${node.tagName}${attrs}>\n${children}${indent}</${node.tagName}>\n` : `${indent}<${node.tagName}${attrs} />\n`;
}
export function buildArtifacts(sources) {
  const header = validateHtml(sources['header.html'], 'header.html');
  const footer = validateHtml(sources['footer.html'], 'footer.html');
  validateCss(sources['chrome.css']);
  const sourceHashes = Object.fromEntries(SOURCE_FILES.map((name) => [name, sha256(sources[name])]));
  const version = sha256([`generatorVersion:${GENERATOR_VERSION}`, ...SOURCE_FILES.map((name) => `${name}:${sourceHashes[name]}`)].join('\n'));
  const banner = `// AUTO-GENERATED by scripts/shared-chrome/generate.mjs. DO NOT EDIT.\n// shared-chrome-version: ${version}\n`;
  const files = {
    'source/header.html': `${SOURCE_MARKERS['header.html']}${sources['header.html'].trim()}\n`,
    'source/footer.html': `${SOURCE_MARKERS['footer.html']}${sources['footer.html'].trim()}\n`,
    'SharedChrome.tsx': `${banner}import './shared-chrome.css';\n\nexport const SHARED_CHROME_VERSION = ${JSON.stringify(version)};\n\nexport function SharedChromeHeader() {\n  return (\n${serialize(header.childNodes[0], 2, version).trimEnd()}\n  );\n}\n\nexport function SharedChromeFooter() {\n  return (\n${serialize(footer.childNodes[0], 2, version).trimEnd()}\n  );\n}\n`,
    'shared-chrome.css': `/* AUTO-GENERATED by scripts/shared-chrome/generate.mjs. DO NOT EDIT. */\n/* shared-chrome-version: ${version} */\n${sources['chrome.css'].trim()}\n`,
  };
  const artifactHashes = Object.fromEntries(ARTIFACT_FILES.map((destination) => [destination, sha256(files[RECIPIENT_FILE_MAP[destination]])]));
  return { version, sourceHashes, artifactHashes, files };
}
export function parseProvenance(content, location = VERSION_PATH) {
  let value;
  try { value = JSON.parse(content); } catch (error) { fail(`malformed JSON: ${error.message}`, location); }
  const exactKeys = ['notice', 'schemaVersion', 'generatorVersion', 'version', 'sourceHashes', 'canonicalRepository', 'sourceCommit', 'sourceGeneration', 'targetRepository', 'targetBranch', 'artifactHashes'];
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(exactKeys)
    || value.notice !== 'AUTO-GENERATED. DO NOT EDIT.' || value.schemaVersion !== 1
    || value.generatorVersion !== GENERATOR_VERSION || !/^[a-f0-9]{64}$/u.test(value.version ?? '')
    || value.canonicalRepository !== CANONICAL_REPOSITORY || !/^[a-f0-9]{40}$/u.test(value.sourceCommit ?? '')
    || !Number.isSafeInteger(value.sourceGeneration) || value.sourceGeneration < 1
    || value.targetRepository !== TARGET_REPOSITORY || value.targetBranch !== TARGET_BRANCH
    || JSON.stringify(Object.keys(value.sourceHashes ?? {})) !== JSON.stringify(SOURCE_FILES)
    || Object.values(value.sourceHashes).some((hash) => !/^[a-f0-9]{64}$/u.test(hash))
    || JSON.stringify(Object.keys(value.artifactHashes ?? {})) !== JSON.stringify(ARTIFACT_FILES)
    || Object.values(value.artifactHashes).some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) fail('provenance schema or target binding is invalid', location);
  return value;
}
export function verifyRecipientFiles(files) {
  if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify([...RECIPIENT_FILES].sort())) fail('candidate must contain exactly the five recipient files');
  const provenance = parseProvenance(files[VERSION_PATH]);
  const sources = {
    'header.html': stripSourceMarker(files[RECIPIENT_FILES[0]], 'header.html'),
    'footer.html': stripSourceMarker(files[RECIPIENT_FILES[1]], 'footer.html'),
    'chrome.css': files[RECIPIENT_FILES[3]].replace(/^\/\* AUTO-GENERATED by scripts\/shared-chrome\/generate\.mjs\. DO NOT EDIT\. \*\/\n\/\* shared-chrome-version: [a-f0-9]{64} \*\/\n/u, ''),
  };
  const expected = buildArtifacts(sources);
  if (expected.version !== provenance.version || JSON.stringify(expected.sourceHashes) !== JSON.stringify(provenance.sourceHashes)
    || JSON.stringify(expected.artifactHashes) !== JSON.stringify(provenance.artifactHashes)) fail('provenance hashes/version do not match deterministic artifacts');
  for (const [destination, artifact] of Object.entries(RECIPIENT_FILE_MAP)) {
    if (artifact !== 'version.json' && files[destination] !== expected.files[artifact]) fail(`artifact is not deterministic: ${destination}`);
    if (artifact !== 'version.json' && sha256(files[destination]) !== provenance.artifactHashes[destination]) fail(`artifact hash mismatch: ${destination}`);
  }
  return { provenance, artifacts: expected };
}
export function containsLegacyChromeScript(html) {
  const document = parse5.parse(html);
  let found = false;
  const visit = (node) => {
    if (node.tagName === 'script') {
      const src = node.attrs?.find((a) => a.name === 'src')?.value ?? '';
      if (/^(?:(?:https:)?\/\/sakutio\.com\/shared\/|\/shared-pinned\/)sakutio-global-(?:header|footer)(?:-[a-f0-9]+)?\.js(?:[?#].*)?$/iu.test(src)) {
        found = true;
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  return found;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

export function validateRecipientPolicy(policy) {
  const topKeys = ['schemaVersion', 'repository', 'baseBranch', 'entryFiles', 'generatedFiles', 'statusContext', 'ciCheck', 'integration'];
  if (!exactKeys(policy, topKeys)
    || policy.schemaVersion !== 1 || policy.repository !== TARGET_REPOSITORY
    || policy.baseBranch !== TARGET_BRANCH || policy.statusContext !== 'shared-chrome/recipient-policy'
    || policy.ciCheck !== 'shared-chrome/unprivileged-ci'
    || JSON.stringify(policy.generatedFiles) !== JSON.stringify(RECIPIENT_FILES)
    || !Array.isArray(policy.entryFiles) || policy.entryFiles.length === 0
    || !exactKeys(policy.integration, ['mountPath', 'mountExport', 'components'])
    || typeof policy.integration.mountPath !== 'string'
    || !Array.isArray(policy.integration.components) || policy.integration.components.length !== 2) {
    fail('base-owned recipient policy configuration is invalid');
  }
  if (policy.integration.mountPath !== 'src/App.tsx' || policy.integration.mountExport !== 'App') {
    fail('base-owned integration configuration is invalid');
  }
  const [header, footer] = policy.integration.components;
  if (!validWrapperComponent(header, 'SharedChromeHeader', 'Header')
    || !validWrapperComponent(footer, 'SharedChromeFooter', 'Footer')
    || header.wrapperExport === footer.wrapperExport) {
    fail('base-owned integration configuration is invalid');
  }
  return policy;
}

function validWrapperComponent(component, generatedExport, suffix) {
  return exactKeys(component, [
    'wrapperPath', 'wrapperExport', 'generatedImportSpecifier', 'generatedExport', 'mountImportSpecifier',
  ])
    && component.generatedImportSpecifier === '../shared-chrome/generated/SharedChrome'
    && component.generatedExport === generatedExport
    && /^[A-Z][A-Za-z0-9]*$/u.test(component.wrapperExport)
    && component.wrapperExport.endsWith(suffix)
    && component.wrapperPath === `src/components/${component.wrapperExport}.tsx`
    && component.mountImportSpecifier === `./components/${component.wrapperExport}`;
}

function parseTypeScript(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) fail(`TypeScript parse error: ${file.parseDiagnostics[0].messageText}`, filename);
  return file;
}

function namedImport(statement, specifier, importedName) {
  if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== specifier) return false;
  const bindings = statement.importClause?.namedBindings;
  if (!bindings || statement.importClause.name || !ts.isNamedImports(bindings) || bindings.elements.length !== 1) return false;
  const element = bindings.elements[0];
  return !element.propertyName && element.name.text === importedName && !statement.importClause.isTypeOnly && !element.isTypeOnly;
}

function returnedComponent(statement, componentName) {
  if (!ts.isFunctionDeclaration(statement) || !statement.body || statement.parameters.length !== 0
    || statement.asteriskToken || statement.typeParameters?.length
    || JSON.stringify(statement.modifiers?.map((modifier) => modifier.kind) ?? [])
      !== JSON.stringify([ts.SyntaxKind.ExportKeyword])) return false;
  if (statement.body.statements.length !== 1 || !ts.isReturnStatement(statement.body.statements[0])) return false;
  const expression = statement.body.statements[0].expression;
  return Boolean(expression && ts.isJsxSelfClosingElement(expression)
    && ts.isIdentifier(expression.tagName) && expression.tagName.text === componentName
    && expression.attributes.properties.length === 0);
}

function isAppFunction(statement, name) {
  return ts.isFunctionDeclaration(statement) && statement.name?.text === name && Boolean(statement.body)
    && statement.parameters.length === 0 && !statement.asteriskToken && !statement.typeParameters?.length;
}

function hasModifier(statement, kind) {
  return Boolean(statement.modifiers?.some((modifier) => modifier.kind === kind));
}

function findMountFunction(sourceFile, name, filename) {
  const functions = sourceFile.statements.filter((statement) => isAppFunction(statement, name));
  const defaultFunctions = functions.filter((statement) => (
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    && hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
  ));
  const defaultAssignments = sourceFile.statements.filter((statement) => ts.isExportAssignment(statement)
    && !statement.isExportEquals && ts.isIdentifier(statement.expression)
    && statement.expression.text === name);
  if (defaultFunctions.length + defaultAssignments.length !== 1 || functions.length !== 1) {
    fail(`mount must have exactly one default-exported function ${name}`, filename);
  }
  return functions[0];
}

export function validateIntegration(contents, integration) {
  const mountSource = contents[integration.mountPath];
  if (typeof mountSource !== 'string') fail(`integration source is missing: ${integration.mountPath}`);
  const mount = parseTypeScript(mountSource, integration.mountPath);
  const mountFunction = findMountFunction(mount, integration.mountExport, integration.mountPath);
  const returnedExpressions = mountFunction.body.statements
    .filter(ts.isReturnStatement)
    .map((statement) => statement.expression)
    .filter(Boolean);
  for (const component of integration.components) {
    const source = contents[component.wrapperPath];
    if (typeof source !== 'string') fail(`integration source is missing: ${component.wrapperPath}`);
    const wrapper = parseTypeScript(source, component.wrapperPath);
    if (wrapper.statements.length !== 2
      || !namedImport(wrapper.statements[0], component.generatedImportSpecifier, component.generatedExport)) {
      fail('wrapper must contain only the exact generated component import and exported function', component.wrapperPath);
    }
    const declaration = wrapper.statements[1];
    const exported = ts.isFunctionDeclaration(declaration)
      && declaration.name?.text === component.wrapperExport
      && declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported || !returnedComponent(declaration, component.generatedExport)) {
      fail(`wrapper must export ${component.wrapperExport} returning <${component.generatedExport} />`, component.wrapperPath);
    }
    const imports = mount.statements.filter((statement) => namedImport(
      statement,
      component.mountImportSpecifier,
      component.wrapperExport,
    ));
    let mounts = 0;
    const visit = (node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
        && ts.isIdentifier(node.tagName) && node.tagName.text === component.wrapperExport) mounts += 1;
      ts.forEachChild(node, visit);
    };
    for (const expression of returnedExpressions) visit(expression);
    if (imports.length !== 1 || mounts < 1) {
      fail(`mount must import and render ${component.wrapperExport}`, integration.mountPath);
    }
  }
}

function parseJson(content, filename) {
  let value;
  try { value = JSON.parse(content); } catch (error) { fail(`malformed JSON: ${error.message}`, filename); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('JSON root must be an object', filename);
  return value;
}

function protectedLockKeys(lock) {
  const packages = lock.packages;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) fail('lockfile packages map is invalid', 'package-lock.json');
  const pending = PROTECTED_DIRECT_PINS.map((name) => `node_modules/${name}`);
  const result = new Set();
  while (pending.length) {
    const key = pending.pop();
    if (result.has(key)) continue;
    const entry = packages[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`protected lock entry is missing: ${key}`, 'package-lock.json');
    result.add(key);
    for (const dependency of Object.keys(entry.dependencies ?? {})) pending.push(`node_modules/${dependency}`);
  }
  return [...result].sort();
}

export function validatePackageMetadata(candidateContents, baseContents) {
  const candidatePackage = parseJson(candidateContents['package.json'], 'package.json');
  const basePackage = parseJson(baseContents['package.json'], 'base:package.json');
  const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  for (const name of PROTECTED_DIRECT_PINS) {
    const expected = Object.fromEntries(dependencySections.map((section) => [section, basePackage[section]?.[name] ?? null]));
    const candidate = Object.fromEntries(dependencySections.map((section) => [section, candidatePackage[section]?.[name] ?? null]));
    if (typeof expected.devDependencies !== 'string' || JSON.stringify(candidate) !== JSON.stringify(expected)) {
      fail(`protected direct parser pin changed: ${name}`, 'package.json');
    }
  }
  const candidateLock = parseJson(candidateContents['package-lock.json'], 'package-lock.json');
  const baseLock = parseJson(baseContents['package-lock.json'], 'base:package-lock.json');
  if (candidateLock.lockfileVersion !== baseLock.lockfileVersion) fail('protected lockfile version changed', 'package-lock.json');
  const rootPins = (lock) => Object.fromEntries(PROTECTED_DIRECT_PINS.map((name) => [
    name,
    Object.fromEntries(dependencySections.map((section) => [section, lock.packages?.['']?.[section]?.[name] ?? null])),
  ]));
  const baseRootPins = rootPins(baseLock);
  if (JSON.stringify(rootPins(candidateLock)) !== JSON.stringify(baseRootPins)
    || Object.values(baseRootPins).some((sections) => typeof sections.devDependencies !== 'string')) {
    fail('protected root lock parser pins changed', 'package-lock.json');
  }
  const keys = protectedLockKeys(baseLock);
  const protectedNames = new Set(keys.map((key) => key.slice(key.lastIndexOf('node_modules/') + 13)));
  const relevantKeys = (lock) => Object.keys(lock.packages).filter((key) => {
    const marker = key.lastIndexOf('node_modules/');
    return marker >= 0 && protectedNames.has(key.slice(marker + 13));
  }).sort();
  if (JSON.stringify(protectedLockKeys(candidateLock)) !== JSON.stringify(keys)
    || JSON.stringify(relevantKeys(candidateLock)) !== JSON.stringify(relevantKeys(baseLock))) {
    fail('protected transitive lock closure changed', 'package-lock.json');
  }
  for (const key of keys) {
    if (JSON.stringify(candidateLock.packages[key]) !== JSON.stringify(baseLock.packages[key])) {
      fail(`protected lock entry changed: ${key}`, 'package-lock.json');
    }
  }
}
