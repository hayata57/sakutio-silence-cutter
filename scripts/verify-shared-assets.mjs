import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SHARED_FILES = ['sakutio-brand-v1.css']

export function attribute(tag, name) {
  const matches = [...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi'))]
  if (matches.length !== 1) return null
  return matches[0][2]
}

export function resourceTags(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').match(/<(?:script|link)\b[^>]*>/gi) ?? []
}

export function verifySharedAssets(root, { built = false } = {}) {
  const manifest = JSON.parse(readFileSync(new URL('public/shared-pinned/manifest.json', root), 'utf8'))
  const prefix = built ? 'dist/' : 'public/'
  const html = readFileSync(new URL(built ? 'dist/index.html' : 'index.html', root), 'utf8')
  const tags = resourceTags(html)
  if (manifest.assets?.length !== SHARED_FILES.length) throw new Error('Expected exactly one shared brand asset.')
  for (const sourceFile of SHARED_FILES) {
    const assets = manifest.assets.filter(asset => asset.source === `https://sakutio.com/shared/${sourceFile}`)
    if (assets.length !== 1) throw new Error(`Missing or duplicate shared asset: ${sourceFile}`)
    const asset = assets[0]
    if (!/^[\w-]+\.(js|css)$/.test(asset.file)) throw new Error(`Invalid shared asset filename: ${asset.file}`)
    const bytes = readFileSync(new URL(`${prefix}shared-pinned/${asset.file}`, root))
    const hash = createHash('sha256').update(bytes).digest('hex')
    const expectedFile = sourceFile.replace(/(\.[^.]+)$/, `-${hash.slice(0, 12)}$1`)
    if (hash !== asset.sha256 || asset.file !== expectedFile) {
      throw new Error(`Shared asset snapshot changed: ${asset.file}. Review and explicitly run pin:shared; builds never regenerate hashes.`)
    }
    const matches = tags.filter(tag => /^<link\b/i.test(tag)
      && attribute(tag, 'href') === `/shared-pinned/${asset.file}`)
    if (matches.length !== 1) {
      throw new Error(`Missing or duplicate shared asset HTML tag: ${asset.file}`)
    }
  }
  for (const tag of tags.filter(tag => /^<script\b/i.test(tag))) {
    const src = attribute(tag, 'src')
    if (/sakutio\.com\/shared\/sakutio-global-(?:header|footer)\.js/i.test(src ?? '')) {
      throw new Error('The processing page must not load the shared Header/Footer JavaScript.')
    }
    if (/^(?:https?:)?\/\//i.test(src ?? '')) throw new Error('The processing page must not load a remote script. Review deployment-injected scripts separately.')
    if (src?.startsWith('/shared-pinned/') && !manifest.assets.some(asset => src === `/shared-pinned/${asset.file}`)) {
      throw new Error(`Unlisted shared script: ${src}`)
    }
  }
  console.log(`[shared-assets] ${built ? 'built' : 'source'} brand snapshot verified; no network fetch`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg => arg !== '--dist')) throw new Error('Usage: verify-shared-assets.mjs [--dist]')
  verifySharedAssets(new URL('../', import.meta.url), { built: process.argv.includes('--dist') })
}
