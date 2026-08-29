# MimiFlow 性能基线

生成时间：2026-08-25T16:08:55.216Z

## 环境与数据

- Node：v24.14.1
- 系统：darwin x64 24.6.0
- CPU：Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- 数据：{"materials":185,"questions":238,"vocabularies":289,"subtitleLines":1726,"attempts":191,"audioMaterials":140,"largestSubtitle":{"materialId":"1e2d815d-24f8-459a-91e2-1af9f72aa57f","lines":909}}
- 构建：15775.9 ms
- 服务冷启动：日志就绪 925.6 ms，首页 HTTP 可用 1926.4 ms
- 服务进程 RSS：52.2 MiB

## 页面硬加载（3 次，中位数）

| 页面 | TTFB ms | FCP ms | Load ms | 传输 KiB | DOM 节点 |
|---|---:|---:|---:|---:|---:|
| / | 40.2 | 360 | 423.9 | 184.3 | 146 |
| /listening | 17.4 | 344 | 428.6 | 198.8 | 201 |
| /reading | 13 | 344 | 441.7 | 208.6 | 346 |
| /practice | 26.7 | 384 | 507.4 | 249.5 | 244 |
| /vocabulary | 17.2 | 360 | 439.3 | 217.4 | 606 |

## 客户端页面切换

| 目标页面 | 中位数 ms | P95 ms |
|---|---:|---:|
| /listening | 181.4 | 256.2 |
| /reading | 169.6 | 199.7 |
| /practice | 182.7 | 183.6 |
| /vocabulary | 196.5 | 199.1 |

## 长列表滚动

| 页面 | DOM 节点 | 行类节点 | 页面高度 | 平均帧 ms | P95 帧 ms | >20ms 帧 |
|---|---:|---:|---:|---:|---:|---:|
| /listening | 197 | 0 | 1070 | 16.7 | 17.4 | 0 |
| /practice | 240 | 4 | 962 | 17 | 17.6 | 3 |
| /vocabulary | 602 | 0 | 1982 | 16.7 | 17.7 | 2 |
| /manage/vocabulary | 609 | 30 | 3449 | 17.2 | 18.1 | 3 |
| /subtitles/1e2d815d-24f8-459a-91e2-1af9f72aa57f | 627 | 40 | 5134 | 16.8 | 17.5 | 1 |

## 注音

- 文本长度：8699 字符
- 整篇注音：中位数 15.3 ms，P95 23.6 ms
- 单词注音：中位数 3.7 μs，P95 4.4 μs

## 音频

- 文件：/audios/listening/collections/TOEIC-L&R-問題集-11-T1/LR11-T1-Pt1-Q1.mp3（0.6 MiB）
- Range 请求：HTTP 206，读取 262144 bytes，用时 65.9 ms
- metadata 就绪：52 ms，时长 24.6 秒
