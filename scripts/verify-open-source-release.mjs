import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function fail(message) {
  throw new Error(`[release:verify] ${message}`)
}

const packageMeta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const sourceManifest = JSON.parse(await readFile(path.join(root, 'gpl-source-manifest.json'), 'utf8'))

if (packageMeta.license !== 'GPL-2.0-or-later') fail(`package.json license must be GPL-2.0-or-later, got ${packageMeta.license}`)
if (packageMeta.dependencies?.['@ffmpeg/core'] !== '0.12.10') fail('@ffmpeg/core must remain pinned to 0.12.10 until the GPL source manifest is updated.')
if (sourceManifest.corePackage?.version !== '0.12.10') fail('gpl-source-manifest.json core version mismatch.')
if (sourceManifest.corePackage?.license !== 'GPL-2.0-or-later') fail('gpl-source-manifest.json core license mismatch.')
if (sourceManifest.corePackage?.releaseCommit !== '71aa99d37c02a7b4c435275ca9ef50e612f6efa1') fail('Unexpected @ffmpeg/core upstream release commit.')
if (sourceManifest.corePackage?.enableNonfree !== false) fail('The source manifest must explicitly record enableNonfree=false.')

const repositoryUrl = packageMeta.repository?.url ?? ''
if (!repositoryUrl.includes('hayata57/sakutio-silence-cutter')) fail('Public source repository URL is not configured in package.json.')

const requiredRootFiles = [
  'LICENSE',
  'COPYRIGHT.md',
  'THIRD_PARTY_NOTICES.md',
  'SOURCE.md',
  'OPEN_SOURCE_RELEASE.md',
  'gpl-source-manifest.json',
  'package-lock.json',
]
for (const relative of requiredRootFiles) {
  if (!(await exists(path.join(root, relative)))) fail(`Missing release file: ${relative}`)
}

const requiredPublicFiles = [
  'public/licenses/index.html',
  'public/licenses/gpl-2.0.txt',
  'public/licenses/SOURCE_INFO.txt',
  'public/licenses/THIRD_PARTY_LICENSES.txt',
]
for (const relative of requiredPublicFiles) {
  if (!(await exists(path.join(root, relative)))) fail(`Missing generated/public license file: ${relative}`)
}

const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8')
const requiredIgnoreEntries = [
  'node_modules/',
  'dist/',
  'public/ffmpeg-core-gpl/',
  'POC_TECH_NOTES.md',
  'WORK_PROGRESS.md',
  'release-source-bundle/',
  'Sakutio_Silence_Cutter_GPL_Source.zip',
]
for (const entry of requiredIgnoreEntries) {
  if (!gitignore.split(/\r?\n/).includes(entry)) fail(`.gitignore must contain: ${entry}`)
}

const notices = await readFile(path.join(root, 'public', 'licenses', 'THIRD_PARTY_LICENSES.txt'), 'utf8')
if (!notices.includes('Package: @ffmpeg/core@0.12.10')) fail('Generated third-party notices do not include @ffmpeg/core@0.12.10.')
if (!notices.includes('Declared license: GPL-2.0-or-later')) fail('Generated third-party notices do not record the GPL core license.')

const licensePage = await readFile(path.join(root, 'public', 'licenses', 'index.html'), 'utf8')
if (!licensePage.includes('https://github.com/hayata57/sakutio-silence-cutter')) fail('License page does not link to the public source repository.')

const dist = path.join(root, 'dist')
if (!(await exists(dist))) fail('dist/ does not exist. Run npm run build before release:verify.')

const distributed = [
  'ffmpeg-core-gpl/ffmpeg-core.js',
  'ffmpeg-core-gpl/ffmpeg-core.wasm',
  'licenses/index.html',
  'licenses/gpl-2.0.txt',
  'licenses/SOURCE_INFO.txt',
  'licenses/THIRD_PARTY_LICENSES.txt',
]

const hashLines = []
for (const relative of distributed) {
  const full = path.join(dist, ...relative.split('/'))
  if (!(await exists(full))) fail(`Built release is missing: dist/${relative}`)
  const buffer = await readFile(full)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  hashLines.push(`${sha256}  ${relative}`)
}

const distLicenses = path.join(dist, 'licenses')
await mkdir(distLicenses, { recursive: true })
await writeFile(path.join(distLicenses, 'DISTRIBUTED_ARTIFACTS.sha256'), `${hashLines.join('\n')}\n`, 'utf8')
console.log('[release:verify] PASS')
console.log('[release:verify] wrote dist/licenses/DISTRIBUTED_ARTIFACTS.sha256')
