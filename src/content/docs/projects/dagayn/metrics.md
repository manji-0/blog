---
title: "構造メトリクス"
description: "dagayn のコミュニティ・フロー・ADP/SDP/SAP メトリクス"
sidebar:
  order: 10
---

`dagayn build` の後処理で、リファクタの **観測フェーズ** に使える数値指標を計算する。ソースを1行も読まずに「どこに手を入れるべきか」を絞り込める。

`architecture_analysis_tool` がこれらを1ショットで返す。リポジトリ初見診断の起点として使う。

## コミュニティ（Leiden 分割）

[Leiden アルゴリズム](https://www.nature.com/articles/s41598-019-41695-z)でグラフをコミュニティ分割し、各コミュニティの **凝集度（cohesion）** を計算する。

凝集度（cohesion）は次の比で定義する。

```text
cohesion = コミュニティ内エッジ数 / コミュニティに接続する全エッジ数
```

凝集度は1.0に近いほど、コミュニティ内に閉じている。

| cohesion | 解釈 |
| --- | --- |
| 1.0 に近い | 内側に閉じた独立サブシステム |
| 低い + サイズ大 | 内部境界が無い塊の候補。Leiden が「どこで切ればいいか分からなかった」領域 |

コミュニティを上位構造として捉え、その中でHub / Bridge / 大関数を見つけるのが定石です。

## Hub nodes（fan-in / fan-out）

| パターン | 意味 | リスク |
| --- | --- | --- |
| 入次数が異常に高い | type coupling / utility coupling | 名前変更・移動コストが跳ね上がる |
| 出次数が異常に高い | dispatcher coupling | 変更が周囲に広範囲に波及 |

## Bridge nodes（betweenness centrality）

最短経路に対する媒介中心性が高いノード。道路網の「橋」に相当し、触るとblast radiusが大きいチョークポイントになる。

リファクタ前後で同じメトリクスを叩けば、「betweennessがtop-10圏外に落ちた」といった客観的な改善検証ができる。

## 実行フロー（Flows）

CLIコマンド、HTTPハンドラ、MCPツールハンドラなどの **エントリポイント** から葉に向かう到達経路を事前計算する。

| ツール | 用途 |
| --- | --- |
| `flow_tool` | 特定フローの経路一覧 |
| `get_affected_flows`（review 経由） | 変更ノードがどのフローに乗るか |

「この関数を変えたらどのユーザーフローが壊れるか」を機械的に洗い出します。hookの日常運用では `--skip-flows` で省略し、大きな変更の後にフル再計算するのが現実的です。

## ADP — Acyclic Dependencies Principle

「パッケージ間に循環依存があってはならない」。

### 母集団

依存分析のエッジ種別（`CALLS` は除外）：

- `IMPORTS_FROM`
- `DEPENDS_ON`
- `INHERITS`
- `IMPLEMENTS`

粒度はファイル単位かパッケージ単位を選べる。

### 計測

NetworkX `simple_cycles` で循環を列挙し、severityを付ける。

| 要素 | 意味 |
| --- | --- |
| `length` | サイクル内パッケージ数 |
| `edge_weight` | サイクル内エッジ重み合計 |
| `severity` | `length × edge_weight` |

結果はseverityの降順で出力するため、「短く軽い循環は後回し、長く重い循環を優先する」という順序になります。既定値は `min_cycle_size=2` / `max_cycle_length=10` です。上限を超える長い循環は打ち切ります。

## SDP — Stable Dependencies Principle

「依存は **安定した方** に向くべき」。

各パッケージ \(P\) について：

| 記号 | 定義 |
| --- | --- |
| \(C_a\) | 入次数（他から依存されている数） |
| \(C_e\) | 出次数（他へ依存している数） |
| \(I = C_e / (C_a + C_e)\) | **不安定度**（instability） |

| \(I\) | 解釈 |
| --- | --- |
| 0 | 他から依存されるが自分は依存しない＝最安定 |
| 1 | 自分だけが依存しまくる＝最不安定 |

SDP違反は「依存元より依存先の方が不安定」なエッジ。安定側が不安定側へ依存すると、不安定側の変更が安定側へ逆流する。

検出条件の例：`I(source) < I(target) − min_delta`（既定 `min_delta = 0.1`）

## SAP — Stable Abstractions Principle

「安定したパッケージほど **抽象的** であるべきです」。SDPと組み合わせて運用します。

| 記号 | 定義 |
| --- | --- |
| \(N_a\) | 抽象型（interface / protocol / trait / ABC 等）の数 |
| \(N_t\) | 全 top-level 型の数 |
| \(A = N_a / N_t\) | **抽象度**（abstractness） |

main sequence：\(A + I = 1\)

距離：\(D = |A + I - 1|\)（0が理想、1が最悪）

| ゾーン | 条件 | 意味 |
| --- | --- | --- |
| **Pain zone** | \(A=0, I=1\) | 全部具体で誰からも依存されないが自分は何にでも依存。触ると壊れる塊 |
| **Useless zone** | \(A=1, I=0\) | 宣言だけで拡張も呼び出しもされない |

抽象判定は言語ごとに異なり、`extra.is_abstract` / `extra.is_contract` / `extra.type_role` メタデータを使う。

## 3原則の関係

同じ依存部分グラフを別角度から見る3つの原則：

| 原則 | 問い |
| --- | --- |
| **ADP** | 循環がないか（DAG であるか） |
| **SDP** | エッジの向きが安定度に沿っているか |
| **SAP** | 抽象度と安定度のバランスが main sequence 近傍か |

CLI：`detect-adp` / `sdp-metrics` / `detect-sdp` / `sap-metrics` / `detect-sap`

MCP：`detect_adp_violations_tool` / `compute_sdp_metrics_tool` 等。

## 運用パターン

1. `architecture_analysis_tool` でコミュニティ・hub・bridgeを俯瞰
2. ADPで循環のseverity順リストを取得
3. SDP / SAPでパッケージ配置の違和感を数値化
4. リファクタ後に同じコマンドで数字が動いたか検証

## 関連記事

- [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/) — メトリクス詳説とdagayn自身への適用例

## 関連ページ

- [グラフモデル](/projects/dagayn/graph-model/)
- [ストレージと SQLite](/projects/dagayn/storage/)
- [レビューと影響分析](/projects/dagayn/review-analysis/)
