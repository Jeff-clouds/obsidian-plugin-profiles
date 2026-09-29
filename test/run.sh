#!/bin/zsh
# 回归测试：用 stub 模拟 Obsidian 运行时，验证档案切换的核心逻辑
set -e
cd "$(dirname "$0")"

NODE="${NODE:-/Users/apple/.workbuddy/binaries/node/versions/22.22.2-3/bin/node}"
OUT="$(mktemp -d)"
mkdir -p "$OUT/node_modules/obsidian"
cp obsidian-stub/obsidian-index.js "$OUT/node_modules/obsidian/index.js"
cp ../main.js "$OUT/main.js"
cp test.js "$OUT/test.js"

cd "$OUT" && "$NODE" test.js
rm -rf "$OUT"
