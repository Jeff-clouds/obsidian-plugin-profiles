class Plugin { constructor(){ this.manifest = { id: "plugin-profiles", name: "插件档案" }; } }
class PluginSettingTab { constructor(app, plugin){ this.app = app; this.plugin = plugin; this.containerEl = {}; } }
class Notice { constructor(m, t){ Notice.log.push(m); } }
class Modal { constructor(app){ this.app = app; } }
Notice.log = [];
module.exports = { Plugin, PluginSettingTab, Setting: class {}, Notice, Modal };
