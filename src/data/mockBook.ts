import type { Chapter } from "../types/app";

export const textbookAssets = {
  cover: "/assets/textbook/biology-cover.webp",
  coverThumb: "/assets/textbook/biology-cover-thumb.webp",
  catalogOne: "/assets/textbook/biology-catalog-1.webp",
  catalogTwo: "/assets/textbook/biology-catalog-2.webp",
  chapterTwo: "/assets/textbook/biology-chapter-2-open.webp",
  chapterThree: "/assets/textbook/biology-chapter-3-open.webp",
  sectionOpen: "/assets/textbook/biology-chapter-section-open.webp",
  meiosisOne: "/assets/textbook/biology-lesson-meiosis-1.webp",
  meiosisTwo: "/assets/textbook/biology-lesson-meiosis-2.webp",
  illustration: "/assets/textbook/biology-illustration-cell-division.webp"
};

export const demoBook = {
  id: "book_biology_2",
  title: "生物 必修 2 遗传与进化",
  shortTitle: "遗传与进化",
  fileName: "人教版高中生物必修2遗传与进化.pdf",
  publisher: "人民教育出版社",
  pages: 125,
  fileSize: "38.8 MB",
  chapterCount: 7,
  sectionCount: 20,
  knowledgePointCount: 96,
  progress: 18,
  mastery: 68,
  planDays: 14,
  dailyMinutes: 30,
  cover: textbookAssets.coverThumb
};

export const communityBooks = [
  {
    id: "community_genetics",
    title: "遗传与进化高频考点课",
    owner: "高二 3 班 林同学",
    cover: textbookAssets.coverThumb,
    learners: 128,
    progress: 50,
    flashcardCount: 24,
    tags: ["章节导学", "闪卡", "测试"],
    description: "按教材第 1-3 章整理，重点覆盖孟德尔遗传、减数分裂和 DNA 结构。",
    chapters: ["第一章 遗传因子的发现", "第二章 减数分裂和受精作用", "第三章 基因的本质"]
  },
  {
    id: "community_ecology",
    title: "生态系统与稳态复习课",
    owner: "生物学习小组",
    cover: textbookAssets.chapterThree,
    learners: 86,
    progress: 34,
    flashcardCount: 18,
    tags: ["思维导图", "错题", "笔记"],
    description: "把生态系统结构、能量流动和稳态调节整理成短课，适合考前快速复习。",
    chapters: ["生态系统结构", "能量流动", "信息传递"]
  },
  {
    id: "community_diagram",
    title: "遗传图解专项训练",
    owner: "BookCourse 共创",
    cover: textbookAssets.illustration,
    learners: 203,
    progress: 72,
    flashcardCount: 16,
    tags: ["专项练习", "诊断"],
    description: "围绕遗传图解和概率推断设计练习，导入后可直接生成诊断作业。",
    chapters: ["分离定律", "自由组合", "伴性遗传"]
  },
  {
    id: "community_meiosis",
    title: "减数分裂动画讲解课",
    owner: "AI 课程广场",
    cover: textbookAssets.meiosisTwo,
    learners: 164,
    progress: 58,
    flashcardCount: 20,
    tags: ["图示讲解", "闪卡"],
    description: "用图示拆解同源染色体、四分体、姐妹染色单体的关系。",
    chapters: ["同源染色体", "减数第一次分裂", "受精作用"]
  }
];

export const chapters: Chapter[] = [
  {
    id: "c1",
    sourceTitle: "第 1 章 遗传因子的发现",
    aiTitle: "课程 1：理解孟德尔遗传规律",
    pages: "第 1-25 页",
    confidence: 96,
    status: "匹配良好",
    progress: 42,
    duration: "3 天",
    concepts: ["豌豆杂交", "性状分离", "分离定律"]
  },
  {
    id: "c1s1",
    sourceTitle: "第 1 节 孟德尔的豌豆杂交实验（一）",
    aiTitle: "课程 1.1：从实验设计理解分离定律",
    pages: "第 11-18 页",
    confidence: 94,
    status: "匹配良好",
    progress: 65,
    duration: "30 分钟",
    concepts: ["相对性状", "显性性状", "隐性性状"]
  },
  {
    id: "c1s2",
    sourceTitle: "第 2 节 孟德尔的豌豆杂交实验（二）",
    aiTitle: "课程 1.2：用概率解释自由组合",
    pages: "第 19-25 页",
    confidence: 88,
    status: "需检查",
    progress: 20,
    duration: "35 分钟",
    concepts: ["自由组合定律", "测交", "遗传图解"]
  },
  {
    id: "c2",
    sourceTitle: "第 2 章 基因和染色体的关系",
    aiTitle: "课程 2：把基因放到染色体上理解",
    pages: "第 26-53 页",
    confidence: 95,
    status: "匹配良好",
    progress: 12,
    duration: "4 天",
    concepts: ["减数分裂", "受精作用", "伴性遗传"]
  },
  {
    id: "c2s1",
    sourceTitle: "第 1 节 减数分裂和受精作用",
    aiTitle: "课程 2.1：同源染色体如何分离",
    pages: "第 28-36 页",
    confidence: 93,
    status: "匹配良好",
    progress: 45,
    duration: "28 分钟",
    concepts: ["同源染色体", "四分体", "受精作用"]
  },
  {
    id: "c3",
    sourceTitle: "第 3 章 基因的本质",
    aiTitle: "课程 3：理解 DNA 与遗传信息",
    pages: "第 54-76 页",
    confidence: 91,
    status: "匹配良好",
    progress: 0,
    duration: "3 天",
    concepts: ["DNA", "遗传物质", "半保留复制"]
  }
];

