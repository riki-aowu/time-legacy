# 时光之遗 / Time Legacy

Claude 官方对话导出的本地优先档案阅读器。没有后端：导入、解析、搜索、统计与导出均在浏览器内完成。

```bash
npm install
npm run dev
```

拖入 Claude 导出的 `conversations.json` 或包含它的 ZIP 即可使用。数据保存在浏览器 IndexedDB；「彻底清空本地档案」会删除聊天正文。

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
