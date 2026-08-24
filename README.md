# 时光之遗 / Time Legacy

Claude 官方对话导出的本地优先档案阅读器。没有后端：导入、解析、搜索、统计与导出均在浏览器内完成。

```bash
npm install
npm run dev
```

拖入 Claude 导出的 `conversations.json` 或包含它的 ZIP 即可使用。数据保存在浏览器 IndexedDB；「彻底清空本地档案」会删除聊天正文。
