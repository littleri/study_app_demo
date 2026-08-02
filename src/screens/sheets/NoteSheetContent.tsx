import {
  Save
} from "lucide-react";
import type {
  AppActions
} from "../../types/app";
import {
  Button,
  Pill
} from "../../components/ui";

export function NoteSheetContent({
  concept,
  setSavedNoteCount,
  closeSheet,
  showToast
}: {
  concept: string;
  setSavedNoteCount: (fn: (count: number) => number) => void;
  closeSheet: () => void;
  showToast: AppActions["showToast"];
}) {
  return (
    <div className="sheet-body">
      <Pill tone="purple">{concept}</Pill>
      <h3>生成导学笔记</h3>
      <p>围绕“{concept}”，已整理出一条可复习笔记：先判断对象是同源染色体还是姐妹染色单体，再对应减数第一次或第二次分裂。</p>
      <textarea className="note-textarea" defaultValue={`# ${concept}\n关键：理解它在减数分裂中的位置和作用。`} />
      <Button
        icon={<Save size={18} aria-hidden="true" />}
        onClick={() => {
          setSavedNoteCount((count) => count + 1);
          closeSheet();
          showToast("已保存到导学笔记");
        }}
      >
        保存到笔记
      </Button>
    </div>
  );
}
