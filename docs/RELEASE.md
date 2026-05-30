# Release And Homebrew

## 中文

KeyLoop 使用 GitHub PR 工作流：

1. 从功能分支提交 PR。
2. PR 自动运行 `.github/workflows/ci.yml`。
3. CI 通过后合并到 `main`。
4. `.github/workflows/release.yml` 读取 `Cargo.toml` 的 `package.version`。
5. 如果 `vX.Y.Z` release 不存在，就自动构建 release 包、创建 GitHub Release，并更新 Homebrew tap。

版本发布由 `Cargo.toml` 控制。普通代码合并如果没有改版本号，release workflow 会跳过，避免重复发同一个版本。

### 发布一个新版本

1. 修改 `Cargo.toml` 里的 `version`。
2. 提交 PR。
3. 等 CI 通过。
4. 合并到 `main`。
5. Release workflow 自动创建 `vX.Y.Z`。

### Homebrew Tap

Homebrew 的推荐方式是维护一个单独的 tap 仓库。官方文档要求 GitHub 上的短命令 tap 仓库使用 `homebrew-` 前缀，所以这里使用：

```text
luweiCN/homebrew-tap
```

安装命令会是：

```bash
brew install luweiCN/tap/keyloop
```

release workflow 会尝试更新 `luweiCN/homebrew-tap` 的 `Formula/keyloop.rb`。要让这一步生效，需要在 `luweiCN/keyloop` 仓库里配置 secret：

```text
HOMEBREW_TAP_TOKEN
```

这个 token 需要能写入 `luweiCN/homebrew-tap`。建议后续换成只允许写 tap 仓库 contents 的 fine-grained token。

### 私有仓库注意事项

当前 `luweiCN/keyloop` 是 private 仓库。GitHub Release 资产也是私有的，所以普通 Homebrew 用户无法无认证下载。要让一条命令安装真正可用，需要把 `keyloop` 和 `homebrew-tap` 都改成 public，或者只在配置了 GitHub 认证的个人环境里使用。

## English

KeyLoop uses a GitHub PR workflow:

1. Open a PR from a feature branch.
2. CI runs through `.github/workflows/ci.yml`.
3. Merge into `main` after CI passes.
4. `.github/workflows/release.yml` reads `package.version` from `Cargo.toml`.
5. If the matching `vX.Y.Z` release does not exist, the workflow builds release packages, creates a GitHub Release, and updates the Homebrew tap.

Releases are version-driven. If a merge to `main` does not change `Cargo.toml` version, the release workflow skips publishing to avoid duplicate releases.

### Publishing A New Version

1. Change `version` in `Cargo.toml`.
2. Open a PR.
3. Wait for CI.
4. Merge into `main`.
5. The release workflow creates `vX.Y.Z`.

### Homebrew Tap

Homebrew packages are published through a separate tap repository:

```text
luweiCN/homebrew-tap
```

Install command:

```bash
brew install luweiCN/tap/keyloop
```

The release workflow updates `Formula/keyloop.rb` in `luweiCN/homebrew-tap`. To enable this, add this secret to `luweiCN/keyloop`:

```text
HOMEBREW_TAP_TOKEN
```

The token must be able to write to `luweiCN/homebrew-tap`. Prefer a fine-grained token limited to tap repository contents.

### Private Repository Caveat

`luweiCN/keyloop` is currently private. Its GitHub Release assets are private too, so unauthenticated Homebrew installs will not work for normal users. For a public one-command Homebrew install, make both `keyloop` and `homebrew-tap` public, or use it only in authenticated personal environments.
