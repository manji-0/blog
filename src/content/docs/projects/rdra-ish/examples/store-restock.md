---
title: "店舗補充管理の例"
description: "rdra-ish v3.0.0 の samples/incremental-order を使い、要求分析からライフサイクル・業務ルールまでを Stage 0–7 で追う実践例"
sidebar:
  order: 20
  label: "店舗補充管理の例"
---

このページは、店舗運営部の「補充予定と担当組織の維持」を題材にした実践ウォークスルーです。要求分析からエンティティ構造、ライフサイクル、業務ルールまでをStage 0〜7で追います。Stageの定義は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) にあり、ソースはupstreamの [`samples/incremental-order`](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/samples/incremental-order) です。

## 前提

サンプルは8つのstepからなり、各stepが1つのStageに対応します。各stepは独立した `src/` を持ちます。前のstepを上書きせず、そのstepのモデルだけを `check` します。

| Step | Stage | 焦点 |
|---|---|---|
| `step-0-scope` | 0 Scope sketch | 業務領域とBUC名 |
| `step-1-buc-skeleton` | 1 BUC skeleton | アクターとユーザーに見えるユースケース |
| `step-2-screens` | 2 Screens | ユースケースごとの画面 |
| `step-3-data-touchpoints` | 3 Data touchpoints | 粗いエンティティ、直接CRUD、画面が示すエンティティ |
| `step-4-api-access-boundary` | 4 API and access boundary | API、システムの所有、権限と媒体の制約 |
| `step-5-entity-structure` | 5 Entity structure | 列とシステムをまたぐ関連の調整 |
| `step-6-lifecycle` | 6 Lifecycle | 状態、遷移、効果 |
| `step-7-business-rules` | 7A / 7B | `forbidden` と `invariant` |

各stepは次の形です。stepごとに `requirements-analysis.md`、`design.md`、`src/` の `.rdra` の順で読みます。

```text
samples/incremental-order/
  step-0-scope/
    requirements-analysis.md
    design.md
    src/
      shared/   # biz (actors and entities appear in later steps)
      buc/      # buc_store_restock.rdra
    out/        # generated diagrams and CSVs
  ...
  step-7-business-rules/
```

クローン後は次のルートで試せます。

```bash
git clone --branch v3.0.0 https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl/samples/incremental-order
```

以下、パスは `samples/incremental-order/` からの相対です。どのstepでも `rdra-ish next <step>/src` を実行すると、そのstepが到達したStageと次に足すものが表示されます。

## Stage 0のスコープ

**要求の焦点:** 店舗補充管理を店舗運営業務の一部として扱い、画面やデータ設計の前に、業務名と境界をレビューできること。

追加するのは業務領域とBUCだけです。業務領域は複数のBUCから参照される安定語彙なので `shared/biz.rdra` に置きます。

```rdra
// shared/biz.rdra
module shared.biz

business StoreOperations "Store Operations"
  description "Store operations owns restock planning and store master maintenance."

// buc/buc_store_restock.rdra
module buc.store_restock

import shared.biz

buc BucStoreRestock "Maintain Store Restock"
  description "Keep restock dates and store organization assignments operationally correct."

belongs(BucStoreRestock, StoreOperations)
```

```bash
rdra-ish check step-0-scope/src
rdra-ish next step-0-scope/src
```

この段階で固定する語彙は `StoreOperations` と `BucStoreRestock` です。アクターやユースケースを先に置くと、業務境界が固まる前に詳細化してしまいます。

## Stage 1のBUC骨格

**要求の焦点:** 店舗運営の担当者がBUCの実行主体として見え、補充予定日の変更と担当組織の変更を別ユースケースとしてレビューできること。

```rdra
// shared/actors.rdra
actor OpsStaff "Operations Staff"

// buc/buc_store_restock.rdra
usecase ChangeNextRestockDate "Change Next Restock Date"
usecase ChangeStoreParentOrganization "Change Store Parent Organization"

performs(OpsStaff, BucStoreRestock)
contains(BucStoreRestock, ChangeNextRestockDate)
contains(BucStoreRestock, ChangeStoreParentOrganization)
```

