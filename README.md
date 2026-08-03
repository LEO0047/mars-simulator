# Mars Transfer Lab

一個不需安裝或 API key 的互動式地球—火星轉移軌道實驗室。

[開啟線上版本](https://leo0047.github.io/mars-simulator/)

## 功能

- 比較霍曼轉移與快速轉移的飛行時間、ΔV 與軌道形狀
- **即時解模式**：任意發射日以共面 Lambert 求解掃描飛行時間，找出最小 ΔV 轉移軌道
- 調整 780 天地火會合週期內的發射日
- 即時顯示發射相位、目標相位與預估抵達誤差
- 執行、暫停、縮放與平移軌道模擬
- 任務結束後產生可解釋的本機任務簡報
- 支援鍵盤焦點、`prefers-reduced-motion` 與手機版面
- 完全自包含：字型自托管、無任何第三方請求；service worker 離線快取，載入過一次後斷網也能用

## 本機執行

ES modules 需要透過 HTTP 載入。在 repo 根目錄執行：

```bash
python3 -m http.server 4173
```

再開啟 <http://127.0.0.1:4173/>。

## 驗證

```bash
node --test tests/simulation.test.mjs tests/solver.test.mjs
```

push 到 GitHub 後 CI（GitHub Actions）會自動重跑同一套測試。

兩個預設模式的 ΔV 與即時解模式共用同一套向量公式（近日點切線注入 + 抵達向量差捕獲），由 `simulation.mjs` 在載入時推導，不再寫死常數。

## 視覺資產

宇宙背景與天體 atlas 由 OpenAI 原生圖片生成工具製作（本次工具未回報可驗證的 model ID）。`assets/generated/celestial-atlas-keyed.png` 保留純洋紅 `#FF00FF` 原始色鍵，透明成品可重建：

```bash
scripts/color-key-image.swift \
  assets/generated/celestial-atlas-keyed.png \
  assets/generated/celestial-atlas.png
```

這個流程會一併處理抗鋸齒邊緣的 magenta despill；重建後仍應在近白與近黑背景檢查外輪廓及火箭零件間的內部縫隙。

## 模型範圍

本工具採用共面圓形行星軌道與預設轉移橢圓，用於解釋發射相位與 ΔV 取捨。它未納入軌道傾角、攝動、有限推力或真實星曆，不可用於實際任務導航。
