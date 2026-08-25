import { openDatabase } from "./db";
import type { ImportSession } from "./types";

type Row = Record<string, unknown>;
export type ArchiveFilter =
  | "all"
  | "conversations"
  | "design_chats"
  | "attachments"
  | "tools"
  | "thinking";
export type ArchiveSort =
  "updated_desc" | "created_asc" | "messages_desc" | "title_asc";
export type ArchiveIndexItem = {
  id: string;
  kind: "conversation" | "design_chat";
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  hasAttachments: boolean;
  hasTools: boolean;
  hasThinking: boolean;
  projectResolution?: "resolved" | "unresolved" | "absent";
};
export type ConversationDetail = {
  conversation: Row;
  messages: Array<Row & { blocks: Row[]; attachments: Row[]; files: Row[] }>;
};
export type DesignChatDetail = { designChat: Row; project?: Row };
export type SearchResult = {
  kind:
    | "conversation"
    | "message"
    | "project"
    | "project_doc"
    | "memory_file"
    | "project_memory"
    | "reflection";
  id: string;
  title: string;
  excerpt: string;
  route: string;
  source: string;
  entityId: string;
  conversationUuid?: string;
  messageUuid?: string;
  sender?: string;
  messageIndex?: number;
  projectUuid?: string;
  docUuid?: string;
  memoryPath?: string;
  reflectionId?: string;
  match: "title" | "message" | "block" | "other";
};
export type RawRecord = {
  id: string;
  store: string;
  relativePath?: string;
  category?: string;
  part?: number | null;
  sessionId?: string;
  schemaSummary: string;
  raw: unknown;
};
export type MemoryPageData = {
  globalMemory?: Row;
  files: Row[];
  projectMemories: Row[];
};
export type ProjectPageData = {
  projects: Array<Row & { docsCount: number; hasMemory: boolean }>;
};
export type DataPageData = {
  manifests: Row[];
  importSessions: ImportSession[];
  unknown: Row[];
  conflicts: Row[];
  sensitiveCounts: { users: number; loginHistory: number };
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
async function read<T>(
  names: string[],
  get: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await get(db.transaction(names, "readonly"));
  } finally {
    db.close();
  }
}
const rows = <T extends Row = Row>(store: IDBObjectStore) =>
  request(store.getAll() as IDBRequest<T[]>);
const byIndex = <T extends Row = Row>(
  store: IDBObjectStore,
  index: string,
  key: IDBValidKey,
) => request(store.index(index).getAll(key) as IDBRequest<T[]>);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const blocksFor = (messageId: string, blocks: Row[]) =>
  blocks
    .filter((block) => text(block.messageUuid) === messageId)
    .sort((a, b) => Number(a.blockIndex) - Number(b.blockIndex));

