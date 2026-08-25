import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getDataPage,
  getMemories,
  getProject,
  getSensitiveMetadata,
  listProjects,
  listRawRecords,
  listReflections,
} from "./data/queries";
import type {
  DataPageData,
  MemoryPageData,
  ProjectPageData,
  RawRecord,
} from "./data/queries";
import type { ImportSession } from "./data/types";
import { collectArchiveStats } from "./stats";
import type { ArchiveStats } from "./stats";

/* ===== Phase 3 Step 2/3 页面组件 =====
   纯展示层：只消费 queries.ts 接口 + raw.ts/export.ts 工具，不碰数据层。
   str/date/bytes/RawViewer 等工具由 App.tsx 传入或在此重复定义（小工具，避免改动 App.tsx 既有导入）。 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const date = (v?: string) =>
  v
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "时间未知";
const dateOnly = (v?: string) =>
  v
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
        new Date(v),
      )
    : "时间未知";
const bytes = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : n >= 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${n} B`;
const download = (n: string, d: string, t: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([d], { type: t }));
  a.download = n;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
};

/* ---------- RawViewer（与 App.tsx 行为一致，供页面组件使用） ---------- */
import { serializeRawJson } from "./raw";
export function RawViewer({
  value,
  label = "Raw JSON",
}: {
  value: unknown;
  label?: string;
}) {
  const full = useMemo(() => serializeRawJson(value), [value]),
    [open, setOpen] = useState(false),
    [needle, setNeedle] = useState(""),
    [copied, setCopied] = useState(false);
  const size = new Blob([full]).size,
    hits = needle
      ? full.toLowerCase().split(needle.toLowerCase()).length - 1
      : 0;
  const rendered = !needle
    ? full
    : full
        .split(
          new RegExp(
            `(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi",
          ),
        )
        .map((part, index) =>
          part.toLowerCase() === needle.toLowerCase() ? (
            <mark key={index}>{part}</mark>
          ) : (
            part
          ),
        );
  const copy = async () => {
    await navigator.clipboard?.writeText(full);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="raw-viewer">
      {!open ? (
        <button className="raw-load" onClick={() => setOpen(true)}>
          {label}
          {size > 20000 ? ` 较大 · ${bytes(size)}` : ""} · 点击完整加载
        </button>
      ) : (
        <>
          <div className="raw-tools">
            <input
              value={needle}
              onChange={(e) => setNeedle(e.target.value)}
              placeholder="在当前 JSON 中搜索"
              aria-label="在当前 JSON 中搜索"
            />
            {needle && <span>{hits} 处</span>}
            <button onClick={() => void copy()}>
              {copied ? "已复制" : "Copy"}
            </button>
            <button onClick={() => setOpen(false)}>Collapse</button>
          </div>
          <pre className="raw-pre raw-full">{rendered}</pre>
        </>
      )}
    </div>
  );
}

/* ---------- 通用：章节骨架 / 空状态 / Markdown 渲染 ---------- */
function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
    </div>
  );
}
export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div className="empty-state">
      <i>◌</i>
      <b>{title}</b>
      {note && <p>{note}</p>}
    </div>
  );
}
function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/* ---------- 记忆页：总记忆 + Memory Files 文件树 + Project Memories ---------- */
type FileNode =
  | { name: string; path: string; isDir: false; row: Row }
  | { name: string; path: string; isDir: true; children: FileNode[] };
function buildTree(paths: Array<Row & { path?: unknown }>): FileNode[] {
  const root: FileNode[] = [];
  for (const row of paths) {
    const raw = str(row.path) || "/未命名";
    const parts = raw.replace(/^\//, "").split("/").filter(Boolean);
    let level = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.isDir === !isLeaf);
      if (!node) {
        node = isLeaf
          ? { name: part, path: `/${acc}`, isDir: false, row }
          : { name: part, path: `/${acc}`, isDir: true, children: [] };
        level.push(node);
      }
      if (!isLeaf && node.isDir) level = node.children;
    });
  }
  const sortRec = (nodes: FileNode[]): FileNode[] =>
    nodes
      .sort((a, b) =>
        a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name),
      )
      .map((n) => (n.isDir ? { ...n, children: sortRec(n.children) } : n));
  return sortRec(root);
}
function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  query,
}: {
  node: FileNode;
  depth: number;
  selectedId: string;
  onSelect: (row: Row) => void;
  query: string;
}) {
  const [open, setOpen] = useState(
    depth < 1 ||
      (query ? node.path.toLowerCase().includes(query.toLowerCase()) : false),
  );
  const matched = query
    ? node.path.toLowerCase().includes(query.toLowerCase())
    : true;
  if (node.isDir) {
    return (
      <div className={`tree-node ${matched ? "" : "dim"}`}>
        <button
          className="tree-dir"
          style={{ paddingLeft: depth * 14 + 10 }}
          onClick={() => setOpen((v) => !v)}
        >
          <i className={`chev ${open ? "rot" : ""}`}>▸</i>
          {node.name}/
        </button>
        {open &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              query={query}
            />
          ))}
      </div>
    );
  }
  const active = str(node.row.id) === selectedId;
  return (
    <button
      className={`tree-file ${active ? "active" : ""} ${matched ? "" : "dim"}`}
      style={{ paddingLeft: depth * 14 + 26 }}
      onClick={() => onSelect(node.row)}
    >
      <i>▪</i>
      {node.name}
    </button>
  );
}
export function MemoriesPage({
  openProject,
  jump,
}: {
  openProject: (uuid: string) => void;
  jump?: { path: string; n: number };
}) {
  const [data, setData] = useState<MemoryPageData>();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void getMemories().then((v) => {
      if (live) setData(v);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (jump?.path && data)
      setSelectedId(
        str(data.files.find((file) => str(file.path) === jump.path)?.id),
      );
  }, [data, jump]);
  const tree = useMemo(() => (data ? buildTree(data.files) : []), [data]);
  const selected = data?.files.find((f) => str(f.id) === selectedId);
  const filtered = query
    ? data?.files.filter((f) =>
        str(f.path).toLowerCase().includes(query.toLowerCase()),
      )
    : data?.files;
  const visibleTree = query && filtered ? buildTree(filtered) : tree;
  const copy = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  if (!data)
    return (
      <section className="page">
        <div className="empty loading">正在从本地记忆库读取…</div>
      </section>
    );
  return (
    <section className="page">
      <SectionHead
        eyebrow="MEMORIES"
        title="Claude 记得的你"
        sub="Claude 导出中的全局记忆、Memory Files 与 Project Memories"
      />
      <div className="mem-grid">
        <div className="mem-col">
          <h3 className="col-title">
            总记忆 <span className="col-sub">conversations_memory</span>
          </h3>
          {str(data.globalMemory?.content) ? (
            <div className="memory-scroll">
              <Markdown text={str(data.globalMemory?.content)} />
            </div>
          ) : (
            <EmptyState
              title="暂无总记忆"
              note="Claude 导出中没有 conversations_memory 内容。"
            />
          )}
          {str(data.globalMemory?.content) && (
            <div className="col-actions">
              <button
                className="secondary"
                onClick={() => void copy(str(data.globalMemory?.content))}
              >
                {copied ? "已复制" : "复制全文"}
              </button>
            </div>
          )}
        </div>
        <div className="mem-col wide">
          <h3 className="col-title">
            Memory Files{" "}
            <span className="col-sub">
              {data.files.length} 个文件 · 任意深度目录
            </span>
          </h3>
          <div className="files-split">
            <div className="tree-pane">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 Memory File 路径"
              />
              {visibleTree.length === 0 ? (
                <EmptyState
                  title="暂无 Memory Files"
                  note="Claude 导出中没有 memory_files 记录。"
                />
              ) : (
                visibleTree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={(row) => setSelectedId(str(row.id))}
                    query={query}
                  />
                ))
              )}
            </div>
            <div className="file-reader">
              {selected ? (
                <>
                  <div className="file-head">
                    <div>
                      <b>{str(selected.path)}</b>
                      <span>
                        {str(selected.updatedAt)
                          ? `更新于 ${date(str(selected.updatedAt))}`
                          : "Claude 导出中未提供独立更新时间"}
                      </span>
                    </div>
                    <div className="file-actions">
                      <button
                        className="secondary"
                        onClick={() => void copy(str(selected.content))}
                      >
                        复制
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          download(
                            `memory-${str(selected.path).replace(/^\//, "").replace(/\//g, "-")}.md`,
                            str(selected.content),
                            "text/markdown",
                          )
                        }
                      >
                        导出 Markdown
                      </button>
                    </div>
                  </div>
                  <div className="memory-scroll">
                    {str(selected.content) ? (
                      <Markdown text={str(selected.content)} />
                    ) : (
                      <EmptyState
                        title="文件内容为空"
                        note="此 Memory File 在导出中没有内容。"
                      />
                    )}
                  </div>
                  <RawViewer
                    value={selected.raw}
                    label="Memory File Raw JSON"
                  />
                </>
              ) : (
                <EmptyState
                  title="选择左侧文件开始阅读"
                  note="支持展开/折叠目录与路径搜索。"
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <h3 className="col-title" style={{ marginTop: 34 }}>
        Project Memories{" "}
        <span className="col-sub">
          {data.projectMemories.length} 条 · 按 UUID 精确关联
        </span>
      </h3>
      {data.projectMemories.length === 0 ? (
        <EmptyState
          title="暂无 Project Memories"
          note="Claude 导出中没有项目级记忆记录。"
        />
      ) : (
        <div className="pm-grid">
          {data.projectMemories.map((m) => (
            <div key={str(m.id)} className="pm-card">
              <button
                className="pm-open"
                onClick={() => openProject(str(m.projectUuid))}
              >
                <b>{str(m.projectUuid)}</b>
                <span>查看所属 Project →</span>
              </button>
              <div className="memory-scroll small">
                <Markdown text={str(m.content)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- 项目页：列表 + 详情（概览/Instructions/Docs/Memory/Raw） ---------- */
export function ProjectsPage({
  jump,
}: {
  jump?: { uuid: string; docUuid?: string; n: number };
}) {
  const [data, setData] = useState<ProjectPageData>();
  const [openUuid, setOpenUuid] = useState(jump?.uuid || "");
  useEffect(() => {
    if (jump?.uuid) setOpenUuid(jump.uuid);
  }, [jump]);
  useEffect(() => {
    let live = true;
    void listProjects().then((v) => {
      if (live) setData(v);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!data)
    return (
      <section className="page">
        <div className="empty loading">正在从本地项目库读取…</div>
      </section>
    );
  if (openUuid)
    return (
      <ProjectDetail
        uuid={openUuid}
        docUuid={jump?.uuid === openUuid ? jump.docUuid : undefined}
        back={() => setOpenUuid("")}
      />
    );
  return (
    <section className="page">
      <SectionHead
        eyebrow="PROJECTS"
        title="你与 Claude 的项目"
        sub="Projects、Instructions、Docs 与 Project Memory"
      />
      {data.projects.length === 0 ? (
        <EmptyState
          title="暂无 Projects"
          note="Claude 导出中没有 projects 记录。"
        />
      ) : (
        <div className="proj-grid">
          {data.projects.map((p) => (
            <button
              key={str(p.uuid)}
              className="proj-card"
              onClick={() => setOpenUuid(str(p.uuid))}
            >
              <b>{str(p.name) || "未命名项目"}</b>
              {str(p.description) && <p>{str(p.description)}</p>}
              <span className="proj-meta">
                {dateOnly(str(p.updatedAt) || str(p.createdAt))} ·{" "}
                {Number(p.docsCount)} docs{p.hasMemory ? " · 有 Memory" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function ProjectDetail({
  uuid,
  docUuid,
  back,
}: {
  uuid: string;
  docUuid?: string;
  back: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [stateFor, setStateFor] = useState("");
  const [pendingState, setPendingState] = useState<
    { project?: Row; docs: Row[]; memory?: Row } | undefined
  >();
  const state = stateFor === uuid ? pendingState : undefined;
  useEffect(() => {
    let live = true;
    void getProject(uuid).then((v) => {
      if (live) {
        setPendingState(v);
        setStateFor(uuid);
      }
    });
    return () => {
      live = false;
    };
  }, [uuid]);
  useEffect(() => {
    if (docUuid) setTab("docs");
  }, [docUuid]);
  const copy = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  if (!state)
    return (
      <section className="page">
        <div className="empty loading">正在读取项目…</div>
      </section>
    );
  if (!state.project)
    return (
      <section className="page">
        <button className="secondary" onClick={back}>
          ← 返回项目列表
        </button>
        <EmptyState title="未找到该项目" note="可能数据未导入或已被清空。" />
      </section>
    );
  const p = state.project;
  const tabs: Array<[string, string]> = [
    ["overview", "概览"],
    ["instructions", "Instructions"],
    ["docs", `Docs (${state.docs.length})`],
    ["memory", "Memory"],
    ["raw", "Raw"],
  ];
  return (
    <section className="page">
      <button className="secondary" onClick={back}>
        ← 返回项目列表
      </button>
      <div className="page-head">
        <p className="eyebrow">PROJECT</p>
        <h1>{str(p.name) || "未命名项目"}</h1>
        <p className="page-sub mono">{str(p.uuid)}</p>
      </div>
      <div className="tabs">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            className={`tab ${tab === v ? "on" : ""}`}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="tab-body">
          <div className="kv-list">
            <p>
              <span>名称</span>
              <b>{str(p.name) || "未命名"}</b>
            </p>
            <p>
              <span>描述</span>
              <b>{str(p.description) || "（导出中未提供）"}</b>
            </p>
            <p>
              <span>创建时间</span>
              <b>{str(p.createdAt) ? date(str(p.createdAt)) : "未提供"}</b>
            </p>
            <p>
              <span>更新时间</span>
              <b>{str(p.updatedAt) ? date(str(p.updatedAt)) : "未提供"}</b>
            </p>
            <p>
              <span>Docs</span>
              <b>{state.docs.length} 篇</b>
            </p>
            <p>
              <span>Project Memory</span>
              <b>
                {state.memory
                  ? "存在"
                  : "Claude 导出中未包含该项目的 Project Memory"}
              </b>
            </p>
          </div>
        </div>
      )}
      {tab === "instructions" && (
        <div className="tab-body">
          {str(p.promptTemplate) ? (
            <>
              <div className="memory-scroll">
                <Markdown text={str(p.promptTemplate)} />
              </div>
              <div className="col-actions">
                <button
                  className="secondary"
                  onClick={() => void copy(str(p.promptTemplate))}
                >
                  {copied ? "已复制" : "复制"}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      `project-${str(p.name) || "instructions"}.md`,
                      str(p.promptTemplate),
                      "text/markdown",
                    )
                  }
                >
                  导出 Markdown
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="暂无 Instructions"
              note="Claude 导出中没有该项目的 prompt_template 内容。"
            />
          )}
        </div>
      )}
      {tab === "docs" && (
        <div className="tab-body">
          {state.docs.length === 0 ? (
            <EmptyState
              title="暂无 Docs"
              note="Claude 导出中没有该项目的文档记录。"
            />
          ) : (
            <div className="doc-list">
              {state.docs.map((d) => (
                <details
                  key={str(d.uuid)}
                  className="doc-item"
                  id={`doc-${str(d.uuid)}`}
                  open={docUuid === str(d.uuid)}
                  tabIndex={docUuid === str(d.uuid) ? -1 : undefined}
                >
                  <summary>
                    <b>{str(d.filename) || "未命名文档"}</b>
                    <span>
                      {str(d.createdAt) ? dateOnly(str(d.createdAt)) : ""}
                    </span>
                  </summary>
                  <div className="memory-scroll">
                    {str(d.content) ? (
                      <Markdown text={str(d.content)} />
                    ) : (
                      <EmptyState title="文档内容为空" />
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "memory" && (
        <div className="tab-body" id="memory">
          {state.memory ? (
            <>
              <p className="page-sub">按 UUID 精确关联的 Project Memory</p>
              <div className="memory-scroll">
                <Markdown text={str(state.memory.content)} />
              </div>
            </>
          ) : (
            <EmptyState
              title="暂无 Project Memory"
              note="Claude 导出中没有这个项目的记忆记录。"
            />
          )}
        </div>
      )}
      {tab === "raw" && (
        <div className="tab-body">
          <RawViewer value={p.raw} label="Project Raw JSON" />
        </div>
      )}
    </section>
  );
}

/* ---------- 回顾页：Reflections 年鉴卡 ---------- */
function reflectField(content: Row, key: string): string {
  return str(content[key]);
}
export function ReflectionsPage({
  jump,
}: {
  jump?: { id: string; n: number };
}) {
  const [items, setItems] = useState<Row[]>();
  useEffect(() => {
    let live = true;
    void listReflections().then((v) => {
      if (live) setItems(v);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (jump?.id && items)
      window.setTimeout(
        () =>
          document
            .getElementById(`reflection-${jump.id}`)
            ?.scrollIntoView({ block: "start" }),
        0,
      );
  }, [items, jump]);
  if (!items)
    return (
      <section className="page">
        <div className="empty loading">正在读取官方回顾…</div>
      </section>
    );
  if (items.length === 0)
    return (
      <section className="page">
        <SectionHead
          eyebrow="CLAUDE REFLECTIONS"
          title="官方回顾"
          sub="Claude 曾经如何总结你"
        />
        <EmptyState
          title="暂无官方回顾"
          note="Claude 导出中没有 reflections 记录。"
        />
      </section>
    );
  return (
    <section className="page">
      <SectionHead
        eyebrow="CLAUDE REFLECTIONS"
        title="官方回顾"
        sub="Claude 曾经如何总结你 · 原文呈现，未做修改"
      />
      <div className="refl-list">
        {items.map((r) => {
          const content = (r.content ?? {}) as Row,
            stats = content.stats as Row | undefined,
            topics = content.topics as unknown[] | undefined;
          return (
            <article
              key={str(r.id)}
              id={`reflection-${str(r.id)}`}
              className="refl-card"
              tabIndex={jump?.id === str(r.id) ? -1 : undefined}
            >
              <header className="refl-hero">
                <p className="eyebrow">{str(r.period) || "未知周期"}</p>
                {reflectField(content, "hero_title") && (
                  <h2>{reflectField(content, "hero_title")}</h2>
                )}
                {reflectField(content, "hero_body") && (
                  <Markdown text={reflectField(content, "hero_body")} />
                )}
              </header>
              {stats && Object.keys(stats).length > 0 && (
                <div className="refl-stats">
                  {Object.entries(stats).map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <strong>{String(v)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(topics) && topics.length > 0 && (
                <div className="refl-topics">
                  {topics.map((t, i) => (
                    <em key={i}>{String(t)}</em>
                  ))}
                </div>
              )}
              {reflectField(content, "about_your_time") && (
                <div className="refl-section">
                  <h3>About Your Time</h3>
                  <Markdown text={reflectField(content, "about_your_time")} />
                </div>
              )}
              {reflectField(content, "expanding_your_skills") && (
                <div className="refl-section">
                  <h3>Expanding Your Skills</h3>
                  <Markdown
                    text={reflectField(content, "expanding_your_skills")}
                  />
                </div>
              )}
              {reflectField(content, "worth_thinking_about") && (
                <div className="refl-section">
                  <h3>Worth Thinking About</h3>
                  <Markdown
                    text={reflectField(content, "worth_thinking_about")}
                  />
                </div>
              )}
              <footer className="refl-foot">
                {str(r.createdAt)
                  ? `生成于 ${date(str(r.createdAt))}`
                  : "Claude 导出中未提供生成时间"}
                <RawViewer value={r.raw} label="查看原始数据" />
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 统计页升级 ---------- */
export function AnalyticsPage({
  base,
}: {
  base: Array<[string, string | number]>;
}) {
  const [stats, setStats] = useState<ArchiveStats>();
  useEffect(() => {
    let live = true;
    void collectArchiveStats().then((v) => {
      if (live) setStats(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="page analytics">
      <SectionHead
        eyebrow="LOCAL ANALYTICS"
        title="你的对话时间线"
        sub="全部指标来自本地标准化数据，不以 DOM 为来源"
      />
      <div className="metrics">
        {base.map(([l, v]) => (
          <div className="metric" key={String(l)}>
            <span>{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      {!stats ? (
        <div className="empty loading">正在聚合统计…</div>
      ) : (
        <>
          <h3 className="col-title">Blocks</h3>
          <div className="metrics">
            {(
              [
                ["Text", stats.blocks.text],
                ["Thinking", stats.blocks.thinking],
                ["Tool Use", stats.blocks.tool_use],
                ["Tool Result", stats.blocks.tool_result],
                ["Token Budget", stats.blocks.token_budget],
                ["Flag", stats.blocks.flag],
                ["未识别", stats.blocks.unknown],
              ] as Array<[string, number]>
            ).map(([l, v]) => (
              <div className="metric" key={l}>
                <span>{l}</span>
                <strong>{v.toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <h3 className="col-title" style={{ marginTop: 30 }}>
            Tool
          </h3>
          <div className="metrics">
            {(
              [
                ["Tool Call 总量", stats.tools.total],
                ["MCP 调用", stats.tools.mcpCount],
              ] as Array<[string, number]>
            ).map(([l, v]) => (
              <div className="metric" key={l}>
                <span>{l}</span>
                <strong>{v.toLocaleString()}</strong>
              </div>
            ))}
          </div>
          {stats.tools.byName.length > 0 && (
            <div className="insights">
              <div>
                <h3>常见工具</h3>
                <ol>
                  {stats.tools.byName.slice(0, 8).map((t) => (
                    <li key={t.name}>
                      <button>{t.name}</button>
                      <span>{t.count.toLocaleString()} 次</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          <h3 className="col-title" style={{ marginTop: 30 }}>
            Memories & Projects
          </h3>
          <div className="metrics">
            {(
              [
                ["Memory Files", stats.memories.files],
                ["Project Memories", stats.memories.projectMemories],
                [
                  "最近记忆更新",
                  stats.memories.lastUpdated
                    ? dateOnly(stats.memories.lastUpdated)
                    : "无记录",
                ],
                ["Projects", stats.projects.projects],
                ["Project Docs", stats.projects.docs],
                ["有 Memory 的 Projects", stats.projects.withMemory],
              ] as Array<[string, string | number]>
            ).map(([l, v]) => (
              <div className="metric" key={l}>
                <span>{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- 数据页：Manifest / Raw / Unknown / Sensitive / Import Session ---------- */
function SessionReport({ session }: { session: ImportSession }) {
  const records = Object.entries(session.records);
  return (
    <details className="doc-item session-item">
      <summary>
        <b>
          {str(session.completedAt)
            ? date(str(session.completedAt))
            : date(str(session.startedAt))}
        </b>
        <span>
          {session.filesSuccess}/{session.filesTotal} 文件 · 新增{" "}
          {session.counts.inserted} · 更新 {session.counts.updated} · 未变化{" "}
          {session.counts.unchanged} · 冲突 {session.counts.conflicted}
        </span>
      </summary>
      <div className="kv-list">
        <p>
          <span>开始 / 完成</span>
          <b>
            {date(str(session.startedAt))} →{" "}
            {str(session.completedAt)
              ? date(str(session.completedAt))
              : "未完成"}
          </b>
        </p>
        <p>
          <span>Manifest 版本</span>
          <b>{str(session.manifestVersion) || "未提供"}</b>
        </p>
        <p>
          <span>文件（成功/失败/未知）</span>
          <b>
            {session.filesSuccess} / {session.filesFailed} /{" "}
            {session.filesUnknown}
          </b>
        </p>
        {records.length > 0 && (
          <p>
            <span>记录数</span>
            <b>{records.map(([k, v]) => `${k} ${v}`).join(" · ")}</b>
          </p>
        )}
        {session.errors.length > 0 && (
          <p>
            <span>错误</span>
            <b>
              {session.errors.map((e) => `${e.path}: ${e.error}`).join("；")}
            </b>
          </p>
        )}
      </div>
      <RawViewer value={session} label="Import Session Raw JSON" />
    </details>
  );
}
export function DataPage() {
  const [data, setData] = useState<DataPageData>();
  const [rawRecords, setRawRecords] = useState<RawRecord[]>();
  const [tab, setTab] = useState("manifest");
  const [sensitive, setSensitive] = useState<{
    users: Row[];
    loginHistory: Row[];
  } | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let live = true;
    void getDataPage().then((v) => {
      if (live) setData(v);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (tab !== "raw" || rawRecords) return;
    let live = true;
    void listRawRecords().then((v) => {
      if (live) setRawRecords(v);
    });
    return () => {
      live = false;
    };
  }, [rawRecords, tab]);
  useEffect(() => {
    if (tab !== "sensitive" || sensitive) return;
    let live = true;
    void getSensitiveMetadata().then((v) => {
      if (live) setSensitive(v);
    });
    return () => {
      live = false;
    };
  }, [tab, sensitive]);
  const masked = (key: string, value: string) =>
    reveal[key] ? value : "••••••••";
  if (!data)
    return (
      <section className="page">
        <div className="empty loading">正在读取数据层…</div>
      </section>
    );
  const tabs: Array<[string, string]> = [
    ["manifest", `Manifest (${data.manifests.length})`],
    ["raw", "Raw Data"],
    ["unknown", `Unknown (${data.unknown.length})`],
    [
      "sensitive",
      `Sensitive (${data.sensitiveCounts.users + data.sensitiveCounts.loginHistory})`,
    ],
    ["sessions", `导入记录 (${data.importSessions.length})`],
    ["conflicts", `冲突 (${data.conflicts.length})`],
  ];
  return (
    <section className="page">
      <SectionHead
        eyebrow="DATA LAYER"
        title="数据"
        sub="Manifest、原始数据、未识别内容与敏感元数据 · 全部保存在当前浏览器本地"
      />
      <div className="tabs">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            className={`tab ${tab === v ? "on" : ""}`}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "manifest" && (
        <div className="tab-body">
          {data.manifests.length === 0 ? (
            <EmptyState
              title="暂无 Manifest"
              note="Claude 导出中没有 manifest 记录。"
            />
          ) : (
            data.manifests.map((m) => (
              <details key={str(m.id)} className="doc-item" open>
                <summary>
                  <b>{str(m.relativePath) || "manifest"}</b>
                  <span>{str(m.version) || "版本未知"}</span>
                </summary>
                <div className="kv-list">
                  <p>
                    <span>version</span>
                    <b>{str(m.version) || "未提供"}</b>
                  </p>
                  <p>
                    <span>created_at</span>
                    <b>
                      {str(m.created_at) ? date(str(m.created_at)) : "未提供"}
                    </b>
                  </p>
                  <p>
                    <span>total_files</span>
                    <b>{String(m.total_files ?? "未提供")}</b>
                  </p>
                  <p>
                    <span>data_files</span>
                    <b>
                      {Array.isArray(m.data_files) ? m.data_files.length : 0} 条
                    </b>
                  </p>
                  <p>
                    <span>export_url</span>
                    <b>一次性导出地址已忽略</b>
                  </p>
                </div>
                {Array.isArray(m.data_files) && m.data_files.length > 0 && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>category</th>
                        <th>part</th>
                        <th>filename</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(m.data_files as Row[]).map((f, i) => (
                        <tr key={i}>
                          <td>{str(f.category) || "—"}</td>
                          <td>{f.part == null ? "—" : String(f.part)}</td>
                          <td className="mono">{str(f.filename) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <RawViewer
                  value={m}
                  label="Manifest 完整数据（标准化存储行）"
                />
              </details>
            ))
          )}
        </div>
      )}
      {tab === "raw" && (
        <div className="tab-body">
          <p className="page-sub">
            这里展示标准化 record 保存的 <b>record-level raw</b>
            ，不是未经解析的完整源文件 JSON；原始文件级 JSON
            当前架构未持久化，故不伪造。
          </p>
          {!rawRecords ? (
            <div className="empty loading">正在读取 Raw records…</div>
          ) : rawRecords.length === 0 ? (
            <EmptyState
              title="暂无 Raw records"
              note="当前浏览器尚未导入可查看的数据。"
            />
          ) : (
            rawRecords.map((record) => (
              <details
                key={`${record.store}:${record.id}`}
                className="doc-item"
              >
                <summary>
                  <b>{record.relativePath || record.store}</b>
                  <span>
                    {record.category || "category 未提供"} · part{" "}
                    {record.part ?? "—"} · {record.store}
                  </span>
                </summary>
                <div className="kv-list">
                  <p>
                    <span>source session</span>
                    <b>{record.sessionId || "未提供"}</b>
                  </p>
                  <p>
                    <span>schema summary</span>
                    <b>{record.schemaSummary}</b>
                  </p>
                  <p>
                    <span>record id</span>
                    <b>{record.id}</b>
                  </p>
                </div>
                <RawViewer value={record.raw} label="完整 record Raw JSON" />
              </details>
            ))
          )}
        </div>
      )}
      {tab === "unknown" && (
        <div className="tab-body">
          {data.unknown.length === 0 ? (
            <EmptyState
              title="没有发现未识别的 Claude 数据"
              note="本次导入中所有文件均被识别；未来格式变化的数据会保留在这里。"
            />
          ) : (
            data.unknown.map((u) => (
              <details key={str(u.id)} className="doc-item">
                <summary>
                  <b>{str(u.relativePath)}</b>
                  <span>
                    {bytes(Number(u.bytes ?? 0))} · {str(u.schemaSummary)}
                  </span>
                </summary>
                <div className="kv-list">
                  <p>
                    <span>category</span>
                    <b>{str(u.category)}</b>
                  </p>
                  <p>
                    <span>parse error</span>
                    <b>{str(u.parseError) || "—"}</b>
                  </p>
                </div>
                <RawViewer value={u.raw} label="Unknown Raw JSON" />
              </details>
            ))
          )}
        </div>
      )}
      {tab === "sensitive" && (
        <div className="tab-body">
          <div className="sensitive-note">
            <i>⚠</i>
            <div>
              <b>这里包含账户与登录相关敏感信息。</b>
              <p>
                数据仅保存在当前浏览器本地；不进入普通搜索，不默认导出。敏感值默认隐藏，可逐项显示。
              </p>
            </div>
          </div>
          {!sensitive ? (
            <div className="empty loading">正在读取敏感元数据…</div>
          ) : (
            <>
              {sensitive.users.map((u) => (
                <div key={str(u.uuid)} className="sens-card">
                  <h4>
                    账户信息{" "}
                    <span className="mono">{str(u.uuid).slice(0, 8)}…</span>
                  </h4>
                  <div className="kv-list">
                    <p>
                      <span>姓名</span>
                      <b>
                        {masked(
                          `u:${str(u.uuid)}:name`,
                          str(u.fullName) || "未提供",
                        )}{" "}
                        {str(u.fullName) && (
                          <button
                            className="reveal"
                            onClick={() =>
                              setReveal((p) => ({
                                ...p,
                                [`u:${str(u.uuid)}:name`]:
                                  !p[`u:${str(u.uuid)}:name`],
                              }))
                            }
                          >
                            {reveal[`u:${str(u.uuid)}:name`] ? "隐藏" : "显示"}
                          </button>
                        )}
                      </b>
                    </p>
                    <p>
                      <span>邮箱</span>
                      <b>
                        {masked(
                          `u:${str(u.uuid)}:mail`,
                          str(u.emailAddress) || "未提供",
                        )}{" "}
                        {str(u.emailAddress) && (
                          <button
                            className="reveal"
                            onClick={() =>
                              setReveal((p) => ({
                                ...p,
                                [`u:${str(u.uuid)}:mail`]:
                                  !p[`u:${str(u.uuid)}:mail`],
                              }))
                            }
                          >
                            {reveal[`u:${str(u.uuid)}:mail`] ? "隐藏" : "显示"}
                          </button>
                        )}
                      </b>
                    </p>
                    <p>
                      <span>手机号</span>
                      <b>
                        {masked(
                          `u:${str(u.uuid)}:tel`,
                          u.verifiedPhoneNumber
                            ? str(u.verifiedPhoneNumber)
                            : "",
                        ) || "未提供"}{" "}
                        {u.verifiedPhoneNumber ? (
                          <button
                            className="reveal"
                            onClick={() =>
                              setReveal((p) => ({
                                ...p,
                                [`u:${str(u.uuid)}:tel`]:
                                  !p[`u:${str(u.uuid)}:tel`],
                              }))
                            }
                          >
                            {reveal[`u:${str(u.uuid)}:tel`] ? "隐藏" : "显示"}
                          </button>
                        ) : null}
                      </b>
                    </p>
                  </div>
                </div>
              ))}
              {sensitive.loginHistory.map((l) => (
                <div key={str(l.id)} className="sens-card">
                  <h4>
                    登录记录{" "}
                    <span className="mono">
                      {str(l.timestamp) ? date(str(l.timestamp)) : "时间未知"}
                    </span>
                  </h4>
                  <div className="kv-list">
                    <p>
                      <span>方式</span>
                      <b>{str(l.method) || "未提供"}</b>
                    </p>
                    <p>
                      <span>IP</span>
                      <b>
                        {masked(
                          `l:${str(l.id)}:ip`,
                          str(l.ipAddress) || "未提供",
                        )}{" "}
                        {str(l.ipAddress) && (
                          <button
                            className="reveal"
                            onClick={() =>
                              setReveal((p) => ({
                                ...p,
                                [`l:${str(l.id)}:ip`]: !p[`l:${str(l.id)}:ip`],
                              }))
                            }
                          >
                            {reveal[`l:${str(l.id)}:ip`] ? "隐藏" : "显示"}
                          </button>
                        )}
                      </b>
                    </p>
                    <p>
                      <span>位置 / 设备</span>
                      <b>
                        {masked(
                          `l:${str(l.id)}:loc`,
                          JSON.stringify(l.locationInfo ?? {}),
                        )}
                      </b>
                    </p>
                    <p>
                      <span>User Agent</span>
                      <b>
                        {masked(
                          `l:${str(l.id)}:ua`,
                          JSON.stringify(l.userAgent ?? {}),
                        )}
                      </b>
                    </p>
                  </div>
                </div>
              ))}
              {sensitive.users.length === 0 &&
                sensitive.loginHistory.length === 0 && (
                  <EmptyState
                    title="暂无敏感元数据"
                    note="Claude 导出中没有 users / login_history 记录。"
                  />
                )}
            </>
          )}
        </div>
      )}
      {tab === "sessions" && (
        <div className="tab-body">
          {data.importSessions.length === 0 ? (
            <EmptyState
              title="暂无导入记录"
              note="尚未在当前浏览器导入过 Claude 导出。"
            />
          ) : (
            data.importSessions.map((s) => (
              <SessionReport key={str(s.id)} session={s} />
            ))
          )}
        </div>
      )}
      {tab === "conflicts" && (
        <div className="tab-body">
          {data.conflicts.length === 0 ? (
            <EmptyState
              title="没有冲突记录"
              note="所有导入均按稳定键正常合并。"
            />
          ) : (
            data.conflicts.map((c) => (
              <details key={str(c.id)} className="doc-item">
                <summary>
                  <b>
                    {str(c.store)} · {str(c.recordId)}
                  </b>
                  <span>{str(c.reason)}</span>
                </summary>
                <RawViewer value={c} label="Conflict Raw JSON" />
              </details>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- 导出页升级 ---------- */
import { exportOptions } from "./export-set";
export function ExportPage({
  current,
  onExportOne,
  onExportSet,
  onClear,
}: {
  current?: { title: string };
  onExportOne: (format: string) => void;
  onExportSet: (picked: string[], sensitiveConfirmed: boolean) => void;
  onClear: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>({
    conversations: true,
    memories: true,
    projects: true,
    reflections: true,
    raw: false,
  });
  const [sensitiveAgree, setSensitiveAgree] = useState(false);
  const [done, setDone] = useState("");
  const toggle = (key: string) => setPicked((p) => ({ ...p, [key]: !p[key] }));
  const run = () => {
    const chosen = [
      ...exportOptions.filter((o) => picked[o.key]).map((o) => o.key),
      ...(picked.sensitive ? ["sensitive"] : []),
    ];
    if (!chosen.includes("sensitive") || sensitiveAgree) {
      onExportSet(chosen, sensitiveAgree);
      setDone(`已导出：${chosen.join(" · ")}`);
      window.setTimeout(() => setDone(""), 2600);
    }
  };
  const anyPicked =
    exportOptions.some((o) => picked[o.key]) || picked.sensitive;
  return (
    <section className="page export">
      <SectionHead
        eyebrow="EXPORT"
        title="带走你的档案"
        sub="内容只在本地生成下载，不会上传"
      />
      {current && (
        <p className="page-sub">
          当前窗口：<b>{current.title}</b>
        </p>
      )}
      <div className="format-grid">
        {exportOptions.map((o) => (
          <button
            key={o.key}
            className={`export-pick ${picked[o.key] ? "on" : ""}`}
            onClick={() => toggle(o.key)}
          >
            <strong>{o.label}</strong>
            <span>{o.note}</span>
            <i className="pick-mark">{picked[o.key] ? "✓ 已选择" : "未选择"}</i>
          </button>
        ))}
        <button
          className={`export-pick sensitive-pick ${picked.sensitive ? "on" : ""}`}
          onClick={() => toggle("sensitive")}
        >
          <strong>Sensitive Metadata</strong>
          <span>邮箱 / 手机号 / IP / 登录记录</span>
          <i className="pick-mark">
            {picked.sensitive ? "✓ 已选择（敏感）" : "未选择 · 默认不导出"}
          </i>
        </button>
      </div>
      {picked.sensitive && (
        <div className="sensitive-note">
          <i>⚠</i>
          <div>
            <b>敏感信息将随导出文件离开浏览器。</b>
            <p>
              包含邮箱、手机号、IP、登录时间与设备信息。请确认导出目的地是安全位置。
            </p>
            <label className="sens-check">
              <input
                type="checkbox"
                checked={sensitiveAgree}
                onChange={(e) => setSensitiveAgree(e.target.checked)}
              />{" "}
              <span>我已知晓风险，确认单独导出敏感元数据</span>
            </label>
          </div>
        </div>
      )}
      <div className="col-actions">
        <button className="secondary" onClick={run} disabled={!anyPicked}>
          导出已选内容
        </button>
        {done && <em className="done-note">{done}</em>}
      </div>
      {current && (
        <>
          <h3 className="col-title" style={{ marginTop: 34 }}>
            导出当前窗口
          </h3>
          <div className="format-grid">
            {[
              ["md", "长期归档，保留角色和代码"],
              ["txt", "纯文本，角色分隔清晰"],
              ["html", "离线阅读的单文件"],
              ["json", "标准化数据，便于二次开发"],
            ].map(([f, d]) => (
              <button key={f} onClick={() => onExportOne(f)}>
                <strong>{f.toUpperCase()}</strong>
                <span>{d}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <hr />
      <button className="danger" onClick={onClear}>
        彻底清空本地档案
      </button>
    </section>
  );
}
