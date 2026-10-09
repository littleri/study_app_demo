import { useCallback, useRef, useState } from "react";
import { BookOpen, Plus, Settings, Trash2 } from "lucide-react";
import { Button, Card, ProgressBar } from "../components/ui";
import { CourseRemovalMotion } from "../components/CourseRemovalMotion";
import { useAppContext } from "../context/AppContext";
import { CollapsibleRegion, CourseCardMotion, useReducedMotion } from "../motion";
import { useListReflowMotion } from "../motion/useListReflowMotion";
import type { Course } from "../features/courses/model";
import { courseProgress, courseSources, preferredCourseSource } from "../features/courses/selectors";
import { useCoursePlans } from "../features/courses/useCoursePlans";
import { courseCoverImageUrl } from "./shared";

export function LibraryScreen() {
  const { courses, sourceSummaries, selectCourse, go, showToast, clearLoadedCourse, clearCourseSession } = useAppContext();
  const { plans } = useCoursePlans();
  const reducedMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const [opening, setOpening] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [exiting, setExiting] = useState<Course[]>([]);
  const order = useRef<string[]>([]);
  const displayed = courses.state.courses.map((course) => ({ course, exiting: false }));
  for (const course of exiting) displayed.push({ course, exiting: true });
  if (exiting.length) displayed.sort((a, b) => {
    const position = (id: string) => { const index = order.current.indexOf(id); return index < 0 ? order.current.length : index; };
    return position(a.course.id) - position(b.course.id);
  });
  const prepareReflow = useListReflowMotion(listRef, JSON.stringify(displayed.map(({ course }) => course.id)), reducedMotion);
  const finishRemoval = useCallback((id: string) => {
    prepareReflow();
    setExiting((current) => current.filter((course) => course.id !== id));
  }, [prepareReflow]);

  function create() { courses.startDraft(); go("upload"); }
  async function open(id: string) {
    setOpening(id);
    try { if (await selectCourse(id)) go("study"); }
    finally { setOpening(null); }
  }
  function cancelDelete(id: string) {
    deleteButtons.current.get(id)?.focus({ preventScroll: true });
    setConfirmDelete(null);
  }
  function remove(id: string) {
    const index = displayed.findIndex((item) => item.course.id === id);
    const course = displayed[index]?.course;
    if (!course || exiting.some((course) => course.id === id)) return;
    try {
      const wasActive = id === courses.state.activeCourseId;
      order.current = displayed.map((item) => item.course.id);
      // Commit first; the retained visual copy is inert during its short exit.
      courses.removeCourse(id);
      if (wasActive) { clearLoadedCourse(); clearCourseSession(); }
      const next = displayed.slice(index + 1).find((item) => !item.exiting) ?? displayed.slice(0, index).reverse().find((item) => !item.exiting);
      (next ? deleteButtons.current.get(next.course.id) : headingRef.current?.querySelector("button"))?.focus({ preventScroll: true });
      if (!reducedMotion) setExiting((current) => [...current, course]);
      else prepareReflow();
      setConfirmDelete(null);
      showToast("课程已移除，原资料和笔记仍保留");
    } catch (error) { showToast(error instanceof Error ? error.message : "移除失败", "warning"); }
  }

  return <div className="screen-stack library-screen">
    <div ref={headingRef} className="course-library-heading"><span>{courses.state.courses.length} 门课程</span><Button icon={<Plus size={18} />} onClick={create}>创建课程</Button></div>
    <div ref={listRef} className="course-library-list">
      {displayed.length === 0 ? <Card className="course-library-empty"><BookOpen size={30} /><h2>还没有课程</h2><p>创建课程，再添加教材或其他学习文件。</p><Button onClick={create}>创建第一门课程</Button></Card> : null}
      {displayed.map(({ course, exiting: isExiting }, index) => {
        const sources = courseSources(course, courses.state.resources, sourceSummaries);
        const primary = preferredCourseSource(course, courses.state.resources, sourceSummaries);
        const directoryOnly = primary?.source?.content_mode === "directory";
        const readyCount = sources.filter((source) => source.status === "ready" && source.source?.content_mode !== "directory").length;
        const progress = courseProgress(sources.flatMap((source) => source.bookId && plans.has(source.bookId) ? [plans.get(source.bookId)!] : []));
        const expanded = confirmDelete === course.id || isExiting;
        const toggleId = `course-delete-toggle-${course.id}`;
        const regionId = `course-delete-confirm-${course.id}`;
        return <div key={course.id} className="course-library-row" data-layout-key={course.id}>
          <CourseRemovalMotion id={course.id} exiting={isExiting} reducedMotion={reducedMotion} onExit={finishRemoval}>
            <CourseCardMotion bookId={course.id} index={index}>{(motion) => <Card {...motion} className="course-library-card">
              <button className="course-library-open" type="button" disabled={Boolean(opening)} onClick={() => void open(course.id)}>
                <img src={primary?.source?.cover_url ?? courseCoverImageUrl(primary?.bookId ?? "")} alt="" /><span><strong>{course.name}</strong><small>{directoryOnly ? "演示课程 · 目录预览" : `${sources.length} 份资料 · ${readyCount} 份可学习`}</small><small>{opening === course.id ? "正在打开…" : primary?.name ?? "添加资料后开始学习"}</small></span>
              </button>
              {!directoryOnly ? <ProgressBar value={progress} label={`课程完成 ${progress}%`} /> : null}
              <div className="course-library-actions">
                <button type="button" onClick={() => { void selectCourse(course.id).then((selected) => { if (selected) go("courseDetail"); }); }}><Settings size={16} />课程资料与偏好</button>
                <button ref={(element) => { if (element) deleteButtons.current.set(course.id, element); else deleteButtons.current.delete(course.id); }} id={toggleId} type="button" aria-label={`删除课程 ${course.name}`} aria-expanded={expanded} aria-controls={regionId} onClick={() => expanded ? cancelDelete(course.id) : setConfirmDelete(course.id)}><Trash2 size={16} /></button>
              </div>
              <CollapsibleRegion id={regionId} labelledBy={toggleId} expanded={expanded} className="course-library-confirm-region">
                <div className="course-library-delete-confirm"><p>移除这门课程？资料文件和已有笔记会保留。</p><button type="button" onClick={() => remove(course.id)}>确认移除课程</button><button type="button" onClick={() => cancelDelete(course.id)}>取消</button></div>
              </CollapsibleRegion>
            </Card>}</CourseCardMotion>
          </CourseRemovalMotion>
        </div>;
      })}
    </div>
  </div>;
}
