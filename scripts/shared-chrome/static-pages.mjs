import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { verifyInstalled } from './verify-installed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS_URL = '/shared-chrome/static-chrome.css';
const slots = ['sakutio-global-header', 'sakutio-global-footer'];
function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}
function legacyScript(node) {
  if (node.tagName !== 'script') return false;
  const src = node.attrs.find((a) => a.name === 'src')?.value;
  if (!src) return false;
  let url;
  try { url = new URL(src, 'https://sakutio.com/'); } catch { return false; }
  return /\/sakutio-global-(?:header|footer)(?:-[a-f0-9]+)?\.js$/iu.test(url.pathname);
}

// Edit source offsets only: article text, metadata, JSON-LD and unrelated scripts stay byte-identical.
export function renderStaticPage(html, { header, footer }, required = false) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const found = [[], []];
  const scripts = [];
  let head;
  walk(document, (node) => {
    const index = slots.indexOf(node.tagName);
    if (index >= 0) found[index].push(node);
    if (legacyScript(node)) scripts.push(node);
    if (node.tagName === 'head') head = node;
  });
  if (!required && !found.flat().length && !scripts.length) return null;
  if (found.some((nodes) => nodes.length !== 1) || !head?.sourceCodeLocation?.endTag) {
    throw new Error('Static page must have exactly one explicit header/footer slot and head');
  }
  const edits = [];
  for (const [index, nodes] of found.entries()) {
    const node = nodes[0];
    const loc = node.sourceCodeLocation;
    if (!loc?.endTag || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      throw new Error('Invalid static Chrome slot');
    }
    let ancestor = node.parentNode;
    while (ancestor && ancestor.tagName !== 'body') ancestor = ancestor.parentNode;
    if (!ancestor) throw new Error('Static Chrome slot must be in the document body');
    edits.push({ start: loc.startOffset, end: loc.endOffset, value: index === 0 ? header : footer });
  }
  for (const node of scripts) {
    const loc = node.sourceCodeLocation;
    if (!loc?.endTag) throw new Error('Invalid legacy script element');
    edits.push({ start: loc.startOffset, end: loc.endOffset, value: '' });
  }
  const offset = head.sourceCodeLocation.endTag.startOffset;
  edits.push({ start: offset, end: offset, value: `<link rel="stylesheet" href="${CSS_URL}">\n` });
  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start < edits[i - 1].end) throw new Error('Overlapping static Chrome elements');
  }
  let result = html;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  let remaining = false;
  walk(parse(result), (node) => { if (slots.includes(node.tagName) || legacyScript(node)) remaining = true; });
  if (remaining) throw new Error('Legacy Chrome remains after rendering');
  return result;
}

async function htmlFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink in static page tree: ${entry.name}`);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await htmlFiles(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile() && entry.name.endsWith('.html')) result.push(relative);
  }
  return result.sort();
}

export async function buildStaticPages(root = ROOT, verify = false) {
  const { artifacts } = await verifyInstalled(root);
  const chrome = { header: artifacts.files['source/header.html'], footer: artifacts.files['source/footer.html'] };
  const outputs = new Map();
  for (const relative of await htmlFiles(path.join(root, 'public'))) {
    const source = await readFile(path.join(root, 'public', relative), 'utf8');
    const rendered = renderStaticPage(source, chrome, relative.startsWith('guide/'));
    if (rendered !== null) outputs.set(relative, rendered);
  }
  if (outputs.size) outputs.set(CSS_URL.slice(1), artifacts.files['shared-chrome.css']);
  for (const [relative, content] of outputs) {
    const dest = path.join(root, 'dist', relative);
    if (verify) {
      if (await readFile(dest, 'utf8') !== content) throw new Error(`Static Chrome output is missing or stale: ${relative}`);
    } else {
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, content, 'utf8');
    }
  }
  // Check the complete published HTML tree, including pages outside public/guide.
  for (const relative of await htmlFiles(path.join(root, 'dist'))) {
    const html = await readFile(path.join(root, 'dist', relative), 'utf8');
    walk(parse(html), (node) => {
      if (legacyScript(node) || slots.includes(node.tagName)) throw new Error(`Legacy Chrome in published page: ${relative}`);
    });
  }
  return outputs.size ? outputs.size - 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`[static-chrome] ${process.argv.includes('--verify') ? 'Verified' : 'Rendered'} ${await buildStaticPages(ROOT, process.argv.includes('--verify'))} static pages`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
