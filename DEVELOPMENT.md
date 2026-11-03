# 開発ガイド

このアプリは React + TypeScript + Vite で動作する静的Webアプリです。バックエンドは使用しません。

## 必要なもの

- Node.js 22（GitHub Actionsと同じバージョンを推奨）
- npm（Node.jsに付属）
- Git

バージョンは次のコマンドで確認できます。

```powershell
node --version
npm --version
```

## 初回セットアップ

PowerShellまたはターミナルでプロジェクトのフォルダーへ移動し、依存パッケージをインストールします。

```powershell
cd D:\dev\Pathlock
npm ci
```

`npm ci` は `package-lock.json` に記録されたバージョンでインストールします。依存パッケージを変更した場合は `npm install` を使い、その変更と更新されたロックファイルを一緒に保存してください。

## 開発サーバーの起動

```powershell
npm run dev
```

ターミナルに表示されたURL（通常は `http://localhost:5173/`）をブラウザーで開きます。ソースを保存すると、開発サーバーが変更を反映します。終了するときはターミナルで `Ctrl+C` を押します。

## ビルドと動作確認

本番用ビルドを作成します。TypeScriptのチェックもこのコマンドに含まれます。

```powershell
npm run build
```

生成物は `dist` フォルダーに出力されます。ビルドした内容をローカルで確認するには、次を実行し、表示されたURLを開きます。

```powershell
npm run preview
```

## GitHub Pages向けのビルド

GitHub Actionsはリポジトリ名に合わせたパスを設定してビルド・デプロイします。ローカルで同様のパスを確認する場合は、`Pathlock` をGitHubリポジトリ名に置き換えて実行します。

```powershell
$env:VITE_BASE_PATH = "/Pathlock/"
npm run build
Remove-Item Env:VITE_BASE_PATH
```

`VITE_BASE_PATH` を設定しない場合、通常のローカル開発・ビルドでは `/` が使われます。

## GitHub Pagesへのデプロイ

1. 変更をGitHubリポジトリの `main` ブランチへpushします。
2. GitHubリポジトリの **Settings → Pages** を開き、公開元を **GitHub Actions** にします。
3. **Actions** タブで `Deploy to GitHub Pages` の実行結果を確認します。

ワークフローは `main` へのpush、またはActions画面からの手動実行でビルドとデプロイを行います。

## 主なファイル

| パス | 用途 |
|---|---|
| `src/` | React画面、データ型、データ読み込み |
| `patchnote/` | デプロイ時にJSONへ変換するパッチノート原文 |
| `public/images/heroes/` | ヒーロー画像 |
| `public/images/items/` | アイテム画像 |
| `public/images/abilities/` | ヒーローのスキルアイコン |
| `vite.config.ts` | パッチノートJSON生成とViteの公開パス設定 |
| `.github/workflows/deploy.yml` | GitHub Pagesへの自動デプロイ |

標準パッチを追加・更新する際は、原文テキストを `patchnote/` 直下に追加します。対象ファイルは `.txt`、`.text` または拡張子なしです。ファイル名（拡張子を除いた部分）がパッチ名として表示されます。ファイル名を `patchnote_YYYYMMDD.txt` の形式にすると、その日付が公開日に使われます。デプロイ用ビルド時に原文が解析され、パッチJSONと一覧ファイルが `dist/data/patches/` に生成されます。アプリは生成済みJSONを読み込み時に検証します。ローカル開発サーバーでも同じ原文からJSONを生成して配信するため、標準パッチJSONを手作業で作成・登録する必要はありません。

原文に `General:`、`Items:`、`Heroes:`、`Street Brawl:` などの見出しがない変更は、`src/data/patchAttributeMaster.ts` の分類マスタを使って対象名から分類します。マスタに登録されていない対象や分類できない行は `Another` に分類されます。対象を追加・更新する場合は、このマスタも更新してください。

原文に `- URL: https://...` を記載すると、そのURLがパッチJSONの `URL` として保存され、Archiveの「原文」リンクに使われます。

個別変更の評価は、変更行に `[BalanceAssessment:"nerf"]` のような注釈を付けて指定します。指定できる値は `buff`、`nerf`、`adjust`、`unrated`（小文字）です。注釈は構造化された変更説明から除かれますが、根拠となる原文行には残ります。注釈は子変更だけに適用し、親グループの評価は自動設定しません。注釈がない行は `unrated` になり、不正な値や複数注釈はビルド警告となって `unrated` として扱われます。

開発サーバーではArchive画面の「Assessments」から、パッチと個別変更の評価を選択してまとめて保存できます。保存すると `patchnote/` の原文が更新されます。この画面と保存APIは開発環境でのみ有効で、本番ビルドには含まれません。

Settings画面（`/settings`）も開発環境でのみ利用できます。本番ビルドではメニューに表示されず、URLへ直接アクセスしてもArchive画面へ戻ります。

将来Assessmentの自動設定を実装する際の判断基準は [`assessment-criteria.md`](./assessment-criteria.md) を参照してください。現状の評価は引き続き原文の注釈で手動設定します。

ヒーローとアイテムの画像は `public/images/heroes/` と `public/images/items/` に置きます。ヒーロー画像はパッチデータの `entityId` に `.png` を付けた名前です（例: `Abrams` は `heroes/abrams.png`）。アイテム画像は `entityId` を小文字化し、`-` を `_` に置き換えた名前に `.png` を付けます（例: `Shadow Weave` は `items/shadow_weave.png`）。画像がない対象には各ディレクトリの `placeholder.svg` が表示されます。

アイテム名や画像ファイル名の一部に通常ルールと異なる記号・区切りが使われていて、画像が表示されない場合は、実際のパッチ原文・生成される `entityId`・画像ファイル名を確認してください。画像の実ファイル名が通常ルールと異なるときは、`src/PatchImages.tsx` の `ITEM_IMAGE_ID_OVERRIDES` に対応を追加します。キーにはパッチデータの `entityId`、値には `public/images/items/` 内の画像ファイル名（拡張子なし）を指定します。たとえば `High-Velocity Rounds` は `entityId` が `high-velocity-rounds`、画像ファイル名が `high-velocity_rounds.png` なので、`"high-velocity-rounds": "high-velocity_rounds"` と登録します。`Hunter's Aura` も同様に `"hunter-s-aura": "hunter's_aura"` と登録されています。例外を追加したら、該当画像が表示されることと `npm run build` が成功することを確認してください。

ヒーローのスキルアイコンは `public/images/abilities/{heroId}/{skill_name}.png` に置きます。ヒーローIDとスキル名は小文字化し、単語間をアンダースコアでつなぎます。アイコンがない場合も一覧の表示位置は維持されます。

## 画面とブラウザーデータ

画面は Dashboard、Patch Archive、Search の3つです。Data Management画面はありません。既存のユーザーパッチとOverrideはブラウザーのIndexedDBに保持され、ArchiveとSearchで読み込まれますが、画面からの新規登録・編集・削除やバックアップのインポート・エクスポートには対応していません。標準パッチは `patchnote/` の原文を更新してビルド・デプロイします。

## 利用できるnpmコマンド

| コマンド | 用途 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 型チェックを行い、本番用にビルド |
| `npm run preview` | 本番ビルドをローカルでプレビュー |
