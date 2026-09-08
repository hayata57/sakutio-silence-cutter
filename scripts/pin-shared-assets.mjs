import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SHARED_FILES, attribute, resourceTags, verifySharedAssets } from './verify-shared-assets.mjs'

// Explicit review-time operation only. Never run this automatically during build.
// The argument is a directory containing the reviewed canonical brand stylesheet.
if (process.argv.length !== 3) throw new Error('Usage: npm run pin:shared -- <reviewed-shared-directory>')
const root = new URL('../', import.meta.url)
const manifestURL = new URL('public/shared-pinned/manifest.json', root)
const htmlURL = new URL('index.html', root)
const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'))
let html = readFileSync(htmlURL, 'utf8')
const updates = SHARED_FILES.map(sourceFile => {
  const matches = manifest.assets.filter(asset => asset.source === `https://sakutio.com/shared/${sourceFile}`)
  if (matches.length !== 1) throw new Error(`Missing or duplicate shared asset: ${sourceFile}`)
  const old = matches[0]
  const bytes = Buffer.from(readFileSync(path.resolve(process.argv[2], sourceFile), 'utf8').replace(/\r\n/g, '\n'))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const file = sourceFile.replace(/(\.[^.]+)$/, `-${sha256.slice(0, 12)}$1`)
  const tags = resourceTags(html).filter(tag => /^<link\b/i.test(tag)
    && attribute(tag, 'href') === `/shared-pinned/${old.file}`)
  if (tags.length !== 1) throw new Error(`Expected one existing shared asset tag: ${old.file}`)
  const tag = tags[0].replace(`/shared-pinned/${old.file}`, `/shared-pinned/${file}`)
  return { asset: { source: old.source, file, sha256 }, bytes, oldTag: tags[0], tag }
})
// Read and validate every source/tag before writing anything. Keep old snapshots;
// removing them is a separate review decision for old HTML/cache compatibility.
for (const update of updates) {
  html = html.replace(update.oldTag, update.tag)
}
for (const { asset, bytes } of updates) writeFileSync(new URL(`public/shared-pinned/${asset.file}`, root), bytes)
manifest.assets = updates.map(update => update.asset)
manifest.reviewedAt = new Date().toISOString().slice(0, 10)
writeFileSync(manifestURL, `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(htmlURL, html)
verifySharedAssets(root)
console.log('[shared-assets] reviewed local brand copy, filename and manifest updated. Review the diff before deployment.')
