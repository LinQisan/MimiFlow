# 项目整理与工程消融验证（2026-09-08）

## 范围与基线

以开始任务时的未提交工作区为基线，不以 Git HEAD 作为清理前版本。工作区已有大量功能修改；本次没有提交、回退它们，也没有执行数据迁移、导入或音频修复脚本。

检查范围包括 app、components、context、features、hooks、lib、locales、modules、utils、scripts，及包依赖和框架配置。调用核查结合 TypeScript AST 的 import/export/dynamic import/require 解析、全库文本搜索、Next.js 入口约定与测试引用。第一轮调用图覆盖 478 个源码及脚本文件；移除无引用 Header 后，没有其他非路由、非脚本文件呈现零静态入边。这不代表每个导出都被运行时使用，也不证明任意动态调用不存在。

初始状态：373 项测试，369 通过、3 失败、1 跳过；类型检查报告 77 条诊断；lint 有 13 个未使用声明警告。

## 已实施

| 清理项 | 调用证据与处理 |
| --- | --- |
| VocabularyPageV2 | 由 /vocabulary?ui=v2 真实调用。文件和组件改为 VocabularyPage，路由入口函数改为 VocabularyRoute；保留查询参数、默认页与实验行为。 |
| modules/knowledge/vocabulary/components/Header.tsx | 全库无引用，且重复全局 StudyNavigation；删除。 |
| annotateJapaneseHtml | 全库仅定义，无调用；删除连同专用的 HTML 切分、释义匹配、注音辅助函数与相关类型/import。保留用户偏好 hook 及 hasJapanese 兼容导出。 |
| findVocabularyDetail / searchVocabularyRelationTargets | 无源码或脚本调用；删除这两个仓储查询函数。保留现有批量查询。 |
| modules/reading/server/sudachi-pronunciation.ts | 仅转发 canonical 模块；5 个调用点直接引用 modules/language/server/sudachi-pronunciation，删除转发文件。 |
| 词汇编辑器未使用声明 | 删除无用 draft props、import、局部函数和参数；将集合更新类型绑定到具体字段，增加空草稿保护。 |
| 词条输入解析 | 明确解析结果类型，保留直接/包装输入及未知扩展字段；删除不再使用的 union schema。补充行为测试。 |
| 例句保存 | 将未定义的 sourceUrl 修正为已计算的 storageSourceUrl，保留存储来源标识；补充模拟事务的公开保存入口测试，覆盖来源不变和来源更新；不修改数据库 schema。 |
| 页面数据导出 | 文件内部使用的分页常量与返回接口改为局部声明。 |
| 3 项历史测试失败 | 断言仍在旧组件中寻找已迁出的工具栏与词表链接；改为检查实际组件及接入点，不修改功能来迎合旧字符串。 |

## 已执行的工程消融与对照

本节按组移除冗余并运行回归对照。另对项目现有的 Sudachi 常驻进程优化执行了固定样本性能消融，见下一节。没有禁用应用中的现有实验功能。

| 阶段 | 结果 | 可得结论 |
| --- | --- | --- |
| 原始工作区 | 369 通过 / 3 失败 / 1 跳过 | 建立已知失败基线。 |
| 删除无引用 Header，规范实验页名称 | 369 通过 / 相同 3 失败 / 1 跳过 | 该组清理没有引入现有测试可检测的新失败。 |
| 校准组件提取后的 3 项断言 | 对应 135 项测试全部通过 | 原失败来自测试中的陈旧组件位置。 |
| 删除旧注音实现、两个查询及转发层，集成编辑器清理 | 372 通过 / 0 失败 / 1 跳过 | 现有完整套件通过。 |
| 加入输入解析兼容性用例 | 374 通过 / 0 失败 / 1 跳过 | 直接/包装/无效输入及扩展字段保留获得行为覆盖。 |
| 加入例句保存行为用例后的最终套件 | 375 通过 / 0 失败 / 1 跳过（共 376 项） | 例句来源保留和修改两条路径通过，未触达真实数据库。 |
| 启用 PostgreSQL 新旧分页语义对照 | 109 项含子测试全部通过，无跳过 | 在真实 SQL 引擎上比较分组、筛选、Unicode、分页与用户隔离；仅使用会话临时表，结束回滚。 |

