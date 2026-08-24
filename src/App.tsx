import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { importClaudeFiles } from './data/import-client'
import { clearAllData, legacyArchiveSnapshot } from './data/db'
import { getConversationDetail, listArchive } from './data/queries'
import type { ArchiveFilter, ArchiveSort, ArchiveIndexItem, ConversationDetail } from './data/queries'
import './App.css'

type Block={type:string;text?:string;payload?:unknown}; type Message={id:string;role:string;createdAt?:string;blocks:Block[]}; type Conversation={id:string;title:string;createdAt?:string;updatedAt?:string;messages:Message[]}; type Archive={version:1;importedAt:string;warnings:string[];conversations:Conversation[]}
const textOf=(m:Message)=>m.blocks.map(b=>b.text??'').join('\n'); const date=(v?:string)=>v?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'时间未知'
async function db(action:'get'|'clear'):Promise<Archive|undefined>{if(action==='get')return legacyArchiveSnapshot();await clearAllData();return undefined}
function download(name:string,data:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0)}

/* ---------- 展示辅助（纯视觉，不碰数据层） ---------- */
type DetailRow = Record<string, unknown>
const str=(v:unknown)=>typeof v==='string'?v:''
const fmtBytes=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:n>=1024?`${(n/1024).toFixed(1)} KB`:`${n} B`
const shortJson=(v:unknown)=>{try{const s=JSON.stringify(v,null,2);return s&&s.length>20000?`${s.slice(0,20000)}\n…（内容过长已截断显示）`:s??''}catch{return String(v)}}
const toolName=(raw:unknown)=>{const r=raw as Record<string,unknown>|null;return str(r?.name)||'未知工具'}
const mcpSource=(raw:unknown)=>{const r=raw as Record<string,unknown>|null;const url=str(r?.mcp_server_url);return url?`MCP · ${url}`:str(r?.integration_type)&&`集成 · ${str(r?.integration_type)}`||''}
const ROLE_LABEL: Record<string,string>={user:'你',assistant:'Claude',system:'System',human:'你'}
const roleLabel=(r:string)=>ROLE_LABEL[r]??r
const BLOCK_LABEL: Record<string,string>={thinking:'Thinking',tool_use:'Tool Call',tool_result:'Tool Result',token_budget:'Token Budget',flag:'Flag'}
const blockLabel=(t:string)=>BLOCK_LABEL[t]??(t.startsWith('unknown:')?`未识别 · ${t.slice(8)}`:t)
const fileSizeOf=(r:DetailRow)=>Number(r.fileSize??0)
const fileNameOf=(r:DetailRow)=>{const n=str(r.fileName);return n||'未命名文件'}
const kindBadge=(k:'conversation'|'design_chat')=>k==='design_chat'?'DESIGN CHAT':'CONVERSATION'
const projectTag=(item:ArchiveIndexItem)=>item.kind!=='design_chat'?null:item.projectResolution==='resolved'&&item.projectResolution!==undefined?'已关联 Project':item.projectResolution==='unresolved'?'未关联到本次导出的 Project':null

