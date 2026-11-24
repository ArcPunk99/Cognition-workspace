# BDI 智能体架构综述

**原题**　BDI Agent Architectures: A Survey  
**作者**　Lavindra de Silva（英国剑桥大学）、Felipe Meneguzzi（巴西南里奥格兰德天主教大学）、Brian Logan（英国诺丁汉大学）  
**出处**　第 29 届国际人工智能联合会议（IJCAI 2020），综述专栏，第 4914–4921 页。[[BDI Agent Architectures - A Survey (IJCAI 2020).pdf|英文原版 PDF]] · [会议出版页](https://www.ijcai.org/proceedings/2020/684)

*中文译稿。文中的「目前」和对未来研究的展望均以论文发表于 2020 年时为准。参考文献保留原文著录，便于检索。*

## 摘要

在研究智能体如何自主行动的符号模型，以及面向智能体的软件工程时，许多工作都以 BDI 模型为基础。文献中已出现多种基本 BDI 模型的变体，但距上一次系统梳理 BDI 智能体架构研究已逾十年。本文综述 BDI 架构各组成部分的主要处理方法，考察这些方法在智能体编程语言中的实现，并讨论各自的取舍。

## 1 引言

过去三十年间，以信念（belief）、愿望（desire）和意图（intention）这三种心智态度为基础的 BDI 模型，支撑了大量自主智能体架构研究。从 Bratman（1987）的哲学工作，以及过程推理系统（Procedural Reasoning System，PRS）等早期实现（Georgeff and Lansky，1987）出发，BDI 的理论与实践一直并行发展。关于程序含义的新认识催生了新的架构与语言特性，而新的架构特性又促使研究者扩展和革新相应的形式语义。这段时期涌现出许多架构、语言、解释器、平台和形式化理论，涵盖多种智能体编程特性及其对应的语义。理论与实现已十分繁多，是时候梳理 BDI 生态的发展状况了。[^1]

我们考察 BDI 智能体架构中最重要的特性，以及它们如何在智能体编程语言中实现。哪些特性重要难免带有主观判断，本文采用两个筛选条件。第一，该特性须属于 Bratman（1987）最初提出的 BDI 概念范围。引入额外心智态度（如义务）的架构因而超出讨论范围。第二，该特性须实现 Bratman 所说的实践推理，或有助于实现这种推理。模块和调试支持等面向软件开发的特性因此也不在讨论之列。受篇幅和文献数量所限，许多特性只能列举代表性实例。对于未能收录其成果的作者，我们谨致歉意。

[^1]: 据作者所知，最近的一篇相关综述是 Bordini 等（2006）。Kravari 和 Bassiliades（2015）关注智能体平台在许可证、健壮性等使用层面的问题，研究重点与架构本身有所不同。

## 2 BDI 智能体架构

BDI 智能体架构源自 Bratman（1987）的哲学研究。他认为，实践推理意味着主体根据自己相信什么、想要什么、重视和关心什么，在彼此冲突的选项之间权衡各种支持或反对的理由。实践推理的第一步称为**审议**（deliberation），即从可能彼此冲突的愿望出发，决定要使哪种状态成为现实。第二步称为**手段—目的推理**（means–ends reasoning），即决定怎样实现该状态。在实践中，这通常意味着采纳一套现成做法或预先指定的行动计划。Bratman 的哲学模型由此启发了一种编程思路：用信念、愿望和意图这三种心智态度来构造智能体。

在 BDI 架构中，**信念**表示智能体掌握的有关环境、其他智能体和自身的信息；**目标**（愿望）表示希望达到的状态；**意图**表示智能体为实现特定目标所作的承诺。BDI 智能体程序包括一组初始信念（有时还有初始目标），以及一组**计划规则**。计划规则类似于层次任务网络（HTN）规划中的方法，规定在什么条件下可以用某个计划实现目标，或响应信念的变化。计划由一系列步骤组成，其中可以包含信念更新、行动和子目标。

智能体解释器通过**审议循环**同时实现审议和手段—目的推理，见算法 1。每轮开始时，智能体用来自环境的外部事件（如新的顶层目标或感知信息）和上一轮产生的内部事件（如子目标）更新事件队列（第 3 行）。接着，它根据感知到的环境状态变化更新信念库 `Bel`（第 4 行）。然后，智能体使用计划库中的规则响应新事件。每条计划规则都根据当前信念，为某个事件提出一个应对计划。如果事件来自外部，这个计划便成为一项新意图的根；如果事件是一个子目标，就把计划加入已有意图（第 5 行）。因此，每项意图都包含一个计划栈，栈中的计划对应一系列有层次的子目标。最后，智能体选择一项意图，执行其栈顶计划的下一步：可能将新的子目标放入事件队列，也可能在环境中采取行动（第 6 行）。随后开始下一轮循环。

**算法 1　BDI 智能体解释器**

```text
1  过程 智能体解释器(〈Ev, Bel, PLib, Int〉)
2    持续循环
3      Ev  ← 更新事件(Ev)
4      Bel ← 更新信念(Ev, Bel)
5      Int ← 选择计划(Ev, Bel, PLib, Int)
6      Ev  ← 执行意图(Int, Ev)
```

其中，`Ev` 是事件队列，`Bel` 是信念库，`PLib` 是计划库，`Int` 是当前的意图集合。

算法 1 略去了每一步的实现细节，呈现的是本文所讨论的各类 BDI 架构与语言的主要特征。关于可计算的 BDI 解释器，更详细的讨论见 Meneguzzi 和 De Silva（2015）。在 BDI 智能体研究的发展过程中，架构的基本组成和审议循环的步骤大体稳定，但对每个组成部分和步骤，人们提出了多种细化方式和解释。下文逐一讨论。

## 3 信念的处理方法

在大多数智能体编程语言中，智能体的信念库用一阶逻辑语言中不含变量的正文字的合取来表示。许多语言在这一基本表示上作了扩展，具体如下。

### 3.1 信念公式

在许多语言中，智能体的信念只表示「为真的事实」（即正文字）。这样做的好处是，智能体的信念始终一致。但要表示否定信息，例如积木 `block1` 上没有其他积木，通常就需要引入额外的状态谓词，例如 `clear(block1)`。这类语言即使支持否定，也只允许在计划规则中使用「失败即否定」：如果智能体的信念库中没有 φ，也无法从中推出 φ，智能体就隐含地相信 `not(φ)`。另一些语言则允许信念库包含负文字，例如 Jason（Bordini 等，2007） 将这种做法称为「强否定」。此外，许多语言允许把推理规则纳入智能体的信念，通常采用霍恩子句。这些规则一般表示某个领域中固定的、起定义作用的知识，不随智能体的感知或其他智能体发来的消息而更新。

### 3.2 扩展信念表示

有些研究通过扩展底层信念表示，支持更复杂的推理。例如，Moreira 等（2006） 开发了一个 AgentSpeak(L) 变体，其基础由 Prolog 改为描述逻辑。这样可以更简洁地表述复杂的信念库查询，检查信念更新后是否一致，利用概念间的包含关系更灵活地检索计划，还可以共享用 OWL 等本体语言表达的知识。Jason 智能体平台的 JASDL 扩展采用了类似方法。它借助现有的 OWL-API，利用本体知识泛化计划的触发条件，也用这些知识查询智能体的信念库（Klapiscak 和 Bordini，2009）。

另一条研究路线让底层知识表示（KR）技术成为可插拔组件，避免绑定某一种技术。例如，Dastani 等（2009） 提出了两种方法，在基于 BDI 的智能体编程语言中集成和组合多种知识表示技术。一种是保持语义的翻译，把一种表示映射为另一种。另一种使用「桥接规则」，使采用多种知识表示技术的智能体系统获得额外的推理能力。集成多种知识表示语言还可以采用通用接口，例如，通过同一接口接入 Prolog 和带规则的 OWL（Bagosi 等，2015）。在实际应用中，Jason 等语言允许给信念添加「注记」，记录该信念的来源、智能体在哪个时间步开始持有它等信息。其他推理方法或信念更新程序可以使用这些信息。

### 3.3 不确定信念

也有研究扩展了 BDI 语言，使其能够处理不确定的信念。例如，Kwisthout 等（2005） 用登普斯特–谢弗理论刻画智能体信念中的不确定性。Casali 等（2011） 提出分级 BDI 智能体模型，用信念度表示智能体对各项信念的确信程度。Silva 和 Gluz（2011） 提出 AgentSpeak(L)（Rao，1996） 的一个变体 AgentSpeak(PL)，通过贝叶斯网络支持概率信念。Bauters 等（2014） 则扩展了智能体语言 CAN（Winikoff 等，2002） 的操作语义，使其能够处理不确定信息。还有方法将符号化的 BDI 循环与感知信息的贝叶斯更新分开。例如，Coelho 和 Nogueira（2015） 的更新函数在内部使用隐马尔可夫模型，返回最可能的感知结果，将其作为符号元素纳入信念库。

### 3.4 信念修正

智能体如何更新信念，也是一个研究方向。例如，Alechina 等（2006） 考察了如何用人工智能中的信念修正技术，保证 BDI 智能体信念库的一致性。另一条路线研究如何运用论证理论对相互矛盾的信息进行推理，例如处理多智能体交互中的分歧。Panisson 等（2018） 开发的方法允许 Jason/JaCaMo 智能体考虑不同信息来源的可信程度，在相互冲突的结论之间作出选择，或在对话中选取最有希望的论据。

## 4 目标的处理方法

目标是 BDI 智能体编程的另一个核心概念。本节简要回顾文献中处理目标的主要方法，包括目标的主要类型及其语义。

### 4.1 测试目标

测试目标用来检查某个条件是否成立，即智能体是否相信它成立。在多数 BDI 编程语言中，测试目标只作为计划内的目标或子目标出现，不作为顶层目标。求值时，智能体对照自己的信念库或目标库检查该目标，过程中可能涉及变量合一。如果求值为真，包含该目标的计划就继续执行。各语言对求值为假的测试目标有不同处理方式。例如，在 2APL（Dastani，2008） 中，包含该目标的计划会阻塞，直到求值为真。PRS 通过 `?WAIT` 结构实现这一行为。在 Jason 中，测试目标失败可能触发一个子目标，使智能体采纳一项计划，让测试条件成立，例如向其他智能体询问信息。

### 4.2 成就目标

成就目标主要分为两类。过程式成就目标关注「要做什么」，即当智能体的目标或信念发生变化时，它承诺执行某个动作或一系列动作。声明式成就目标关注「要达到什么状态」，意在使环境或智能体本身达到某个特定状态。声明式目标与智能体的信念有内在联系：理性的智能体不应把自己相信已经成立的状态继续当作目标。一旦智能体相信目标状态当前已经成立，就会放弃该目标。过程式目标通常独立于智能体的信念，也就是说，信念发生变化本身不会导致智能体放弃该目标。

不同的智能体编程语言通常只支持过程式目标或声明式目标之一。例如，PRS、JACK（Busetta 等，1999）、3APL（Hindriks 等，1999）、Jason 和 Jadex（Braubach 等，2005） 对成就目标采取过程式解释，GOAL（Hindriks 等，2001）、较新版本的 3APL（Dastani 等，2004） 和 2APL 则采取声明式解释。一些采用过程式解释的语言可以借助特定编程惯例间接支持声明式目标。例如，Hübner 等（2006） 展示了如何通过计划规则模式，在 Jason 中实现兼有成功条件和失败条件的声明式目标。

采用过程式方法的语言通常用简单的项表示目标，其中可以含有变量，例如 `pickup(block1)`。当智能体有多个目标时，可按任意顺序执行，也可同时执行，具体取决于智能体及其程序的能力。支持声明式目标的语言通常用正文字的合取来表示目标，其中也可以含有变量。例如，`on(block1, block2) ∧ on(block2, block3)` 要求两个谓词在同一个状态中同时为真。每个目标本身都必须一致，即智能体不能把 `φ ∧ ¬φ` 作为一个目标。但当智能体拥有多个目标时，这些目标彼此不一定相容，即不要求能够同时达成。

在 PRS、CAN、Jadex 等语言中，成就目标的定义还可以包含「失败条件」，指明在什么情形下应当认定目标无法实现或已不再相关，从而放弃它。当用于达成目标的计划失败时，该目标也可能被放弃，不过这通常由第 6 节所述的审议循环决定。

无论过程式还是声明式目标，通常都被视为已被智能体「采纳」：它将在未来某个时候追求或实现这些目标。至于何时实现某个目标，通常由第 6 节所述的审议循环决定。因此，它们的作用更接近 BDI 逻辑中的愿望。

### 4.3 维持目标

维持目标要求环境持续处于某个特定状态。与声明式成就目标类似，当目标条件不成立时，维持目标会促使智能体采纳相应的计划。当某个守卫条件变为真时，也会触发计划：此时意味着需要维持的状态在不久后将不再成立。（Dastani 等，2006） 将这种守卫条件称为「维持条件」。例如，当电量降到 20% 以下时，维持电池有电的目标可以被激活。成就目标可以留到未来完成，而对维持目标而言，守卫条件变真或目标条件变假，通常都会促使智能体立即采纳一项计划，以恢复或维持目标条件。不过，与成就目标相同，如果计划失败，如何处理仍由第 6 节所述的审议循环决定。

### 4.4 时序扩展目标

声明式成就目标和维持目标都可以视为时序扩展目标的特例。时序扩展目标由时序逻辑公式定义。在这种表述下，成就目标可视为可达性性质（未来某时 φ 成立），维持目标可视为不变性性质（φ 在所有状态中成立），而 PRS 的主动保持目标则类似于 Until（直到）公式（ψ 持续成立，直至 φ 成立，尽管在 PRS 中 φ 是过程式目标）。Dastani 等（2011） 给出了一套涵盖多种目标类型的分类体系，用线性时序逻辑（LTL）公式表示目标，再将其转化为更基本的声明式目标与维持目标的组合。例如，「达成并维持」目标可以定义为先使某个条件成立（如同声明式成就目标），然后使其在给定的一段时间内持续成立。Dastani et al. 概述了如何在标准智能体编程语言中实现这些时序目标。不过，除上述特例和 Hindriks 等（2009） 的初步工作之外，在本文发表时，大多数智能体编程语言尚不支持时序目标。

### 4.5 优先级、截止时间和计划限制

除上述主要目标类型之外，文献还提出了多种附加的目标属性和约束。这些属性和约束大多是在声明式目标的语境下研究的，但原则上也可以用于过程式目标，有些还可以用于维持目标。例如，AgentSpeak(XL) 允许为目标指定效用和截止时间，智能体采取行动以使目标函数最大化（Bordini 等，2002）。类似地，AgentSpeak(RT) 允许为目标指定优先级以及必须达成的截止时间。如果无法在各自的截止时间内实现全部目标，AgentSpeak(RT) 智能体就会选择一组能按时达成、且在优先级意义上极大的目标加以追求（Vikhorev 等，2011）。

## 5 计划的处理方法

一条计划规则通常由三部分构成：触发项指明何时该规则与当前情形相关；上下文条件指明何时该规则适用，也就是智能体需要持有哪些信念，这个计划才合适；计划本身则由目标、信念更新操作、行动等步骤组成。最简单的情形是按顺序执行计划中的各个步骤。不过，一些语言也提供了控制步骤执行次序的结构，本节将介绍这些结构。

### 5.1 串并联交错执行

在支持串并联交错执行的语言中，可以把已有计划顺序组合或并行组合，逐步构造更大的计划。一种做法是把子目标当作一个独立意图，使实现该子目标的计划与原计划的剩余步骤交错执行。例如，在 Jason 中，计划 `!!e; a₁; a₂` 指定将子目标 `e` 作为一个新意图。于是，实现 `e` 的计划可以与 `a₁; a₂` 交错执行：它可以在 `a₁; a₂` 之前、之后或执行期间运行，并与之完全独立。特别地，实现 `e` 的计划即使失败，也不算作调用它的计划失败。

有些语言可以更细致地控制步骤顺序，如 CAN 和 AgLOTOS（Chaouche 等，2014）。例如，执行计划 `(a₁; a₂) | (a₃; a₄)` 时，只要 `a₂` 在 `a₁` 之后、`a₄` 在 `a₃` 之后，步骤便可以按任何满足条件的顺序执行，例如 `a₁ · a₃ · a₂ · a₄`。在 AgLOTOS 中，交错执行的步骤还可以同步。例如，在程序 `(a₁; a₂; a₃) | (a₄; a₂; a₅)` 中，若 `a₂` 是「同步步骤」，那么 `a₁` 和 `a₄` 可以按任意顺序执行，但两个分支随后必须通过行动 `a₂` 同步，才能执行余下的行动。

### 5.2 任意交错执行

与串并联交错相比，支持任意交错的语言可以更细致地规定步骤之间的次序。例如，考虑串并联计划 `P = !e₁; (!e₅ | (!e₂; !e₆)); !e₃; !e₄`。它依次组合了子目标 `e₁`、交错计划 `(!e₅ | (!e₂; !e₆))` 和顺序计划 `!e₃; !e₄`，其中 `!e` 表示需要实现子目标 `e`。中间的交错计划规定，实现 `e₅` 的计划与顺序计划 `!e₂; !e₆` 交错执行。请注意，如果还想让 `e₆` 与 `e₃` 交错执行（严格说，是让分别选来处理这两个目标的计划交错执行），那么在这种表示下，无论怎样修改 `P`，都会破坏某项既有的顺序要求，或者给本应保持无序的步骤强加次序。支持任意交错的系统，如 PRS（de Silva 等，2018）和 HTN-acting（de Silva，2018），则能准确保留 `P` 的顺序要求，并允许 `e₆` 与 `e₃` 交错。例如，HTN-acting 为此把 `P` 表示为由带标签子程序组成的偏序集。

### 5.3 非交错（真正的）并发

有些语言支持真正的并发，即不同步骤可以同时执行。例如，计划 `P ∥ P′` 允许 `P` 与 `P′` 中的步骤交错执行，也允许它们同时执行，例如分别运行在不同的处理器上。JACK 允许指定并发计划采用以下四种执行方式之一（de Silva，2020）：（1）一个分支失败，整个计划即判定失败；其他分支收到通知，可以先执行「清理」步骤再终止。（2）一个分支失败，整个计划即判定失败，但其余分支可以执行完毕。（3）一个分支执行完毕，整个计划即判定成功；其他分支收到通知，可以先执行清理步骤再终止。（4）一个分支执行完毕，整个计划即判定成功，但其余分支可以执行完毕。其他语言支持的并发形式较少。例如，Concurrent CAN 的操作语义支持第二种方式（de Silva，2020）；OpenPRS 直接支持第一种方式（Ingrand，2014），也可以用特定编程写法实现第二种。JAM 支持一种更基本的真正并发，称为「锁步并发」：各分支同时执行各自的第一步，然后同时执行各自的第二步，依此类推（Huber，2001）。

### 5.4 控制流

除上述各种并行形式外，有些语言和系统还支持命令式编程语言常见的条件与循环结构，例如 `if-then-else` 语句和 `while` 循环。例子包括 Jadex、OpenPRS、细化行动引擎（Refinement Acting Engine，RAE）（Ghallab 等，2016）、JACK、3APL 和 Jason。不过，这些结构本质上是「语法糖」，没有增强 BDI 语言的表达能力，因为使用多条上下文条件各异的计划规则就能达到同样的效果。例如，在 AgentSpeak 这类语言里，要表达 `if φ then a₁ else a₂`，可以给出两条计划规则 `e : φ ← a₁` 和 `e : ¬φ ← a₂`。实现子目标 `e` 就相当于执行这条 `if` 语句。此外，更丰富的计划语法可能会增加实现某些 BDI 审议循环扩展的难度。下一节将讨论这些扩展。

## 6 审议循环的处理方法

最后，我们讨论审议循环的几种处理方法。重点是失败处理、通过意图调度规避或利用意图之间的相互作用，以及通过元层推理实现复杂的智能体行为；这些主题在已有文献中受到的关注最多。

### 6.1 失败处理

在有些 BDI 系统中，失败恢复需要由开发者用「失败」计划规则或专门的过程编程实现，在这个意义上称为手动恢复。另一些语言则支持各种形式的自动失败恢复，即系统行为本身就包含恢复机制。

**手动失败恢复。** 在一些语言（如 JAM）中，每个计划都有关联的「失败处理过程」，由它负责恢复。如果计划在执行中失败，例如其中一个行动失败，或者某个子目标找不到适用的计划规则，就会调用相应的失败处理过程。这类过程主要用于指定「清理步骤」：其中不能包含子目标，执行也是原子的，即不会与其他意图的执行交错。另一些语言（如 Jason）则把从失败中恢复视为一种有待实现的特殊目标。当实现目标 `!e` 的计划失败时，系统会挂起相关意图，并发出相应的「目标删除」事件 `-!e`。目标删除事件会触发「失败」计划规则。相应计划通常包含清理步骤，随后还可能重新提交先前失败的目标。

3APL 和 Jadex 等采用了更复杂的做法：使用专门的失败计划规则，对发生失败的意图进行元层推理。触发这类规则的是计划或计划片段，而非目标或信念。例如，如果一个规则的头部与一串以失败步骤开头的计划步骤匹配，它就可以替换这个失败步骤以及其后的部分或全部步骤，相当于在运行时重写计划。元层推理能够访问信念库中没有的信息，例如某个意图中尚待执行的步骤，因此可以比上述方法更有依据地作出恢复决策。

**自动失败恢复。** 最简单的自动失败恢复方法是反复重试失败的行动，直到成功（Wobcke，2001）。然而，在大多数语言中，例如 CAN、JACK、RAE 和 HTN-acting，自动失败恢复发生在目标层面。也就是说，如果一个计划没有实现触发它的目标 `!e`，系统会从与 `!e` 相关的计划规则中另选一条适用的规则。如果没有其他规则可选，或者所有适用备选规则的计划都失败了，智能体就回溯到 `!e` 的「父」目标（即触发了那个将 `!e` 作为子目标提交的计划的目标），在这一层尝试其他适用规则。这一回溯过程可能一直持续到顶层目标。关于如何选择适用的备选计划规则，文献主要提出了三种方法：（1）在 JACK 等一些语言中，可以「提前」检查计划规则的上下文条件，即在规则刚加入某个目标的相关规则集时就检查，从而将适用规则实例化并保存起来，以备之后发生失败时使用。（2）在 CAN 和 RAE 等语言中，只有在已经发生失败、需要适用的替代规则时，才检查或重新检查上下文条件；此时可能距相关规则集的建立已经很久。（3）在 HTN-acting 中，检查计划规则的上下文条件是在执行计划第一步之前的最后一刻。

不过，在 HTN-acting 中，每条计划规则的适用性只检查一次。为同一目标选取的另一个计划即使失败，该规则也不会重查。上述第二种失败处理方法包含更「完整」的做法：有的系统重新检查一条计划规则，除非该规则的计划已经有某个实例失败了（例如 CAN）；有的系统则对规则的各个实例分别处理，重新检查那些计划尚未失败的规则实例（例如 JACK、RAE，以及 Sardina 和 Padgham（2011）提出的 CAN 变体）。正如 Ghallab 等（2016）指出的，还可以进一步做得更完整：即使某个规则实例的计划曾经失败，只要导致失败的条件已经消失，就重新检查这个规则实例。

### 6.2 意图调度

意图调度就是以合适的次序交错执行智能体的多个意图。最基本的做法是在每个审议循环里执行某个意图的一步。可以按先进先出或轮转方式选择意图，如 JACK 和 Jason；也可以像 JAM 那样选择效用最高的意图。其中，意图的效用由它所实现的各项目标的效用及所用计划的效用计算得出。然而，这些简单做法可能导致意图冲突（一个意图中的行动破坏了另一个意图中某个行动的前置条件），也可能造成「白费力气」（例如多个意图分别实现了同一个子目标）。为此，研究者提出了多种意图调度方法，着重利用交错意图之间的正向相互作用，或避免意图之间、意图与环境之间的负向相互作用，有些方法兼顾两者。

**利用正向相互作用。** 在当前审议循环中，如果行动的前置条件不成立，或者某个子目标没有适用的计划，意图的下一项行动就无法执行。此时，推进另一个意图，其「附带效果」有可能恰好建立或恢复受阻意图所需的行动前置条件或计划上下文条件。这称为正向相互作用。它和前述失败处理方法有所不同：按那些方法，包含受阻行动的计划会被中止（可能先执行一些清理步骤），随后为相应目标另选一条适用的计划规则。为利用这种正向相互作用，Yao 等（2016）提出了一种基于蒙特卡洛树搜索的调度方法。它对各意图步骤的不同交错顺序进行伪随机模拟，以确定接下来推进哪个意图。

**避免负向相互作用。** 如果执行一个意图中的某个步骤产生了某种效果，破坏了另一个意图中的某项条件，就发生了负向相互作用。为避免这种冲突，Thangarajah 等（2011）根据智能体的目标和计划规则离线计算「摘要」信息。对于实现一项目标的不同办法，摘要分别描述必然和可能的前置条件与后置条件。运行时，系统借助这些信息调度意图：它检查执行一个新采纳的目标是否一定安全无冲突、一定会引发冲突，或可能发生冲突。如果无法在不发生冲突的情况下实现目标，相应意图就会被推迟。Waters 等（2014）计算意图的「覆盖度」，也就是相对于所有可能的环境情形，现有计划规则对实现这一意图所提供的覆盖有多完整。他们的意图调度器优先推进覆盖度低的意图，也就是那些很可能因环境变化而无法继续执行的意图。不过，他们和 Thangarajah 等（2011）的方法都在计划层面调度意图。Yao 等（2016）展示了如何利用单人蒙特卡洛树搜索在行动层面调度意图，以避免负向相互作用。

上述方法使用的信息来自行动的前置条件、后置条件以及计划规则的上下文条件。另一种做法是让开发者为计划规则提供额外信息。例如，Bordini 等（2002）提出了 AgentSpeak 的一个扩展版本 AgentSpeak(XL)。该版本使用调度器为 AgentSpeak 意图生成调度方案，例如决定执行哪些目标、怎样执行，以及按什么顺序执行。这一方法依赖开发者手动给出计划规则之间的关系，例如一个计划对另一个计划是「促进」还是「妨碍」。

### 6.3 元层推理

在许多语言中，如果一项目标有多条适用的计划规则，系统会任意选择一条，或者按规则在智能体程序中的排列顺序选择。要改变这种默认行为，实际上就得重新实现解释器的一部分。除了前述失败处理之外，元层推理还可以用来为一项目标选择最合适的适用计划规则。一种做法是让元层计划规则比普通计划规则有更高优先级，OpenPRS 和 meta-APL（Leask 和 Logan，2018）就是如此。另一种做法是，只要某个目标有多条适用规则，就触发一个特殊目标，交给一条元层计划规则处理，JACK 采取的就是这种做法。借助该机制，系统可以对计算得到的适用计划规则集进行推理（例如读取存放该集合的「元谓词」），然后为当前情形选择一条规则；选择时可以参考该规则过去执行的成功率等标准。元层推理还可以访问和修改智能体内部数据结构中的值（例如使用 Jason 的「元函数」），借此完成中止正在追求的某个声明式目标等操作。最后，OpenPRS 可以利用元层推理，让智能体的所有意图真正并发执行，取代通常的交错执行。

## 7 讨论

本节就信念、目标、计划和审议循环指出若干仍待解决的问题，并讨论 BDI 智能体架构未来可能的发展方向。

许多智能体编程语言采用较简单的信念表示，已足以支持一大类应用。但新的应用领域很可能需要更丰富的表示。例如，辅助型智能体需要持续掌握受助者相信什么、希望达成什么；机器人和自主系统则需要把传感器给出的亚符号信息整合进智能体的信念。这些需求可能推动嵌套信念和不确定信念的表示、信念修正等研究。

许多自主系统需要长期自主运行，这也会推动有关目标的研究。例如，如何推理维持目标及其与成就目标的相互作用，以及如何处理优先级、截止时间等目标属性和约束，都可能变得更加重要。已有工作（如 Harland 等，2014）需要开发者事先预见并管理目标间可能发生的相互作用。对运行周期很长的智能体，这种做法很可能难以实行。此外，大多数 BDI 语言缺少相应机制，使智能体能够审议自己是否应当采纳某个目标，例如一个由它自主生成的目标。这里可以借鉴目标推理研究（Coman 和 Aha，2018），其中已有人尝试提供生成和管理目标的机制。

机器人应用也可能更加重视计划的真正并发执行。这会带来一系列研究问题，例如怎样形式化描述并发执行的分支如何相互影响，以及智能体的审议循环如何与持续一段时间的行动相互作用。另一个方向是用机器学习等人工智能技术补充预先定义的计划规则，或生成新规则。已有工作（如 Singh 和 Hindriks，2013）主要学习计划规则的上下文条件。值得进一步研究的还有：怎样把学习得到的行为整合进 BDI 框架（或可借鉴学习 HTN 方法的相关技术），以及怎样扩展已有的、利用人工智能规划在运行时生成新计划的工作（Meneguzzi 等，2015）。

上述应用也给审议循环的研究带来了新的问题。例如，引入不确定信念后，怎样判断某个声明式目标已经实现或已无法实现？同样需要重新考察的，还有通过模拟多项意图的交错执行来调度意图的方法，如 Yao 和 Logan（2016）所述。我们同样预期，意图调度的其他方面将得到进一步研究，包括截止时间、资源使用和对社会规范的遵守（Meneguzzi 等，2012）。对许多自主系统而言，这些都至关重要。

上述许多研究问题都有望受益于与其他人工智能领域的合作，如机器学习、HTN 规划和自然语言处理。我们相信，这将是 BDI 智能体架构今后的一个重要研究方向。

## 致谢

Felipe Meneguzzi 感谢巴西国家科学技术发展委员会（CNPq）通过项目 407058/2018-4 和 302773/2019-3 提供资助。

## 参考文献

- [Alechina et al., 2006] Natasha Alechina, Rafael Bordini, Jomi Hübner, Mark Jago, and Brian Logan. Automating belief revision for AgentSpeak. In Proceedings of the 4th International Workshop on Declarative Agent Languages and Technologies, volume 4327 of Lecture Notes in Computer Science, pages 61–77, 2006.
- [Bagosi et al., 2015] Timea Bagosi, Joachim de Greeff, Koen V. Hindriks, and Mark A. Neerincx. Designing a knowledge representation interface for cognitive agents. In Engineering Multi-Agent Systems, pages 33–50, 2015.
- [Bauters et al., 2014] Kim Bauters, Weiru Liu, Jun Hong, Carles Sierra, and Lluis Godo. CAN(PLAN)+: extending the operational semantics of the BDI architecture to deal with uncertain information. In Proceedings of the Conference on Uncertainty in Artificial Intelligence, pages 52–61, 2014.
- [Bordini et al., 2002] Rafael H. Bordini, Ana L. C. Bazzan, Rafael de O. Jannone, Daniel M. Basso, Rosa M. Vicari, and Victor R. Lesser. AgentSpeak(XL): efficient intention selection in BDI agents via decision-theoretic task scheduling. In Proceedings of the International Joint Conference on Autonomous Agents and Multiagent Systems, pages 1294–1302, 2002.
- [Bordini et al., 2006] Rafael H. Bordini, Lars Braubach, Mehdi Dastani, Amal El Fallah-Seghrouchni, Jorge J. Gómez-Sanz, João Leite, Gregory M. P. O’Hare, Alexander Pokahr, and Alessandro Ricci. A survey of programming languages and platforms for multi-agent systems. Informatica (Slovenia), 30(1):33–44, 2006.
- [Bordini et al., 2007] Rafael H. Bordini, Michael Wooldridge, and Jomi Fred Hübner. Programming Multi-Agent Systems in AgentSpeak using Jason. John Wiley & Sons, 2007.
- [Bratman, 1987] Michael E. Bratman. Intention, Plans and Practical Reason. Harvard University Press, 1987.
- [Braubach et al., 2005] Lars Braubach, Alexander Pokahr, and Winfried Lamersdorf. Jadex: A BDI-agent system combining middleware and reasoning. In Rainer Unland, Monique Calisti, and Matthias Klusch, editors, Software Agent-Based Applications, Platforms and Development Kits, pages 143–168, 2005.
- [Busetta et al., 1999] Paolo Busetta, Ralph Rönnquist, Andrew Hodgson, and Andrew Lucas. JACK intelligent agents - components for intelligent agents in Java. AgentLink Newsletter, 1999. White paper, http://www.agent-software.com.au.
- [Casali et al., 2011] Ana Casali, Lluis Godo, and Carles Sierra. A graded BDI agent model to represent and reason about preferences. Artificial Intelligence, 175(7-8):1468–1478, 2011.
- [Chaouche et al., 2014] Ahmed Chawki Chaouche, A El Fallah Seghrouchni, Jean-Michel Ilié, and Djamel-Eddine Saïdouni. A dynamical plan revising for ambient systems. Procedia Computer Science, 32:37–44, 2014.
- [Coelho and Nogueira, 2015] Francisco Coelho and Vítor Nogueira. Probabilistic perception revision in AgentSpeak(L). In Proceedings of the International Conference on Principles and Practice of Multi-Agent Systems, volume 9387 of Lecture Notes in Computer Science, pages 613–621, 2015.
- [Coman and Aha, 2018] Alexandra Coman and David W Aha. AI rebel agents. AI Magazine, 39(3):16–26, 2018.
- [Dastani et al., 2004] Mehdi Dastani, M. Birna van Riemsdijk, Frank Dignum, and John-Jules Ch. Meyer. A programming language for cognitive agents: Goal directed 3APL. In Programming Multi-Agent Systems, pages 111–130, 2004.
- [Dastani et al., 2006] Mehdi Dastani, M. Birna van Riemsdijk, and John-Jules Ch. Meyer. Goal types in agent programming. In Proceedings of the European Conference on Artificial Intelligence, pages 220–224, 2006.
- [Dastani et al., 2009] Mehdi M. Dastani, Koen V. Hindriks, Peter Novák, and Nick A. M. Tinnemeier. Combining multiple knowledge representation technologies into agent programming languages. In Declarative Agent Languages and Technologies VI, pages 60–74, 2009.
- [Dastani et al., 2011] Mehdi Dastani, M. Birna van Riemsdijk, and Michael Winikoff. Rich goal types in agent programming. In Proceedings of the International Conference on Autonomous Agents and Multiagent Systems, pages 405–412, 2011.
- [Dastani, 2008] Mehdi Dastani. 2APL: A practical agent programming language. Autonomous Agents and Multi-Agent Systems, 16(3):214–248, 2008.
- [de Silva et al., 2018] Lavindra de Silva, Felipe Meneguzzi, and Brian Logan. An operational semantics for a fragment of PRS. In Proceedings of the International Joint Conference on Artificial Intelligence, pages 195–202, 2018.
- [de Silva, 2018] Lavindra de Silva. HTN acting: A formalism and an algorithm. In Proceedings of the International Conference on Autonomous Agents and Multiagent Systems, pages 363–371, 2018.
- [de Silva, 2020] Lavindra de Silva. An operational semantics for true concurrency in BDI agent systems. In Proceedings of the AAAI Conference on Artificial Intelligence, 2020.
- [Georgeff and Lansky, 1987] Michael P. Georgeff and Amy L. Lansky. Reactive reasoning and planning. In Proceedings of the National Conference on Artificial Intelligence, pages 677–682, 1987.
- [Ghallab et al., 2016] Malik Ghallab, Dana Nau, and Paolo Traverso. Automated Planning and Acting. Cambridge University Press, 2016.
- [Harland et al., 2014] James Harland, David N. Morley, John Thangarajah, and Neil Yorke-Smith. An operational semantics for the goal life-cycle in BDI agents. Autonomous Agents and Multi-Agent Systems, 28(4):682–719, 2014.
- [Hindriks et al., 1999] Koen V. Hindriks, Frank S. De Boer, Wiebe Van der Hoek, and John-Jules Ch. Meyer. Agent programming in 3APL. Autonomous Agents and Multi-Agent Systems, 2(4):357–401, 1999.
- [Hindriks et al., 2001] Koen V. Hindriks, Frank S. de Boer, Wiebe van der Hoek, and John-Jules Ch. Meyer. Agent programming with declarative goals. In Proceedings of the 7th International Workshop on Agent Theories Architectures and Languages, volume 1986 of Lecture Notes in Computer Science, pages 228–243. 2001.
- [Hindriks et al., 2009] Koen V. Hindriks, Wiebe van der Hoek, and M. Birna van Riemsdijk. Agent programming with temporally extended goals. In Proceedings of the International Joint Conference on Autonomous Agents and Multiagent Systems, pages 137–144, 2009.
- [Huber, 2001] M. J. Huber. JAM agents in a nutshell, version 0.61+0.79i. http://www.marcush.net/irs/jam/jam-man-01nov01-draft.htm, November 2001.
- [Hübner et al., 2006] Jomi Fred Hübner, Rafael H. Bordini, and Michael Wooldridge. Programming declarative goals using plan patterns. In Proceedings of the 4th International Workshop on Declarative Agent Languages and Technologies, volume 4327 of Lecture Notes in Computer Science, pages 123–140, 2006.
- [Ingrand, 2014] Félix Ingrand. OPRS Development Environment, version 1.1b7 edition, 2014.
- [Klapiscak and Bordini, 2009] Thomas Klapiscak and Rafael H. Bordini. JASDL: A practical programming approach combining agent and semantic web technologies. In Declarative Agent Languages and Technologies VI, pages 91–110, 2009.
- [Kravari and Bassiliades, 2015] Kalliopi Kravari and Nick Bassiliades. A survey of agent platforms. Journal of Artificial Societies and Social Simulation, 8(1):11, 2015.
- [Kwisthout and Dastani, 2005] Johan Kwisthout and Mehdi Dastani. Modelling uncertainty in agent programming. In Declarative Agent Languages and Technologies III, pages 17–32, 2005.
- [Leask and Logan, 2018] Sam Leask and Brian Logan. Programming agent deliberation using procedural reflection. Fundamenta Informaticae, 158(1–3):93–120, 2018.
- [Meneguzzi and De Silva, 2015] Felipe Meneguzzi and Lavindra De Silva. Planning in BDI agents: a survey of the integration of planning algorithms and agent reasoning. The Knowledge Engineering Review, 30:1–44, 2015.
- [Meneguzzi et al., 2012] Felipe Meneguzzi, Sanjay Modgil, Nir Oren, Simon Miles, Michael Luck, and Noura Faci. Applying electronic contracting to the aerospace aftercare domain. Engineering Applications of Artificial Intelligence, 25(7):1471–1487, 2012.
- [Meneguzzi et al., 2015] Felipe Meneguzzi, Odinaldo Rodrigues, Nir Oren, Wamberto W. Vasconcelos, and Michael Luck. BDI reasoning with normative considerations. Engineering Applications of Artificial Intelligence, 43(0):127–146, 2015.
- [Moreira et al., 2006] Álvaro F. Moreira, Renata Vieira, Rafael H. Bordini, and Jomi F. Hübner. Agent-oriented programming with underlying ontological reasoning. In Proceedings of the 3rd Internatinal Workshop on Declarative Agent Languages and Technologies, pages 155–170, 2006.
- [Panisson et al., 2018] Alison R. Panisson, Simon Parsons, Peter McBurney, and Rafael H. Bordini. Choosing appropriate arguments from trustworthy sources. In Computational Models of Argument, pages 345–352, 2018.
- [Rao, 1996] Anand S. Rao. AgentSpeak(L): BDI agents speak out in a logical computable language. In Proceedings of the European workshop on Modelling Autonomous Agents in a Multi-Agent World: Agents Breaking Away, pages 42–55, 1996.
- [Sardina and Padgham, 2011] Sebastian Sardina and Lin Padgham. A BDI agent programming language with failure recovery, declarative goals, and planning. Autonomous Agents and Multi-agent Systems, 23(1):18–70, 2011.
- [Silva and Gluz, 2011] Diego Goncalves Silva and Joao Carlos Gluz. AgentSpeak(PL): A new programming language for BDI agents with integrated Bayesian network model. In Proceedings of the International Conference on Information Science and Applications, pages 1–7, 2011.
- [Singh and Hindriks, 2013] Dhirendra Singh and Koen V. Hindriks. Learning to improve agent behaviours in GOAL. In Programming Multi-Agent Systems, volume 7837 of Lecture Notes in Computer Science, pages 158–173. 2013.
- [Thangarajah and Padgham, 2011] John Thangarajah and Lin Padgham. Computationally effective reasoning about goal interactions. Journal of Automated Reasoning, 47(1):17–56, 2011.
- [Vikhorev et al., 2011] Konstantin Vikhorev, Natasha Alechina, and Brian Logan. Agent programming with priorities and deadlines. In Proceedings of the International Conference on Autonomous Agents and Multiagent Systems, pages 397–404, 2011.
- [Waters et al., 2014] Max Waters, Lin Padgham, and Sebastian Sardiña. Evaluating coverage based intention selection. In Proceedings of the International Conference on Autonomous Agents and Multi-Agent Systems, pages 957–964, 2014.
- [Winikoff et al., 2002] Michael Winikoff, Lin Padgham, James Harland, and John Thangarajah. Declarative & Procedural Goals in Intelligent Agent Systems. In Proceedings of the International Conference on Principles of Knowledge Representation and Reasoning, pages 470–481, 2002.
- [Wobcke, 2001] Wayne Wobcke. An operational semantics for a PRS-like agent architecture. In Proceedings of the Australian Joint Conference on Artificial Intelligence, pages 569–580, 2001.
- [Yao and Logan, 2016] Yuan Yao and Brian Logan. Action-level intention selection for BDI agents. In Proceedings of the International Conference on Autonomous Agents and Multiagent Systems, pages 1227–1236, 2016.
- [Yao et al., 2016] Yuan Yao, Brian Logan, and John Thangarajah. Robust execution of BDI agent programs by exploiting synergies between intentions. In Proceedings of the AAAI Conference on Artificial Intelligence, pages 2558–2565, 2016.
