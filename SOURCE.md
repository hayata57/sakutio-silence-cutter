# Source code availability

Sakutio 無音カッター is distributed under **GPL-2.0-or-later**.

## Sakutio application source

Public source repository planned for release:

https://github.com/hayata57/sakutio-silence-cutter

Before the production site is published, this repository must exist and be
public. The repository should contain the source corresponding to the deployed
site, including `package.json`, the lockfile used for the release, build scripts,
license documents, and the release tag/commit.

## Distributed FFmpeg WebAssembly core

The browser receives these files at runtime:

- `/ffmpeg-core-gpl/ffmpeg-core.js`
- `/ffmpeg-core-gpl/ffmpeg-core.wasm`

They are copied without Sakutio modification from the installed npm package:

- package: `@ffmpeg/core`
- version: `0.12.10`
- declared license: `GPL-2.0-or-later`
- upstream release commit: `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`
- upstream repository: https://github.com/ffmpegwasm/ffmpeg.wasm

The build inputs visible in the upstream release Dockerfile are recorded in
`gpl-source-manifest.json`.

## Preparing the release source archive

On Windows, after Git and PowerShell are available:

```powershell
npm run release:sources
```

The script creates a source bundle containing:

1. The current Sakutio application source required for the public release
   (excluding generated binaries, caches, and local-only development records).
2. The exact ffmpeg.wasm release commit used for `@ffmpeg/core@0.12.10`.
3. The third-party source repositories referenced by that upstream Dockerfile,
   checked out at the recorded tag/ref or pinned commit.
4. A manifest containing the actually resolved Git commit for every checkout.
   When run from the public Sakutio Git checkout, the Sakutio application commit
   is recorded there as well.

Keep the generated source ZIP with the matching deployed release. If the
runtime core version changes, update the source manifest and create a new source
bundle. Never reuse an old source bundle for a different WebAssembly binary.

## Release hashes

`npm run release:prepare` writes SHA-256 hashes for the distributed FFmpeg JS/WASM
and license files into the built `dist/licenses/` directory. Keep those hashes
with the release record so the exact distributed artifacts can be identified.

## Local-only development records

`POC_TECH_NOTES.md` and `WORK_PROGRESS.md` are development records, not build
inputs required to reproduce the released application. They are intentionally
excluded from the public Git repository and from the GPL source archive. Public
release provenance and build instructions must therefore be kept in the files
listed above rather than only in those local notes.
