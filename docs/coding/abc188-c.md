# ABC188 C - ABC Tournament

[問題](https://atcoder.jp/contests/abc188/tasks/abc188_c)

## 初見
### 立てた方針
#### 制約の整理
* 1 <= N <= 16なので、選手の数は高々2^16人 < 10^4人
* トーナメントなので、2番目にレートの高い選手が決勝に残るとは限らない
    * 例) 1番レートの高い選手と1戦目で当たったら2番目の選手は負けちゃう
    * つまりトーナメント表がめちゃくちゃ大事
        * `各整数 j(1≤j≤2N−i) について、まだ負けたことのない選手のうち、 2j−1 番目に番号の小さい選手と 2j 番目に番号の小さい選手が対戦する。`
#### 考察
* トーナメントの階層は最大16段で、選手の数は最大65566人(かつ階層ごとに半分に減る) → 選手の数をMとしたときに階層ごとに生き残ってる選手のリストを捜査したとしても`O(M^2)`より小さそう

### 実装案
* `dict`で選手の番号とレートを保存しておいて、階層ごとに`.keys()`で選手のリストを出力 → 勝敗判定して負けた方をdictから落とす
    * python3.8で書くので、dictは仕様としてordered、なので毎回のソートは不要なはず
* `i=N`のときにだけレートの低い方をprintする
    * pythonでのforのindexは0から始まるので、-1を忘れないようにする
    * jの設定も同様

### 書いてみたコード
```python
N = int(input())

players = dict()

for i, rate in zip(range(1, 2**N + 1), [ int(r) for r in input().split() ]):
    players[i] = rate

for i in range(N):
    ps = list(players.keys())

    if i == N -1:
        if players[ps[0]] > players[ps[1]]:
            print(ps[1])
        else:
            print(ps[0])
        break

    losers = []
    
    for j in range(2 ** (N - i -1)):
        if players[ps[2*j]] > players[ps[2*j+1]]:
            losers.append(ps[2*j+1])
        else:
            losers.append(ps[2*j])
    
    for l in losers:
        players.pop(l)

```

### 結果
AC

## 感想
多分Cの中では簡単な問題だったのではないかと思う。

書いた後で気付いたけど負けたあとすぐにdict.popしていいじゃん。psはi loop内で固定されてるんだから副作用無いし...