export async function listArchive(
  options: { filter?: ArchiveFilter; sort?: ArchiveSort; query?: string } = {},
): Promise<ArchiveIndexItem[]> {
  const filter = options.filter ?? "all";
  const needle = (options.query ?? "").trim().toLowerCase();
  return read(
    [
      "conversations",
      "messages",
      "conversation_blocks",
      "attachments",
      "design_chats",
    ],
    async (tx) => {
      const [conversations, messages, blocks, attachments, designChats] =
        await Promise.all([
          rows(tx.objectStore("conversations")),
          rows(tx.objectStore("messages")),
          rows(tx.objectStore("conversation_blocks")),
          rows(tx.objectStore("attachments")),
          rows(tx.objectStore("design_chats")),
        ]);
      const messagesByConversation = new Map<string, Row[]>();
      for (const message of messages)
        messagesByConversation.set(text(message.conversationUuid), [
          ...(messagesByConversation.get(text(message.conversationUuid)) ?? []),
          message,
        ]);
      const items: ArchiveIndexItem[] = conversations.map((conversation) => {
        const ownMessages =
          messagesByConversation.get(text(conversation.uuid)) ?? [];
        const ids = new Set(ownMessages.map((message) => text(message.uuid)));
        const ownBlocks = blocks.filter((block) =>
          ids.has(text(block.messageUuid)),
        );
        return {
          id: text(conversation.uuid),
          kind: "conversation",
          title: text(conversation.name) || "未命名对话",
          createdAt: text(conversation.createdAt) || undefined,
          updatedAt: text(conversation.updatedAt) || undefined,
          messageCount: ownMessages.length,
          hasAttachments: attachments.some((item) =>
            ids.has(text(item.messageUuid)),
          ),
          hasTools: ownBlocks.some((block) =>
            ["tool_use", "tool_result"].includes(text(block.type)),
          ),
          hasThinking: ownBlocks.some(
            (block) => text(block.type) === "thinking",
          ),
        };
      });
      for (const chat of designChats)
        items.push({
          id: text(chat.uuid),
          kind: "design_chat",
          title: text(chat.title) || "未命名 Design Chat",
          createdAt: text(chat.createdAt) || undefined,
          updatedAt: text(chat.updatedAt) || undefined,
          messageCount: Array.isArray(chat.messagesRaw)
            ? chat.messagesRaw.length
            : 0,
          hasAttachments: false,
          hasTools: false,
          hasThinking: false,
          projectResolution:
            chat.projectResolution as ArchiveIndexItem["projectResolution"],
        });
      const filtered = items.filter(
        (item) =>
          (filter === "all" ||
            (filter === "conversations" && item.kind === "conversation") ||
            (filter === "design_chats" && item.kind === "design_chat") ||
            (filter === "attachments" && item.hasAttachments) ||
            (filter === "tools" && item.hasTools) ||
            (filter === "thinking" && item.hasThinking)) &&
          (!needle || item.title.toLowerCase().includes(needle)),
      );
      const sort = options.sort ?? "updated_desc";
      return filtered.sort((a, b) =>
        sort === "created_asc"
          ? (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
          : sort === "messages_desc"
            ? b.messageCount - a.messageCount
            : sort === "title_asc"
              ? a.title.localeCompare(b.title, "zh-CN")
              : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
      );
    },
  );
}

export async function getConversationDetail(
  conversationUuid: string,
): Promise<ConversationDetail | undefined> {
  return read(
    [
      "conversations",
      "messages",
      "conversation_blocks",
      "attachments",
      "files",
    ],
    async (tx) => {
      const conversation = await request(
        tx.objectStore("conversations").get(conversationUuid) as IDBRequest<
          Row | undefined
        >,
      );
      if (!conversation) return undefined;
      const messages = await byIndex(
        tx.objectStore("messages"),
        "by_conversation",
        conversationUuid,
      );
      const blocks = await rows(tx.objectStore("conversation_blocks"));
      const attachments = await rows(tx.objectStore("attachments"));
      const files = await rows(tx.objectStore("files"));
      return {
        conversation,
        messages: messages
          .sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)))
          .map((message) => ({
            ...message,
            blocks: blocksFor(text(message.uuid), blocks),
            attachments: attachments.filter(
              (item) => text(item.messageUuid) === text(message.uuid),
            ),
            files: files.filter(
              (item) => text(item.messageUuid) === text(message.uuid),
            ),
          })),
      };
    },
  );
}
export async function getDesignChatDetail(
  uuid: string,
): Promise<DesignChatDetail | undefined> {
  return read(["design_chats", "projects"], async (tx) => {
    const designChat = await request(
      tx.objectStore("design_chats").get(uuid) as IDBRequest<Row | undefined>,
    );
    if (!designChat) return undefined;
    const projectUuid = text(designChat.projectUuid);
    const project = projectUuid
      ? await request(
          tx.objectStore("projects").get(projectUuid) as IDBRequest<
            Row | undefined
          >,
        )
      : undefined;
    return { designChat, project };
  });
}

