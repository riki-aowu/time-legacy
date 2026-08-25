# 时光之遗 / Time Legacy

一个面向 Claude 官方数据导出的本地优先档案馆。它将对话、记忆、项目、回顾与导入元数据留在浏览器中，让历史聊天重新成为可搜索、可阅读、可导出的个人档案。

**在线使用：** <https://riki-aowu.github.io/time-legacy/>

## 最新功能

- Conversation 阅读页：正常 Human / Claude 正文直接以 Markdown 展示；Thinking、Tool、Unknown 等技术 block 默认折叠。
- 长对话阅读：渐进窗口化渲染、阅读位置恢复，以及搜索结果直达后段消息。
- 全文搜索：覆盖对话标题与正文、Projects、Memory Files、Project Memories、Reflections；结果可定位到对应实体。
- 记忆与项目：浏览全局记忆、目录化 Memory Files、Project Instructions、Docs 与 Project Memory。
- 数据与回顾：查看 Claude Reflections、导入记录、Unknown 数据、冲突记录及 record-level Raw JSON。
- 本地统计与导出：统计真实 block / tool / project 数据；支持导出对话、记忆、项目、回顾、Raw 数据及经明确确认的敏感元数据。

## 使用方式

1. 打开部署地址，或在本地启动：

   ```bash
   npm install
   npm run dev
   ```

2. 在「导入」页拖入 Claude 官方导出的 `conversations.json`、完整导出 ZIP，或多个导出批次文件。
3. 在「档案」页阅读对话；使用左侧搜索可跳到命中的消息、Memory File、Project Doc 或 Reflection。
4. 在「导出」页按需选择导出范围。敏感元数据默认不导出，必须单独勾选并确认。

## 隐私说明

- 没有应用后端：导入、解析、搜索、统计和导出都在当前浏览器内完成。
- 数据保存在浏览器 IndexedDB，不会由本项目上传到服务器。
- Raw Data 页面展示的是标准化记录保留的 record-level raw；应用不会伪造不存在的原始文件级 JSON。
- 「彻底清空本地档案」会清除当前浏览器中的本地档案数据。
- 请不要把 Claude 导出文件、包含私人对话的测试数据或敏感导出结果提交到 Git 仓库，或上传给不信任的服务。

## 开源说明

本项目以 [MIT License](LICENSE) 开源。你可以自由使用、复制、修改、发布、再授权或销售本项目的副本，包括用于个人项目和商业项目；但所有副本或实质性部分都必须保留原始版权声明与 MIT 许可证全文。

本项目按“原样”提供，不提供任何明示或默示担保。请自行评估使用风险，并遵守 Claude、GitHub 及其他相关服务的条款。

## Fork 与二次开发

欢迎 Fork 后用于自己的对话档案、学习或二次开发。

1. 在 GitHub 上点击 **Fork**，创建你账户下的副本。
2. 克隆你的 Fork 并安装依赖：

   ```bash
   git clone https://github.com/<你的用户名>/time-legacy.git
   cd time-legacy
   npm ci
   npm run dev
   ```

3. 修改前端界面或功能时，请保留 `LICENSE`、版权声明和许可证文本。
4. 若要部署到自己的 GitHub Pages，需将 `vite.config.ts` 中的 `base` 改为 `/<你的仓库名>/`；例如仓库为 `my-time-legacy` 时设为 `base: '/my-time-legacy/'`。
5. 推送到你 Fork 的 `main` 分支后，仓库内的 GitHub Actions 会自动构建并发布 `dist/`。首次使用时，请在 GitHub 仓库 **Settings → Pages** 中将发布源选择为 **GitHub Actions**。

该应用在浏览器本地处理导入的档案数据；请勿将包含私人对话的导出文件提交到仓库，或上传到你不信任的第三方服务。
