import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, LogOut, UserRound } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { dailyTimes, primaryGoals } from "../features/courses/model";

function LogoutDialog({
  originRef,
  onCancel,
  onConfirm,
  error
}: {
  originRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => boolean;
  error: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const skipFocusRestoreRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      if (skipFocusRestoreRef.current) return;
      const origin = originRef.current;
      if (origin?.isConnected) window.requestAnimationFrame(() => {
        if (origin.isConnected) origin.focus({ preventScroll: true });
      });
    };
  }, [originRef]);

  useEffect(() => {
    const onNativeBack = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("bookcourse:native-back", onNativeBack);
    return () => window.removeEventListener("bookcourse:native-back", onNativeBack);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="settings-logout-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <span className="settings-logout-icon" aria-hidden="true"><LogOut size={26} /></span>
      <h2 id={titleId}>确认退出账号？</h2>
      <p id={descriptionId}>退出后需要重新填写称呼、学习目标和每日学习时间。已有课程、资料和学习记录会保留在本机。</p>
      {error ? <p className="settings-logout-error" role="alert">{error}</p> : null}
      <div className="settings-logout-actions">
        <button ref={cancelRef} type="button" onClick={onCancel}>取消</button>
        <button className="settings-logout-confirm" type="button" onClick={() => { skipFocusRestoreRef.current = onConfirm(); }}>确认退出</button>
      </div>
    </dialog>
  );
}

export function SettingsScreen() {
  const { courses, logout } = useAppContext();
  const preferences = courses.state.preferences;
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const cancelLogout = useCallback(() => {
    setConfirmingLogout(false);
    setError(null);
  }, []);

  function confirmLogout() {
    try {
      logout();
      setConfirmingLogout(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退出失败，请重试");
      return false;
    }
  }

  return (
    <div className="screen-stack settings-screen">
      <section className="settings-card settings-account-card" aria-labelledby="settings-account-title">
        <span className="settings-account-icon" aria-hidden="true"><UserRound size={26} /></span>
        <div>
          <h2 id="settings-account-title">{preferences?.displayName ?? "我的账号"}</h2>
          <p>当前账号</p>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-preferences-title">
        <h2 id="settings-preferences-title">学习偏好</h2>
        <dl className="settings-preferences">
          <div><dt>主要学习目标</dt><dd>{primaryGoals.find((item) => item.value === preferences?.primaryGoal)?.label ?? "系统学习（默认）"}</dd></div>
          <div><dt>每日学习时间</dt><dd>{dailyTimes.find((item) => item.value === preferences?.dailyTime)?.label ?? "45 分钟（默认）"}</dd></div>
        </dl>
      </section>

      <div className="settings-logout-section">
        <button ref={logoutRef} className="settings-logout-button" type="button" onClick={() => { setError(null); setConfirmingLogout(true); }}>
          <LogOut size={20} aria-hidden="true" /><span>退出账号</span><ArrowRight size={18} aria-hidden="true" />
        </button>
        <p>退出后，再次打开软件也需要重新完成引导。</p>
      </div>
      <section className="settings-card settings-data-card" aria-labelledby="settings-data-title">
        <h2 id="settings-data-title">本机学习数据</h2>
        <p>已保留 {courses.state.courses.length} 门课程。退出账号后，课程、资料和学习记录仍会保留，完成引导即可继续学习。</p>
      </section>
      {confirmingLogout ? <LogoutDialog originRef={logoutRef} onCancel={cancelLogout} onConfirm={confirmLogout} error={error} /> : null}
    </div>
  );
}
