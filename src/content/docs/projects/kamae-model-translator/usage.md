---
title: "使い方"
description: "kamae-model-translator スキルのインストールとルール上書き"
sidebar:
  order: 5
  label: "使い方"
---

## 範囲

**kamae-model-port**と**kamae-model-bridge**のインストール、およびエージェント振る舞いの上書きです。移植手順は[移植（port）](/projects/kamae-model-translator/port/)、wire規約は[連携（bridge）](/projects/kamae-model-translator/bridge/)を参照してください。

## スキルのインストール

GitHub上のパッケージ名は`agent-skill-modelconverter`です。2 Skillがセットで入ります。

```bash
npx skills add manji-0/agent-skill-modelconverter \
  -s kamae-model-port -s kamae-model-bridge -g -y
```

Claude Code向け：

```bash
claude skills add manji-0/agent-skill-modelconverter
```

タスクに応じてportかbridgeかを選びます。単一言語の実装は各kamaeスキルで足ります。

## ルールの上書き

[rules/README.md](https://github.com/manji-0/kamae-model-translator/blob/main/rules/README.md)のとおり、`.claude/rules/*.md`や`.codex/rules/*.md`で振る舞いを上書きできます。

優先は**プロジェクトルール > ユーザーグローバル > 同梱defaults**です。`applies-to`でport / bridge / `*`を指定します。チームの命名やwire例外はここに書くとエージェントが揃いやすくなります。

## 向き不向き

向いているのは、kamaeサービスを別言語へ書き直すとき、混在環境でイベントやAPI契約を揃えるとき、discriminated unionの写像を不変条件付きで決めたいときです。

向いていないのは、単一言語の実装レビュー、OpenAPI / Protobufからの機械生成だけが目的のときです。

## 次に読む

移植順序は[移植（port）](/projects/kamae-model-translator/port/)、wireと契約テストは[連携（bridge）](/projects/kamae-model-translator/bridge/)。各言語のkamaeは[kamae-rs](/projects/kamae-rs/)、[kamae-scala](/projects/kamae-scala/)、[kamae-py](/projects/kamae-py/)です。