```bash
rdra-ish check step-1-buc-skeleton/src
rdra-ish diagram step-1-buc-skeleton/src --kind rdra --format mermaid --buc BucStoreRestock
```

画面やデータはまだ置きません。2つのユースケースが担当者にとって別の作業か、補充停止などの別ユースケース候補がないかを見ます。

## Stage 2の画面

**要求の焦点:** 担当者が両方のユースケースをどの画面で行うかを示し、データ項目が未確定でも操作の流れをレビューできること。

```rdra
screen StoreMaintenanceScreen "Store Maintenance"

displays(ChangeNextRestockDate, StoreMaintenanceScreen)
displays(ChangeStoreParentOrganization, StoreMaintenanceScreen)
```

```bash
rdra-ish check step-2-screens/src
rdra-ish diagram step-2-screens/src --kind screen --format mermaid --buc BucStoreRestock
```

画面はユースケースと並ぶシステム境界で、アクターが見て操作するものです。そのため、どのデータに触るかより先に決めます。担当者は同じ店舗を見ながら補充予定と担当組織を見直すので、画面は1つにまとめます。`shows` と `field` は、エンティティを置く次のstepで結びます。

## Stage 3のデータ接点

**要求の焦点:** 補充予定日の変更が店舗を更新し、担当組織の変更が組織を参照して店舗を更新することを示せること。店舗メンテナンス画面が対象の店舗と組織の候補を示すことも確認します。

```rdra
// shared/entities.rdra
entity Store "Store" {
  id: Int @pk
}

entity Organization "Organization" {
  id: Int @pk
}

// buc/buc_store_restock.rdra
shows(StoreMaintenanceScreen, Store)
shows(StoreMaintenanceScreen, Organization)

updates(ChangeNextRestockDate, Store)
reads(ChangeStoreParentOrganization, Organization)
updates(ChangeStoreParentOrganization, Store)
```

```bash
rdra-ish check step-3-data-touchpoints/src
rdra-ish csv step-3-data-touchpoints/src --kind matrix
rdra-ish diagram step-3-data-touchpoints/src --kind rdra --format mermaid --buc BucStoreRestock
```

CRUDマトリクスの出力です。

```csv
UseCase,Organization,Store
ChangeNextRestockDate,,U
ChangeStoreParentOrganization,R,U
```

オブジェクト関係のイメージです。

```diagram-design store-restock-context
```

エンティティは `id` だけで始め、列の定義より操作とデータ接点の妥当性を先に確かめます。API境界やトランザクションの責務はまだ決めないので、直接CRUDを使います。Organizationは参照だけです。担当組織そのものを変える業務ではないからです。

このstepで `next` はStage 4と判定します。ユースケースがAPIを呼ばないので、呼ばれるAPIがシステムに属することだけを求めるStage 4のゲートをそのまま満たすからです。

## Stage 4のAPIとアクセス境界

**要求の焦点:** 店舗保守の操作に要る権限と操作媒体をユースケースとAPIに示すこと。担当組織の変更では店舗更新と組織参照を別のAPI境界として見せます。補充予定日の変更は過剰にAPI化せず、直接更新のまま残します。

