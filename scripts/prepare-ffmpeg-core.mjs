import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceCandidates = [
  path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
  path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd'),
]
const destination = path.join(root, 'public', 'ffmpeg-core-gpl')

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

const source = (await Promise.all(sourceCandidates.map(async (candidate) => [candidate, await exists(candidate)])))
  .find(([, found]) => found)?.[0]

if (!source) {
  throw new Error('@ffmpeg/core が見つかりません。先に npm install を実行してください。')
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(path.join(source, 'ffmpeg-core.js'), path.join(destination, 'ffmpeg-core.js'))

const wasm = await readFile(path.join(source, 'ffmpeg-core.wasm'))
const gzipped = gzipSync(wasm, { level: 9 })
await writeFile(path.join(destination, 'ffmpeg-core.wasm.gz'), gzipped)

console.log(`[prepare:core] copied ffmpeg-core.js and wrote ffmpeg-core.wasm.gz (${gzipped.length} bytes) from ${source}`)
