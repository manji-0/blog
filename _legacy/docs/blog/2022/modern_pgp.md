# 今っぽくPGP鍵を作って管理してみる

## TL;DR
* Yubikeyにmaster keyを格納
* 普段使いする鍵はmaster keyで署名した別鍵
* 主鍵はP521で作る
* 副鍵は用途に合わせてアルゴリズムを選ぶ
    * Sign: P521
    * Encrypt: RSA4096
    * Auth: ed25519

## PGP鍵
大昔からあるPGP。今でも個人間での暗号文のやりとりや、Git commitの署名などに使われている。スノーデン騒動のときにちょっと話題になったりした記憶がある。

現代では公開鍵の広報に昔ながらのkeyserverだけでなく[keybase](https://keybase.io/)がそこそこ使われるようになっており、SNS的な文化との融合が進んでいる。

また、概念が分散モデルであり昨今のWeb3うんたらの流行にマッチしていることから、個人的にはこれからインターネット上の個人証明手段としての存在感が増していくのではないかと考えている。

最近僕は副業を探し始めたり、仕事の一環でOSSにコミットしたりすることがあったりで、Github上で「どの立場で書いたコードなのか」を明らかにしたいというモチベーションがあった。なので、そのために所属組織ごとにPGP鍵を管理することとした。

## Yubikey
YubikeyはOTP, FIDO U2F, FIDO2, OpenPGPなどに対応した物理キーである。今時セキュリティに敏感な人なら誰でも知ってるブランドではないだろうか。

昔USB-C&NFCに対応したモデルが出たときに買っていたのだが、全く使っていなかった。

今回PGP鍵を管理するにあたって、「どこかのマシンに鍵データを置く」ことを避けたかったので、外部から読み出し不可能な鍵ストレージとしてYubikeyを使い始めることにした。

## Keybase
[Keybase](https://keybase.io/)はPGP鍵および各種アカウントと個人の紐付けを承認する & keybaseアカウント間でのPGPによる暗号文通信を提供するサービス。

SNSのようなフォロー、フォロワーの概念が存在し、フォローしてる人のPGP公開鍵をマシンにインポートしたりすることができる。

なんとなく今時はここにPGP公開鍵を広報するのがモダンな感じがするので、ここに公開できる鍵形式でmaster keyを作ることを目標にしたい。

## 作成するPGP鍵の構造と管理
今回は

* master keyとして1つの鍵束を作成 → Yubikeyに保存
* 個人用の鍵として1つの鍵束を作成 → master keyで署名して個人マシンに保存
* 所属組織ごとに鍵束を作成 → master keyで署名して各組織用のマシンに保存

することを目指す。master keyは他の鍵に署名できる必要があるので、master keyのmain keyもyubikeyに保存する。

これらの鍵はすべてkeybaseに登録されることとする。

PGP用語である主鍵、副鍵などの概念については面倒なので説明しない。

詳しいことは[gnomeのhelpページ](https://help.gnome.org/users/seahorse/stable/index.html.en#pgp-keys)とか読めば分かる。


## GPGでの鍵作成とKeybaseへの公開鍵登録
### GPG
GNUのpgp実装。Mac OSだとデフォルトではコマンドが叩けない。

今回はhomebrewで`2.3.7`を入れてそれを使う。

### 鍵の生成
主鍵はNIST P521を使う。Yubikey 5が対応している & 楕円曲線が好きだという理由。

RSA4096でも実用上問題は無いはずだが、公開鍵のサイズが大きくなるので注意。一般に楕円曲線暗号鍵の方がRSA暗号鍵より強度あたりの公開鍵のサイズが小さいと認識している。

BrainpoolはYubikeyが対応していないと思う(ソースが曖昧)ので選ばないよう気をつける。

```
gpg --full-gen-key --expert
gpg (GnuPG) 2.3.7; Copyright (C) 2021 Free Software Foundation, Inc.
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.

ご希望の鍵の種類を選択してください:
   (1) RSA と RSA
   (2) DSA と Elgamal
   (3) DSA (署名のみ)
   (4) RSA (署名のみ)
   (7) DSA (機能をあなた自身で設定)
   (8) RSA (機能をあなた自身で設定)
   (9) ECC (署名と暗号化) *デフォルト
  (10) ECC (署名のみ)
  (11) ECC (機能をあなた自身で設定)
  (13) 既存の鍵
  (14) カードに存在する鍵
あなたの選択は? 9
ご希望の楕円曲線を選択してください:
   (1) Curve 25519 *デフォルト
   (2) Curve 448
   (3) NIST P-256
   (4) NIST P-384
   (5) NIST P-521
   (6) Brainpool P-256
   (7) Brainpool P-384
   (8) Brainpool P-512
   (9) secp256k1
あなたの選択は? 5
鍵の有効期限を指定してください。
         0 = 鍵は無期限
      <n>  = 鍵は n 日間で期限切れ
      <n>w = 鍵は n 週間で期限切れ
      <n>m = 鍵は n か月間で期限切れ
      <n>y = 鍵は n 年間で期限切れ
鍵の有効期間は? (0)0
鍵は無期限です
これで正しいですか? (y/N) y

GnuPGはあなたの鍵を識別するためにユーザIDを構成する必要があります。

本名: John Wick
電子メール・アドレス: john@example.com
コメント: example
次のユーザIDを選択しました:
    "John Wick (example) <john@example.com>"

名前(N)、コメント(C)、電子メール(E)の変更、またはOK(O)か終了(Q)? O
たくさんのランダム・バイトの生成が必要です。キーボードを打つ、マウスを動か
す、ディスクにアクセスするなどの他の操作を素数生成の間に行うことで、乱数生
成器に十分なエントロピーを供給する機会を与えることができます。
たくさんのランダム・バイトの生成が必要です。キーボードを打つ、マウスを動か
す、ディスクにアクセスするなどの他の操作を素数生成の間に行うことで、乱数生
成器に十分なエントロピーを供給する機会を与えることができます。
gpg: 失効証明書を '/Users/manji0/.gnupg/openpgp-revocs.d/40D8FB9F15D6A5E7491B3CC796E9266F721E54E4.rev' に保管しました。
公開鍵と秘密鍵を作成し、署名しました。

pub   nistp521 2022-08-20 [SC]
      40D8FB9F15D6A5E7491B3CC796E9266F721E54E4
uid                      John Wick (example) <john@example.com>
sub   nistp521 2022-08-20 [E]
```

作成後の確認

```
$ gpg -K

sec   nistp521 2022-08-20 [SC]
      40D8FB9F15D6A5E7491B3CC796E9266F721E54E4
uid           [  究極  ] John Wick (example) <john@example.com>
ssb   nistp521 2022-08-20 [E]
```

### 副鍵の追加
P521は復号速度が遅いので、Encrypt鍵はRSAで再作成する。SignはP521でよい。Authはopensshとの互換性を踏まえてed25519を使う。

手順は以下。

1. Encrypt用の副鍵を削除
2. Encrypt用の副鍵を作成(RSA4096)
3. Sign用の副鍵を作成(NIST P521)
4. Auth用の副鍵を作成(ed25519)

```
gpg --expert --edit-key 40D8FB9F15D6A5E7491B3CC796E9266F721E54E4
gpg (GnuPG) 2.3.7; Copyright (C) 2021 Free Software Foundation, Inc.
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.

秘密鍵が利用できます。

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  nistp521/6FE32982D3CFE6AE
     作成: 2022-08-20  有効期限: 無期限      利用法: E
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> ## Delete exist key
gpg> key 1

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb* nistp521/6FE32982D3CFE6AE
     作成: 2022-08-20  有効期限: 無期限      利用法: E
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> delkey
この鍵を本当に削除しますか? (y/N) y

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> ## Add subkey for Encrypt
gpg> addkey
ご希望の鍵の種類を選択してください:
   (3) DSA (署名のみ)
   (4) RSA (署名のみ)
   (5) Elgamal (暗号化のみ)
   (6) RSA (暗号化のみ)
   (7) DSA (機能をあなた自身で設定)
   (8) RSA (機能をあなた自身で設定)
  (10) ECC (署名のみ)
  (11) ECC (機能をあなた自身で設定)
  (12) ECC (暗号化のみ)
  (13) 既存の鍵
  (14) カードに存在する鍵
あなたの選択は? 6
RSA 鍵は 1024 から 4096 ビットの長さで可能です。
鍵長は? (3072) 4096
要求された鍵長は4096ビット
鍵の有効期限を指定してください。
         0 = 鍵は無期限
      <n>  = 鍵は n 日間で期限切れ
      <n>w = 鍵は n 週間で期限切れ
      <n>m = 鍵は n か月間で期限切れ
      <n>y = 鍵は n 年間で期限切れ
鍵の有効期間は? (0)
鍵は無期限です
これで正しいですか? (y/N) y
本当に作成しますか? (y/N) y
たくさんのランダム・バイトの生成が必要です。キーボードを打つ、マウスを動か
す、ディスクにアクセスするなどの他の操作を素数生成の間に行うことで、乱数生
成器に十分なエントロピーを供給する機会を与えることができます。

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  rsa4096/36F15D8D3A16899C
     作成: 2022-08-20  有効期限: 無期限      利用法: E
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> ## Add subkey for Sign
gpg> addkey
ご希望の鍵の種類を選択してください:
   (3) DSA (署名のみ)
   (4) RSA (署名のみ)
   (5) Elgamal (暗号化のみ)
   (6) RSA (暗号化のみ)
   (7) DSA (機能をあなた自身で設定)
   (8) RSA (機能をあなた自身で設定)
  (10) ECC (署名のみ)
  (11) ECC (機能をあなた自身で設定)
  (12) ECC (暗号化のみ)
  (13) 既存の鍵
  (14) カードに存在する鍵
あなたの選択は? 10
ご希望の楕円曲線を選択してください:
   (1) Curve 25519 *デフォルト
   (2) Curve 448
   (3) NIST P-256
   (4) NIST P-384
   (5) NIST P-521
   (6) Brainpool P-256
   (7) Brainpool P-384
   (8) Brainpool P-512
   (9) secp256k1
あなたの選択は? 5
鍵の有効期限を指定してください。
         0 = 鍵は無期限
      <n>  = 鍵は n 日間で期限切れ
      <n>w = 鍵は n 週間で期限切れ
      <n>m = 鍵は n か月間で期限切れ
      <n>y = 鍵は n 年間で期限切れ
鍵の有効期間は? (0)0
鍵は無期限です
これで正しいですか? (y/N) y
本当に作成しますか? (y/N) y
たくさんのランダム・バイトの生成が必要です。キーボードを打つ、マウスを動か
す、ディスクにアクセスするなどの他の操作を素数生成の間に行うことで、乱数生
成器に十分なエントロピーを供給する機会を与えることができます。

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  rsa4096/36F15D8D3A16899C
     作成: 2022-08-20  有効期限: 無期限      利用法: E
ssb  nistp521/78D108ED2D99529D
     作成: 2022-08-20  有効期限: 無期限      利用法: S
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> ## Add subkey for Auth
gpg> addkey
ご希望の鍵の種類を選択してください:
   (3) DSA (署名のみ)
   (4) RSA (署名のみ)
   (5) Elgamal (暗号化のみ)
   (6) RSA (暗号化のみ)
   (7) DSA (機能をあなた自身で設定)
   (8) RSA (機能をあなた自身で設定)
  (10) ECC (署名のみ)
  (11) ECC (機能をあなた自身で設定)
  (12) ECC (暗号化のみ)
  (13) 既存の鍵
  (14) カードに存在する鍵
あなたの選択は? 11

このECC鍵にありうる操作: Sign Authenticate
現在の認められた操作: Sign

   (S) 署名機能を反転する
   (A) 認証機能を反転する
   (Q) 完了

あなたの選択は? S

このECC鍵にありうる操作: Sign Authenticate
現在の認められた操作:

   (S) 署名機能を反転する
   (A) 認証機能を反転する
   (Q) 完了

あなたの選択は? A

このECC鍵にありうる操作: Sign Authenticate
現在の認められた操作: Authenticate

   (S) 署名機能を反転する
   (A) 認証機能を反転する
   (Q) 完了

あなたの選択は? Q
ご希望の楕円曲線を選択してください:
   (1) Curve 25519 *デフォルト
   (2) Curve 448
   (3) NIST P-256
   (4) NIST P-384
   (5) NIST P-521
   (6) Brainpool P-256
   (7) Brainpool P-384
   (8) Brainpool P-512
   (9) secp256k1
あなたの選択は? 1
鍵の有効期限を指定してください。
         0 = 鍵は無期限
      <n>  = 鍵は n 日間で期限切れ
      <n>w = 鍵は n 週間で期限切れ
      <n>m = 鍵は n か月間で期限切れ
      <n>y = 鍵は n 年間で期限切れ
鍵の有効期間は? (0)
鍵は無期限です
これで正しいですか? (y/N) y
本当に作成しますか? (y/N) y
たくさんのランダム・バイトの生成が必要です。キーボードを打つ、マウスを動か
す、ディスクにアクセスするなどの他の操作を素数生成の間に行うことで、乱数生
成器に十分なエントロピーを供給する機会を与えることができます。

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  rsa4096/36F15D8D3A16899C
     作成: 2022-08-20  有効期限: 無期限      利用法: E
ssb  nistp521/78D108ED2D99529D
     作成: 2022-08-20  有効期限: 無期限      利用法: S
ssb  ed25519/B171BE1DDD21233D
     作成: 2022-08-20  有効期限: 無期限      利用法: A
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> save
```

### setprofする
この手順で作成したPGP鍵について、公開鍵をKeybaseに登録しようとするとエラーが出て失敗する。

この問題については[GithubでIssueが立っており](https://github.com/keybase/keybase-issues/issues/4025)、`setpref`で公開鍵の属性を編集することで回避することができると判明している。

`setpref AES256 AES192 AES 3DES SHA512 SHA384 SHA256 SHA224 SHA1 ZLIB BZIP2 ZIP mdc no-ks-modify`

```
$ gpg --edit-key 40D8FB9F15D6A5E7491B3CC796E9266F721E54E4
gpg (GnuPG) 2.3.7; Copyright (C) 2021 Free Software Foundation, Inc.
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.

秘密鍵が利用できます。

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  rsa4096/36F15D8D3A16899C
     作成: 2022-08-20  有効期限: 無期限      利用法: E
ssb  nistp521/78D108ED2D99529D
     作成: 2022-08-20  有効期限: 無期限      利用法: S
ssb  ed25519/B171BE1DDD21233D
     作成: 2022-08-20  有効期限: 無期限      利用法: A
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> setpref AES256 AES192 AES 3DES SHA512 SHA384 SHA256 SHA224 SHA1 ZLIB BZIP2 ZIP mdc no-ks-modify
優先指定の一覧を設定:
     暗号方式: AES256, AES192, AES, 3DES
     AEAD:
     ダイジェスト: SHA512, SHA384, SHA256, SHA224, SHA1
     圧縮: ZLIB, BZIP2, ZIP, 無圧縮
     機能: MDC, 鍵サーバ 修正しない
優先指定を本当に更新しますか? (y/N) y

sec  nistp521/96E9266F721E54E4
     作成: 2022-08-20  有効期限: 無期限      利用法: SC
     信用: 究極        有効性: 究極
ssb  rsa4096/36F15D8D3A16899C
     作成: 2022-08-20  有効期限: 無期限      利用法: E
ssb  nistp521/78D108ED2D99529D
     作成: 2022-08-20  有効期限: 無期限      利用法: S
ssb  ed25519/B171BE1DDD21233D
     作成: 2022-08-20  有効期限: 無期限      利用法: A
[  究極  ] (1). John Wick (example) <john@example.com>

gpg> save
```

この処理を施した後、`$ keybase pgp select --multi` を使ってアップロードすることができるようになる。

## Yubikeyへの転送
### Yubikey PGP機能のリセット
YubikeyをMacに挿した状態で、`gpg --card-edit`からリセットする。

```
$ gpg --card-edit

# ここにYubikeyの情報がずらずら出てくる

gpg/card> admin
管理者コマンドが許可されています

gpg/card> help
quit           このメニューを終了
admin          管理コマンドを表示
help           このヘルプを表示
list           全有効データを表示
name           カード所有者の名前の変更
url            鍵を取得するURLの変更
fetch          カードURLで指定された鍵の取得
login          ログイン名の変更
lang           言語の優先指定の変更
salutation     カード所有者の敬称の変更
cafpr          CAフィンガープリントの変更
forcesig       署名強制PINフラグを反転
generate       新しい鍵を生成
passwd         PINブロックの解除や変更のメニュー
verify         PINを確認しすべてのデータを表示する
unblock        PINをリセット・コードでブロックを解除する
factory-reset  すべての鍵とデータを破壊します
kdf-setup      PIN認証のKDFを設定する (on/single/off)
key-attr       鍵の属性の変更
uif            ユーザインタラクションフラグの変更
```

`factory-reset` した後、`passwd` を使ってPINを設定する。

factory reset後のPINはデフォルト値に設定される。

* PIN: `123456`
* Admin PIN: `12345678`

### 主鍵、副鍵のバックアップ
* `gpg --armor --export-secret-keys <ID>`
* `gpg --armor --export-secret-subkeys <ID>`

で書き出し、どこか安全な場所に置く。

QRコードにして印刷して金庫にでも入れておくのが一番よい。

### YubikeyへのPGP鍵書き込み

作ったkeyをedit modeから`keytocard`する。

手順は[ここ](https://keens.github.io/blog/2021/03/23/yubikeywotsukau_openpghen/)が参考になる。

keytocardした後、`gpg> save` しないと鍵がローカルに残ったままになるので注意。

## 用途別の鍵の作成と署名
個人用に `$ gpg --full-gen-key --expert` で鍵を作成する。

また、MacでYubikey内の鍵を使えるように[公式ガイド](https://github.com/drduh/YubiKey-Guide#macos)を参考に必要な設定を済ませておく。

その後、`$ gpg -u <master key id> --sign-key <key id>` でuidを署名していく。

## 公開
`$ gpg --export <key id> | curl -T - https://keys.openpgp.org` などで公開する。

keys.openpgp.orgを使う場合、コマンド実行後にメールの認証リンクが表示されるのでそれを使ってメールアドレスの認証を実施する必要がある。

keybaseにも公開する場合には、setprofした後に `$ keybase pgp select --multi` でアップロードしていく。

## 別のPCでYubikeyを使う
[公式ガイド](https://github.com/drduh/YubiKey-Guide#macos)に従って環境を整えた後、

* `$ gpg --card-edit`
* `gpg> verify`

で認証し、gpgの秘密鍵リストを更新する。 `$ gpg -K` で鍵が見えれば成功。

Signなどの操作を実行する場合、エラーが出る場合がある。恐らく`export GPG_TTY=$(tty)` をすると解決する。

### 組織別の鍵を登録、署名、公開
それぞれのPCで署名操作の実施可能を確認した後、個人用と同じように組織別の鍵を作成し、Yubikeyの鍵を使って署名、公開する。

## Githubへ登録
Githubにログインし、Preference → SSH and GPG keysから登録する。

## Gitの設定
コミット時に自動で署名するよう、gitconfigを設定する。

```
[user]
	name = Wataru Manji
	email = <each mail address>
	signingkey = <key id>
[commit]
	gpgsign = true
```

## Github上での見え方
[こんな感じ](https://github.com/manji-0/blog/commit/e22f74fe03ee79f1d3839537c545e522930100d3)