```rdra
// shared/biz.rdra
medium OpsConsole "Operations Console"
permission StoreMaintenanceWrite "Store Maintenance Write"

// buc/buc_store_restock.rdra
api StoreAdminApi "Store Admin API"
api OrganizationLookupApi "Organization Lookup API"
system StoreAdminSystem "Store Admin System"
system OrganizationSystem "Organization System"

belongs(BucStoreRestock, StoreOperations).by(OpsConsole)
has_permission(OpsStaff, StoreMaintenanceWrite)

requires_permission(ChangeNextRestockDate, StoreMaintenanceWrite)
requires_medium(ChangeNextRestockDate, OpsConsole)

contains(StoreAdminSystem, StoreAdminApi)
contains(OrganizationSystem, OrganizationLookupApi)
invokes(ChangeStoreParentOrganization, StoreAdminApi)
invokes(ChangeStoreParentOrganization, OrganizationLookupApi)
updates(StoreAdminApi, Store)
reads(OrganizationLookupApi, Organization)
requires_permission(ChangeStoreParentOrganization, StoreMaintenanceWrite)
requires_medium(ChangeStoreParentOrganization, OpsConsole)
requires_permission(StoreAdminApi, StoreMaintenanceWrite)
```

担当組織の変更の直接CRUD（`reads(ChangeStoreParentOrganization, Organization)` と `updates(ChangeStoreParentOrganization, Store)`）は、このstepでAPI側の `updates` / `reads` に置き換わります。媒体は `belongs(...).by(OpsConsole)` で業務とBUCの文脈に付けます。

```bash
rdra-ish check step-4-api-access-boundary/src
rdra-ish csv step-4-api-access-boundary/src --kind matrix
rdra-ish csv step-4-api-access-boundary/src --kind screen-constraints
rdra-ish csv step-4-api-access-boundary/src --kind actor-permission-audit
```

ユースケースのCRUDマトリクスでは、担当組織の変更の行が空になります。API側のCRUDは `csv --kind api-matrix` で確認します。

```csv
UseCase,Organization,Store
ChangeNextRestockDate,,U
ChangeStoreParentOrganization,,
```

```csv
Api,Organization,Store
OrganizationLookupApi,R,
StoreAdminApi,,U
```

画面の制約は直接書きません。`displays` と `invokes` から、ユースケースとAPIの `requires_*` が画面に導出されます。

```csv
screen_id,usecase_id,api_id,required_permissions,required_media
StoreMaintenanceScreen,ChangeNextRestockDate,,StoreMaintenanceWrite,OpsConsole
StoreMaintenanceScreen,ChangeStoreParentOrganization,OrganizationLookupApi,StoreMaintenanceWrite,OpsConsole
StoreMaintenanceScreen,ChangeStoreParentOrganization,StoreAdminApi,StoreMaintenanceWrite,OpsConsole
```

権限監査では、`OpsStaff` に割り当てた権限が必要とされ、状態が `ok` であることを確認します。

```csv
actor_id,actor_label,permission_id,permission_label,assigned,required,status,required_usecase_ids,required_api_paths
OpsStaff,Operations Staff,StoreMaintenanceWrite,Store Maintenance Write,true,true,ok,ChangeNextRestockDate|ChangeStoreParentOrganization,ChangeStoreParentOrganization->StoreAdminApi
```

直接CRUD（補充予定日）とAPI経由のCRUD（担当組織の変更）の混在は、この段階の判断として残します。

## Stage 5のエンティティ構造

**要求の焦点:** 店舗コードと組織コードを業務識別子として持ち、店舗が担当組織に属する関係をERとしてレビューできること。システム境界をまたぐ関係を調整するユースケースも明示します。

```rdra
// shared/entities.rdra
entity Store "Store" {
  id: Int @pk
  code: String @unique
  name: String
}

entity Organization "Organization" {
  id: Int @pk
  code: String @unique
  name: String
}

relate(Store, Organization, N:1)

// buc/buc_store_restock.rdra
coordinates(ChangeStoreParentOrganization, Store, Organization)
```

```bash
rdra-ish check step-5-entity-structure/src
rdra-ish diagram step-5-entity-structure/src --kind er --format mermaid
```

`code` を `@unique` にするのは、業務レビューではIDよりコードで店舗と組織を識別するからです。監査や履歴保持の要否が未確定なので、変更履歴のエンティティは足しません。

生成されるERのイメージです。

```diagram-design store-restock-er
```

Mermaidの出力では、`relate` が外部キー列 `organization_id` を生成します。

