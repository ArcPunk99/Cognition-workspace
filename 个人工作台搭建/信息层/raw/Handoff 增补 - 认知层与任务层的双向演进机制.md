---
类型: 来源材料
所属项目: "[[个人工作台搭建]]"
---

来源：扭老板在本次 Codex 对话中提供的《Personal Workspace — Handoff 增补》。当时在讨论如何把认知更新流程写入工作台的 README 和 Schema。
收录日期：2026-11-22。材料形成时间：原文未注明。

---

# Personal Workspace — Handoff 增补

## 认知层与任务层的双向演进机制

**状态：设计讨论稿，供 Codex 编写 README 和 Schema 使用**

### 一、核心设计原则

Personal Workspace 以 Project 为工作空间，以 Task 为行动单元，以 Milestone 为认知记录单元，以 Artifact 为阶段性工作成果。



核心循环：



**Brainstorm → Handoff → Raw → Milestone → Task → Artifact → 人工确认 → 认知更新**



这一过程可以反复循环，而不是一次性完成。

### 二、认知区（Cognitive Space）

认知区包含两个主要部分。



**1. Raw：来源材料**

- 接收 GPT 等对话 Agent 生成的 Handoff。
- 接收其他来源的工作资料。
- 保留原始输入的来源、时间和上下文。
- Handoff 是经过整理的交接材料，不应被误认为完整对话原文。
- 具备文件操作权限的 Agent 可以将 Handoff 写入对应 Project 的 Raw 区域。

**2. Milestone：原子化认知记录**

- 用户在讨论过程中主动确认 Milestone。
- 一个 Milestone 可以非常简洁，例如一句话。
- 每条 Milestone 都可以独立记录和引用。
- Milestone 与 Raw 来源之间建立 Obsidian 双向链接。
- 通过 Obsidian Bases 展示 Milestone 清单，支持检索、筛选和回溯。
- AI 可以从 Handoff 中提取已经由用户确认的 Milestone，但不得将普通建议自动升级为确认结论。

### 三、任务区（Task Space）

Task 根据具体目标开展工作。



任务执行时，可以读取相关 Milestone，结合必要的 Raw 信息进行分析和行动。



执行过程中产生的阶段性 Artifact 及其版本应当保留。



最终经过人工确认，形成 Archive Artifact。



Archive Artifact 不替代历史工作记录。

### 四、Artifact 与 Milestone 的双向关系

这是本轮新增的关键设计。



**正向关系：**



Milestone 为 Artifact 的生成提供已经确认的认知依据。



**反向关系：**



Artifact 形成新的工作结论后，可以推动原有 Milestone 的修订。



例如：

- M001：确认采用技术方案 A。
- M002：确认方案 A 存在某项技术限制。
- Artifact V2：经过验证，提出采用方案 B。
- 用户确认 Artifact V2，并明确决定改用方案 B。
- 系统生成新的有效 Milestone，记录这一决策。
- M001 标记为已被取代，但保留原始内容。

**重要约束：Artifact 与 Milestone 发生冲突，不意味着 Artifact 自动拥有更高权威。**



AI 应当指出冲突，交由人确认。



只有经过明确确认的判断，才能改变当前有效的认知状态。

### 五、Milestone 的历史保留机制

每个曾经确认的原子化 Milestone 都应保留。



需要区分：

- 历史上确认过什么。
- 当前仍然有效什么。
- 哪些判断已经被修订或取代。
- 新判断依据哪些 Raw、Task 或 Artifact 形成。

因此，**历史记录不可被覆盖，当前有效认知可以持续更新。**



具体采用状态字段、版本链还是其他实现方式，由 Codex 提出方案。

### 六、给 Codex 的 Schema 设计要求

当前优先明确以下关系：

1. Project 包含多个 Task。
2. Raw 保存 Handoff 和其他来源材料。
3. Milestone 可以关联一个或多个 Raw 来源。
4. Task 可以引用多个 Milestone。
5. Task 可以产生多个 Artifact 版本。
6. Artifact 可以引用其形成依据。
7. 经人工确认的新结论可以取代旧 Milestone。
8. 被取代的 Milestone 必须保留历史和关联关系。

优先采用 Markdown、Properties、Obsidian 双向链接与 Bases。



不要预先引入 SQLite 或复杂的认知图谱系统。

### 七、尚待讨论

- Milestone 的最小字段规范。
- 多个 Milestone 之间的冲突与替代关系。
- Artifact 确认后，如何生成新的有效 Milestone。
- Task 的阶段性 Artifact 与最终 Archive Artifact 的具体区别。
- Milestone 在 Project 内共享的范围。
- 哪些已确认认知应发布到独立的 LLM Wiki。

以上内容尚未完成设计，不应直接视为已经确定的实现规范。
