# Sakutio 無音カッター - GPL公開チェック

最終更新: 2026-08-31

このファイルは「公開直前に何を確認すればよいか」を1か所へ集約するための運用メモです。
通常の開発では毎回実行する必要はありません。

## 固定方針

- アプリ本体: `GPL-2.0-or-later`。
- 公開ソース候補: `https://github.com/hayata57/sakutio-silence-cutter`。
- FFmpeg runtime core: npm `@ffmpeg/core@0.12.10` を改変せず配信。Pagesの25MiB制限のため WASM は gzip 事前圧縮し、HTTP Content-Encodingには依存せずアプリ側で展開する。展開後バイトは公式coreと一致させる。
- coreのnpm declared license: `GPL-2.0-or-later`。
- 対応するupstream release commit: `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`。
- WebMは初期公開対象外。ただし公式coreバイナリ自体に含まれる第三者ライブラリのソース/ライセンス記録は省略しない。

## 公開前の必須確認

1. GitHub repository `hayata57/sakutio-silence-cutter` を作成し、**public** にする。
2. productionへ出すcommitへrelease tagを付ける（例: `v1.0.0`）。
3. `package-lock.json` をrelease commitへ必ず含める。
4. `npm ci` を使いlockfileどおりの依存を復元する。
5. `npm run release:prepare` を実行する。test / lint / typecheck / license生成 / build / release verifyはこの1コマンドで実行される。
6. `npm run release:sources` を実行し、GPL source ZIPを作成する。
7. source ZIPを同じGitHub Releaseへ添付するか、同等に継続取得できる場所へ置く。
8. `dist/licenses/DISTRIBUTED_ARTIFACTS.sha256` と実際の配信ファイルのhashが一致することを保存する。
9. 本番 `/licenses/` を直接開き、GPL本文・third-party licenses・source情報の3リンクが200になることを確認する。
10. 本番 `/licenses/` からGitHub source repositoryへ到達できることを確認する。
11. `@ffmpeg/core` のversionを変更した場合は、**必ず** `gpl-source-manifest.json` とsource ZIPを作り直す。
12. `--enable-nonfree` を含む独自coreへ将来切り替えない。coreを変更する場合は再監査する。

## リリースコマンド

```powershell
npm ci
npm run release:prepare
npm run release:sources
```

`release:prepare` は test → lint → typecheck → third-party license生成 → production build → 公開用ファイル構成/SHA-256検査を順に実行します。

## 公開GitHubへ入れるもの / 入れないもの

公開repositoryには、配布物を再現・確認するために必要なソースと設定を入れます。

**公開する:**

- `src/`, `scripts/`, `public/`（ただし生成coreは除外）
- `package.json`, releaseで使用した `package-lock.json`
- TypeScript / Vite設定、`index.html`
- `LICENSE`, `COPYRIGHT.md`, `THIRD_PARTY_NOTICES.md`
- `README.md`, `SOURCE.md`, `OPEN_SOURCE_RELEASE.md`, `gpl-source-manifest.json`

**公開しない（ローカル開発用）:**

- `POC_TECH_NOTES.md`
- `WORK_PROGRESS.md`
- `node_modules/`, `dist/`, `.vite/`, coverage、ログ、一時テスト媒体
- `public/ffmpeg-core-gpl/`（npm packageからrelease/build時に再生成）
- `release-source-bundle/` と `Sakutio_Silence_Cutter_GPL_Source.zip`（GitHub Release等へ成果物として添付し、repository本体にはcommitしない）

`.gitignore` でこの境界を固定し、`release:verify` でも主要な除外設定を検査します。

## 配布時に残すもの

- release commit / tag
- `package-lock.json`
- `LICENSE`
- `COPYRIGHT.md`
- `THIRD_PARTY_NOTICES.md`
- `SOURCE.md`
- `gpl-source-manifest.json`
- `public/licenses/` の公開ファイル
- `dist/licenses/DISTRIBUTED_ARTIFACTS.sha256`
- `npm run release:sources` が生成したGPL source ZIP

## 未解決として扱うもの

- H.264の特許/特許プール等の論点はGPLの著作権ライセンスとは別問題。必要なら公開前に別途確認する。
- これは技術・運用上のコンプライアンス構成であり、法律相談の代替ではない。