```text
erDiagram
  Organization {
    Int id PK
    String code
    String name
  }
  Store {
    Int id PK
    String code
    String name
    Int organization_id FK
  }
  Store }o--|| Organization : ""
```

## Stage 6のライフサイクル

**要求の焦点:** 補充状態をnormal・scheduled・blockedとして到達検証し、補充予定日の設定と状態変化を同じユースケースで説明できること。補充停止のときに予定日が残らないことも表します。

```rdra
// shared/entities.rdra
entity Store "Store" {
  id: Int @pk
  code: String @unique
  name: String
  restock_status: Enum(normal, scheduled, blocked) @default(normal)
  next_restock_date: DateTime @null
}

// buc/buc_store_restock.rdra
usecase BlockScheduledRestock "Block Scheduled Restock"
contains(BucStoreRestock, BlockScheduledRestock)

transitions(ChangeNextRestockDate, Store.restock_status, normal -> scheduled)
sets(ChangeNextRestockDate, Store.next_restock_date == present)

displays(BlockScheduledRestock, StoreMaintenanceScreen)
updates(BlockScheduledRestock, Store)
transitions(BlockScheduledRestock, Store.restock_status, scheduled -> blocked)
sets(BlockScheduledRestock, Store.next_restock_date == null)
requires_permission(BlockScheduledRestock, StoreMaintenanceWrite)
requires_medium(BlockScheduledRestock, OpsConsole)
```

```bash
rdra-ish check step-6-lifecycle/src
rdra-ish states step-6-lifecycle/src --entity Store
rdra-ish diagram step-6-lifecycle/src --kind state --format mermaid
```

状態を動かすのはユースケースです。`transitions` はユースケースを先頭に取り、列は `Entity.col` で書きます。このサンプルはイベントを使わず、ユースケースが遷移と `sets` を直接持ちます。blockedからnormalへ戻すユースケースは、まだ入れません。

`states` の出力です。2つの軸の組み合わせ6通りのうち、3つに到達します。

```text
Entity: Store (Store)
  axes: restock_status[normal|scheduled|blocked], next_restock_date[null|present]

  RESTOCK_STATUS  NEXT_RESTOCK_DATE  INITIAL  TERMINAL  VIA
  ──────────────  ─────────────────  ───────  ────────  ────────────────────────────────────────────────────────────────────────────
  normal          null               yes      no        -
  scheduled       present            no       no        BucStoreRestock/ChangeNextRestockDate
  blocked         null               no       yes       BucStoreRestock/BlockScheduledRestock, BucStoreRestock/ChangeNextRestockDate

  reachable: 3 / bound: 6
  diagnostics:
    [info][NoCreationPath_Store] no creates(...) found; seeded from column defaults
```

`NoCreationPath_Store` はinfoです。`creates` がないので、列の既定値（`@default(normal)` と `null`）から初期状態を作ったことを示します。

このstepで `next` は `stage 6 Lifecycle, required stages complete` を表示し、任意のルールStageを提示します。

## Stage 7の業務ルール

**要求の焦点:** scheduledで予定日がないパターンを検出し、blockedで予定日が残るパターンを禁止できること。状態到達表をレビューして、ルール違反の有無を判断します。

| ルール | 内容 | DSL |
|---|---|---|
| BR-001 | scheduledの店舗には `next_restock_date` が必要 | `invariant` |
| BR-002 | blockedの店舗に `next_restock_date` を残してはいけない | `forbidden` |

```rdra
// shared/entities.rdra
forbidden(Store, restock_status == blocked, next_restock_date == present)

invariant(Store).when(restock_status == scheduled).then(next_restock_date == present)
```

```bash
rdra-ish check step-7-business-rules/src
rdra-ish states step-7-business-rules/src --entity Store
```

`forbidden` は任意のStage 7A、`invariant` はStage 7Bに当たります。このstepで `next` は7Aと7Bをmetとし、7Cを提示します。`states` の到達表はStage 6と同じ3状態で、どちらのルールにも違反しません。

