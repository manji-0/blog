---
title: AstroのサイトとWorker 4つを、Voidのアプリ1つにまとめる
description: Astroで生成するmanj.ioと、それを配信するWorker、ステータス用のproxy Worker 3つを、Voidのアプリ1つに移した話。ファイルルーティングへの書き換え、public/が先に返るせいで鍵付きページが素通しになる罠、Nixで揃えたツールチェーン、既存Workerを引き継ぐ初回デプロイで止められた理由をまとめる
summary: "The Worker that served this Astro site and three status proxy Workers became one Void app with file routes. Why a key-gated page would have leaked through `public/`, what a Nix toolchain exposed, and why the first deploy refused to run."
tags: [void, cloudflare-workers, astro, nix]
---

このサイト（manj.io）は、Astroで静的なHTMLを生成し、Cloudflare Workersで配信している。配信の部分を、[Void](https://void.cloud)のアプリ1つにまとめた。Voidは、Viteの上に作られたCloudflare Workers向けのフレームワークで、デプロイ用のCLIも兼ねている。

先に断っておくと、ページの生成はいまもAstroが担っている。Voidに移したのは、Astroが出力したファイルの配信と、その横で動いていたWorkerたちである。移したあとの姿は次のとおりだ。

| | 移行前 | 移行後 |
|---|---|---|
| ページの生成 | Astro | Astro（変わらず） |
| 配信 | `site-worker`（wranglerで手書きの `fetch` ハンドラ） | Voidのアプリ（`routes/` のファイルルーティング） |
| 最新の投稿 | `latest-statuses.manji.app` のWorker | 同じアプリの `/api/statuses` |
| GitHub Status | `github-status-proxy.manji.app` のWorker | 同じアプリの `/api/status/github/*` |
| Cloudflare Status | `cloudflare-status-proxy.manji.app` のWorker | 同じアプリの `/api/status/cloudflare/*` |
| デプロイのワークフロー | 4本 | 1本 |
| ツールチェーン | ワークフローごとに `setup-node`（Node.js 22）、`pip`、`apt-get` で導入 | Nix flakeのdevShell |

lockファイルを除いた差分は58ファイル、+591 / −975だった。Workerのコードに限ると+382 / −622で、移行したら行数が減った。

## なぜまとめたのか

もともとWorkerが4つあったのは、必要になった順で1つずつ足したからである。最新の投稿をトップページに出したくなってproxyを1つ、ステータスのバッジを出したくなってさらに2つ、という具合だ。それぞれが `wrangler.jsonc`、`package.json`、デプロイ用のワークフローを持ち、サブドメインを1つずつ使っていた。

この構成には、細かい手間が積み重なっていた。

- 別のオリジンから読むので、proxyはすべてCORSのヘッダーを返す必要がある。
- GitHub StatusとCloudflare Statusのproxyは、どちらも90行のほぼ同じコードで、違うのは上流のURLだけだった。
- 依存を上げるときは、4か所の `package.json` を揃えて上げる。

同じオリジンの `/api/*` に置けば、これらはまとめて消える。Voidを選んだのは、ファイルを置くだけでルートが増える仕組みと、bindingやsecretをコードから型付きで扱える点が、この規模にちょうどよかったからだ。

## 手書きの `fetch` からファイルルーティングへ

移行前の `site-worker/src/index.ts` は173行で、パスを見て処理を振り分ける `if` が並んでいた。

```ts
const { pathname } = new URL(request.url);
if (pathname.startsWith(R2_ROUTE_PREFIX)) {
	return handleR2Asset(request, env);
}

if (isCardPath(pathname)) {
	return handleCard(request, env);
}

return handleAssetMiss(request, env);
```

Voidでは、`routes/` 以下のファイルの置き場所がそのままパスになる。移行後の `routes/` は次のとおりだ。

```text
routes/
├── api/
│   ├── statuses.ts
│   └── status/
│       ├── cloudflare/{index.ts, [endpoint].ts}
│       └── github/{index.ts, [endpoint].ts}
├── assets/r2/[...key].ts
├── card/{index.ts, [...path].ts}
└── slides/{index.ts, [deck]/[...rest].ts}
```

各ファイルは、HTTPメソッドの名前でハンドラを書き出すだけである。

```ts
// routes/assets/r2/[...key].ts
import { defineHandler } from 'void';
import { handleR2Asset } from '../../../src/r2';

export const GET = defineHandler((c) => handleR2Asset(c.req.raw, c.env.R2_ASSETS));
```

処理の本体は `src/` に置いたまま、ルートのファイルは振り分けだけを担う。もとの `if` の並びが、ディレクトリの並びに置き換わった形だ。GETとHEAD以外に405を返す処理も、自分では書かなくてよくなった。

3つのproxyも同じ形で入れた。GitHub StatusとCloudflare Statusは上流のURLが違うだけなので、`src/statuspage.ts` に1つの関数としてまとめ、ルートのファイルからは上流の指定だけを渡す。

```ts
export const GITHUB_STATUSPAGE: Statuspage = { name: 'github', origin: 'https://www.githubstatus.com' };
export const CLOUDFLARE_STATUSPAGE: Statuspage = { name: 'cloudflare', origin: 'https://www.cloudflarestatus.com' };
```

フロント側は、`https://latest-statuses.manji.app/statuses` を読んでいた箇所を `/api/statuses` に変えた。ビルド時にCloudflare Statusを取りに行く処理は、proxyを経由せず上流のAPIを直接呼ぶようにした。ビルドはブラウザの中で動くわけではないので、CORSのためのproxyはもともと要らなかった。

### bindingとsecret

R2のbindingは `void.config.ts` の `cloudflare` に書く。ここに書いた値は、Voidが生成するCloudflare向けの設定へそのまま渡る。

```ts
cloudflare: {
	name: 'manjio',
	r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: 'manjio-assets' }],
},
```

Voidは、コードから使い方を推論できたbindingには自動で型を付ける。手で書いたbindingは推論の対象外なので、型は自分で宣言する。

```ts
declare global {
	interface VoidGeneratedEnvBindings {
		R2_ASSETS: R2Bucket;
	}
}
```

NFC名刺のページで使う鍵 `CARD_KEY` は、`env.ts` に宣言する。

```ts
export default defineEnv({
	CARD_KEY: string().optional(),
});
```

コードからは `import { env } from 'void/env'` で読み、本番の値は `void secret put CARD_KEY` で設定する。手元の `.env` がデプロイされることはない。

## 罠: `public/` のファイルは、ルートより先に返る

移行でいちばん危なかったのが、NFC名刺のページである。このページは、URLに正しい鍵（`?k=...`）が付いているときだけ表示し、それ以外は404を返す。ページのHTMLと、連絡先を配るvCardは、Astroがほかのページと一緒に生成している。

移行前は、wranglerの設定でこのパスだけWorkerを先に通していた。

```jsonc
"assets": {
  "directory": "./public",
  "run_worker_first": ["/assets/r2/*", "/card", "/card/*"]
}
```

Voidは、すべてのリクエストでWorkerを動かす。ただしその中で、`public/` に同じパスのファイルがあれば、ルートより先にそのファイルを返す。つまり、Astroの出力を `public/` にそのまま置くと、`routes/card/index.ts` で鍵を確かめる前に `public/card/index.html` が返ってしまう。鍵の確認が、まるごと素通しになる。

そこで、Astroの出力を `public/` に集めるスクリプトで、名刺のファイルだけを `public/` の外（`private/card/`）へ移すようにした。

```js
// Void serves files in public/ before routes run, so the key-gated card must
// not be there. src/card.ts bundles these files into the Worker instead.
renameSync(cardPublicDir, cardPrivateDir);
```

移したファイルは、Viteの `?raw` でWorkerのコードに文字列として埋め込む。

```ts
import cardHtml from '../private/card/index.html?raw';
import vcard from '../private/card/manji0.vcf?raw';
```

こうすると、名刺のファイルは鍵を確かめるコードを通らないと外に出ない。静的ファイルとして配るものと、Workerが判断してから返すものを、置き場所で分けた形である。

小さな罠がもう1つあった。`routes/card/[...path].ts` のような可変長のルートは、残りの部分が空のパスには一致しない。`/card/` は `index.ts` と `[...path].ts` のどちらにも当たらないので、`void.config.ts` のリダイレクトで `/card` へ送っている。

```ts
routing: {
	redirects: {
		'/card/': { to: '/card', status: 308 },
	},
},
```

### `/assets/` を取り合う

R2に置いた大きな画像は、`/assets/r2/*` のルートから返している。一方でViteは、自分がビルドしたファイルを既定で `/assets/` 以下に出力する。同じパスを取り合わないよう、Viteの出力先を変えた。

```ts
export default defineConfig({
	plugins: [voidPlugin()],
	build: { assetsDir: '_void' },
});
```

## ツールチェーンをNixで揃える

Void 1.5.0は、Node.jsのバージョンを `^24.22.0 || >=26.12.0` に限っている。移行前のCIは、各ワークフローで `actions/setup-node` を使ってNode.js 22を入れていたので、この条件を満たさない。ほかにも、フォントのサブセット化に使うWOFF2対応のfonttoolsを `pip` で、検索の索引に使うSQLiteを `apt-get` で、それぞれのワークフローが個別に入れていた。

これらをNix flakeのdevShellにまとめ、CIのすべてのステップを `nix develop --command bash` の中で動かすことにした。

```nix
default = pkgs.mkShell {
  packages = [
    nodejs   # pkgs.nodejs_26
    pnpm
    python   # fonttools + brotli + zopfli
    pkgs.sqlite
  ];
};
```

```yaml
defaults:
  run:
    shell: nix develop --command bash -e {0}
```

これで、手元とCIが同じバージョンの道具で動くようになった。

ただ、道具の中身が変われば挙動も変わる。CIに移した直後、検索の索引を確かめるステップが落ちた。

```text
Parse error: no such column: "document_count"
  SELECT value FROM search_metadata WHERE key = "document_count";
```

SQLの文字列はシングルクォートで囲むのが標準で、ダブルクォートは列名などの識別子に使う。SQLiteは互換性のため、ダブルクォートで囲んだ文字列も既定で受け付けてきた。しかし、Nixから入れたsqlite3ではこの互換動作が無効になっていて、`"document_count"` を列名として読む。もともと書き方が間違っていて、それが `apt-get` で入れたsqlite3では表に出ていなかっただけである。シングルクォートに直して終わった。

## 初回デプロイ: 別名で試し、本番では止められる

### 別名のWorkerで試す

Voidは、Cloudflareの名前付き環境（`wrangler.jsonc` の `env`）に対応していない。本番と同じ設定でデプロイすると、そのまま本番のWorkerを置き換えてしまう。

そこで、手元で `cloudflare.name` だけを一時的に `manjio-preview` に変えてデプロイした。新しいWorkerができ、workers.devのURLで全ルートを確かめられる。確認が済んだら、そのWorkerを消して設定を戻した。

### 既存のWorkerを引き継ぐ

本番のWorker `manjio` へ初めてデプロイしたとき、Voidは何もアップロードせずに止まった。

```text
▲ Worker deployment stopped.
■ deploy: the existing Worker has dashboard-managed routes or visibility that Void cannot safely republish.
  Add its current routes, workers_dev, and preview_urls values to the root Cloudflare config, then retry; no version was uploaded.
```

`www.manj.io` は、Cloudflareのダッシュボードで `manjio` にCustom Domainとして付けていた。プレビューURLの有効・無効も、ダッシュボードで決めた値のままだった。設定ファイルにない値を、Voidは勝手に上書きしない。食い違ったまま進めると、ドメインが外れたり、URLの公開範囲が変わったりするかもしれないからだ。

Cloudflare APIで今の値を確かめると、`workers_dev` と `preview_urls` はどちらも有効で、ゾーンのRouteはなかった。これを設定に書き写した。

```ts
cloudflare: {
	name: 'manjio',
	workers_dev: true,
	preview_urls: true,
	routes: [{ pattern: 'www.manj.io', custom_domain: true }],
	// ...
},
```

これで2回目のデプロイは通った。ダッシュボードで決めた値を設定ファイルに書く手間はかかったが、本番のドメインを黙って外されるよりずっとよい。

### lockファイルをコミットしてからCIへ

初回のデプロイで、Voidは `void.lock.json` を生成する。作成したリソースのIDなどを記録するファイルで、Voidのドキュメントは「初回は1台のマシンからデプロイし、lockファイルをコミットしてからほかのマシンやCIでデプロイする」としている。初回のデプロイが途中で失敗すると、作りかけのリソースがアカウントに残ることがあるからだ。

手元からの初回デプロイが済んだところで `void.lock.json` をコミットし、PRをマージした。以降は、mainへのpushでCIがデプロイする。

CIで `void deploy` を動かすときは、もう1つ気をつけることがある。ページを事前に生成するアプリでは、VoidがISRのキャッシュを作るか尋ねてくる。CIには答える人がいないので、`routing.isr: false` で先に答えを書いておいた。このサイトのページはすべてAstroが事前に生成していて、エッジで描画するものはない。

## まとめ

Workerを4つから1つにまとめたことで、デプロイのワークフローも、CORSのヘッダーも、ほぼ同じコードの重複もなくなった。手書きの振り分けはディレクトリの構造になり、行数は減った。

引っかかったのは、どれも「前の仕組みが黙ってやっていたこと」だった。

- wranglerの `run_worker_first` は、名刺のページを静的ファイルより先にWorkerへ通していた。Voidでは置き場所を分けて、同じ守りを作り直した。
- ランナーのsqlite3は、間違った書き方のSQLを黙って受け付けていた。
- ダッシュボードで付けたドメインは、設定ファイルのどこにも書かれていなかった。

3つ目は、Voidが止めてくれたおかげで事故にならなかった。移行の前に、いまの仕組みが暗黙に何をしているかを書き出しておくと、こうした穴に先回りできる。

役目を終えた `*.manji.app` の3つのWorkerは、まだ動いている。古いURLを読んでいる人がいないことを確かめてから消す予定だ。
