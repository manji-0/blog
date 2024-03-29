# エンジニア組織で面接を設計するときに考えたこと

先月からVerdaのSREチームのマネージャーになり、そのタイミングで[インタビュー記事](https://gihyo.jp/dev/serial/01/line2021/0008)が出たりした。
マネージャーになってからの仕事として、とりあえずチームの体制や役割を明確にしたり、それに応じた採用戦略を考えたりしている。
その中で面接設計については運用開始できるとこまで仕上がったので、メモを残してみようと思う。

**免責事項:**
* 具体的な採用基準については書かない どっかから怒られそうなので
* 面接中の設問についての例は挙げるけど、それがそのまま出るわけではない

## 1. 以前の面接設計の振り返り
LINEのエンジニア職種のスタンダードな中途採用フローは、

1. (カジュアル面談)
2. 書類選考
3. 1次面接 (エンジニア、チームマネージャー)
4. 2次面接 (シニアマネージャー、担当役員)

という4ステップになっている。

VerdaのSREチームもこれを踏襲していたのだけど、1次面接の中で以下のようなことを進めなくてはいけなくて、1回の面接では合否判断が難しいという課題感があった。

* 技術スキルの確認
* 経歴の深掘り
* 行動指針のチェック
* チームのミッションへの理解度チェック
* 技術的/ビジネス的な興味関心のチェック
* キャリアプランについてのヒアリング

...いや難しいというか無理だよ。面接は1時間しかないのに最後まで進められるわけがない。少なくとも僕の腕では無理。過去にこのやり方で今のメンバーが集まったのが奇跡だと思う。今までの担当者は面接のプロ集団だったに違いない。

さて、振り返ったところで改善する方法を考える。幸いLINEは採用に関する現場の権限がかなり広くて、オリジナルのフローを作って運用するくらいのことはチームマネージャーが自由にやってOKだったので、ゴリゴリに弄ることにした。

## 2.ペルソナの設定
採用フローを決める前に、どんな人を採用したいのかというイメージは固めておく必要があるなと思ったので、適当に書いてみてチームメンバーにコメントを貰うことを何回か繰り返した。
正直なところ当初は「賢くて感情的に安定していて新しいことを学ぶことに抵抗が無い人」だったらいいなーくらいのイメージしかなかったのだけど、その具体度のイメージでは採用フローに落としこめないので頑張って具体化した。

### 行動面
* 心理的安全なチームを維持するための協調性がある
* 困ったときや忙しいときに他人への相談やタスクの整理に目を向けられる視野の広さがある
* 主体的な行動力を基本としたリーダーシップがある
* 未知の分野についても進んで学びアウトプットする好奇心がある

### 技術面
* 高い可用性を持つシステムをデザインするための基礎知識がある
* 低レイヤの技術知識に基いてシステムのトラブルシューティングを実施できる
* 現代的な監視のデザインと任意のシステムを監視するにあたって必要な監視項目の定義を実施できる程度の知識がある
* CI/CDを実現するための仕組みと必要な文化を一貫してデザインできる程度の知識がある
* マイクロサービス的な文脈でサービスの責務の分担と信頼性を損なうシナリオの検討およびその対応策を一貫して実施できる程度の知識がある

## 3.行動面接の観点を決める

行動面接の方が市中に情報や事例が多そうだったので、こちらから観点を考え始めた。

まず参考にしたのが、LINE社員の行動指針である LINE STYLE。

これは一般に公開されてるので、是非読んで欲しい。僕らのチームもこの内容に全面的に同意している。

[LINE STYLE BOOK](https://linecorp.com/pdf/ja/LINE_STYLE_BOOK.pdf)

次に参考にしたのが「採用基準」という本。リーダーシップの重要性と面接での測り方についてすごく参考になった。

[採用基準 (伊賀 泰代)](https://www.amazon.co.jp/dp/B00B42SX70)

最後に参考にしたのがLinkedinが公開している行動面接の質問集。行動面接の採用基準はここの分類を参考に分類とレベル分けをして構造化した。

[30 Essential Behavioral Interview Questions](https://business.linkedin.com/content/dam/me/business/en-us/talent-solutions/resources/pdfs/Guide-to-screening-candidates-30-essential-behavioral-interview-questions-ebook.pdf)

## 4. 技術面接の観点を決める
技術面接についてはペルソナが決まった段階で「システムデザインは絶対に入れよう」と考えていて、それを軸に進め方を考えた。

色々メンバーとも議論した結果、最終的には

* 1次面接: システムデザインを作ってもらい、面接官が内容を理解できるまで問答
* 2次面接: 1次で作ってもらったデザインを元にした議論とトラブルシューティングのケース試験

みたいな感じで、1時間ずつの合計2時間を使うことにした。

システムデザインで出す課題についてはとりあえず用意したけど、今後も数を増やしたり質を高める活動をしていくつもりでいる。

VerdaはIaaS部分にKaaSが依存してるみたいな大きなMSAでできているので、そういう感じのデザインについて想像力が及ぶかだったり、小さい変更が全体にどのように影響するかだったり、リクエストのルートを変えなきゃいけないような要件についてより効率的な方法を取れるかみたいなところを見たいなーという感じ。

トラブルシューティングについてはTCP以下のレイヤの問題がメインで、低レイヤの部分についての知識の広さと深さを測りたいという思いで面接に組み込んでいる。世はクラウド全盛でこのあたりを意識してプロダクトを作ってない人も沢山いると思うけど、僕らはプライベートクラウドを作っているわけなので。このあたりの教養があるかはチェックしておかないとなーというお気持ちです。

## 5.最終的な構成
1. カジュアル面談 (これは必須にした。過去に「やっておいたら避けられたトラブル」が多かったので)
2. 書類選考 (これもどういう観点でチェックするか、逆に判断に使ってはいけない情報は何かを明文化した)
3. 1次面接: System Design Interview
4. 2次面接: Technical Interview
5. 3次面接: Behavior Interview
6. (4次面接: 3次で測れなかった部分があれば追加される)
7. 最終面接: シニアマネージャーと役員

## 6.やってみた感想
実は応募者があんまり集まってないのでまだ技術面接のみ、しかも数回しか試せてない...

応募者を集めるために[採用イベント](https://line.connpass.com/event/219153/)や[CI/CD Conference](https://event.cloudnativedays.jp/cicd2021/talks/1179)、LINE DevDayとかに出る計画をしているので、これを読んでる人(いるのか?)で興味がある方はチェックしてみてください。

あとJDを是非読んでほしい。頑張って書いたけどフィードバックが少なくてこっからどうすればいいか分からんので。分かりにくかったら直すので。コメントはTwitterでもメールでもOKです。

[ソフトウェアエンジニア / Platform wide SRE / Private Cloud Platform](https://linecorp.com/ja/career/position/3150)

これだけ大規模なインフラをソフトウェアで制御する試みを内製でやってる企業は日本どころか世界にも少ないと思うし、まだまだやりたいことが沢山ある未成熟な代物なので楽しくてインパクトのある取り組みがいくらでもできるはず。是非応募してくれ。練習目的でもいいぞ。(面接の内容を改善するヒントが得られるだけで得なので)

