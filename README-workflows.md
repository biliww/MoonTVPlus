# docker-image-dev.yml 工作流详细中文注释与说明

## 文件作用
本文件是 GitHub Actions 的 CI/CD 工作流配置文件，主要用于自动构建并推送多平台（amd64/arm64）Docker 镜像到 GitHub Container Registry（ghcr.io），并自动合并多平台镜像清单，最后清理旧的 workflow 运行记录。

---

## 每一行详细中文解释

```yaml
name: Build & Push Docker image # 工作流名称

on: # 触发条件
  workflow_dispatch: # 支持手动触发
    inputs:
      tag:
        description: 'Docker 标签' # 手动触发时可自定义 Docker 镜像标签
        required: false
        default: 'latest'
        type: string
  push:
    branches: [ main-my ] # 推送到 main-my 分支时自动触发
  pull_request:
    branches: [ main-my ] # 针对 main-my 分支的 PR 也会触发

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }} # 同一分支同一工作流只允许一个实例
  cancel-in-progress: true # 新的触发会取消正在运行的旧实例

permissions:
  contents: write # 允许操作仓库内容
  packages: write # 允许推送/拉取容器镜像
  actions: write # 允许管理 workflow 运行

jobs:
  build: # 构建并推送镜像的 job
    strategy:
      matrix:
        include:
          - platform: linux/amd64
            os: ubuntu-latest
          - platform: linux/arm64
            os: ubuntu-24.04-arm
    runs-on: ${{ matrix.os }} # 按平台分别在不同 runner 上运行

    steps:
      - name: Prepare platform name
        run: |
          echo "PLATFORM_NAME=${{ matrix.platform }}" | sed 's|/|-|g' >> $GITHUB_ENV # 处理平台名，便于后续使用

      - name: Checkout source code
        uses: actions/checkout@v4 # 拉取源码

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3 # 配置 Docker Buildx 支持多平台构建

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3 # 登录 ghcr.io
        with:
          registry: ghcr.io
          username: ${{ github.actor }} # 当前 GitHub 用户
          password: ${{ secrets.GITHUB_TOKEN }} # 自动注入的 GitHub Token

      - name: Set lowercase repository owner
        id: lowercase
        run: echo "owner=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT" # 仓库所有者转小写

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5 # 提取镜像元数据
        with:
          images: ghcr.io/mtvpls/moontvplus-dev # 镜像名
          tags: |
            type=raw,value=${{ github.event.inputs.tag || 'latest' }},enable={{is_default_branch}} # 镜像标签

      - name: Build and push by digest
        id: build
        uses: docker/build-push-action@v5 # 构建并推送镜像
        with:
          context: . # 构建上下文
          file: ./Dockerfile # Dockerfile 路径
          platforms: ${{ matrix.platform }} # 构建平台
          labels: ${{ steps.meta.outputs.labels }} # 镜像标签
          tags: ghcr.io/mtvpls/moontvplus-dev:${{ github.event.inputs.tag || 'latest' }} # 镜像 tag
          outputs: type=image,name=ghcr.io/mtvpls/moontvplus-dev,name-canonical=true,push=true # 推送镜像

      - name: Export digest
        run: |
          mkdir -p /tmp/digests
          digest="${{ steps.build.outputs.digest }}"
          touch "/tmp/digests/${digest#sha256:}" # 导出镜像 digest

      - name: Upload digest
        uses: actions/upload-artifact@v4 # 上传 digest 供后续合并
        with:
          name: digests-${{ env.PLATFORM_NAME }}
          path: /tmp/digests/*
          if-no-files-found: error
          retention-days: 1

  merge: # 合并多平台镜像清单
    runs-on: ubuntu-latest
    needs:
      - build # 依赖 build job
    steps:
      - name: Download digests
        uses: actions/download-artifact@v4 # 下载所有 digest
        with:
          path: /tmp/digests
          pattern: digests-*
          merge-multiple: true

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set lowercase repository owner
        id: lowercase
        run: echo "owner=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"

      - name: Create manifest list and push
        working-directory: /tmp/digests
        run: |
          docker buildx imagetools create -t ghcr.io/mtvpls/moontvplus-dev:${{ github.event.inputs.tag || 'latest' }} \
            $(printf 'ghcr.io/mtvpls/moontvplus-dev@sha256:%s ' *) # 合并多平台镜像清单并推送

  cleanup-refresh: # 清理旧 workflow 运行
    runs-on: ubuntu-latest
    needs:
      - merge
    if: always()
    steps:
      - name: Delete workflow runs
        uses: Mattraks/delete-workflow-runs@main # 删除旧 workflow 运行
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          repository: ${{ github.repository }}
          retain_days: 0
          keep_minimum_runs: 2 # 至少保留 2 个运行记录
```

---

## 总结

### 目的
本工作流用于自动化构建、推送并管理多平台 Docker 镜像，极大简化了开发者的发布流程，保证了镜像的统一性和可用性。

### 使用方式
1. **自动触发**：向 main-my 分支推送代码或发起 PR，工作流会自动运行。
2. **手动触发**：在 GitHub Actions 页面选择该 workflow，点击“Run workflow”，可自定义 tag。
3. **镜像获取**：构建完成后，镜像会被推送到 ghcr.io/mtvpls/moontvplus-dev:tag。
4. **权限说明**：无需手动配置 secrets.GITHUB_TOKEN，GitHub 会自动注入。
5. **清理机制**：每次运行后自动清理旧的 workflow 运行记录，节省资源。

---

如需进一步定制或排查问题，可参考每一步的日志输出。