`normal` と予定日 `present` の組み合わせは禁止しません。将来、予定日を事前に入力する要求を妨げないためです。比較や時間の性質まで厳密に見る場合は [形式検証](/projects/rdra-ish/formal-verification/) へ進みます。

## 最終形の骨格

step-7のBUCファイルは次の形に収束します（`description` と重複する `shows` は省略しています）。

```rdra
module buc.store_restock

import shared.biz
import shared.actors
import shared.entities

buc BucStoreRestock "Maintain Store Restock"
usecase ChangeNextRestockDate "Change Next Restock Date"
usecase ChangeStoreParentOrganization "Change Store Parent Organization"
usecase BlockScheduledRestock "Block Scheduled Restock"
screen StoreMaintenanceScreen "Store Maintenance"
api StoreAdminApi "Store Admin API"
api OrganizationLookupApi "Organization Lookup API"
system StoreAdminSystem "Store Admin System"
system OrganizationSystem "Organization System"

belongs(BucStoreRestock, StoreOperations).by(OpsConsole)
performs(OpsStaff, BucStoreRestock)
has_permission(OpsStaff, StoreMaintenanceWrite)
contains(BucStoreRestock, ChangeNextRestockDate)
contains(BucStoreRestock, ChangeStoreParentOrganization)
contains(BucStoreRestock, BlockScheduledRestock)

displays(ChangeNextRestockDate, StoreMaintenanceScreen)
shows(StoreMaintenanceScreen, Store)
updates(ChangeNextRestockDate, Store)
transitions(ChangeNextRestockDate, Store.restock_status, normal -> scheduled)
sets(ChangeNextRestockDate, Store.next_restock_date == present)
requires_permission(ChangeNextRestockDate, StoreMaintenanceWrite)
requires_medium(ChangeNextRestockDate, OpsConsole)

displays(ChangeStoreParentOrganization, StoreMaintenanceScreen)
shows(StoreMaintenanceScreen, Organization)
contains(StoreAdminSystem, StoreAdminApi)
contains(OrganizationSystem, OrganizationLookupApi)
invokes(ChangeStoreParentOrganization, StoreAdminApi)
invokes(ChangeStoreParentOrganization, OrganizationLookupApi)
updates(StoreAdminApi, Store)
reads(OrganizationLookupApi, Organization)
coordinates(ChangeStoreParentOrganization, Store, Organization)
requires_permission(ChangeStoreParentOrganization, StoreMaintenanceWrite)
requires_medium(ChangeStoreParentOrganization, OpsConsole)
requires_permission(StoreAdminApi, StoreMaintenanceWrite)

displays(BlockScheduledRestock, StoreMaintenanceScreen)
updates(BlockScheduledRestock, Store)
transitions(BlockScheduledRestock, Store.restock_status, scheduled -> blocked)
sets(BlockScheduledRestock, Store.next_restock_date == null)
requires_permission(BlockScheduledRestock, StoreMaintenanceWrite)
requires_medium(BlockScheduledRestock, OpsConsole)
```

エンティティの列と制約は、Stage 6〜7の抜粋のとおり `shared/entities.rdra` に置きます。

## 実務のループ

1. 要求をそのStageの焦点に絞る（Mustだけ先に固定する）
2. 差分だけ `.rdra` に足す
3. `check` と `--buc` 付きの `diagram`、`states`、`csv` でレビューする
4. `next` で到達Stageと次の問いを確かめ、次のStageへ進む（warningは探索の信号、errorはブロッカー）

## 次に読む

Stageの定義とディレクトリ規約は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) にあります。構文は [言語リファレンス](/projects/rdra-ish/language-reference/)、状態の厳密な検証は [形式検証](/projects/rdra-ish/formal-verification/) を参照してください。各stepの全文は [`samples/incremental-order`](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/samples/incremental-order) の `requirements-analysis.md` と `design.md` にあります。
