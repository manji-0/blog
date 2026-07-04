# Slides (Slidev)

Slidev デッキのソースとビルドスクリプト。成果物は `site-worker/public/slides/` に出力される。

新規デッキ作成は Cursor skill **create-slidev-deck**（`.cursor/skills/create-slidev-deck/`）を参照。

## 共有レイアウト

| パス | 役割 |
|------|------|
| `components/AgendaToc.vue` | 章番号付きアジェンダ（全デッキ auto-import） |
| `styles/manjio.css` | cover / toc / center / statement の調整 |
| `decks/{id}/setup/main.ts` | 共有 CSS 読み込み |

テンプレート雛形: `.cursor/skills/create-slidev-deck/template/slides.md`

## コマンド

```bash
pnpm --filter slides exec slidev decks/{deck-id}/slides.md --open   # 任意デッキのプレビュー
pnpm --filter slides run dev:sample   # sample デッキのプレビュー
pnpm --filter slides run build        # site-worker/public/slides/ へ出力
```

## デッキ追加

`decks/{deck-id}/slides.md` を追加して `pnpm --filter slides run build` を実行する。
URL は `/slides/{deck-id}/` になる。
