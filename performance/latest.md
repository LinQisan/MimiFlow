# MimiFlow 性能基线

生成时间：2026-09-11T02:41:24.720Z

## 环境与数据

- Node：v26.7.0
- 系统：darwin x64 24.6.0
- CPU：Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- 数据：{"materials":279,"questions":430,"vocabularies":1738,"subtitleLines":1726,"attempts":285,"audioMaterials":198,"largestSubtitle":{"materialId":"1e2d815d-24f8-459a-91e2-1af9f72aa57f","lines":909}}
- 构建：16428.3 ms
- 服务冷启动：日志就绪 907.4 ms，首页 HTTP 可用 2086.1 ms
- 服务进程 RSS：53.9 MiB

## 页面硬加载（3 次，中位数）

| 页面 | TTFB ms | FCP ms | Load ms | 传输 KiB | DOM 节点 |
|---|---:|---:|---:|---:|---:|
| / | 25.6 | 268 | 341.8 | 186.9 | 156 |
| /listening | 25.3 | 244 | 321.4 | 206.7 | 235 |
| /reading | 15.8 | 248 | 332.2 | 203.9 | 253 |
| /practice | 17.6 | 256 | 329 | 196.4 | 304 |
| /vocabulary | 17.4 | 252 | 359.7 | 332.9 | 608 |

## 客户端页面切换

| 目标页面 | 中位数 ms | P95 ms |
|---|---:|---:|
| /listening | 116.5 | 231.4 |
| /reading | 100.8 | 100.8 |
| /practice | 98.4 | 100 |
| /vocabulary | 116.5 | 123.1 |

## 长列表滚动

| 页面 | DOM 节点 | 行类节点 | 页面高度 | 平均帧 ms | P95 帧 ms | >20ms 帧 |
|---|---:|---:|---:|---:|---:|---:|
| /listening | 231 | 0 | 1386 | 16.6 | 18.1 | 0 |
| /practice | 300 | 6 | 1273 | 16.7 | 18.1 | 0 |
| /vocabulary | 608 | 0 | 1957 | 17 | 18.3 | 1 |
| /manage/vocabulary | 643 | 30 | 2461 | 16.8 | 17.9 | 1 |
| /subtitles/1e2d815d-24f8-459a-91e2-1af9f72aa57f | 595 | 40 | 5085 | 16.9 | 18.2 | 1 |

## 注音

- 文本长度：8699 字符
- 整篇注音：中位数 18.8 ms，P95 23.1 ms
- 单词注音：中位数 6.1 μs，P95 6.8 μs

## 音频

- 文件：/audios/listening/collections/TOEIC-L&R-問題集-11-T1/LR11-T1-Pt1-Q1.mp3（0.6 MiB）
- Range 请求：HTTP 206，读取 262144 bytes，用时 19.2 ms
- metadata 就绪：62.6 ms，时长 24.6 秒
