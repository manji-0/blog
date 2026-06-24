---
title: "プロパティベーステスト チェックリスト"
sidebar:
  order: 5
  label: "プロパティベーステスト"
---

参照: [`property-based-tests.md`](/docs/kamae/rust/references/property-based-tests/)

## 16.1 ジェネレータは公開コンストラクタを使っているか — High

`new`、`try_new`、`TryFrom` ではなく、生リテラルやプライベートフィールドでドメイン構造体を組み立てる `proptest` / `quickcheck` 戦略をフラグする。

## 16.2 各プロパティは名前付き不変条件か — Medium

法則（往復、冪等性、拒否ルールなど）を述べず、`is_ok()` だけをアサートする、または非構造化出力を比較するだけのプロパティテストをフラグする。

## 16.3 前提条件は `prop_assume!` で強制されているか — Medium

ドメイン外入力を成功と失敗のどちらとも曖昧に扱うのではなく、明示的に破棄すべきプロパティをフラグする。

## 16.4 非法遷移は特定エラーまでテストされているか — Medium

[`state-transitions.md`](/docs/kamae/rust/review/checklist/state-transitions/) も照合する。呼び出し元がエラーバリアントに依存するのに、非法遷移で `is_err()` だけを確認するプロパティテストをフラグする。

## 16.5 プロパティ内で非決定的 I/O は避けているか — High

注入フェイクや固定クロックなしに、ライブ DB、ネットワーク、壁時計に当たる `proptest!` ブロックをフラグする。

## 16.6 縮小済みケースの回帰ファイルはコミットされているか — Low

プロパティが微妙なバグを見つけ、最小反例を黙って消えさせたくないときは `proptest-regressions` を提案する。
