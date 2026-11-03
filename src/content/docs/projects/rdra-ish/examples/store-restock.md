---
title: "店舗補充管理の例"
description: "要求分析からデータモデリング・ライフサイクル・業務ルールまでを Stage 0–7 で追う実践例"
sidebar:
  order: 20
  label: "店舗補充管理の例"
---

<!-- derived-from ../incremental-modeling.md#Stage-一覧 -->

このページは、店舗運営部の「補充予定と担当組織の維持」を題材に、要求分析からエンティティ構造・ライフサイクル・業務ルールまでをStage 0–7で追う実践ウォークスルーです。[段階的モデリング](/projects/rdra-ish/incremental-modeling/) の概念表に対応し、ソースはupstreamの [`samples/incremental-order`](https://github.com/manji-0/rdra-ish-dsl/tree/v1.0.0/samples/incremental-order) です。

## 前提

各Stageは独立した `src/` を持ちます。前段を上書きせず、その段階のモデルだけを `check` します。

```text
samples/incremental-order/
  step-0-scope/src/
  step-1-buc-skeleton/src/
  step-2-screens/src/
  ...
  step-7-business-rules/src/
    shared/   # actors, biz, entities
    buc/      # buc_store_restock.rdra
```

クローン後は次のルートで試せます。

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
```

以下、パスは `samples/incremental-order/` からの相対です。どのStepでも `rdra-ish next <step>/src` を実行すると、そのStepが到達したStageと次に足すものが表示されます。

## Stage 0のスコープ

<!-- derived-from ../incremental-modeling.md#Stage-一覧 -->

**要求の焦点:** 店舗補充管理を店舗運営業務のスライスとして切り、画面やデータを置くより先に業務名と境界をレビューできること。

追加するのは業務領域とBUC名だけです。

```rdra
// shared/biz.rdra
business StoreOperations "Store Operations"

// buc/buc_store_restock.rdra
buc BucStoreRestock "Maintain Store Restock"
belongs(BucStoreRestock, StoreOperations)
```

```bash
rdra-ish check step-0-scope/src
```

この段階で固定する語彙は `StoreOperations` と `BucStoreRestock` です。発注実行・在庫引当・配送は対象外のままにします。

## Stage 1のBUC骨格

**要求の焦点:** 店舗運営の担当者が実行主体として見え、補充予定日の変更と担当組織変更を別ユースケースとしてレビューできること。

```rdra
actor OpsStaff "Operations Staff"

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

データや画面はまだ置きません。UCの粒度が業務担当者にとって別作業か、だけを見ます。

## Stage 2の画面

**要求の焦点:** 担当者が各ユースケースをどの画面で行うかを、どのデータに触るかより先に固められること。

```rdra
screen StoreMaintenanceScreen "Store Maintenance"

displays(ChangeNextRestockDate, StoreMaintenanceScreen)
displays(ChangeStoreParentOrganization, StoreMaintenanceScreen)
```

```bash
rdra-ish check step-2-screens/src
rdra-ish diagram step-2-screens/src --kind screen --format mermaid
```

画面はアクターが見て操作するシステム境界です。v1.0.0のStage順では、データより先に画面を決めます。

## Stage 3のデータ接点

**要求の焦点:** 粗いエンティティとUC直結のCRUDで、どの操作がどのデータに触るか、画面が何を見せるかを説明できること。

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

CRUDマトリクスのイメージ：

```csv
UseCase,Organization,Store
ChangeNextRestockDate,,U
ChangeStoreParentOrganization,R,U
```

オブジェクト関係のイメージ：

```diagram-design store-restock-context
```

カラム詳細やAPIはまだ入れません。Organizationは参照のみ（担当組織マスタ自体の変更ではない）です。このStepで `next` はStage 4と判定します。UCがAPIを呼ばないので、API・アクセス境界のgateをそのまま満たすからです。

## Stage 4のAPIとアクセス境界

**要求の焦点:** 担当組織変更では店舗更新と組織参照を別API境界として見える化し、各APIを所有するシステムと、操作に要る権限・媒体を明示できること。補充予定日の変更は過剰なAPI化を避けてよい。

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

```bash
rdra-ish check step-4-api-access-boundary/src
rdra-ish csv step-4-api-access-boundary/src --kind actor-permission-audit
rdra-ish csv step-4-api-access-boundary/src --kind screen-constraints
```

担当組織変更のUC直結CRUD（`reads(ChangeStoreParentOrganization, Organization)` と `updates(ChangeStoreParentOrganization, Store)`）は、このStepでAPI側の `updates` / `reads` に置き換わります。direct CRUD（補充予定日）とAPI CRUD（担当組織変更）の混在は、この段階の判断として残します。媒体は `belongs(...).by(OpsConsole)` で業務とBUCの文脈に付けます。

## Stage 5のエンティティ構造

**要求の焦点:** 店舗・組織の業務識別子とN:1関係をERとしてレビューし、境界越え関係の調整責務をユースケースに明示できること。

```rdra
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
coordinates(ChangeStoreParentOrganization, Store, Organization)
```

```bash
rdra-ish check step-5-entity-structure/src
rdra-ish diagram step-5-entity-structure/src --kind er --format mermaid
```

生成されるERのイメージ：

```diagram-design store-restock-er
```

## Stage 6のライフサイクル

**要求の焦点:** 補充状態（normal / scheduled / blocked）と次回の補充予定日の有無を、同じユースケースで説明し到達検証できること。

```rdra
entity Store "Store" {
  id: Int @pk
  code: String @unique
  name: String
  restock_status: Enum(normal, scheduled, blocked) @default(normal)
  next_restock_date: DateTime @null
}

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
rdra-ish diagram step-6-lifecycle/src --kind state --format mermaid --buc BucStoreRestock
```

v1.0.0では状態を動かすのはユースケースです。`transitions` はUCを先頭に取り、列は `Entity.col` で書きます。このサンプルはイベントを使わず、UCが遷移と `sets` を直接持ちます。blockedからnormalへ戻すUCは、このサンプルではまだ入れません。このStepで `next` は必須Stageの完了（`stage 6 Lifecycle, required stages complete`）を表示します。

## Stage 7の業務ルール

**要求の焦点:** scheduledには予定日が必要、blockedに予定日を残してはいけない、をDSL上の制約として検出し、状態到達表で違反がないことを確認できること。

```rdra
forbidden(Store, restock_status == blocked, next_restock_date == present)

invariant(Store).when(restock_status == scheduled).then(next_restock_date == present)
```

```bash
rdra-ish check step-7-business-rules/src
rdra-ish states step-7-business-rules/src --entity Store
```

`forbidden` は任意のStage 7A、`invariant` はStage 7Bに当たります。`normal + present` は禁止しません（業務上許容する判断）。比較や時間性質まで厳密に見る場合は [形式検証](/projects/rdra-ish/formal-verification/) へ進みます。

## 最終形の骨格

Stage 7のBUC側の関係は次の形に収束します。

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

エンティティ側の列と制約はStage 6–7の抜粋をそのまま共有モジュール（`shared/entities.rdra`）に置きます。

## 実務のループ

<!-- derived-from #Stage-0のスコープ -->
<!-- derived-from #Stage-1のBUC骨格 -->
<!-- derived-from #Stage-2の画面 -->
<!-- derived-from #Stage-3のデータ接点 -->
<!-- derived-from #Stage-4のAPIとアクセス境界 -->
<!-- derived-from #Stage-5のエンティティ構造 -->
<!-- derived-from #Stage-6のライフサイクル -->
<!-- derived-from #Stage-7の業務ルール -->

1. 要求をそのStageの焦点に絞る（Mustだけ先に固定する）
2. 差分だけ `.rdra` に足す
3. `check` と `--buc` 付きdiagram / `states`、それに `csv` でレビューする
4. `next` で到達Stageと次の問いを確かめ、次Stageへ進む（warningは探索信号、errorはブロッカー）

## 次に読む

Stageの定義とディレクトリ規約の正本は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) です。構文は [言語リファレンス](/projects/rdra-ish/language-reference/)、状態の厳密検証は [形式検証](/projects/rdra-ish/formal-verification/)。フル差分は [`samples/incremental-order`](https://github.com/manji-0/rdra-ish-dsl/tree/v1.0.0/samples/incremental-order) の各stepの `requirements-analysis.md` と `design.md` を参照してください。
