# Slides (Slidev)

Slidev デッキのソースとビルドスクリプト。成果物は `site-worker/public/slides/` に出力される。

## コマンド

```bash
pnpm --filter slides run dev:sample   # ローカルプレビュー
pnpm --filter slides run build        # site-worker/public/slides/ へ出力
```

## デッキ追加

`decks/{deck-id}/slides.md` を追加して `pnpm --filter slides run build` を実行する。
URL は `/slides/{deck-id}/` になる。