/* ---------- 展示组件：块渲染（Thinking/Tool/附件/文本） ---------- */
function BlockView({block}:{block:DetailRow}){
  const type=str(block.type), text=str(block.normalizedContent), raw=block.raw
  if(type==='text'&&text)return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
  if(type==='code'&&text)return <pre className="code-block"><code>{text}</code></pre>
  if(type==='thinking')return <details className="block-card thinking"><summary><i className="glyph">◍</i>{text? 'Thinking':'Thinking（无文本内容）'}<span className="chev">▸</span></summary><div className="block-body">{text? <pre className="raw-pre">{text}</pre> : <pre className="raw-pre">{shortJson(raw)}</pre>}</div></details>
  if(type==='tool_use')return <details className="block-card tool"><summary><i className="glyph">⚙</i>Tool Call · {toolName(raw)}{mcpSource(raw)&&<em className="mcp">{mcpSource(raw)}</em>}<span className="chev">▸</span></summary><div className="block-body"><p className="kv">Input</p><pre className="raw-pre">{shortJson((raw as Record<string,unknown>|undefined)?.input??raw)}</pre></div></details>
  if(type==='tool_result')return <details className="block-card tool"><summary><i className="glyph">◎</i>Tool Result<span className="chev">▸</span></summary><div className="block-body"><pre className="raw-pre">{shortJson(text?text:(raw as Record<string,unknown>|undefined)?.content??raw)}</pre></div></details>
  return <details className="block-card other"><summary><i className="glyph">▣</i>{blockLabel(type)}<span className="chev">▸</span></summary><div className="block-body"><pre className="raw-pre">{text||shortJson(raw)}</pre></div></details>
}
function AttachmentCard({a}:{a:DetailRow}){return <div className="attach-card"><i className="glyph">▤</i><div><b>{fileNameOf(a)}</b><span>{[str(a.fileType)||'未知类型',fileSizeOf(a)?fmtBytes(fileSizeOf(a)):''].filter(Boolean).join(' · ')}</span>{str(a.extractedContent)&&<details className="inline-details"><summary>查看提取内容</summary><pre className="raw-pre">{str(a.extractedContent)}</pre></details>}<p className="attach-note">原始文件未包含在 Claude 导出中</p></div></div>}
function FileChip({f}:{f:DetailRow}){return <div className="file-chip"><i className="glyph">▦</i><span>{fileNameOf(f)}</span></div>}

/* ---------- 展示组件：单条消息 ---------- */
function MessageView({message}:{message:DetailRow&{blocks:DetailRow[];attachments:DetailRow[];files:DetailRow[]}}){
  const role=str(message.sender), [showTime,setShowTime]=useState(false)
  return <div className={`message ${role}`}><div className="role" onClick={()=>setShowTime(v=>!v)}>{roleLabel(role)}</div><div className="message-content">{showTime&&str(message.createdAt)&&<time>{date(str(message.createdAt))}</time>}{message.blocks.map((b,i)=><BlockView key={i} block={b}/>)}{message.attachments.length>0&&<div className="attach-list">{message.attachments.map((a,i)=><AttachmentCard key={i} a={a}/>)}</div>}{message.files.length>0&&<div className="file-list">{message.files.map((f,i)=><FileChip key={i} f={f}/>)}</div>}</div></div>
}

/* ---------- 展示组件：渐进渲染容器（防 17k 消息冻结） ---------- */
function ProgressiveMessages({messages}:{messages:ConversationDetail['messages']}){
  const [count,setCount]=useState(50), sentinel=useRef<HTMLDivElement|null>(null)
  useEffect(()=>{
    const el=sentinel.current; if(!el)return
    const io=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)setCount(c=>c+100)},{rootMargin:'600px'})
    io.observe(el); return ()=>io.disconnect()
  },[count])
  const shown=messages.slice(0,count)
  return <>{shown.map((m,i)=><MessageView key={str(m.uuid)||i} message={m}/>)}{count<messages.length&&<div ref={sentinel} className="load-more">正在展开后续 {messages.length-count} 条…</div>}</>
}

/* ---------- 展示组件：档案索引柜 ---------- */
const FILTERS: Array<[ArchiveFilter,string]>=[['all','全部'],['conversations','对话'],['design_chats','Design Chats'],['attachments','有附件'],['tools','有 Tool'],['thinking','有 Thinking']]
const SORTS: Array<[ArchiveSort,string]>=[['updated_desc','最近更新'],['created_asc','最早创建'],['messages_desc','消息最多'],['title_asc','标题']]
function ArchiveSidebar({items,selectedId,onSelect,query,setQuery,filter,setFilter,sort,setSort}:{items:ArchiveIndexItem[];selectedId:string;onSelect:(id:string)=>void;query:string;setQuery:(v:string)=>void;filter:ArchiveFilter;setFilter:(v:ArchiveFilter)=>void;sort:ArchiveSort;setSort:(v:ArchiveSort)=>void}){
  return <aside><div className="index-head"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索标题与对话内容"/><div className="sort-row"><select value={sort} onChange={e=>setSort(e.target.value as ArchiveSort)} aria-label="排序方式">{SORTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><span className="count">{items.length} 个窗口</span></div><div className="filter-row">{FILTERS.map(([v,l])=><button key={v} className={`chip ${filter===v?'on':''}`} onClick={()=>setFilter(v)}>{l}</button>)}</div></div><div className="index-list">{items.length===0&&<p className="index-empty">没有符合条件的会话。</p>}{items.map(item=><button className={`conversation ${selectedId===item.id?'selected':''}`} onClick={()=>onSelect(item.id)} key={`${item.kind}:${item.id}`}><b>{item.title}</b><span className="meta"><i className="kind-tag">{kindBadge(item.kind)}</i>{date(item.updatedAt)} · {item.messageCount} 条消息</span>{projectTag(item)&&<em className="proj-tag">{projectTag(item)}</em>}</button>)}</div></aside>
}

