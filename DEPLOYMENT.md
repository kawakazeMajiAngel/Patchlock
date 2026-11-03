# SourcetreeからGitHub Pagesへデプロイする手順

このプロジェクトは、GitHub Actionsを使ってGitHub Pagesへデプロイします。`main`ブランチへpushすると自動でビルド・公開されます。SourcetreeではGitHubアカウントのパスワード認証ではなく、SSH鍵を使ってpushします。

## 前提

- Sourcetreeがインストール済みであること
- デプロイ先として使うGitHubアカウントが作成済みであること
- GitHub上に、デプロイ先リポジトリを作成できること
- このプロジェクトのローカルファイルがあること

GitHub Desktopで使用しているアカウントとは別のアカウントでも、SSH鍵とリモートURLを分けて設定すれば利用できます。以下では新しいアカウント用のSSH接続名を `github-new`、鍵ファイル名を `id_ed25519_github_new` とします。

## 1. 新しいアカウント用のSSH鍵を作成する

PowerShellを開き、SSH鍵を保存するフォルダーを作成します（既に存在する場合もこのコマンドで問題ありません）。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh"
```

続けて、新しいGitHubアカウントに登録したメールアドレスを指定してSSH鍵を作成します。

```powershell
ssh-keygen -t ed25519 -C "新しいアカウントのメールアドレス" -f "$env:USERPROFILE\.ssh\id_ed25519_github_new"
```

パスフレーズを設定した場合は、安全な場所に控えてください。既存のSSH鍵を使っている場合も、ここでは別のファイル名を指定することで鍵を使い分けられます。

次に、PowerShellでSSH設定ファイルを開きます。

```powershell
notepad "$env:USERPROFILE\.ssh\config"
```

ファイルが存在しない場合は、メモ帳で作成するか確認されたら作成します。ファイル名は `config`（`.txt` は付けない）にしてください。既に設定がある場合は内容を消さず、末尾に次の設定を追加します。`Host` の値は接続確認コマンドに指定する名前と完全に一致させます。

```sshconfig
Host github-new
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github_new
    IdentitiesOnly yes
```

公開鍵をクリップボードにコピーします。

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_github_new.pub" | Set-Clipboard
```

新しいGitHubアカウントにログインし、**Settings → SSH and GPG keys → New SSH key** を開きます。コピーした公開鍵を貼り付けて登録してください。秘密鍵（`.pub` が付かないファイル）は他人に共有したり、GitHubへ登録したりしないでください。

接続を確認します。

```powershell
ssh -T git@github-new
```

初回接続時にホスト鍵の確認が表示された場合は、接続先が `github.com` であることを確認してから続行します。認証成功と新しいアカウント名を示すメッセージが表示されれば設定完了です。

## 2. GitHubに空のリポジトリを作成する

新しいGitHubアカウントでログインし、リポジトリを作成します。既存のローカルプロジェクトをpushする場合は、README、ライセンス、`.gitignore` をGitHub側で追加せず、空のリポジトリとして作成してください。

リポジトリ名を決めます。たとえば `Patchlock` とします。リポジトリのSSH URLが次の形式なら、

```text
git@github.com:アカウント名/Patchlock.git
```

ホスト名をSSH設定の別名 `github-new` に置き換えたURLを使います。

```text
git@github-new:アカウント名/Patchlock.git
```

## 3. Sourcetreeでローカルリポジトリを設定する

1. Sourcetreeの **Tools → Options → Git** を開き、SSHクライアントを **OpenSSH** に設定します。メニュー名や場所はSourcetreeのバージョンにより異なる場合があります。PuTTY/Plinkを使っている場合は、ここで作成したOpenSSHの設定が使われないことがあります。
2. Sourcetreeでこのプロジェクトのフォルダーを開きます。まだGitリポジトリになっていない場合は、Sourcetreeからローカルリポジトリを作成します。
3. 変更をステージし、コミットします。必要に応じてコミット時の名前とメールアドレスを設定します。これはコミットに記録される作者情報であり、GitHubへのSSH認証アカウントとは別の設定です。
4. Sourcetreeのリポジトリ設定からリモートを追加し、リモート名を `origin`、URLを `git@github-new:アカウント名/Patchlock.git` の形式で指定します。既にリモートがある場合は、そのURLを新しいアカウント用のURLに変更します。
5. ブランチ名が `main` であることを確認します。別の名前の場合は、ブランチ名を `main` に変更するか、GitHub Actionsのワークフロー対象ブランチを合わせる必要があります。
6. Sourcetreeの **Push** を選び、ローカルの `main` をリモートの `main` にpushします。初回pushでは、Sourcetreeの画面で `main` の追跡先（upstream）も設定します。

## 4. GitHub Pagesを有効にする

GitHubで作成したリポジトリを開き、**Settings → Pages** に移動します。公開元を **GitHub Actions** に設定してください。

## 5. デプロイ結果を確認する

`main` へのpushを契機に、Actionsの `Deploy to GitHub Pages` ワークフローが実行されます。リポジトリの **Actions** タブを開き、最新の実行が成功したことを確認します。初回公開には少し時間がかかる場合があります。

公開URLは通常、次の形式です。

```text
https://アカウント名.github.io/リポジトリ名/
```

このプロジェクトのワークフローは、リポジトリ名に合わせた公開パスを設定してビルドします。サイトが表示されない場合は、Actionsの実行結果とエラーログを確認してください。

## 次回以降の更新

1. ファイルを編集します。
2. Sourcetreeで変更をステージしてコミットします。
3. `main` ブランチを `origin` へpushします。
4. GitHubの **Actions** タブでデプロイが成功したことを確認します。

## よくある確認事項

- **別アカウントで認証される／Permission deniedになる**: リモートURLが `git@github-new:...` になっているか、`ssh -T git@github-new` で正しいアカウントが表示されるか確認します。
- **SSH設定が反映されない**: SourcetreeのSSHクライアントが **OpenSSH** になっているか確認します。
- **Actionsが起動しない**: push先のブランチが `main` か確認します。
- **Actionsは成功したがページが見つからない**: GitHub Pagesの公開元が **GitHub Actions** か、アクセス先URLのアカウント名とリポジトリ名が正しいか確認します。
