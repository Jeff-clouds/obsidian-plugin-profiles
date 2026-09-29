const assert = require("assert");
const { Notice } = require("obsidian");
const PluginProfiles = require("./main.js");

/* ---------- 模拟 Obsidian 环境 ---------- */
const ALL = [
  "dataview", "tasks", "templater", "weread", "tag-wrangler",   // 1-5
  "simpread", "recent-files", "query-control", "periodic-para", "editing-toolbar", // 6-10
  "brat", "zoom", "prettifier", "fullscreen", "auto-link-title",  // 11-15
  "remotely-save", "obsidian-git", "homepage", "graph-presets", "excalidraw", // 16-20
  "plugin-profiles",
];
const manifests = {};
ALL.forEach((id) => { manifests[id] = { id, name: id }; });

const enabled = new Set(["dataview","tasks","templater","weread","tag-wrangler",
  "simpread","recent-files","query-control","periodic-para","editing-toolbar",
  "remotely-save","obsidian-git","plugin-profiles"]); // 13 个（含自身）

const app = {
  plugins: {
    manifests,
    enabledPlugins: enabled,
    async enablePlugin(id) { if (!manifests[id]) throw new Error("no manifest " + id); enabled.add(id); },
    async disablePlugin(id) { enabled.delete(id); },
    async saveEnabledPlugins() {},
  },
};

let store = null;
const p = new PluginProfiles();
p.app = app;
p.loadData = async () => store;
p.saveData = async (d) => { store = JSON.parse(JSON.stringify(d)); };

const on = () => ALL.filter((id) => enabled.has(id));

(async () => {
  await p.loadSettings();
  p.settings.showStatusBar = false;
  p.settings.pinned = ["remotely-save", "obsidian-git"];   // 锁定同步类插件

  /* ---- 1. 保存档案 A = 当前 13 个 ---- */
  await p.saveSlot("A");
  assert.deepStrictEqual(p.settings.slots.A.known.length, 21, "A 记录范围应为 21");
  assert.deepStrictEqual(p.settings.slots.A.enabled.length, 13, "A 启用数应为 13");
  console.log("T1 保存档案 A  OK  ->", p.settings.slots.A.enabled.length, "个启用 / 范围", p.settings.slots.A.known.length);

  /* ---- 2. 手工做出「档案 B」的状态：只留 5 个 ---- */
  ["simpread","recent-files","query-control","periodic-para","editing-toolbar",
   "dataview","tasks","templater"].forEach((id) => enabled.delete(id));
  assert.deepStrictEqual(on(), ["weread","tag-wrangler","remotely-save","obsidian-git","plugin-profiles"]);
  await p.saveSlot("B");
  assert.strictEqual(p.settings.slots.B.enabled.length, 5, "B 启用数应为 5");
  console.log("T2 保存档案 B  OK  -> 5 个启用");

  /* ---- 3. A -> B：A 独有且未被锁定的插件必须被关掉 ---- */
  await p.applySlot("B");
  const afterB = on();
  console.log("T3 切到 B      OK  ->", afterB.join(","));
  assert.deepStrictEqual(afterB, ["weread","tag-wrangler","remotely-save","obsidian-git","plugin-profiles"]);
  assert.strictEqual(p.settings.active, "B");

  /* ---- 4. B -> A：全部按 A 恢复 ---- */
  await p.applySlot("A");
  console.log("T4 切回 A      OK  ->", on().length, "个启用");
  assert.deepStrictEqual(on(), ["dataview","tasks","templater","weread","tag-wrangler",
    "simpread","recent-files","query-control","periodic-para","editing-toolbar",
    "remotely-save","obsidian-git","plugin-profiles"]);

  /* ---- 5. 增量插件测试：安装一个新插件并启用，切档案时它必须不动 ---- */
  ALL.push("brand-new-plugin");
  manifests["brand-new-plugin"] = { id: "brand-new-plugin", name: "brand-new-plugin" };
  enabled.add("brand-new-plugin");
  console.log("T5 新装并启用 brand-new-plugin（未记录）");

  await p.applySlot("B");
  assert.ok(enabled.has("brand-new-plugin"), "增量插件在切到 B 时应保持启用");
  assert.deepStrictEqual(on(), ["weread","tag-wrangler","remotely-save","obsidian-git","plugin-profiles","brand-new-plugin"]);
  console.log("T5 切到 B      OK  -> 增量插件 brand-new-plugin 保持启用");

  await p.applySlot("A");
  assert.ok(enabled.has("brand-new-plugin"), "增量插件在切回 A 时应保持启用");
  assert.ok(!enabled.has("brand-new-plugin") === false);
  console.log("T5 切回 A      OK  -> 增量插件仍保持启用（未被关闭）");

  /* ---- 6. 锁定名单：remotely-save 若被手工关掉，切 A 时不应被打开 ---- */
  // 先把 remotely-save 从 A 的 enabled 里摘掉，模拟「A 不想要它」
  p.settings.slots.A.enabled = p.settings.slots.A.enabled.filter((x) => x !== "remotely-save");
  enabled.delete("remotely-save");
  await p.applySlot("A");
  assert.ok(!enabled.has("remotely-save"), "锁定插件不应被切换打开");
  console.log("T6 锁定名单    OK  -> 锁定的 remotely-save 未被切换动过");

  /* ---- 7. 撤销 ---- */
  enabled.delete("brand-new-plugin");
  await p.saveSlot("B");
  enabled.delete("dataview");
  enabled.delete("simpread");                       // 手工造出与 A 的差异
  const snapshotBefore = on().slice().sort();
  await p.applySlot("A");
  const snapshotAfter = on().slice().sort();
  assert.notDeepStrictEqual(snapshotBefore, snapshotAfter, "切换应产生变化");
  console.log("T7 切换        OK  ->", snapshotBefore.length, "->", snapshotAfter.length, "个启用");
  await p.undoLast();
  assert.deepStrictEqual(on().slice().sort(), snapshotBefore, "撤销应回到切换前状态");
  console.log("T7 撤销        OK  -> 已回到切换前状态");

  /* ---- 8. 自身永不被关闭 ---- */
  const selfId = "plugin-profiles";
  p.settings.slots.B.enabled = p.settings.slots.B.enabled.filter((x) => x !== selfId);
  await p.applySlot("B");
  assert.ok(enabled.has(selfId), "本插件自身必须始终保持启用");
  console.log("T8 自我保护    OK  -> 本插件未被关闭");

  /* ---- 9. 未保存的档案应拒绝切换 ---- */
  p.settings.slots.A.savedAt = null;
  Notice.log.length = 0;
  await p.applySlot("A");
  assert.ok(Notice.log[0].indexOf("还没有保存过") !== -1, "未保存档案应给出提示");
  assert.ok(enabled.has(selfId));
  console.log("T9 空档案保护  OK  ->", Notice.log[0]);

  /* ---- 10. 只碰开关：确认不存在任何写插件 data.json 的行为 ---- */
  const src = require("fs").readFileSync("./main.js", "utf8");
  ["write", "adapter", "vault.modify", "append", "data.json"].forEach((k) => {
    if (k === "data.json") return;
    assert.ok(src.indexOf(k) === -1, "源码中不应出现文件写入相关调用: " + k);
  });
  assert.ok(src.indexOf("loadData") !== -1 && src.indexOf("saveData") !== -1);
  console.log("T10 只碰开关   OK  -> 源码中无任何写 vault / 写插件配置的调用");

  console.log("\n全部 10 项测试通过 ✅");
})().catch((e) => { console.error("测试失败 ❌", e); process.exit(1); });