export async function getMemories(): Promise<MemoryPageData> {
  return read(
    ["global_memories", "memory_files", "project_memories"],
    async (tx) => {
      const [global, files, projectMemories] = await Promise.all([
        rows(tx.objectStore("global_memories")),
        rows(tx.objectStore("memory_files")),
        rows(tx.objectStore("project_memories")),
      ]);
      return {
        globalMemory: global[0],
        files: files.sort((a, b) => text(a.path).localeCompare(text(b.path))),
        projectMemories,
      };
    },
  );
}
export async function listProjects(): Promise<ProjectPageData> {
  return read(["projects", "project_docs", "project_memories"], async (tx) => {
    const [projects, docs, memories] = await Promise.all([
      rows(tx.objectStore("projects")),
      rows(tx.objectStore("project_docs")),
      rows(tx.objectStore("project_memories")),
    ]);
    const output = projects.map((project) => ({
      ...project,
      docsCount: docs.filter(
        (doc) => text(doc.projectUuid) === text(project.uuid),
      ).length,
      hasMemory: memories.some(
        (memory) => text(memory.projectUuid) === text(project.uuid),
      ),
    })) as ProjectPageData["projects"];
    return {
      projects: output.sort((a, b) =>
        text(b.updatedAt).localeCompare(text(a.updatedAt)),
      ),
    };
  });
}
export async function getProject(projectUuid: string) {
  return read(["projects", "project_docs", "project_memories"], async (tx) => ({
    project: await request(
      tx.objectStore("projects").get(projectUuid) as IDBRequest<
        Row | undefined
      >,
    ),
    docs: await byIndex(
      tx.objectStore("project_docs"),
      "by_project",
      projectUuid,
    ),
    memory: (
      await byIndex(
        tx.objectStore("project_memories"),
        "by_project",
        projectUuid,
      )
    )[0],
  }));
}
export async function listDesignChats() {
  return read(["design_chats"], (tx) => rows(tx.objectStore("design_chats")));
}
export async function listReflections() {
  return read(["reflections"], async (tx) =>
    (await rows(tx.objectStore("reflections"))).sort((a, b) =>
      text(b.updatedAt).localeCompare(text(a.updatedAt)),
    ),
  );
}
export async function getDataPage(): Promise<DataPageData> {
  return read(
    [
      "manifests",
      "import_sessions",
      "unknown_files",
      "conflicts",
      "users_metadata",
      "login_history",
    ],
    async (tx) => {
      const [
        manifests,
        importSessions,
        unknown,
        conflicts,
        users,
        loginHistory,
      ] = await Promise.all([
        rows(tx.objectStore("manifests")),
        rows<ImportSession>(tx.objectStore("import_sessions")),
        rows(tx.objectStore("unknown_files")),
        rows(tx.objectStore("conflicts")),
        rows(tx.objectStore("users_metadata")),
        rows(tx.objectStore("login_history")),
      ]);
      return {
        manifests,
        importSessions: importSessions.sort((a, b) =>
          text(b.startedAt).localeCompare(text(a.startedAt)),
        ),
        unknown,
        conflicts,
        sensitiveCounts: {
          users: users.length,
          loginHistory: loginHistory.length,
        },
      };
    },
  );
}
export async function listRawRecords(): Promise<RawRecord[]> {
  const names = [
    "conversations",
    "messages",
    "conversation_blocks",
    "attachments",
    "files",
    "projects",
    "project_docs",
    "project_memories",
    "global_memories",
    "memory_files",
    "design_chats",
    "feedback",
    "reflections",
    "unknown_files",
  ];
  return read(names, async (tx) => {
    const grouped = await Promise.all(
        names.map(async (store) =>
          (await rows(tx.objectStore(store))).map((row) => ({
            id: text(row.id) || text(row.uuid),
            store,
            relativePath: text(row.relativePath) || undefined,
            category: text(row.category) || undefined,
            part: typeof row.part === "number" ? row.part : null,
            sessionId: text(row.sessionId) || undefined,
            schemaSummary:
              row.raw && typeof row.raw === "object"
                ? `object:${Object.keys(row.raw as Row)
                    .sort()
                    .join(",")}`
                : typeof row.raw,
            raw: row.raw,
          })),
        ),
      )
    return grouped.flat().sort((a, b) =>
      `${a.relativePath}:${a.store}:${a.id}`.localeCompare(
        `${b.relativePath}:${b.store}:${b.id}`,
      ),
    )
  });
}
export async function getSensitiveMetadata() {
  return read(["users_metadata", "login_history"], async (tx) => ({
    users: await rows(tx.objectStore("users_metadata")),
    loginHistory: await rows(tx.objectStore("login_history")),
  }));
}

