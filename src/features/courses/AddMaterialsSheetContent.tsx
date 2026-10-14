import { useAppContext } from "../../context/AppContext";
import { CourseMaterialsUpload } from "../../screens/UploadScreen";

export function AddMaterialsSheetContent({ courseId }: { courseId: string }) {
  const { courses } = useAppContext();
  const course = courses.state.courses.find((item) => item.id === courseId);
  if (!course) return <p role="alert">课程已不存在，请重新选择课程。</p>;
  return <div className="course-materials-sheet"><CourseMaterialsUpload courseId={courseId} /></div>;
}
