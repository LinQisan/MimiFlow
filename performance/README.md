# 性能基线

运行完整的生产性能测量：

```bash
npm run perf:baseline
```

复用已有 `.next` 构建：

```bash
npm run perf:baseline -- --skip-build
```

可通过 `PERF_RUNS` 调整每个页面的测量次数，通过 `PERF_BROWSER_PATH` 指定 Chrome 或 Chromium。结果写入 `performance/latest.json` 和 `performance/latest.md`。

基准包含：

- Next.js 生产构建和冷启动；
- 首页、听力、阅读、练习和词汇页面的硬加载；
- 从首页发起的客户端页面切换；
- 主要长列表页面的 DOM 规模和滚动帧耗时；
- 大段日语文本及单词的注音生成；
- 本地音频 Range 请求和浏览器 metadata 就绪时间。

阶段性优化对比记录在同目录的 `optimization-*.md` 文件中。
