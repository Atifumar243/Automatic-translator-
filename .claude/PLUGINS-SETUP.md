# Claude Code plugins/tools — setup notes

This repo is pre-wired for the 5 tools from the "Claude Code ke 5 Plugins" guide.
`.claude/settings.json` can only declare Claude Code **plugins** — the other three
tools are npm/pip/skill installs each person runs on their own machine. Nothing
here downloads or runs automatically; this file is a checklist.

> ⚠️ **Trust before you run.** Four of these are third-party community tools
> (only Claude Code Setup is from Anthropic's official marketplace). Two of them
> — OmniRoute and Headroom — sit between Claude Code and the model and handle your
> API keys / reroute requests. Only enable those if that trade-off is one you want.
> Cloud sessions (claude.ai/code) do **not** load any of these; they're for local
> Claude Code.

---

## Already declared in `.claude/settings.json` (plugins)

These two are turned **on** for the project. Enabling ≠ installing — on each
machine, after you trust the folder, run the matching install once:

| Plugin | Install on your machine (run once) |
| --- | --- |
| `claude-code-setup@claude-plugins-official` (Anthropic official — safest) | `claude plugin install claude-code-setup@claude-plugins-official --scope project` |
| `claude-mem@thedotmack` (session memory) | `claude plugin install claude-mem@thedotmack --marketplace thedotmack --scope project` |

Or, inside a session: `/plugin install claude-code-setup@claude-plugins-official`
and `/plugin install claude-mem@thedotmack` (add the `thedotmack` marketplace first
with `/plugin marketplace add thedotmack/claude-mem` if it isn't known yet).

Do **not** `npm install -g claude-mem` — that installs only the library, not the
plugin hooks.

## Already set up as committed files

| Tool | Where | Finish on your machine |
| --- | --- | --- |
| **Task Observer** (`rebelytics/one-skill-to-rule-them-all`) | `.agents/skills/task-observer/` + `.claude/skills/task-observer` symlink | Edit `CLAUDE.md`: replace `__TASK_OBSERVER_WORKSPACE__` and `__PROJECTS_ROOT__` with real absolute paths (see the comment at the top of `CLAUDE.md`). On Windows, enable git symlinks (`git config core.symlinks true`) or point skill discovery at `.agents/skills/task-observer`. |

## NOT in this repo — run on your own machine (not committable)

These wrap the `claude` binary or run as local proxies/global installs, so they
can't be committed as repo files:

| Tool | Install | Notes |
| --- | --- | --- |
| **OmniRoute** | `npm install -g omniroute` → `omniroute run claude` | ⚠️ Local gateway that reroutes Claude's traffic to other providers using your API keys. Connect providers at its dashboard first. |
| **Headroom** | `pip install "headroom-ai[all]"` → `headroom wrap claude` | ⚠️ Local proxy; compresses tool output and auto-injects a "Serena" MCP server. Check: `headroom doctor`. Undo: `headroom unwrap claude`. Needs Python 3.10+; use `pip`, not `npm`. |

---

Source guide: "Claude Code ke 5 Plugins — Complete Setup Guide" (@MUFFZALA, Oct 2026).
Verify each tool's terms and permissions yourself before enabling it.
