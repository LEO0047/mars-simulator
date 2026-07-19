# Mars Transfer Lab

一個不需安裝或 API key 的互動式地球—火星轉移軌道實驗室。

[開啟線上版本](https://leo0047.github.io/mars-simulator/)

## 功能

- 比較霍曼轉移與快速轉移的飛行時間、ΔV 與軌道形狀
- 調整 780 天地火會合週期內的發射日
- 即時顯示發射相位、目標相位與預估抵達誤差
- 執行、暫停、縮放與平移軌道模擬
- 任務結束後產生可解釋的本機任務簡報
- 支援鍵盤焦點、`prefers-reduced-motion` 與手機版面

## 本機執行

ES modules 需要透過 HTTP 載入。在 repo 根目錄執行：

```bash
python3 -m http.server 4173
```

再開啟 <http://127.0.0.1:4173/>。

## 驗證

```bash
node --test tests/simulation.test.mjs
```

## 模型範圍

本工具採用共面圓形行星軌道與預設轉移橢圓，用於解釋發射相位與 ΔV 取捨。它未納入軌道傾角、攝動、有限推力或真實星曆，不可用於實際任務導航。
