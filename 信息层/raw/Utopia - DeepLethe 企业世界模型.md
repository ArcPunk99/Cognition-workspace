---
类型: 来源材料
所属项目: "[[个人工作台搭建]]"
---

来源：<https://github.com/deeplethe/utopia>　官网：<https://utopia.bi>　作者：DeepLethe　License：Apache-2.0
获取日期：2026-11-23。所属问题：[[Personal Workspace Handoff V0.4#阶段 A：问题出现|是否在重复造轮子]]。
扭老板于 2026-11-23 给出仓库链接，要求收录一份项目介绍。
材料性质：本篇据仓库 README（英文主文件）整理，保留原文关键句，非逐字全文。人工审阅情况未记录。

---

# Utopia

**定位**：DeepLethe 做的「企业世界模型」（enterprise world model）。自我描述为「第一个开放的知识工程底座，被动学习、自我治理」。

作者明确拒绝一种类比：*"we would rather this project were not framed as an open-source take on Palantir. It is a different route to enterprise intelligence, built bottom up from knowledge governance to trustworthy decisions and simulation."*（不希望被当成开源版 Palantir；是从知识治理自下而上走到可信决策与推演的另一种路线。）

## 1. 它认为自己和知识图谱、向量库的区别

知识图谱和向量库用来"盛放当下已知"。Utopia 把**时间意识和本体**放进基础层：知识系统随材料到达而演进，冲突检测、推理和决策都跑在这套本体之上。离线可部署，公司可以在自己控制的硬件上立起知识底座、Agent 可信任的决策核心、以及合规审计链。

v0.1 的一句话功能概览（原文）：

> cited streaming chat against any OpenAI-compatible endpoint, LLM extraction against an editable ontology, three-stage entity resolution with reversible merges, a review queue for what needs a human, and a graph page with a timeline. Multi-tenant with per-KB access control and an audit trail. Rust (axum · sqlx · tokio · tantivy) over PostgreSQL/pgvector — one binary and one database, no other services required.

## 2. 核心机制

| 机制 | 内容 |
|---|---|
| **双时态图** bitemporal | 每个事实带两个时间：何时为真、底座何时得知。纠错会关闭旧版本并把新版本链接到它，而不是覆盖。用于回答"2023 年 Q2 谁负责 X，以及当时我们是怎么认为的"。 |
| **本体** ontology | 抽取按可编辑的本体进行。新知识库自带五套包：schema.org、W3C Org、PROV-O、FOAF、IOF Core。包外术语按出现频次计数，确认常用项后并入本体。 |
| **审核队列** review queue | 存放"需要人处理"的东西。Agent 想写入的任何内容都先到人手上。 |
| **决策账本** decision ledger | 确认/驳回事实、合并/回滚实体、重建图谱，每次留下谁、何时、当时对象长什么样的记录。**追加式，记录比它所属的对象活得久**，甚至比它所属的知识库活得久。 |
| **MCP** | 每个知识库一个 MCP server，Claude Desktop、Cursor、Workbuddy 等可接入，细粒度权限。读是"带类型和日期的事实"而非段落；写是提案。 |
| **Agentic RAG** | 内置 Agent 可检索文档、走图（某实体在某日的全部事实、某段时间内的变化）、查挂载的数据库。同一套只读工具也通过 MCP 暴露。 |

## 3. 其他功能点

- **知识入库**：PDF、DOCX、PPTX、XLSX/XLS、ODS、CSV/TSV、Markdown、HTML、纯文本；扫描件和图片走 MinerU 或火山引擎视觉模型；录音走转写并标说话人。网页、RSS、GitHub、Jira、Notion、WebDAV、S3 兼容桶按计划同步。
- **检索**：Tantivy 全文 + pgvector 向量，RRF 融合。答案流式输出并内联引用，点引用打开原文段落。任意 OpenAI 兼容端点（DeepSeek、Qwen、GLM、Ollama、vLLM），可全内网运行。
- **Ontology2SQL**：作者称在 BIRD Mini-Dev 的 SQLite 与 PostgreSQL 上为当前最好成绩。
- **多用户与权限**：每个知识库独立成员与角色（owner / admin / editor / viewer）；开放库全部署可读，受限库仅受邀。首个注册账号成为系统管理员。
- **决策智能**：开发中。记录一个决策，重放当时的理解与后来的实际走向，在叠加情景上推理。

## 4. 技术栈与运行

Rust（axum · sqlx · tokio · tantivy）+ PostgreSQL/pgvector。**一个二进制、一个数据库，不需要其他服务**。全文检索内嵌在二进制里，向量进 pgvector，作业队列是一张表。

Docker 一行起：`docker compose --profile app up -d`，开 `http://localhost:1516` 注册，首个账号即管理员。本地开发需 Rust 1.85+、Node 20+、pnpm。

## 5. 状态与路线图

**v0.1**。数据库 schema 在版本间演进，迁移只向前、无回滚。生产环境建议用 `UTOPIA_IMAGE` 钉死版本，升级前连同 `data` 目录一起备份数据库。

路线图未完成项：决策推理（约束计算、事后重放）／业务规则（人写在实体属性事实上的规则，产出派生事实并保留规则与前提作为解释）／**执行闸门**（用本体规则和符号逻辑校验 Agent 的调用）／MaxCompute 映射与 Ontology2SQL／飞书连接器／MCP 上的 Agent 记忆（episode 写入、retrieve 端点）／企业项（OIDC SSO、备份恢复命令、10 万文档基准）。

## 6. 关键原文摘句

> Utopia puts time awareness and ontology in the base layer: the knowledge system evolves as material arrives, and conflict detection, reasoning and decision making all run against that ontology.

> Reads are typed and dated, not passages; writes are proposals.

> …a correction links to what it replaced. The temporal QA bench measures this.

> The ledger is append-only, and a record outlives its object, even the base it belonged to.
