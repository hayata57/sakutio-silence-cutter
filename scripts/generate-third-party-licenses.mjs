import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const outputDir = path.join(root, 'public', 'licenses')
const outputPath = path.join(outputDir, 'THIRD_PARTY_LICENSES.txt')
const projectLicensePath = path.join(root, 'LICENSE')
const projectSourcePath = path.join(root, 'SOURCE.md')

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function packagePathParts(name) {
  return name.startsWith('@') ? name.split('/') : [name]
}

async function findPackageDir(name, fromDir) {
  let cursor = fromDir
  while (true) {
    const candidate = path.join(cursor, 'node_modules', ...packagePathParts(name))
    if (await exists(path.join(candidate, 'package.json'))) return candidate
    if (cursor === root) break
    const parent = path.dirname(cursor)
    if (parent === cursor || !parent.startsWith(root)) break
    cursor = parent
  }
  const rootCandidate = path.join(root, 'node_modules', ...packagePathParts(name))
  if (await exists(path.join(rootCandidate, 'package.json'))) return rootCandidate
  throw new Error(`Runtime dependency not installed: ${name}`)
}

async function readLicenseFiles(packageDir) {
  const names = await readdir(packageDir)
  const candidates = names
    .filter((name) => /^(license|licence|copying|notice)(\.|$)/i.test(name))
    .sort((a, b) => a.localeCompare(b))
  const files = []
  for (const name of candidates) {
    const full = path.join(packageDir, name)
    try {
      const text = await readFile(full, 'utf8')
      if (text.trim()) files.push({ name, text: text.trimEnd() })
    } catch {
      // Ignore directories/binary files that match the name pattern.
    }
  }
  return files
}

const seen = new Map()

async function collectPackage(name, fromDir = root) {
  const packageDir = await findPackageDir(name, fromDir)
  const packageMeta = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
  const key = `${packageMeta.name}@${packageMeta.version}`
  if (seen.has(key)) return

  const record = {
    name: packageMeta.name,
    version: packageMeta.version,
    license: packageMeta.license ?? 'UNKNOWN',
    homepage: packageMeta.homepage ?? '',
    repository: typeof packageMeta.repository === 'string'
      ? packageMeta.repository
      : packageMeta.repository?.url ?? '',
    packageDir,
    licenseFiles: await readLicenseFiles(packageDir),
  }
  seen.set(key, record)

  for (const dependencyName of Object.keys(packageMeta.dependencies ?? {}).sort()) {
    await collectPackage(dependencyName, packageDir)
  }
}

for (const dependencyName of Object.keys(packageJson.dependencies ?? {}).sort()) {
  await collectPackage(dependencyName)
}

const core = [...seen.values()].find((item) => item.name === '@ffmpeg/core')
if (!core) throw new Error('@ffmpeg/core is missing from the runtime dependency graph.')
if (core.version !== '0.12.10') throw new Error(`Unexpected @ffmpeg/core version: ${core.version}`)
if (core.license !== 'GPL-2.0-or-later') throw new Error(`Unexpected @ffmpeg/core license: ${core.license}`)

const lines = []
lines.push('Sakutio Silence Cutter - Third-party license notices')
lines.push('Generated from the installed production dependency graph.')
lines.push(`Generated at: ${new Date().toISOString()}`)
lines.push('')
lines.push('Project license: GPL-2.0-or-later')
lines.push('Project source: https://github.com/hayata57/sakutio-silence-cutter')
lines.push('')
lines.push('IMPORTANT: @ffmpeg/core 0.12.10 is GPL-2.0-or-later.')
lines.push('Upstream release commit: 71aa99d37c02a7b4c435275ca9ef50e612f6efa1')
lines.push('See SOURCE_INFO.txt and the project gpl-source-manifest.json for source provenance.')
lines.push('')
lines.push('======================================================================')
lines.push('RUNTIME PACKAGES')
lines.push('======================================================================')

for (const record of [...seen.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))) {
  lines.push('')
  lines.push(`Package: ${record.name}@${record.version}`)
  lines.push(`Declared license: ${record.license}`)
  if (record.repository) lines.push(`Repository: ${record.repository}`)
  if (record.homepage) lines.push(`Homepage: ${record.homepage}`)
  if (record.licenseFiles.length === 0) {
    lines.push('License file: not found in installed npm package; see declared license and upstream repository.')
  } else {
    for (const licenseFile of record.licenseFiles) {
      lines.push('')
      lines.push(`--- ${licenseFile.name} ---`)
      lines.push(licenseFile.text)
    }
  }
  lines.push('')
  lines.push('----------------------------------------------------------------------')
}

await mkdir(outputDir, { recursive: true })
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
await writeFile(path.join(outputDir, 'gpl-2.0.txt'), await readFile(projectLicensePath, 'utf8'), 'utf8')
await writeFile(path.join(outputDir, 'SOURCE_INFO.txt'), await readFile(projectSourcePath, 'utf8'), 'utf8')
console.log(`[licenses] wrote ${path.relative(root, outputPath)} (${seen.size} runtime packages)`)
