# MimiFlow 性能基线

生成时间：2026-08-31T02:27:39.644Z

## 环境与数据

- Node：v26.7.0
- 系统：darwin x64 24.6.0
- CPU：Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- 数据：{"materials":242,"questions":339,"vocabularies":9760,"subtitleLines":1726,"attempts":191,"audioMaterials":174,"largestSubtitle":{"materialId":"1e2d815d-24f8-459a-91e2-1af9f72aa57f","lines":909}}
- 构建：21986.1 ms
- 服务冷启动：日志就绪 1054.5 ms，首页 HTTP 可用 2334.7 ms
- 服务进程 RSS：54.4 MiB

## 页面硬加载（3 次，中位数）

| 页面 | TTFB ms | FCP ms | Load ms | 传输 KiB | DOM 节点 |
|---|---:|---:|---:|---:|---:|
| / | 30 | 268 | 352.2 | 183.1 | 156 |
| /listening | 19.7 | 272 | 370.2 | 220.7 | 262 |
| /reading | 22.6 | 312 | 361.9 | 197.7 | 253 |
| /practice | 21.9 | 276 | 362.2 | 192.4 | 306 |
| /vocabulary | 19.3 | 276 | 339.6 | 220.6 | 912 |

## 客户端页面切换

| 目标页面 | 中位数 ms | P95 ms |
|---|---:|---:|
| /listening | 47.7 | 65.9 |
| /reading | -0.8 | 13 |
| /practice | 28.2 | 33.6 |
| /vocabulary | 111.8 | 129.7 |

## 长列表滚动

| 页面 | DOM 节点 | 行类节点 | 页面高度 | 平均帧 ms | P95 帧 ms | >20ms 帧 |
|---|---:|---:|---:|---:|---:|---:|
| /listening | 262 | 0 | 1251 | 16.4 | 18.3 | 0 |
| /practice | 302 | 6 | 1278 | 16.6 | 18.6 | 0 |
| /vocabulary | 931 | 0 | 2642 | 16.9 | 18.3 | 1 |
| /manage/vocabulary | 513 | 30 | 3296 | 16.7 | 18.7 | 2 |
| /subtitles/1e2d815d-24f8-459a-91e2-1af9f72aa57f | 640 | 40 | 5120 | 16.9 | 18.6 | 1 |

## 注音

- 文本长度：8699 字符
- 整篇注音：中位数 14.5 ms，P95 19 ms
- 单词注音：中位数 3.6 μs，P95 4.8 μs

## 音频

- 文件：/audios/listening/collections/TOEIC-L&R-問題集-11-T1/LR11-T1-Pt1-Q1.mp3（0.6 MiB）
- Range 请求：HTTP 206，读取 262144 bytes，用时 18.6 ms
- metadata 就绪：34.4 ms，时长 24.6 秒