export default function App(){
  const[archive,setArchive]=useState<Archive|null>(null),[page,setPage]=useState('import'),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
  const[filter,setFilter]=useState<ArchiveFilter>('all'),[sort,setSort]=useState<ArchiveSort>('updated_desc'),[indexItems,setIndexItems]=useState<ArchiveIndexItem[]>([]),[detailState,setDetailState]=useState<{id:string;data:ConversationDetail|undefined}|null>(null)
  const input=useRef<HTMLInputElement>(null), articleRef=useRef<HTMLElement|null>(null)
  useEffect(()=>{db('get').then(a=>{if(a){setArchive(a);setSelected(a.conversations[0]?.id??'');setPage('archive')}})},[])
  useEffect(()=>{let alive=true;listArchive({query,filter,sort}).then(items=>{if(alive)setIndexItems(items)});return()=>{alive=false}},[query,filter,sort,archive])
  const detail=detailState?.id===selected?detailState.data:undefined, detailLoading=Boolean(selected)&&detailState?.id!==selected
  useEffect(()=>{if(!selected)return;let alive=true;getConversationDetail(selected).then(d=>{if(alive){setDetailState({id:selected,data:d});if(articleRef.current)articleRef.current.scrollTop=0}});return()=>{alive=false}},[selected])
  const conversations=useMemo(()=>archive?.conversations??[],[archive]),current=conversations.find(c=>c.id===selected)??conversations[0]
  const all=conversations.flatMap(c=>c.messages),chars=all.reduce((n,m)=>n+textOf(m).length,0)

async function importFile(files:File[]){setBusy(true);setNote('正在扫描文件…');try{const session=await importClaudeFiles(files,progress=>setNote(`${progress.phase} ${progress.percent}%`)),a=await legacyArchiveSnapshot();setArchive(a);setSelected(a.conversations[0]?.id??'');setPage('archive');setNote(`导入完成：${a.conversations.length} 个会话；新增 ${session.counts.inserted}，更新 ${session.counts.updated}，未变化 ${session.counts.unchanged}，冲突 ${session.counts.conflicted}。`)}catch(e){setNote(`导入失败：${e instanceof Error?e.message:'未知错误'}`)}finally{setBusy(false)}}
function exportOne(format:string){if(!current)return;const safe=current.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,60),body=current.messages.map(m=>`## ${m.role==='user'?'你':m.role==='assistant'?'Claude':m.role}\n${m.createdAt?`*${date(m.createdAt)}*\\n`:''}${textOf(m)}`).join('\n\n');if(format==='json')download(`${safe}.json`,JSON.stringify(current,null,2),'application/json');else if(format==='html')download(`${safe}.html`,`<!doctype html><meta charset="utf-8"><title>${safe}</title><style>body{max-width:860px;margin:40px auto;font:16px/1.7 system-ui;white-space:pre-wrap}</style><h1>${safe.replace(/</g,'&lt;')}</h1>${body.replace(/&/g,'&amp;').replace(/</g,'&lt;')}`,'text/html');else download(`${safe}.${format}`,`# ${current.title}\\n\\n${body}`,'text/plain;charset=utf-8')}
const file=(e:ChangeEvent<HTMLInputElement>)=>{const files=[...(e.target.files??[])];if(files.length)void importFile(files)};const drop=(e:DragEvent)=>{e.preventDefault();const files=[...e.dataTransfer.files];if(files.length)void importFile(files)}