export const activeLesson = {
  id: "lesson_meiosis",
  title: "减数分裂和受精作用",
  chapter: "第 2 章 第 1 节",
  pages: "第 28-36 页",
  estimatedMinutes: 28,
  progress: 45,
  objective: "理解减数分裂中染色体数目减半的过程，说明同源染色体分离与受精作用如何维持物种染色体数目稳定。",
  sourceQuote:
    "减数分裂是进行有性生殖的生物，在产生配子时发生的染色体数目减半的细胞分裂。",
  aiGuide:
    "可以把减数分裂理解成一次复制、两次分裂。关键不是背阶段名，而是抓住同源染色体先配对后分离，姐妹染色单体随后分开的顺序。",
  concepts: ["同源染色体", "四分体", "减数第一次分裂", "受精作用"],
  sourceImage: textbookAssets.meiosisOne,
  diagramImage: textbookAssets.meiosisTwo
};

export const assignment = {
  title: "判断同源染色体分离发生在哪个时期",
  source: "《遗传与进化》第 2 章 1 节 · 第 30 页",
  question: "同源染色体分离发生在减数分裂的哪个阶段？请说明它与染色体数目减半的关系。",
  initialAnswer: "减数第二次分裂后期",
  correctIdea: "同源染色体分离发生在减数第一次分裂后期，这一步让每个子细胞只获得每对同源染色体中的一条。"
};

export const diagnosis = {
  result:
    "你的答案把同源染色体和姐妹染色单体混在了一起。减数第二次分裂后期分离的是姐妹染色单体，而同源染色体分离发生在减数第一次分裂后期。",
  stuckPoint: "没有区分同源染色体分离与姐妹染色单体分离。",
  knowledgePoints: ["同源染色体", "减数第一次分裂", "姐妹染色单体"],
  reviewPage: "第 30 页 减数分裂过程示意",
  hint: "先问自己：分离的是一对同源染色体，还是复制后连在一起的两条姐妹染色单体。"
};

export const studyPlan = [
  ["第 1 天", "孟德尔实验导读", "导读 + 小测", "25 分钟"],
  ["第 2 天", "分离定律", "课程 + 练习", "30 分钟"],
  ["第 3 天", "自由组合定律", "作业诊断", "35 分钟"],
  ["第 4 天", "错题复习：遗传图解", "薄弱点复习", "20 分钟"],
  ["第 5 天", "减数分裂和受精作用", "课程 + 图示讲解", "30 分钟"],
  ["第 6 天", "同源染色体薄弱点", "闪卡复习 + 再练", "18 分钟"],
  ["第 7 天", "伴性遗传", "课程 + 练习", "30 分钟"]
];

export const generatedModules = [
  ["章节课程", "20 节", "已按原书目录生成"],
  ["学习计划", "14 天", "可随诊断动态调整"],
  ["概念闪卡", "96 张", "覆盖核心知识点"],
  ["练习题", "48 题", "可提交诊断"],
  ["错题追踪", "3 个卡点", "自动回流计划"],
  ["导学笔记", "6 组", "可导出 PDF"]
];

export const courseAssets = [
  {
    title: demoBook.title,
    cover: demoBook.cover,
    progress: demoBook.progress,
    mastery: demoBook.mastery,
    plan: "14 天计划",
    next: "第 2 章 1 节 · 减数分裂和受精作用",
    mistakes: 3,
    flashcardsDue: 12
  },
  {
    title: "高中生物专题复习",
    cover: textbookAssets.chapterThree,
    progress: 42,
    mastery: 74,
    plan: "7 天冲刺",
    next: "生态系统结构",
    mistakes: 5,
    flashcardsDue: 8
  }
];

