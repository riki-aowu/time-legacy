# 时光之遗 V0.2 — Phase 2 验收报告

完成日期：2026-08-25
范围：Architecture & Data Layer。未开始 Phase 3 的档案/记忆/项目页面重做。

## 数据库与迁移

- IndexedDB：`time-legacy`，schema version 从 **1 升至 2**。
- 新增 stores：`import_sessions`、`manifests`、`conversations`、`messages`、`conversation_blocks`、`attachments`、`files`、`projects`、`project_docs`、`project_memories`、`global_memories`、`memory_files`、`design_chats`、`feedback`、`reflections`、`users_metadata`、`login_history`、`unknown_files`、`conflicts`。
- V0.1 migration 在升级事务内读取旧 `archives/archive-v1`，拆回 conversations/messages/blocks；不会以删除数据库作为升级路径。
- 清空操作才会明确清理所有 V2 stores。

## 导入架构

`Manifest Resolver → File Classifier → schema-specific Normalizer → Worker → IndexedDB` 已实现。

- Manifest `category + part` 是首要分类线索；ZIP 内相对路径和 JSON shape 交叉验证。
- 支持同 category 多 part；source `category`、`part`、relative path 随每条数据保存。
- `export_url` 不保存、不请求。
- ZIP 解压、JSON 解析、Normalizer、批量 IndexedDB 写入均在 Web Worker 中执行。
- 现有阅读页只读取 V2 兼容快照，未一次性渲染全部原始消息。

## 分类、Normalizer 与保底

- 已实现：conversations/messages/6 类 blocks/attachments/files/projects/docs/global memory/memory files/project memories/design chats/feedback/reflections/light metadata/manifests。
- block 保留原始顺序和完整 `raw`；未知 block 类型存为 `unknown:<原始类型>`。
- 未知路径、分类冲突、无效 JSON、shape 不匹配进入 `unknown_files` 或 error record，保留相对路径、part、大小、schema 摘要、raw 和解析错误。
- Design Chat 只保存 `messagesRaw`；当前空数组样本没有被伪装成普通 Conversation schema。
- 普通 Conversation 不会按标题、时间或关键词猜测关联 Project；Design Chat 未匹配 Project UUID 保持 `unresolved`。

## Upsert / Conflict

- 稳定键：Claude UUID；Memory File 使用 path 派生 ID；manifest 用来源路径；Project Memory 用 Project UUID。
- raw 完全一致：`unchanged`。
- 同类别、同来源路径的稳定键内容变动：`updated`。
- 不同来源对同一稳定键给出不同 raw：写入 `conflicts`，不静默覆盖。
- 每次导入写入 `import_sessions`：文件统计、分类/part、inserted/updated/unchanged/conflicted、错误和冲突详情。

## Sensitive Metadata

- `users_metadata` 和 `login_history` 独立 store，并带 `sensitive: true`。
- 默认不进入普通 conversation 快照、搜索、统计或导出。
- 邮箱、手机号、IP、地理位置、User Agent 只保持 Local-first raw 数据，尚未制作 UI。

## 真实样本完整导入回归

数据源：`E:\1-codex\claude记忆\`，6 个 ZIP + 1 个 manifest，13 个 ZIP 内 JSON。

| Store / 类型 | 实际记录数 |
|---|---:|
| manifests | 1 |
| conversations | 362 |
| messages | 17,363 |
| conversation_blocks | 28,755 |
| attachments | 12 |
| files | 275 |
| projects | 8 |
| project_docs | 9 |
| project_memories | 6 |
| global_memories | 1 |
| memory_files | 6 |
| design_chats | 1 |
| feedback | 0 |
| reflections | 1 |
| users_metadata | 1 |
| login_history | 5 |
| **合计** | **46,806** |

首次写入：46,806 inserted、0 updated、0 unchanged、0 conflicted。
同一真实导出第二次写入：0 inserted、0 conflicted、46,806 unchanged。
Unknown：0；Error：0。

## 测试与构建

- `npm test`：**2 files / 8 tests passed**。
- 覆盖：manifest、未知 block、nullable file name、空 Design Chat、sensitive metadata、V0.1 migration、重复 UUID 导入，以及真实完整导出的解析与两次 IndexedDB 写入。
- IndexedDB 单元回归使用 `fake-indexeddb`；真实导出正文来自本机目录，未上传。
- `npm run build`：通过；Worker 被作为独立生产 bundle 输出。

## 修改文件

- `src/data/types.ts`：V2 records、source trace、import session 类型。
- `src/data/claude.ts`：manifest/classifier/parser/normalizer/unknown fallback。
- `src/data/db.ts`：V2 stores、V0.1 migration、upsert/conflict、snapshot 和 clear。
- `src/data/import.worker.ts`、`import-client.ts`：后台导入协议。
- `src/data/*.test.ts`：parser、migration、幂等与真实样本回归。
- `src/App.tsx`：只替换导入入口和 V2 兼容读取，不做新 UI。
- `package.json` / lock：Vitest、fake-indexeddb 和 `npm test`。
- `tsconfig.app.json`：Node test typing。

## 明确未进入的 Phase 3 内容

- Memories / Projects / Design Chats / Raw Data 的专用页面。
- 新数据类型的全文搜索、统计和导出 UI。
- Thinking/Tool blocks 的专用阅读组件。
- Sensitive metadata 的 Raw Viewer。

Phase 2 数据层完成，等待验收后再进入 Phase 3。