const goArchive=useCallback((id:string)=>{setSelected(id);setPage('archive')},[])
return <main><header><div className="brand">✦ 时光之遗 <small>TIME LEGACY</small></div><nav>{[['import','导入'],['archive','档案'],['analytics','统计'],['export','导出']].map(([p,n])=><button key={p} className={page===p?'active':''} onClick={()=>setPage(p)}>{n}</button>)}</nav><span className="privacy">● 本地处理，未上传</span></header>{note&&<div className="notice">{note}<button onClick={()=>setNote('')}>×</button></div>}

{page==='import'&&<section className="landing"><p className="eyebrow">PRIVATE CONVERSATION ARCHIVE</p><h1>让过去的对话，<em>重新可阅读。</em></h1><p>导入 Claude 官方导出的 ZIP 或 conversations.json。所有处理都在当前浏览器完成。</p><div className="drop" onDragOver={e=>e.preventDefault()} onDrop={drop} onClick={()=>input.current?.click()}><strong>{busy?'正在处理档案…':'拖入 Claude 导出文件'}</strong><span>或点击选择完整导出 ZIP / 多个批次文件</span><i>✦ 支持 Manifest、批次 ZIP 与 conversations.json</i></div><input ref={input} hidden multiple type="file" accept=".json,.zip" onChange={file}/>{archive&&<button className="secondary" onClick={()=>setPage('archive')}>继续阅读已有档案 →</button>}</section>}

{page==='archive'&&archive===null&&<section className="archive"><div className="empty">请先导入档案。</div></section>}
{page==='archive'&&archive!==null&&<section className="archive"><ArchiveSidebar items={indexItems} selectedId={selected} onSelect={goArchive} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort}/><article ref={articleRef}>{detailLoading&&!detail&&<div className="empty loading">正在从本地档案库读取…</div>}{detail? <>
<div className="conversation-head"><div><p className="eyebrow">{str(detail.conversation.uuid)===selected?'CONVERSATION':''}</p><h2>{str(detail.conversation.name)||'未命名对话'}</h2><span>{date(str(detail.conversation.createdAt))} — {date(str(detail.conversation.updatedAt))} · {detail.messages.length} 条消息</span></div><button className="secondary" onClick={()=>setPage('export')}>导出此窗口</button></div>
<div className="messages">{detail.messages.length===0?<div className="empty">此对话在导出记录中没有消息内容。</div>:<ProgressiveMessages key={selected} messages={detail.messages}/>}</div>
</>:!detailLoading&&<div className="empty">未找到该对话，可能属于 Design Chat 或尚未导入。</div>}</article></section>}

{page==='analytics'&&<section className="analytics"><p className="eyebrow">LOCAL ANALYTICS</p><h1>你的对话时间线</h1><div className="metrics">{[['会话',conversations.length],['消息',all.length],['你的消息',all.filter(m=>m.role==='user').length],['Claude 消息',all.filter(m=>m.role==='assistant').length],['正文字符',chars.toLocaleString()],['活跃天数',new Set(all.map(m=>m.createdAt?.slice(0,10)).filter(Boolean)).size]].map(([l,v])=><div className="metric" key={String(l)}><span>{l}</span><strong>{v}</strong></div>)}</div><div className="insights"><div><h3>消息最多的窗口</h3><ol>{[...conversations].sort((a,b)=>b.messages.length-a.messages.length).slice(0,5).map(c=><li key={c.id}><button onClick={()=>{setSelected(c.id);setPage('archive')}}>{c.title}</button><span>{c.messages.length} 条</span></li>)}</ol></div></div></section>}

{page==='export'&&<section className="export"><p className="eyebrow">EXPORT</p><h1>带走你的档案</h1>{current?<><p>当前窗口：<b>{current.title}</b>。内容只在本地生成下载。</p><div className="format-grid">{[['md','长期归档，保留角色和代码'],['txt','纯文本，角色分隔清晰'],['html','离线阅读的单文件'],['json','标准化数据，便于二次开发']].map(([f,d])=><button key={f} onClick={()=>exportOne(f)}><strong>{f.toUpperCase()}</strong><span>{d}</span></button>)}</div><hr/><button className="danger" onClick={async()=>{if(confirm('这会从当前浏览器彻底清空聊天正文，确定吗？')){await db('clear');setArchive(null);setSelected('');setPage('import');setNote('本地档案已彻底清空。')}}}>彻底清空本地档案</button></>:<p>请先导入档案。</p>}</section>}</main>}