以上清理阶段是增量分组对照，期间还修复了基线问题；不能将测试数量变化解释为单项清理的因果收益。本轮没有进行人工浏览器全功能验收。

最终 typecheck、lint（零警告）、生产 build 和 git diff --check 均通过；构建无宽泛文件追踪警告。默认跳过的数据库用例已另行启用并通过。

复现命令：

```sh
npm run typecheck
npm run lint
npm test
npm run build
VOCABULARY_QUERY_DATABASE_TEST=1 node --test scripts/vocabulary-page-query.test.mjs
.venv/bin/python scripts/sudachi-worker-ablation.py
```

原始与阶段日志位于 outputs/project-cleanup-2026-09-08/（本地输出，受现有忽略规则保护）。

## Sudachi 常驻进程性能消融

实验对象选取项目已有的常驻 Sudachi Python 进程优化。对照保持相同分析代码、Python 环境和文本顺序，仅比较一轮内复用进程与每次请求重新启动。脚本 scripts/sudachi-worker-ablation.py 使用 12 条固定日语文本，每轮 6 个请求、每种模式 5 轮，交替执行顺序。两侧都绕过应用结果缓存，不读取数据库，不修改配置。

计时覆盖整轮进程启动、分析、JSON 传输与退出；不是单个热请求延迟，也不是操作系统冷缓存实验。常驻模式保留其进程内词典状态及缓存，因此结论针对整个常驻机制，不单独归因于进程创建。

| 模式 | 5 轮整批耗时（ms） | 中位数（ms） |
| --- | --- | --- |
| 常驻进程 | 388.08、312.04、292.48、396.83、313.52 | 313.52 |
| 消融：每次重新启动 | 1876.42、1709.52、1851.79、1719.94、1560.38 | 1719.94 |

60 个请求的 pronunciationMap、lexicon、tokens 与参考输出逐项完全一致。逐次启动耗时为常驻模式的 5.49 倍，常驻模式整批耗时降低约 81.8%。结果支持保留常驻机制；仅适用于本机该固定小样本，不能外推为全站提速、真实用户延迟或学习效果改善。未测量内存、长时间稳定性和多用户吞吐。

原始结果：outputs/project-cleanup-2026-09-08/sudachi-worker-ablation.json。环境为 macOS 15.7.9 x86_64、Python 3.14.7；输出 SHA-256 已保存在 JSON 中。

## 保留项及原因

- 18 个运行依赖都有源码、导出、导入、数据库或性能脚本用途；10 个开发依赖服务于框架配置、样式、类型、lint 与 Prisma 工具链，未发现确定可删除项。未改 package.json / lockfile。
- Nadeshiko 通过动态加载的搜索面板使用；实验词汇页依赖链同样真实运行，不能按“默认页面未引用”判定为废弃。
- Anki 旧格式、legacy 词表、旧义项及 source metadata 属于数据兼容逻辑；保留。未运行或删除本地迁移、修复、导入脚本及现有迁移目录。
- updateVocabularyFromInspector 与 syncAnkiSentenceSourcesForWordbook 当前无静态调用，但属于历史写入入口；本次保留并标记为后续候选，未确认运行时兼容边界前不删除。
- utils/language/partOfSpeech 与 utils/vocabulary/partOfSpeech 分别承担语言规范化与词汇过滤，不能机械合并。
- 业务代码现统一归入 modules；scripts/module-boundaries.test.mjs 会阻止恢复 features 导入。跨领域依赖仍须通过明确的模块边界处理，不能以新目录层级规避。
- modules/knowledge/vocabulary/components/data.ts 仍是实验页专用的数据适配，类型与显示筛选耦合；未仅为目录整齐搬进 modules 并制造反向 UI 依赖。
- 保留本地 .agents、outputs、.venv、performance/latest.* 及用户音频；这些不是可凭文件名判定的垃圾。
- 对应用源码扫描未发现 console.log、console.debug、debugger、TODO、FIXME 的直接命中；正常告警、错误处理与兼容代码未因此删除。
