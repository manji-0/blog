---
title: "ライブラリガイド"
sidebar:
  order: 5
  label: "ライブラリガイド（参照）"
---

FastAPI、Pydantic、SQLAlchemy、HypothesisがKamaeのドメイン規約を補助するときの置き場所と既定をまとめます。設計判断の正規リファレンスは[ドメインモデリング](/projects/kamae-py/domain-modeling/)、[状態遷移](/projects/kamae-py/state-transitions/)、[境界防御](/projects/kamae-py/boundary-defense/)です。矛盾する場合はそちらを優先してください。

| 用途 | ガイド付きライブラリ |
| --- | --- |
| HTTP API | FastAPI |
| 検証 / ドメインstate | Pydantic v2 |
| SQL / ORM | SQLAlchemy 2.0 |
| プロパティテスト | Hypothesis |

## fastapi

FastAPIは**インターフェース層**に留めます。ルートはtransport DTOをパースし、ユースケースを呼び、`Result`/ドメインエラーをHTTPへマップします。`domain`パッケージは`fastapi`をimportしません。

```python
@router.post("/requests/{request_id}/assign-driver", status_code=status.HTTP_204_NO_CONTENT)
async def assign_driver(
    request_id: UUID,
    body: AssignDriverBody,
    use_case: AssignDriverUseCase = Depends(get_assign_driver_use_case),
    actor: Actor = Depends(get_actor),
    clock: Clock = Depends(get_clock),
) -> Response:
    result = await use_case(
        actor=actor,
        request_id=request_id,
        driver_id=body.driver_id,
        now=clock.now(),
    )
    if result.is_err():
        raise http_error_for(result.error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- `Depends`はコンポジションルートでのみport構築に使い、純粋遷移の中では使いません
- リクエスト形状失敗は`RequestValidationError`に任せ、ドメイン失敗は操作別エラーで404/409/403へ
- DBプールやOTel exporterはlifespanで配線し、import時にグローバルクライアントを作りません

## pydantic

**Pydantic v2**（`pydantic>=2,<3`）を要求します。PEP 695ジェネリクス（`TransitionOutcome[TState, TEvent]`など）には**2.11+**を推奨します。

- ドメインstate: `extra="forbid"`、`frozen=True`
- 外部DTO: 多くの場合`strict=True` — [境界防御](/projects/kamae-py/boundary-defense/)
- 未知データは境界でのみ`TypeAdapter.validate_python` / `validate_json`
- 信頼できない入力への`model_construct`、1モデル上のoptional status blob、v1 APIは避けます

## sqlalchemy

**2.0**スタイル（`select()`、`mapped_column`、`AsyncSession`）を使います。ORMエンティティはinfrastructureに留め、アダプタ境界で凍結Pydantic stateへマップします。

```text
ORM entity / Row  --mapper-->  Pydantic domain state
Session / transaction         --implements-->  RequestStore Protocol
```

`begin`/`commit`はユースケースが所有するアダプタ内です。集約stateとアウトボックス行は同一トランザクションに載せます。楽観的`version`列と競合エラーの扱いは[ドメインモデリング](/projects/kamae-py/domain-modeling/#リポジトリポート)を参照してください。

## hypothesis

入力全体の法則を最も明確にカバーできるときにdev依存として追加します。

```bash
uv add --dev hypothesis
```

- 公開コンストラクタとPydanticアダプタ経由で値を生成し、`model_construct`やprivate属性は使いません
- 1プロパティ1不変条件にし、shrinkingを読みやすく保ちます
- ケース集合が小さく閉じているなら通常のpytest表で十分です

## 次に読む

| 目的 | ページ |
| --- | --- |
| ポートと集約 | [ドメインモデリング](/projects/kamae-py/domain-modeling/) |
| ユースケース形 | [状態遷移](/projects/kamae-py/state-transitions/) |
| Ruff・pyrefly・pytest | [品質ゲート](/projects/kamae-py/quality-gates/) |
| 環境構築 | [使い方](/projects/kamae-py/usage/) |
