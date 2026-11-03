---
title: "レンダリング"
description: "bmd のMermaid・画像・端末フォールバック"
sidebar:
  order: 10
---

このページは、bmdのMarkdownレンダリングパイプライン、Mermaid描画、端末別フォールバックを扱います。利用手順は [使い方](/projects/bmd/usage/) へ。キー操作は [キーバインド](/projects/bmd/keybindings/) へ。

## パイプライン概要

```text
src/
├── main.rs           # エントリと端末初期化
├── app/              # ループ、入力、描画、ナビ
├── domain/           # ドメインモデルと型付き状態遷移
├── parse/            # pulldown-cmark → ドメイン
├── render/           # ドメイン → ratatui
├── config.rs         # config.toml
├── keymap.rs         # モード別キー
├── browser.rs        # OSでリンクを開く
└── error.rs
```

pulldown-cmarkでMarkdownをドメインモデルに変換し（reStructuredTextとAsciiDocは専用のパーサーで変換し）、ratatuiでTUIに描画します。コードブロックはsyntectでハイライトします。編集やチェックボックスのファイル書き戻しは行いません。

## Mermaid描画

Mermaidコードブロックは [merman](https://crates.io/crates/merman) でラスター化します。外部のNode CLIやブラウザランタイムは要りません。図はmerman 0.9の既定の見た目で描きます。背景は透明なので、端末の背景色の上に表示されます。

| 端末 | 描画方式 |
| --- | --- |
| Kitty、Ghostty、iTerm2、WezTerm等 | グラフィックスプロトコルでインライン表示 |
| その他 | PNGに書き出し、OSの既定ビューア（`open` / `xdg-open`）で開く |

Previewモードでは `+` / `-` / `0` でズーム、`Esc` / `o` / `O` で閉じます。Mermaidブロック由来のリンクは `o` / `Enter` で描画プレビューを開きます。

## 画像プレビュー

`![alt](path.png)` 形式の画像はratatui-imageでフローティングプレビューします。グラフィックス対応端末で見た目が最も良くなります。

## タスクリスト

チェックボックスはセッション内でのトグルのみです。左クリックで切り替えますが、Markdownファイルへは書き戻しません。キーで切り替えたい場合は `toggle_checklist` にキーを割り当てます（既定は未割り当て）。マーカー表示は `BMD_CHECKLIST_STYLE` または [設定](/projects/bmd/configuration/) の `[view] checklist` で `auto` / `unicode` / `emoji` / `ascii` から選べます。

## 表示幅とステータスバー

端末幅が `[view] max_width`（既定100）より広いとき、文書はその幅で折り返し、カラムを中央に寄せます。`0` で上限を外せます。

脚注は本文の下にまとめて描きます。ステータスバーは現在のセクション（`Guide › Install › From source` の形）と、選択中のリンクURLまたは脚注ラベルを示します。幅が足りないときは優先度の低い項目から省き、長いファイル名は末尾を残します。

## リンク処理

| 種類 | 例 | 動作 |
| --- | --- | --- |
| Web | `[text](https://…)` | OSのブラウザで開く。対応形式の文書を指すGitHubのblob URLは、bmdの中で開く |
| Anchor | `[text](#section)` | 見出しへジャンプ（履歴スタックあり） |
| Document | `[text](./other.md)` | 同ビューで開く（ファイルスタック）。`#section` 付きならその見出しで開く |
| Image | `![alt](path.png)` | フローティングプレビュー |
| Mermaid | mermaidコードブロック | 描画プレビュー |

`O` と `Esc` は、どちらも1段戻る操作です。プレビューが開いていれば閉じ、無ければ直前のジャンプへ戻ります。アンカーと文書ナビが両方あるときはアンカーが優先されます。戻り先はステータスバーに `back → README.md` の形で出ます。`other.md#section` から戻るときは、1回の `Esc` でリンク元の文書へ戻ります。

## 主要依存

| 目的 | クレート |
|---|---|
| TUI | ratatui、crossterm |
| Markdown | pulldown-cmark |
| ハイライト | syntect |
| Mermaid | merman（PNGラスター） |
| 画像 | ratatui-image、image |

## ソース開発

devbox推奨のビルド手順：

```bash
git clone https://github.com/manji-0/bmd.git
cd bmd
devbox shell
devbox run setup
devbox run build
devbox run build-release
devbox run test
devbox run clippy
devbox run fmt
devbox run prek
```

| スクリプト | 内容 |
|---|---|
| `build` / `build-release` | デバッグ / リリース |
| `build-linux-x86_64` | macOSから静的Linux x86_64（musl） |
| `package` | `dist/*.tar.gz` を作り、crates.ioへ公開する（`cargo publish` まで実行する） |

devboxはプロジェクトローカルの `RUSTUP_HOME` / `CARGO_HOME` / `SCCACHE_DIR` と `RUSTFLAGS="-C linker=clang"`、`RUSTC_WRAPPER=sccache` を設定します。devboxと素の `cargo` を混ぜると `RUSTFLAGS` 差でインクリメンタルが壊れやすいです。

設計メモはupstreamの [`PLAN.md`](https://github.com/manji-0/bmd/blob/main/PLAN.md) です。機能確認用Markdownは `docs/func-check/` にあります。

## 次に読む

キー操作は [キーバインド](/projects/bmd/keybindings/) です。テーマ設定は [設定](/projects/bmd/configuration/) へ。