export async function searchArchive(
  query: string,
  options: {
    includeThinking?: boolean;
    limit?: number;
    scope?: "all" | "conversations";
  } = {},
): Promise<SearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const limit = options.limit ?? 100;
  return read(
    [
      "conversations",
      "messages",
      "conversation_blocks",
      "projects",
      "project_docs",
      "memory_files",
      "project_memories",
      "reflections",
    ],
    async (tx) => {
      const [
        conversations,
        messages,
        blocks,
        projects,
        docs,
        files,
        memories,
        reflections,
      ] = await Promise.all(
        [
          "conversations",
          "messages",
          "conversation_blocks",
          "projects",
          "project_docs",
          "memory_files",
          "project_memories",
          "reflections",
        ].map((name) => rows(tx.objectStore(name))),
      );
      const results: SearchResult[] = [];
      const add = (result: SearchResult, haystack: string) => {
        const hit = haystack.toLowerCase().indexOf(needle);
        if (hit >= 0 && results.length < limit)
          results.push({
            ...result,
            excerpt: haystack.slice(
              Math.max(0, hit - 80),
              hit + needle.length + 140,
            ),
          });
      };
      const ordered = new Map<string, Row[]>();
      for (const message of messages)
        ordered.set(text(message.conversationUuid), [
          ...(ordered.get(text(message.conversationUuid)) ?? []),
          message,
        ]);
      for (const own of ordered.values())
        own.sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)));
      for (const row of conversations)
        add(
          {
            kind: "conversation",
            id: text(row.uuid),
            entityId: text(row.uuid),
            title: text(row.name),
            excerpt: "",
            route: `/archive/${text(row.uuid)}`,
            source: "Conversation",
            conversationUuid: text(row.uuid),
            match: "title",
          },
          `${text(row.name)}\n${text(row.summary)}`,
        );
      for (const row of messages) {
        const conversationUuid = text(row.conversationUuid),
          own = ordered.get(conversationUuid) ?? [];
        add(
          {
            kind: "message",
            id: text(row.uuid),
            entityId: text(row.uuid),
            title: text(row.sender) || "对话消息",
            excerpt: "",
            route: `/archive/${conversationUuid}#${text(row.uuid)}`,
            source: "Conversation",
            conversationUuid,
            messageUuid: text(row.uuid),
            sender: text(row.sender),
            messageIndex: own.findIndex(
              (item) => text(item.uuid) === text(row.uuid),
            ),
            match: "message",
          },
          text(row.text),
        );
      }
      for (const row of blocks)
        if (
          text(row.type) === "text" ||
          (options.includeThinking && text(row.type) === "thinking")
        ) {
          const conversationUuid = text(row.conversationUuid),
            own = ordered.get(conversationUuid) ?? [];
          const messageUuid = text(row.messageUuid),
            message = own.find((item) => text(item.uuid) === messageUuid);
          add(
            {
              kind: "message",
              id: messageUuid,
              entityId: messageUuid,
              title: text(message?.sender) || text(row.type),
              excerpt: "",
              route: `/archive/${conversationUuid}#${messageUuid}`,
              source: text(row.type),
              conversationUuid,
              messageUuid,
              sender: text(message?.sender),
              messageIndex: own.findIndex(
                (item) => text(item.uuid) === messageUuid,
              ),
              match: "block",
            },
            text(row.normalizedContent),
          );
        }
      if (options.scope === "conversations") return results;
      for (const row of projects)
        add(
          {
            kind: "project",
            id: text(row.uuid),
            entityId: text(row.uuid),
            projectUuid: text(row.uuid),
            title: text(row.name),
            excerpt: "",
            route: `/projects/${text(row.uuid)}`,
            source: "Project",
            match: "other",
          },
          `${text(row.name)}\n${text(row.description)}\n${text(row.promptTemplate)}`,
        );
      for (const row of docs)
        add(
          {
            kind: "project_doc",
            id: text(row.uuid),
            entityId: text(row.uuid),
            projectUuid: text(row.projectUuid),
            docUuid: text(row.uuid),
            title: text(row.filename),
            excerpt: "",
            route: `/projects/${text(row.projectUuid)}#doc-${text(row.uuid)}`,
            source: "Project Doc",
            match: "other",
          },
          `${text(row.filename)}\n${text(row.content)}`,
        );
      for (const row of files)
        add(
          {
            kind: "memory_file",
            id: text(row.id),
            entityId: text(row.id),
            memoryPath: text(row.path),
            title: text(row.path),
            excerpt: "",
            route: `/memories/files/${text(row.id)}`,
            source: "Memory File",
            match: "other",
          },
          `${text(row.path)}\n${text(row.content)}`,
        );
      for (const row of memories)
        add(
          {
            kind: "project_memory",
            id: text(row.id),
            entityId: text(row.id),
            projectUuid: text(row.projectUuid),
            title: text(row.projectUuid),
            excerpt: "",
            route: `/projects/${text(row.projectUuid)}#memory`,
            source: "Project Memory",
            match: "other",
          },
          text(row.content),
        );
      for (const row of reflections)
        add(
          {
            kind: "reflection",
            id: text(row.id),
            entityId: text(row.id),
            reflectionId: text(row.id),
            title: text(row.period),
            excerpt: "",
            route: `/reflections/${text(row.id)}`,
            source: "Reflection",
            match: "other",
          },
          JSON.stringify(row.content ?? ""),
        );
      return results;
    },
  );
}
