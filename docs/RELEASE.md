# Release And Homebrew

## 中文

KeyLoop 使用 GitHub PR 工作流：

1. 从功能分支提交 PR。
2. PR 自动运行 `.github/workflows/ci.yml`。
3. CI 通过后合并到 `main`。
4. `.github/workflows/release.yml` 读取 `package.json` 的 `version`。
5. 如果 `vX.Y.Z` release 不存在，就自动构建 release 包、创建 GitHub Release，并更新 Homebrew tap。

版本发布由 `package.json` 控制。普通代码合并如果没有改版本号，release workflow 会跳过，避免重复发同一个版本。

### 发布一个新版本

1. 修改 `package.json` 里的 `version`。
2. 提交 PR。
3. 等 CI 通过。
4. 合并到 `main`。
5. Release workflow 自动创建 `vX.Y.Z`。

### Homebrew Tap

Homebrew 的推荐方式是维护一个单独的 tap 仓库。`brew tap luweiCN/keyloop` 会按 Homebrew 约定自动映射到 GitHub 仓库 `luweiCN/homebrew-keyloop`，所以这里使用：

```text
luweiCN/homebrew-keyloop
```

安装命令是：

```bash
brew tap luweiCN/keyloop
brew install keyloop
```

也可以用一条命令：

```bash
brew install luweiCN/keyloop/keyloop
```

release workflow 会尝试更新 `luweiCN/homebrew-keyloop` 的 `Formula/keyloop.rb`。要让这一步生效，需要在 `luweiCN/keyloop` 仓库里配置 secret：

```text
HOMEBREW_TAP_TOKEN
```

这个 token 需要能写入 `luweiCN/homebrew-keyloop`。建议后续换成只允许写 tap 仓库 contents 的 fine-grained token。

### 公开安装要求

要让普通用户通过 Homebrew 无认证安装，`luweiCN/keyloop` 的 GitHub Release 资产和 `luweiCN/homebrew-keyloop` tap 仓库都需要公开可读。

## English

KeyLoop uses a GitHub PR workflow:

1. Open a PR from a feature branch.
2. CI runs through `.github/workflows/ci.yml`.
3. Merge into `main` after CI passes.
4. `.github/workflows/release.yml` reads `version` from `package.json`.
5. If the matching `vX.Y.Z` release does not exist, the workflow builds release packages, creates a GitHub Release, and updates the Homebrew tap.

Releases are version-driven. If a merge to `main` does not change the `package.json` version, the release workflow skips publishing to avoid duplicate releases.

### Publishing A New Version

1. Change `version` in `package.json`.
2. Open a PR.
3. Wait for CI.
4. Merge into `main`.
5. The release workflow creates `vX.Y.Z`.

### Homebrew Tap

Homebrew packages are published through a separate tap repository. `brew tap luweiCN/keyloop` maps to `luweiCN/homebrew-keyloop` by Homebrew convention, so this project uses:

```text
luweiCN/homebrew-keyloop
```

Install commands:

```bash
brew tap luweiCN/keyloop
brew install keyloop
```

Or as a single command:

```bash
brew install luweiCN/keyloop/keyloop
```

The release workflow updates `Formula/keyloop.rb` in `luweiCN/homebrew-keyloop`. To enable this, add this secret to `luweiCN/keyloop`:

```text
HOMEBREW_TAP_TOKEN
```

The token must be able to write to `luweiCN/homebrew-keyloop`. Prefer a fine-grained token limited to tap repository contents.

### Public Install Requirements

For unauthenticated Homebrew installs, GitHub Release assets from `luweiCN/keyloop` and the `luweiCN/homebrew-keyloop` tap repository must be publicly readable.
