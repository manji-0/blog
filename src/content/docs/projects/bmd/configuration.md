---
title: "設定"
description: "bmd のテーマとキーマップ"
sidebar:
  order: 4
---

任意設定は `~/.config/bmd/config.toml`（または `$XDG_CONFIG_HOME/bmd/config.toml`）です。無い場合は組み込み既定を使います。

## 環境変数

| 変数 | 意味 |
|---|---|
| `BMD_CHECKLIST_STYLE` | `unicode` / `emoji` / `auto`（未設定もauto相当） |
| `BMD_DEBUG=1` | キーイベント等をstderrへ |

チェックリストマーカー:

| スタイル | 表示 |
|---|---|
| `unicode` | `☐` / `☑` |
| `emoji` | `⬜` / `✅` |
| `auto` | Kitty、Ghostty、iTerm2、WezTerm、Apple Terminal、VS Code等ならemoji、それ以外はunicode |

## テーマ

プリセットを選び、必要ならロール単位で上書きします。

```toml
[theme]
preset = "nord"

[theme.link]
fg = "cyan"

[theme.h1]
underlined = false
```

| プリセット | 説明 |
|---|---|
| `dark` | 高コントラスト |
| `cursor-midnight` | アプリ既定（`preset`省略時） |
| `light` | 明るい背景向け |
| `solarized-dark` / `solarized-light` | Solarized |
| `nord` | Nord |
| `gruvbox-dark` | Gruvbox dark |
| `dracula` | Dracula |
| `tokyo-night` | Tokyo Night |
| `hackerman-omarchy` | Omarchy Hackerman |

ロールごとに `fg` / `bg` / `bold` / `italic` / `underlined` / `dim` / `reversed` / `crossed_out` を指定できます。色は名前（`cyan`等）またはhex（`#ff8800`）。

## キーマップ

モード別にコマンドへキー（または配列）を割り当てます。修飾は `C-` / `S-` / `A-`。

```toml
[keymap.normal]
scroll_down = ["j", "down"]
prev_link = ["N", "backtab", "p"]
toggle_help = "h"

[keymap.preview]
preview_zoom_in = ["+", "="]
preview_zoom_out = "-"
```

| モード | 主なコマンド |
|---|---|
| `normal` | `scroll_down`、`scroll_up`、`half_page_*`、`jump_to_*`、`next_link`、`prev_link`、`next_heading`、`prev_heading`、`open_link`、`nav_back`、`start_search_*`、`toggle_help`、`toggle_checklist`、`quit` |
| `preview` | `close_preview`、`preview_zoom_*`、`quit` |
| `search` | `search_confirm`、`search_cancel`、`search_backspace` |

## 関連ページ

- [キーバインド](/projects/bmd/keybindings/)
- [開発環境](/projects/bmd/development/)
