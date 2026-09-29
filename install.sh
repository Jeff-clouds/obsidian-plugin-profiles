#!/bin/zsh
# 把「插件档案」安装 / 更新到 Obsidian vault 的 .obsidian/plugins/plugin-profiles/
# 只复制代码文件，绝不动 data.json（你的档案数据）
#
# 用法：
#   ./install.sh /path/to/your-vault
#   OBSIDIAN_VAULT=/path/to/your-vault ./install.sh
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
VAULT="${1:-${OBSIDIAN_VAULT:-}}"

if [ -z "$VAULT" ]; then
  cat >&2 <<'USAGE'
用法：./install.sh /path/to/your-vault

也可以先用环境变量指定：
  OBSIDIAN_VAULT=/path/to/your-vault ./install.sh

提示：vault 就是包含 .obsidian 文件夹的那个目录。
USAGE
  exit 1
fi

VAULT="${VAULT%/}"
DEST="$VAULT/.obsidian/plugins/plugin-profiles"

if [ ! -d "$VAULT/.obsidian" ]; then
  echo "错误：$VAULT 下找不到 .obsidian 目录，确认这是 Obsidian vault 根目录。" >&2
  exit 1
fi

mkdir -p "$DEST"

for f in manifest.json main.js styles.css; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$DEST/$f"
    echo "  ok  $f"
  else
    echo "  !!  缺少 $f" >&2
    exit 1
  fi
done

echo ""
echo "已安装到: $DEST"
if [ -f "$DEST/data.json" ]; then
  echo "data.json 已存在，档案数据保留未动。"
fi
echo "回到 Obsidian 点「第三方插件」右上角刷新按钮（或重启），然后启用「插件档案」。"
