# MimiFlow 性能基线

生成时间：2026-09-01T14:33:57.133Z

## 环境与数据

- Node：v26.7.0
- 系统：darwin x64 24.6.0
- CPU：Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- 数据：{"materials":279,"questions":430,"vocabularies":9833,"subtitleLines":1726,"attempts":191,"audioMaterials":198,"largestSubtitle":{"materialId":"1e2d815d-24f8-459a-91e2-1af9f72aa57f","lines":909}}
- 构建：19284.6 ms
- 服务冷启动：日志就绪 923.7 ms，首页 HTTP 可用 2105 ms
- 服务进程 RSS：53.7 MiB

## 页面硬加载（3 次，中位数）

| 页面 | TTFB ms | FCP ms | Load ms | 传输 KiB | DOM 节点 |
|---|---:|---:|---:|---:|---:|
| / | 33.9 | 412 | 376.5 | 184 | 152 |
| /listening | 31.6 | 300 | 417.5 | 226 | 272 |
| /reading | 17.7 | 292 | 338.2 | 200.6 | 253 |
| /practice | 28.1 | 280 | 358.3 | 193.2 | 306 |
| /vocabulary | 28.4 | 280 | 344.3 | 227.2 | 714 |

## 客户端页面切换

| 目标页面 | 中位数 ms | P95 ms |
|---|---:|---:|
| /listening | 42.6 | 59.5 |
| /reading | 13.1 | 66.7 |
| /practice | 28.1 | 48.1 |
| /vocabulary | 79 | 83.3 |

## 长列表滚动

| 页面 | DOM 节点 | 行类节点 | 页面高度 | 平均帧 ms | P95 帧 ms | >20ms 帧 |
|---|---:|---:|---:|---:|---:|---:|
| /listening | 268 | 0 | 1251 | 16.7 | 17.3 | 0 |
| /practice | 302 | 6 | 1278 | 16.7 | 17.3 | 0 |
| /vocabulary | 710 | 0 | 2268 | 16.8 | 17.5 | 1 |
| /manage/vocabulary | 625 | 30 | 2441 | 16.8 | 17.6 | 2 |
| /subtitles/1e2d815d-24f8-459a-91e2-1af9f72aa57f | 619 | 40 | 5120 | 17 | 17.6 | 2 |

## 注音

- 文本长度：8699 字符
- 整篇注音：中位数 15 ms，P95 19.3 ms
- 单词注音：中位数 3.5 μs，P95 4.2 μs

## 音频

- 文件：/audios/listening/collections/TOEIC-L&R-問題集-11-T1/LR11-T1-Pt1-Q1.mp3（0.6 MiB）
- Range 请求：HTTP 206，读取 262144 bytes，用时 16.4 ms
- metadata 就绪：30.2 ms，时长 24.6 秒
