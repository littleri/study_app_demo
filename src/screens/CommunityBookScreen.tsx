import {
  ChevronRight,
  Download
} from "lucide-react";
import { communityBooks } from "../data/mockBook";
import {
  Button,
  Card,
  Metric,
  Pill,
  ProgressBar,
  Section
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useLocalMotionItem } from "../motion";
import { CommunityCover } from "./CommunityCover";

export function CommunityBookScreen() {
  const { go } = useAppContext();
  const book = communityBooks[0];
  const detailMotion = useLocalMotionItem(`community-book:${book.id}:detail`);

  return (
    <div className="screen-stack community-detail-screen">
      <div className="community-detail-workspace">
      <Card {...detailMotion.attributes} className="community-detail-card">
        <CommunityCover source={book.cover} title={book.title} variant="detail" />
        <div>
          <Pill tone="mint">{book.learners} 人学习</Pill>
          <h2>{book.title}</h2>
          <p>{book.description}</p>
        </div>
      </Card>

      <Section title="课程章节">
        <div className="chapter-list">
          {book.chapters.map((chapter, index) => (
            <article className="chapter-row" key={chapter}>
              <div>
                <h3>{chapter}</h3>
                <p>{index === 0 ? "可直接学习" : "导入后生成练习与闪卡"}</p>
                <ProgressBar value={index === 0 ? book.progress : 12 + index * 18} />
              </div>
              <ChevronRight size={19} aria-hidden="true" />
            </article>
          ))}
        </div>
      </Section>

      <div className="capability-grid">
        <Metric label="闪卡" value={`${book.flashcardCount} 张`} helper="导入后可复习" />
        {book.tags.filter((tag) => tag !== "闪卡").map((tag) => (
          <Metric key={tag} label={tag} value="已包含" />
        ))}
      </div>
      </div>

      <div className="community-detail-actions">
      <Button icon={<Download size={18} aria-hidden="true" />} onClick={() => go("communityImport")}>
        导入到我的课程
      </Button>
      <Button variant="secondary" onClick={() => go("community")}>
        返回社区
      </Button>
      </div>
    </div>
  );
}
