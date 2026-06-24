---
title: "インフラの耐障害性 チェックリスト"
sidebar:
  order: 5
  label: "インフラの耐障害性"
---

リファレンス: [`infrastructure-resilience.md`](/docs/kamae/python/references/infrastructure-resilience/)。

## 16.1 リトライはインフラアダプターに留まっているか — Medium

ドメインモジュールや遷移関数内のリトライデコレータ、スリープループ、サーキットブレーカーを指摘する。

## 16.2 リトライは冪等性と組み合わされているか — High

冪等キーや重複排除レコードなしに、副作用を二重適用しうるリトライコマンド、アウトボックスプロセッサ、外部 API 呼び出しを指摘する。

[`persistence-events.md`](/docs/kamae/python/references/persistence-events/) と突き合わせる。

## 16.3 タイムアウトとサーキットブレーカーは明示的か — Medium

プロジェクトがタイムアウトとブレーカー期待を文書化しているのに、アダプターからの無制限 HTTP/DB/キュー呼び出しを指摘する。

## 16.4 耐障害ポリシーがドメイン失敗を隠していないか — Medium

リトライすべきでないバリデーション失敗、認可拒否、ビジネスルール拒否を隠しうる、あらゆる例外への広いリトライを指摘する。