export const flashcards = [
  {
    id: "fc_homologous",
    front: "什么是同源染色体？",
    back: "形态、大小一般相同，一条来自父方、一条来自母方，并控制同一类性状的一对染色体。",
    source: "第 2 章 1 节 · 第 29 页",
    concept: "同源染色体",
    mastery: 58,
    due: "今天复习",
    reason: "来自作业诊断卡点"
  },
  {
    id: "fc_tetrad",
    front: "四分体为什么叫“四”？",
    back: "一对同源染色体联会后，每条染色体含两条姐妹染色单体，因此共有四条染色单体。",
    source: "第 2 章 1 节 · 第 30 页",
    concept: "四分体",
    mastery: 64,
    due: "今天复习",
    reason: "章节学习生成"
  },
  {
    id: "fc_meiosis_i",
    front: "同源染色体分离发生在哪一次分裂？",
    back: "发生在减数第一次分裂后期，这是染色体数目减半的关键步骤。",
    source: "第 2 章 1 节 · 第 30 页",
    concept: "减数第一次分裂",
    mastery: 52,
    due: "今天复习",
    reason: "错题自动加入"
  },
  {
    id: "fc_fertilization",
    front: "受精作用如何维持染色体数目稳定？",
    back: "精子和卵细胞结合后，两个配子的染色体组合在一起，使受精卵恢复体细胞染色体数目。",
    source: "第 2 章 1 节 · 第 35 页",
    concept: "受精作用",
    mastery: 70,
    due: "今天复习",
    reason: "章节学习生成"
  },
  {
    id: "fc_sister_chromatid",
    front: "姐妹染色单体在什么时候分离？",
    back: "姐妹染色单体在减数第二次分裂后期分离，这一点容易和同源染色体分离混淆。",
    source: "第 2 章 1 节 · 第 31 页",
    concept: "姐妹染色单体",
    mastery: 55,
    due: "今天复习",
    reason: "来自作业诊断卡点"
  },
  {
    id: "fc_one_copy_two_divisions",
    front: "“一次复制、两次分裂”是什么意思？",
    back: "DNA 只复制一次，但细胞连续分裂两次，因此配子中染色体数目减半。",
    source: "第 2 章 1 节 · 第 28-36 页",
    concept: "减数分裂过程",
    mastery: 62,
    due: "今天复习",
    reason: "章节学习生成"
  },
  {
    id: "fc_pairing",
    front: "联会发生在什么对象之间？",
    back: "联会发生在同源染色体之间，它们配对后形成四分体。",
    source: "第 2 章 1 节 · 第 29 页",
    concept: "联会",
    mastery: 66,
    due: "今天复习",
    reason: "章节学习生成"
  },
  {
    id: "fc_crossing_over",
    front: "交叉互换为什么会增加变异？",
    back: "同源染色体的非姐妹染色单体之间交换片段，使配子获得新的基因组合。",
    source: "第 2 章 1 节 · 第 30 页",
    concept: "交叉互换",
    mastery: 48,
    due: "今天复习",
    reason: "薄弱点复习"
  },
  {
    id: "fc_gamete",
    front: "配子的染色体数为什么是体细胞的一半？",
    back: "减数第一次分裂让每对同源染色体只进入一个子细胞，最终形成染色体数减半的配子。",
    source: "第 2 章 1 节 · 第 32 页",
    concept: "配子形成",
    mastery: 60,
    due: "今天复习",
    reason: "作业诊断推荐"
  },
  {
    id: "fc_diploid_restore",
    front: "染色体数目如何在亲代和子代之间保持稳定？",
    back: "减数分裂使配子染色体减半，受精作用让两套染色体合并恢复体细胞水平。",
    source: "第 2 章 1 节 · 第 35 页",
    concept: "染色体数稳定",
    mastery: 68,
    due: "今天复习",
    reason: "章节学习生成"
  },
  {
    id: "fc_meiosis_vs_mitosis",
    front: "减数分裂和有丝分裂最关键的区别是什么？",
    back: "减数分裂会发生同源染色体分离并使染色体数减半；有丝分裂一般保持染色体数不变。",
    source: "第 2 章 1 节 · 第 28-36 页",
    concept: "对比辨析",
    mastery: 57,
    due: "今天复习",
    reason: "AI 问答沉淀"
  },
  {
    id: "fc_review_prompt",
    front: "看到“分离”题目时，先问自己什么？",
    back: "先判断分离对象是同源染色体，还是复制后连在一起的姐妹染色单体。",
    source: "第 2 章 1 节 · 第 30 页",
    concept: "解题策略",
    mastery: 50,
    due: "今天复习",
    reason: "错题自动加入"
  }
];

export const planAdjustments = [
  {
    title: "明天新增 10 分钟闪卡复习",
    detail: "因为“同源染色体 vs 姐妹染色单体”连续两次答错，系统已加入第 6 天复习任务。",
    target: "同源染色体、减数第一次分裂"
  },
  {
    title: "第 7 天练习前置",
    detail: "若今天闪卡掌握度低于 70%，伴性遗传任务会后移半天。",
    target: "计划动态调整"
  }
];

export const aiReplies = {
  default:
    "同源染色体可以理解成一对来源不同、形态相似、控制同一类性状的染色体。在减数第一次分裂后期，它们被拉向细胞两极，因此配子里只保留每对同源染色体中的一条。",
  example:
    "如果体细胞里有一对 1 号同源染色体，一条来自父方，一条来自母方。减数第一次分裂后，两个子细胞会各拿到其中一条，这就是染色体数目减半的关键。",
  quiz:
    "练习：在减数第二次分裂后期，分离的对象是什么？A. 同源染色体 B. 姐妹染色单体 C. 四分体 D. 等位基因"
};
