# 插件档案

[English](README.md) | [中文](README.zh-CN.md)

把 Obsidian 的插件开关状态存成**档案 A / 档案 B**，一键互相切换。适合「一套日常重装 + 一套精简专注」并行使用。

## 它做什么

- **档案 A / B 一键互切**：把开关状态恢复成该档案记录的样子。
- **只记开关，不碰配置**：只调用 `app.plugins.enablePlugin` / `disablePlugin`，等价于你在「第三方插件」列表里手拨开关。全程不读取、不写入任何插件的 `data.json`，插件的设置、数据、样式原封不动。
- **增量插件不动**：保存档案时，会把「当时已安装的全部插件 ID」登记为这份档案的**记录范围**。保存之后才装的插件不在范围内 → 切换时完全不改动它。面板里会单独列出「不动 N 个」。
- **锁定名单**：名单里的插件永不被切换改动，适合放 `remotely-save`、`obsidian-git` 这类关掉就会中断同步的插件。本插件自身也永远保持启用。
- **切换前预览**（卡片上直接显示 `开 N / 关 N / 不动 N / 锁定 N`）+ 一键**撤销**。

## 安装

### 方式一：脚本（推荐）

```bash
git clone git@github.com:Jeff-clouds/obsidian-plugin-profiles.git
cd obsidian-plugin-profiles
./install.sh /path/to/your-vault      # vault 就是含 .obsidian 的那个目录
```

然后回到 Obsidian：`设置 → 第三方插件`，点右上角刷新按钮（或重启），启用 **插件档案**。

### 方式二：手动

把 `manifest.json`、`main.js`、`styles.css` 复制到 `<你的 vault>/.obsidian/plugins/plugin-profiles/`，重启 Obsidian 后启用。

### 方式三：BRAT

用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 添加本仓库，即可自动跟踪更新。

## 使用

### 面板（日常最常用）

点左侧 ribbon 的**图层图标**（或状态栏上的「档案 —」）打开面板。两张卡片：

- `切换到 A` —— 把开关状态恢复成 A 的快照
- `存为 A` —— 把**当前**开关状态覆盖保存为 A

卡片上的 `开 N / 关 N / 不动 N / 锁定 N` 是点下去之前的实际动作预览。底部「撤销上一次切换」可回退。

### 命令面板 + 快捷键（推荐）

到 `设置 → 快捷键` 给下面任意命令绑快捷键，实现真正的「随时一键切换」：

| 命令 | 说明 |
|---|---|
| `插件档案: 切换到档案 A` / `B` | 应用快照 |
| `插件档案: 保存当前状态为档案 A` / `B` | 覆盖保存当前状态 |
| `插件档案: 查看档案 A / B 的切换明细` | 逐条列出会开哪些、关哪些、哪些不动 |
| `插件档案: 撤销上一次切换` | 回退上一次切换影响到的插件 |
| `插件档案: 打开插件档案面板` | 等同点 ribbon |

### 建议的初始流程

1. 先停在**日常常用**的插件组合，`存为 A`；
2. 手动关掉一批插件，只留核心几个，`存为 B`；
3. 到 `设置 → 插件档案 → 锁定名单` 勾上 `remotely-save`、`obsidian-git` 等不想被关的插件；
4. 绑快捷键，开始用。

之后新装了插件、想让它长期开着：把它启用，然后 `存为 A`（覆盖一次）即可，档案 B 不受影响。

## 数据存放位置

| 内容 | 路径 |
|---|---|
| 档案 / 锁定名单 / 上次切换记录 | `<vault>/.obsidian/plugins/plugin-profiles/data.json` |
| 插件本体 | `<vault>/.obsidian/plugins/plugin-profiles/` |

改源码后重新跑 `./install.sh` 即可覆盖安装（不会动 `data.json`）。

## 开发

纯 JavaScript，**没有构建步骤**——`main.js` 就是源码，Obsidian 直接加载，无需 npm / esbuild / TypeScript。

```
manifest.json     Obsidian 插件清单
main.js           全部逻辑（单文件）
styles.css        样式（使用 Obsidian 主题变量，自动适配明暗主题）
versions.json     版本 → 最低 Obsidian 版本映射
install.sh        安装到 vault
test/             回归测试（stub 模拟 Obsidian 运行时）
```

### 回归测试

改完 `main.js` 后跑一遍，用 stub 模拟 Obsidian 运行时验证核心逻辑（10 项）：

```bash
./test/run.sh
```

覆盖：保存 A/B、A→B→A 往返、**增量插件不被改动**、锁定名单、撤销、自身保护、空档案保护，以及静态检查确认源码中不存在任何写 vault / 写插件配置的调用。

## 已知边界

- 仅桌面端（`isDesktopOnly: true`）。
- 依赖 Obsidian 未公开的 `app.plugins.enablePlugin / disablePlugin / enabledPlugins`。这是社区插件的通行做法，但 Obsidian 大版本升级时有失效可能。
- 若某个插件加载失败（例如依赖缺失），切换时会被捕获并写进结果提示，不会中断整个过程。
- 不要与其他同样接管插件启停的插件同时管理同一批插件，否则两边的状态可能互相覆盖。

## License

MIT
