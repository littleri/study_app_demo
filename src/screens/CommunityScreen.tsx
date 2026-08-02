import {
  BadgeCheck,
  MessageCircle
} from "lucide-react";
import { communityBooks } from "../data/mockBook";
import {
  Card,
  Section
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useLocalMotionItem } from "../motion";
import { CommunityCover } from "./CommunityCover";

export function CommunityScreen() {
  const { go } = useAppContext();
  const heroMotion = useLocalMotionItem("community:hero");
  return (
    <div className="screen-stack community-screen">
      <Card {...heroMotion.attributes} className="community-hero">
        <div>
          <p className="eyebrow">社区共享</p>
          <h2>看看同学们正在学什么</h2>
          <p>从别人整理好的 AI 课程包里挑选适合自己的版本，导入后进入你的课程空间。</p>
        </div>
        <BadgeCheck size={32} aria-hidden="true" />
      </Card>

      <Section title="共享课程包">
        <div className="community-grid">
          {communityBooks.map((book) => (
            <button className="community-book-card" type="button" key={book.id} onClick={() => go("communityBook")}>
              <CommunityCover source={book.cover} title={book.title} variant="tile" />
              <div>
                <strong>{book.title}</strong>
                <small>{book.owner}</small>
              </div>
              <span>{book.learners} 人学习</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="社区动态">
        <Card className="guide-card">
          <MessageCircle size={20} aria-hidden="true" />
          <div>
            <h3>今日热门讨论</h3>
            <p>减数分裂中同源染色体和姐妹染色单体怎么区分？已有 18 条学习笔记。</p>
          </div>
        </Card>
      </Section>
    </div>
  );
}
