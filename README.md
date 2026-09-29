# Plugin Profiles

[English](README.md) | [中文](README.zh-CN.md)

Snapshot-based plugin enable-state profiles for Obsidian. Save the set of plugins you have enabled right now as **Profile A** or **Profile B**, then switch between them with one click — handy for keeping a heavy daily setup and a light focus setup side by side.

## What it does

- **Switch between Profile A and Profile B.** Restores the enable/disable state recorded in that profile.
- **Only the enabled state is stored.** The plugin calls `app.plugins.enablePlugin` / `disablePlugin` — the same thing as flipping the toggle yourself in *Settings → Community plugins*. No plugin's `data.json` is ever read or written, so plugin settings, data and CSS snippets stay untouched.
- **Plugins installed later are left alone.** A profile records the set of installed plugins **at the moment it was saved**. Anything installed afterwards falls outside that scope and is never modified when switching.
- **Pinned list** for plugins that must never be switched off (e.g. `remotely-save`, `obsidian-git`). Plugin Profiles itself is always kept enabled.
- **Preview before you act** (`N on / N off / N untouched / N pinned` on each card) and a one-click **undo**.

## Install

### Option 1 — script (recommended)

```bash
git clone git@github.com:Jeff-clouds/obsidian-plugin-profiles.git
cd obsidian-plugin-profiles
./install.sh /path/to/your-vault      # the folder that contains .obsidian
```

Then in Obsidian: *Settings → Community plugins*, click the refresh button in the top-right corner (or restart), and enable **Plugin Profiles**.

### Option 2 — manual

Copy `manifest.json`, `main.js` and `styles.css` into `<your vault>/.obsidian/plugins/plugin-profiles/`, restart Obsidian, then enable the plugin.

### Option 3 — BRAT

Add this repository with [BRAT](https://github.com/TfTHacker/obsidian42-brat) to track updates automatically.

## Usage

### Panel

Click the **layers icon** in the left ribbon (or the status-bar item). You get two cards:

- **Switch to A** — restore the state recorded in A
- **Save as A** — overwrite A with the **current** state

The `N on / N off / N untouched / N pinned` line on each card is an exact preview of what the click will do. An **Undo last switch** button sits at the bottom.

### Commands and hotkeys

Bind hotkeys in *Settings → Hotkeys* for real one-key switching:

| Command | Description |
|---|---|
| `Plugin Profiles: Switch to profile A / B` | Apply a snapshot |
| `Plugin Profiles: Save current state as profile A / B` | Overwrite a profile with the current state |
| `Plugin Profiles: Show diff for profile A / B` | List exactly what will be turned on, off, or left alone |
| `Plugin Profiles: Undo last switch` | Revert the previous switch |
| `Plugin Profiles: Open panel` | Same as clicking the ribbon icon |

### Suggested first run

1. Get to the plugin mix you use day to day, then **Save as A**.
2. Turn off a batch of plugins, leaving only your core set, then **Save as B**.
3. In *Settings → Plugin Profiles → Pinned plugins*, tick `remotely-save`, `obsidian-git` and anything else you never want switched off.
4. Bind hotkeys — done.

Later, when you install a plugin you want to keep enabled long-term: enable it and **Save as A** again. Profile B is unaffected.

## Where your data lives

| Item | Path |
|---|---|
| Profiles / pinned list / last switch | `<vault>/.obsidian/plugins/plugin-profiles/data.json` |
| The plugin itself | `<vault>/.obsidian/plugins/plugin-profiles/` |

Re-running `./install.sh` updates the code and never touches `data.json`.

## Development

Plain JavaScript — **no build step**. `main.js` *is* the source; Obsidian loads it directly. No npm, no esbuild, no TypeScript.

```
manifest.json     Obsidian plugin manifest
main.js           all of the logic (single file)
styles.css        styles (Obsidian theme variables, light/dark aware)
versions.json     version → minimum Obsidian version
install.sh        install into a vault
test/             regression suite (stubbed Obsidian runtime)
```

### Regression tests

Run after editing `main.js` — 10 cases against a stubbed Obsidian runtime:

```bash
./test/run.sh
```

Covers: saving A/B, an A→B→A round trip, **plugins installed later are never modified**, the pinned list, undo, self-protection, refusing to switch to an empty profile, plus a static check that the source contains no call that writes to the vault or to any plugin config.

## Known limitations

- Desktop only (`isDesktopOnly: true`).
- Uses the unofficial `app.plugins.enablePlugin / disablePlugin / enabledPlugins` API. This is standard practice among community plugins, but a major Obsidian upgrade could break it.
- If a plugin fails to load (e.g. a missing dependency), the failure is caught and reported without aborting the whole switch.
- Do not manage the same set of plugins with another plugin that also takes over enable/disable — the two would overwrite each other.

## License

MIT
