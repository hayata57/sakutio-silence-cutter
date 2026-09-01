# Third-party notices

Last reviewed: 2026-08-31

This document records the third-party software that is relevant to the browser
application and, separately, to the distributed FFmpeg WebAssembly core.
`npm run licenses:generate` creates a release-time notice file from the exact
packages installed in `node_modules`.

## Application runtime packages

| Package | Version pinned by this project | License | Upstream |
| --- | --- | --- | --- |
| `@ffmpeg/core` | `0.12.10` | GPL-2.0-or-later | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `@ffmpeg/ffmpeg` | `0.12.15` | MIT | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `@ffmpeg/util` | `0.12.2` | MIT | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `react` | `19.2.8` | MIT | https://github.com/facebook/react |
| `react-dom` | `19.2.8` | MIT | https://github.com/facebook/react |

Transitive runtime dependencies are not maintained by hand in this table.
The release-time generated file `public/licenses/THIRD_PARTY_LICENSES.txt`
recursively walks the installed production dependency graph and includes the
license text files found in the installed packages.

## `@ffmpeg/core@0.12.10` provenance

The npm package declares `GPL-2.0-or-later`. The upstream release commit is:

- Repository: https://github.com/ffmpegwasm/ffmpeg.wasm
- Commit: `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`
- Commit message: `RELEASE: @ffmpeg/core and @ffmpeg/core-mt v0.12.10`
- FFmpeg source selected by that build: `n5.1.4`
- The release Dockerfile passes `--enable-gpl` and enables x264/x265 and other
  external libraries.
- The release Dockerfile does **not** pass `--enable-nonfree`.

The exact upstream build inputs recorded from that release are listed in
`gpl-source-manifest.json`.

## Important distribution note

Sakutio redistributes `ffmpeg-core.js` and a gzip-precompressed
`ffmpeg-core.wasm.gz` from the official `@ffmpeg/core@0.12.10` npm package.
After HTTP gzip decompression the WebAssembly bytes are identical to the
unmodified `ffmpeg-core.wasm` in that package. For a public release, do not rely only on an
upstream web link disappearing in the future. Run the GPL source bundle step
and retain/upload the resulting source archive together with the corresponding
Sakutio release. See `OPEN_SOURCE_RELEASE.md` and `SOURCE.md`.

This file is an engineering compliance record, not legal advice.
