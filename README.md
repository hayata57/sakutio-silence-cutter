# Sakutio 無音カッター

音声・動画から長い無音を検出し、候補を確認してから選択した無音だけをカットするブラウザアプリです。ファイルはブラウザ内で処理します。

## 作業場所

Windowsでは次へ配置して使用する想定です。

```text
D:\My_app\_projects\Sakutio\Silence-Cutter\app
```

## 起動

```powershell
cd D:\My_app\_projects\Sakutio\Silence-Cutter\app
npm install
npm run test
npm run lint
npm run typecheck
npm run build
npm run dev
```

`npm run dev` / `npm run build` の前に、`@ffmpeg/core` のJSを `public/ffmpeg-core-gpl/` へコピーし、WASMはgzip圧縮して同じ場所へ置きます。アプリはHTTP展開に頼らず、ブラウザでgzipを展開します。このディレクトリは大容量のためGit管理対象外です。

## 対応入力

- 音声: MP3 / WAV / M4A
- 動画: MP4 / MOV

「拡張子だけ読めれば対応済み」とは扱いません。内部コーデックによって、ブラウザの確認再生可否とFFmpegの読込可否は異なります。

## 画面の流れ

1. ファイルを追加
2. 無音判定を設定
3. 無音部分を調べる
4. 検出結果を確認
5. 無音区間を確認・選択
6. この内容で無音をカット
7. 完成ファイルを保存

PC/スマホで並び順を変えず、常に1→7を上から追う構成です。

## 無音判定の初期値

- 控えめ: -50 dB / 1.0秒
- 標準: -40 dB / 0.8秒
- 強め: -35 dB / 0.5秒
- カット前後に残す無音（合計）: 0.2秒

0.2秒は前後合計です。内部では約0.1秒ずつ前後に残します。

詳細設定の入力範囲は、判定音量 -80〜-10 dB、最低無音時間 0.1〜10秒です。

## 確認再生

- 元メディアのObject URLを1個だけ作成。
- `<audio>` / `<video>` も共有プレイヤー1個だけ使用。
- 一覧の「▶ 確認」で対象区間の前後を含めてシーク再生。
- 選択肢は10 / 20 / 30秒、初期20秒。
- 最大30秒。たとえば2秒の無音を30秒で確認する場合、通常は約14秒前 + 2秒 + 約14秒後。

## FFmpeg coreについて（重要）

動画の正確な再エンコードカットのため、`@ffmpeg/core@0.12.10` を使用します。このcoreはGPL系の構成です。

公開版は **GPLルート** です。初期公開では `@ffmpeg/core@0.12.10` の通常coreを使い、MP4/MOVはlibx264 + AACで正確さ優先の再エンコードを行います。GPLのソース提供・ライセンス表示・第三者ライセンス整理は公開資料として維持します。

ローカル開発記録 `POC_TECH_NOTES.md` と作業進捗 `WORK_PROGRESS.md` は公開GitHub / GPL source bundleには含めません。公開ソースの再現に必要な情報は `README.md`、`SOURCE.md`、`OPEN_SOURCE_RELEASE.md`、`gpl-source-manifest.json` に集約します。

## GPL公開用の構成

公開版は `GPL-2.0-or-later` として扱います。通常開発のbuildと、公開直前のGPL確認を分離しています。

公開前に実行するコマンド:

```powershell
npm ci
npm run release:prepare
npm run release:sources
```

- `release:prepare`: test → lint → typecheck → production dependencyのライセンス本文生成 → build → 公開ファイルとSHA-256検査までを一括実行。
- `release:sources`: Sakutio本体ソースと `@ffmpeg/core@0.12.10` のupstream build入力をまとめたGPL source ZIPを作成。
- `/licenses/`: 公開サイト上のライセンス・ソース案内ページ。

公開時の正本チェックは `OPEN_SOURCE_RELEASE.md`、source provenanceは `SOURCE.md` と `gpl-source-manifest.json` を参照してください。

`@ffmpeg/core` のversionを変更する場合、単にpackage.jsonだけ更新してはいけません。対応するupstream release commit / build inputs / source bundleを同時に更新します。
