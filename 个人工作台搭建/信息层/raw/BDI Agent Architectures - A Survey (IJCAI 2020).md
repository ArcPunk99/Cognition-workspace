---
类型: 来源材料
所属项目: "[[个人工作台搭建]]"
---

# BDI Agent Architectures: A Survey

Lavindra de Silva、Felipe Meneguzzi、Brian Logan，IJCAI 2020 综述专栏，论文集第 4914–4921 页。扭老板提供官方出版页，2026-11-22 收录。[[BDI Agent Architectures - A Survey (IJCAI 2020).pdf|本地论文全文]] · [IJCAI 出版页](https://www.ijcai.org/proceedings/2020/684) · [DOI](https://doi.org/10.24963/ijcai.2020/684)

研究问题见 [[Personal Workspace Handoff V0.4#阶段 A：问题出现|我是不是在重复造轮子]]。这篇综述对应 [[Personal Workspace Handoff V0.4#阶段 B：资料发现|BDI Agent Architecture 线索]]，适合查已有架构如何处理「对情况的认识发生变化后，原目标和执行计划怎么办」。

## 值得读的段落

- **§2 开头两段及算法 1，印刷页 4914–4915。** 作者把「决定要达成什么」与「选择怎样达成」分开，再用一个循环说明新信息如何影响计划选择和下一步行动。可对照工作台的意图、判断与执行分别承担了哪一步。[[BDI Agent Architectures - A Survey (IJCAI 2020).pdf#page=1|读 §2]]
- **§4.2，印刷页 4916。** 先读开头对两类目标的区分，再看谈到 *failure condition* 的一段。如果目标描述的是某个希望实现的状态，哪些新信息意味着它已经实现、已经无关或已无法实现？[[BDI Agent Architectures - A Survey (IJCAI 2020).pdf#page=3|读 §4.2]]
- **§6.1，印刷页 4918。** 找到 *Automated Failure Recovery* 段落。原计划失败时，有些系统会为同一目标另选计划。对照项目中的一次失败，可以追问：证据指向的是「这条路走不通」，还是「原目标需要重审」？[[BDI Agent Architectures - A Survey (IJCAI 2020).pdf#page=5|读 §6.1]]
