---
title: "設定"
description: "bmd のテーマとキーマップ"
sidebar:
  order: 3
---

このページは、`config.toml` と環境変数によるbmdの見た目・操作カスタマイズを扱います。既定キー一覧は [キーバインド](/projects/bmd/keybindings/) へ。インストールは [使い方](/projects/bmd/usage/) へ。

## 設定ファイル

任意設定は `~/.config/bmd/config.toml`（または `$XDG_CONFIG_HOME/bmd/config.toml`）です。無い場合は組み込み既定を使います。

## 環境変数

| 変数 | 意味 |
|---|---|
| `BMD_CHECKLIST_STYLE` | `unicode` / `emoji` / `ascii` / `auto`。`[view] checklist` より優先 |
| `BMD_DEBUG=1` | キーイベント等をstderrへ |

チェックリストマーカー:

| スタイル | 表示 |
|---|---|
| `unicode` | `☐` / `☑` |
| `emoji` | `⬜` / `✅` |
| `ascii` | `[ ]` / `[x]` |
| `auto` | Kitty、Ghostty、iTerm2、WezTerm、Apple Terminal、VS Code等ならemoji、それ以外はunicode |

環境変数と `[view] checklist` がどちらも無いときは `auto` 相当です。

## 表示

`[view]` で文書の幅とチェックリストマーカーを決めます。

```toml
[view]
checklist = "ascii"   # auto（既定） / unicode / emoji / ascii
max_width = 100       # 文書カラムの最大幅。0で端末幅いっぱい
```

`max_width` の既定は100です。これより広い端末では文書カラムを中央に寄せます。狭い端末は影響を受けません。`0` 以外で20未満の値は設定エラーです。

## テーマ

3つの組み込みプリセットから選び、必要ならロール単位で上書きします。

```toml
[theme]
preset = "dark"

[theme.link]
fg = "cyan"

[theme.h1]
underlined = false
```

| プリセット | 説明 |
|---|---|
| `cursor-midnight` | アプリ既定（`preset`省略時） |
| `dark` | 高コントラスト |
| `light` | 明るい背景向け |

これ以外の配色はプリセットとして同梱しません。ベースのプリセットに `[theme.<role>]` を重ねて作ります。

ロールごとに `fg` / `bg` / `bold` / `italic` / `underlined` / `dim` / `reversed` / `crossed_out` を指定できます。色は名前（`cyan`等）、hex（`#ff8800`）、256色インデックス（`208`）のいずれかです。

ロール名はテーマのキー（`text`、`h1`、`link`、`code_block`、`math`、`text_selection` 等）です。未知のロールは設定エラーになります。UI部品には専用のロールがあります。

| ロール | 対象 |
|---|---|
| `status_bar` | 下部ステータスバーの前景・背景 |
| `status_info` | 通知とキー入力待ちの表示 |
| `status_error` | エラー表示 |
| `popup_border` | アウトライン、ヘルプ、プレビューの枠 |

## キーマップ

モード別にコマンドへキー（または配列）を割り当てます。修飾は `C-` / `S-` / `A-`。

```toml
[keymap.normal]
scroll_down = ["j", "down"]
prev_link = ["N", "backtab"]
toggle_help = "h"

[keymap.preview]
preview_zoom_in = ["+", "="]
preview_zoom_out = "-"
```

| モード | 主なコマンド |
|---|---|
| `normal` | `scroll_down`、`scroll_up`、`half_page_*`、`jump_to_*`、`next_link`、`prev_link`、`next_heading`、`prev_heading`、`open_link`、`nav_back`、`nav_reset`、`start_search_*`、`toggle_help`、`toggle_outline`、`yank_prefix`、`copy_selection`、`quit` |
| `preview` | `close_preview`、`preview_zoom_*`、`quit` |
| `search` | `search_confirm`、`search_cancel`、`search_backspace` |

`close_help` と `toggle_checklist` は既定で未割り当てです。使う場合は自分でキーを割り当てます。`nav_reset` はアンカーと文書のスタックをまとめて空にします。既定では未割り当てです。

Normalモードの `Esc` は固定です。検索中は検索をクリアします。それ以外では `nav_back` と同じく1段戻ります。

## 次に読む

Mermaidと画像の描画方式は [レンダリング](/projects/bmd/rendering/) です。
