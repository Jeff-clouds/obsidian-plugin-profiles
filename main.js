"use strict";

/*
 * 插件档案 Plugin Profiles
 * ------------------------------------------------------------------
 * 只保存 / 恢复「插件启用状态」。不读写任何插件的 data.json，
 * 因此每个插件自己的配置（数据、设置、样式）完全不受影响。
 *
 * 切换语义（快照式）：
 *   - 保存档案时，记录当时「全部已安装插件 ID」= 记录范围 known，
 *     以及其中处于启用状态的插件 = enabled
 *   - 切换时，只对「记录范围内且当前仍然安装」的插件恢复开关状态
 *   - 保存之后才安装的插件不在记录范围内 → 完全不改动（增量插件）
 *   - 锁定名单中的插件 + 本插件自身 → 永不改动
 */

const obsidian = require("obsidian");
const { Plugin, PluginSettingTab, Setting, Notice, Modal } = obsidian;

const SLOT_KEYS = ["A", "B"];

function defaultSettings() {
  return {
    slots: {
      A: { enabled: [], known: [], savedAt: null, note: "" },
      B: { enabled: [], known: [], savedAt: null, note: "" },
    },
    active: null,
    pinned: [],
    showStatusBar: true,
    lastOp: null,
  };
}

function fmtTime(ts) {
  if (!ts) return "从未保存";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

/* ================================ 主插件 ================================ */

class PluginProfiles extends Plugin {
  async onload() {
    await this.loadSettings();

    this.statusEl = null;

    this.addRibbonIcon("layers", "插件档案：切换 / 保存", () => {
      new SwitcherModal(this.app, this).open();
    });

    this.registerCommands();
    this.addSettingTab(new ProfilesSettingTab(this.app, this));
    this.refreshUI();
  }

  onunload() {
    /* 不做任何破坏性收尾，插件关闭时不动任何东西 */
  }

  registerCommands() {
    const self = this;
    ["a", "b"].forEach((key, i) => {
      const slot = SLOT_KEYS[i];
      this.addCommand({
        id: "switch-to-" + key,
        name: "切换到档案 " + slot,
        callback: () => self.applySlot(slot),
      });
      this.addCommand({
        id: "save-as-" + key,
        name: "保存当前状态为档案 " + slot,
        callback: () => self.saveSlot(slot),
      });
      this.addCommand({
        id: "details-" + key,
        name: "查看档案 " + slot + " 的切换明细",
        callback: () => new DetailsModal(self.app, self, slot).open(),
      });
    });
    this.addCommand({
      id: "open-panel",
      name: "打开插件档案面板",
      callback: () => new SwitcherModal(self.app, self).open(),
    });
    this.addCommand({
      id: "undo-last-switch",
      name: "撤销上一次切换",
      callback: () => self.undoLast(),
    });
  }

  /* ---------------------------- 基础读取 ---------------------------- */

  installedIds() {
    const pm = this.app.plugins;
    return Object.keys((pm && pm.manifests) || {});
  }

  enabledIds() {
    const pm = this.app.plugins;
    if (pm && pm.enabledPlugins && typeof pm.enabledPlugins.forEach === "function") {
      const out = [];
      pm.enabledPlugins.forEach((id) => out.push(id));
      return out;
    }
    return Object.keys((pm && pm.plugins) || {});
  }

  enabledSet() {
    return new Set(this.enabledIds());
  }

  displayName(id) {
    const m = (this.app.plugins.manifests || {})[id];
    return m && m.name ? m.name : id;
  }

  isProtected(id) {
    if (id === this.manifest.id) return true;
    return this.settings.pinned.indexOf(id) !== -1;
  }

  /* ---------------------------- 差异计算 ---------------------------- */

  /**
   * 返回 { saved, enable[], disable[], locked[], extra[] }
   *   enable  : 记录范围内、档案要求开、当前是关 → 将被开启
   *   disable : 记录范围内、档案要求关、当前是开 → 将被关闭
   *   locked  : 记录范围内但与档案不一致，因在锁定名单里 → 保持不动
   *   extra   : 档案保存之后才安装的插件（未记录）→ 保持不动
   */
  diff(slot) {
    const res = { saved: false, enable: [], disable: [], locked: [], extra: [] };
    const p = this.settings.slots[slot];
    if (!p || !p.savedAt) return res;
    res.saved = true;

    const nowEnabled = this.enabledSet();
    const knownSet = new Set(p.known);
    const wantSet = new Set(p.enabled);

    this.installedIds().forEach((id) => {
      if (!knownSet.has(id)) {
        res.extra.push(id);
        return;
      }
      const want = wantSet.has(id);
      const isOn = nowEnabled.has(id);
      if (want === isOn) return;
      if (this.isProtected(id)) res.locked.push(id);
      else if (want) res.enable.push(id);
      else res.disable.push(id);
    });

    return res;
  }

  /* ---------------------------- 保存档案 ---------------------------- */

  async saveSlot(slot) {
    const enabled = this.enabledIds().slice().sort();
    const known = this.installedIds().slice().sort();
    const prev = this.settings.slots[slot] || {};

    this.settings.slots[slot] = {
      enabled: enabled,
      known: known,
      savedAt: Date.now(),
      note: prev.note || "",
    };
    this.settings.active = slot;
    await this.saveSettings();
    this.refreshUI();

    new Notice(
      "已把当前状态存为档案 " + slot + "：启用 " + enabled.length + " 个 / 记录范围 " + known.length + " 个",
      6000
    );
  }

  /* ---------------------------- 应用档案 ---------------------------- */

  async applySlot(slot) {
    const p = this.settings.slots[slot];
    if (!p || !p.savedAt) {
      new Notice("档案 " + slot + " 还没有保存过，请先「保存当前状态为档案 " + slot + "」。", 7000);
      return;
    }

    const d = this.diff(slot);
    const touched = d.enable.concat(d.disable);

    if (touched.length === 0) {
      this.settings.active = slot;
      await this.saveSettings();
      this.refreshUI();
      new Notice(
        "当前已经是档案 " + slot + " 的状态" +
          (d.extra.length ? "（" + d.extra.length + " 个未记录插件保持原样）" : ""),
        5000
      );
      return;
    }

    this.settings.lastOp = {
      enabled: this.enabledIds(),
      touched: touched,
      active: this.settings.active,
      at: Date.now(),
    };

    const failed = [];

    for (const id of d.disable) {
      try {
        await this.app.plugins.disablePlugin(id);
      } catch (e) {
        failed.push(this.displayName(id));
      }
    }
    for (const id of d.enable) {
      try {
        await this.app.plugins.enablePlugin(id);
      } catch (e) {
        failed.push(this.displayName(id));
      }
    }

    try {
      if (typeof this.app.plugins.saveEnabledPlugins === "function") {
        await this.app.plugins.saveEnabledPlugins();
      }
    } catch (e) {
      /* 忽略：enable/disable 内部通常已经落盘 */
    }

    this.settings.active = slot;
    await this.saveSettings();
    this.refreshUI();

    let msg =
      "已切换到档案 " + slot + "：开启 " + d.enable.length + " 个、关闭 " + d.disable.length + " 个";
    if (d.extra.length) msg += "；" + d.extra.length + " 个未记录插件保持原样";
    if (d.locked.length) msg += "；" + d.locked.length + " 个锁定插件跳过";
    if (failed.length) msg += "。失败：" + failed.join("、");
    new Notice(msg, failed.length ? 12000 : 6000);
  }

  /* ---------------------------- 撤销 ---------------------------- */

  async undoLast() {
    const op = this.settings.lastOp;
    if (!op || !op.touched || !op.touched.length) {
      new Notice("没有可撤销的切换记录。", 5000);
      return;
    }

    const installed = new Set(this.installedIds());
    const before = new Set(op.enabled);
    const failed = [];

    for (const id of op.touched) {
      if (!installed.has(id) || this.isProtected(id)) continue;
      const want = before.has(id);
      const isOn = this.enabledSet().has(id);
      if (want === isOn) continue;
      try {
        if (want) await this.app.plugins.enablePlugin(id);
        else await this.app.plugins.disablePlugin(id);
      } catch (e) {
        failed.push(this.displayName(id));
      }
    }

    try {
      if (typeof this.app.plugins.saveEnabledPlugins === "function") {
        await this.app.plugins.saveEnabledPlugins();
      }
    } catch (e) {
      /* 忽略 */
    }

    this.settings.active = op.active === undefined ? null : op.active;
    this.settings.lastOp = null;
    await this.saveSettings();
    this.refreshUI();

    new Notice(
      "已撤销上一次切换" + (failed.length ? "。失败：" + failed.join("、") : "。"),
      failed.length ? 10000 : 5000
    );
  }

  /* ---------------------------- 状态栏 ---------------------------- */

  refreshUI() {
    if (this.settings.showStatusBar) {
      if (!this.statusEl) {
        this.statusEl = this.addStatusBarItem();
        this.statusEl.addClass("mod-clickable");
        this.statusEl.addEventListener("click", () => {
          new SwitcherModal(this.app, this).open();
        });
      }
      const a = this.settings.active;
      this.statusEl.setText(a ? "档案 " + a : "档案 —");
      this.statusEl.setAttribute("aria-label", "插件档案：点击切换 / 保存");
    } else if (this.statusEl) {
      this.statusEl.remove();
      this.statusEl = null;
    }
    if (this.settingTab && this.settingTab.containerEl && this.settingTab.containerEl.isConnected) {
      this.settingTab.display();
    }
  }

  /* ---------------------------- 设置存取 ---------------------------- */

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign(defaultSettings(), data);
    this.settings.slots = Object.assign(defaultSettings().slots, data.slots || {});
    if (!Array.isArray(this.settings.pinned)) this.settings.pinned = [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

/* ============================ 切换面板 Modal ============================ */

class SwitcherModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pp-modal");
    contentEl.createEl("h2", { text: "插件档案" });

    const p = this.plugin;
    const total = p.installedIds().length;
    const onNow = p.enabledIds().length;
    const sub = contentEl.createDiv({ cls: "pp-sub" });
    sub.setText(
      "当前共安装 " + total + " 个插件，其中 " + onNow + " 个启用" +
        (p.settings.active ? " · 生效档案：" + p.settings.active : " · 当前未标记任何档案")
    );

    SLOT_KEYS.forEach((slot) => {
      renderSlotCard(this.plugin, contentEl, slot, () => this.onOpen());
    });

    const foot = contentEl.createDiv({ cls: "pp-foot" });
    const undoBtn = foot.createEl("button", { text: "撤销上一次切换" });
    undoBtn.addEventListener("click", async () => {
      await p.undoLast();
      this.onOpen();
    });
    const settingBtn = foot.createEl("button", { text: "打开设置" });
    settingBtn.addEventListener("click", () => {
      this.close();
      const s = this.app.setting;
      if (s && typeof s.open === "function") s.open();
      if (s && typeof s.openTabById === "function") s.openTabById(p.manifest.id);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ============================ 明细 Modal ============================ */

class DetailsModal extends Modal {
  constructor(app, plugin, slot) {
    super(app);
    this.plugin = plugin;
    this.slot = slot;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pp-modal");
    contentEl.createEl("h2", { text: "档案 " + this.slot + " 切换明细" });

    const p = this.plugin;
    const s = p.settings.slots[this.slot];
    if (!s || !s.savedAt) {
      contentEl.createEl("p", { text: "该档案还没有保存过。" });
      return;
    }
    const d = p.diff(this.slot);
    const title = (t, n) => {
      contentEl.createEl("h4", { text: t + "（" + n + "）" });
    };
    const list = (ids, cls) => {
      if (!ids.length) {
        contentEl.createEl("p", { cls: "pp-muted", text: "无" });
        return;
      }
      const box = contentEl.createDiv({ cls: "pp-list " + (cls || "") });
      ids
        .slice()
        .sort((a, b) => p.displayName(a).localeCompare(p.displayName(b)))
        .forEach((id) => {
          const row = box.createDiv({ cls: "pp-item" });
          row.createSpan({ text: p.displayName(id), cls: "pp-item-name" });
          row.createSpan({ text: id, cls: "pp-item-id" });
        });
    };

    title("将被开启", d.enable.length);
    list(d.enable, "pp-on");
    title("将被关闭", d.disable.length);
    list(d.disable, "pp-off");
    title("锁定跳过", d.locked.length);
    list(d.locked, "pp-lock");
    title("未记录 · 保持原样（增量插件）", d.extra.length);
    list(d.extra, "pp-extra");

    const foot = contentEl.createDiv({ cls: "pp-foot" });
    const go = foot.createEl("button", { text: "立即切换到档案 " + this.slot });
    go.addClass("mod-cta");
    go.addEventListener("click", async () => {
      this.close();
      await this.plugin.applySlot(this.slot);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ======================== 复用：档案卡片渲染 ======================== */

function renderSlotCard(plugin, parent, slot, onChanged) {
  const s = plugin.settings.slots[slot];
  const d = plugin.diff(slot);
  const card = parent.createDiv({ cls: "pp-card" });
  const head = card.createDiv({ cls: "pp-card-head" });
  head.createEl("h3", { text: "档案 " + slot });
  if (plugin.settings.active === slot) {
    head.createSpan({ cls: "pp-badge pp-badge-active", text: "生效中" });
  }

  const info = card.createDiv({ cls: "pp-card-info" });
  if (!s || !s.savedAt) {
    info.createEl("p", { cls: "pp-muted", text: "尚未保存。点右侧「存为 " + slot + "」把当前开关状态记下来。" });
  } else {
    info.createEl("p", {
      text:
        "记录：" + s.enabled.length + " 个启用 / 范围 " + s.known.length + " 个 · 保存于 " + fmtTime(s.savedAt),
      cls: "pp-muted",
    });
    const chips = info.createDiv({ cls: "pp-chips" });
    chips.createSpan({ cls: "pp-chip pp-on", text: "开 " + d.enable.length });
    chips.createSpan({ cls: "pp-chip pp-off", text: "关 " + d.disable.length });
    chips.createSpan({ cls: "pp-chip pp-extra", text: "不动 " + d.extra.length });
    if (d.locked.length) chips.createSpan({ cls: "pp-chip pp-lock", text: "锁定 " + d.locked.length });
  }

  if (s && s.note) {
    card.createEl("p", { cls: "pp-note", text: "备注：" + s.note });
  }

  const btns = card.createDiv({ cls: "pp-card-btns" });
  const btnSwitch = btns.createEl("button", { text: "切换到 " + slot });
  btnSwitch.addClass("mod-cta");
  btnSwitch.disabled = !s || !s.savedAt;
  btnSwitch.addEventListener("click", async () => {
    await plugin.applySlot(slot);
    if (onChanged) onChanged();
  });

  const btnSave = btns.createEl("button", { text: "存为 " + slot });
  btnSave.addEventListener("click", async () => {
    if (s && s.savedAt) {
      const ok = window.confirm("档案 " + slot + " 将被当前状态覆盖，确定？");
      if (!ok) return;
    }
    await plugin.saveSlot(slot);
    if (onChanged) onChanged();
  });

  if (s && s.savedAt) {
    const btnDetail = btns.createEl("button", { text: "明细" });
    btnDetail.addEventListener("click", () => {
      new DetailsModal(plugin.app, plugin, slot).open();
    });
  }
  return card;
}

/* ============================== 设置页 ============================== */

class ProfilesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();
    p.settingTab = this;

    containerEl.createEl("h2", { text: "插件档案" });
    containerEl.createEl("p", {
      cls: "pp-muted",
      text:
        "只保存与恢复插件的「启用 / 停用」状态：不读取、不写入任何插件的 data.json，" +
        "所有插件的配置、数据、样式都原封不动。",
    });
    containerEl.createEl("p", {
      cls: "pp-muted",
      text:
        "切换规则：保存档案时会把当时已安装的插件全部登记为「记录范围」。" +
        "之后新安装的插件不在记录范围内，切换档案时不会被改动（增量插件保持原样）。",
    });

    const cards = containerEl.createDiv({ cls: "pp-cards" });
    SLOT_KEYS.forEach((slot) => {
      renderSlotCard(p, cards, slot, () => this.display());
    });

    /* 备注 */
    SLOT_KEYS.forEach((slot) => {
      new Setting(containerEl)
        .setName("档案 " + slot + " 备注")
        .setDesc("只是给自己看的说明，例如「写作模式」「只留核心插件」")
        .addText((t) => {
          t.setPlaceholder("可留空")
            .setValue((p.settings.slots[slot] && p.settings.slots[slot].note) || "")
            .onChange(async (v) => {
              p.settings.slots[slot].note = v;
              await p.saveSettings();
            });
        });
    });

    containerEl.createEl("h3", { text: "锁定名单" });
    containerEl.createEl("p", {
      cls: "pp-muted",
      text:
        "勾选的插件永远不会被档案切换改动（例如 remotely-save / obsidian-git 这类" +
        "一旦关掉就会中断同步的插件）。本插件自身也永远保持启用。",
    });

    const search = containerEl.createEl("input", { cls: "pp-search" });
    search.type = "text";
    search.placeholder = "搜索插件名或 ID…";
    const pinnedBox = containerEl.createDiv({ cls: "pp-pinned-list" });

    const renderPinned = () => {
      pinnedBox.empty();
      const kw = (search.value || "").trim().toLowerCase();
      const ids = p
        .installedIds()
        .slice()
        .sort((a, b) => p.displayName(a).localeCompare(p.displayName(b)));

      ids.forEach((id) => {
        const name = p.displayName(id);
        if (kw && name.toLowerCase().indexOf(kw) === -1 && id.toLowerCase().indexOf(kw) === -1) return;
        const row = pinnedBox.createDiv({ cls: "pp-pin-row" });
        const lab = row.createEl("label");
        const cb = lab.createEl("input");
        cb.type = "checkbox";
        cb.checked = p.settings.pinned.indexOf(id) !== -1;
        if (id === p.manifest.id) {
          cb.checked = true;
          cb.disabled = true;
        }
        cb.addEventListener("change", async () => {
          const arr = p.settings.pinned.filter((x) => x !== id);
          if (cb.checked) arr.push(id);
          p.settings.pinned = arr;
          await p.saveSettings();
        });
        lab.createSpan({ text: name, cls: "pp-pin-name" });
        row.createSpan({ text: id, cls: "pp-item-id" });
      });
    };
    search.addEventListener("input", renderPinned);
    renderPinned();

    containerEl.createEl("h3", { text: "其他" });

    new Setting(containerEl)
      .setName("在状态栏显示当前档案")
      .setDesc("状态栏显示「档案 A / B」，点击即可打开切换面板。")
      .addToggle((t) => {
        t.setValue(!!p.settings.showStatusBar).onChange(async (v) => {
          p.settings.showStatusBar = v;
          await p.saveSettings();
          p.refreshUI();
        });
      });

    new Setting(containerEl)
      .setName("撤销上一次切换")
      .setDesc(
        p.settings.lastOp
          ? "上次切换于 " + fmtTime(p.settings.lastOp.at) + "，影响 " + p.settings.lastOp.touched.length + " 个插件。"
          : "暂无可撤销的切换记录。"
      )
      .addButton((b) => {
        b.setButtonText("撤销").onClick(async () => {
          await p.undoLast();
          this.display();
        });
        b.setDisabled(!p.settings.lastOp);
      });

    containerEl.createEl("h3", { text: "命令面板可用命令" });
    const cmdBox = containerEl.createDiv({ cls: "pp-cmds" });
    [
      "插件档案: 切换到档案 A / B",
      "插件档案: 保存当前状态为档案 A / B",
      "插件档案: 查看档案 A / B 的切换明细",
      "插件档案: 撤销上一次切换",
      "插件档案: 打开插件档案面板",
    ].forEach((t) => cmdBox.createEl("div", { text: "· " + t, cls: "pp-muted" }));
    containerEl.createEl("p", {
      cls: "pp-muted",
      text: "到「设置 → 快捷键」里可以给上面任意命令绑定快捷键，实现一键切换。",
    });
  }
}

module.exports = PluginProfiles;
module.exports.default = PluginProfiles;
