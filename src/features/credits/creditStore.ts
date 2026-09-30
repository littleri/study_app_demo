import { useSyncExternalStore } from "react";

export const creditStorageKey = "bookcourse.credits.v1";
export const initialCreditBalance = 100;
export const creditCosts = { chat: 1, video: 10 } as const;

export type CreditAction = keyof typeof creditCosts;
export type CreditTransaction = {
  id: string;
  action: CreditAction;
  amount: number;
  createdAt: number;
  status: "reserved" | "spent";
};
export type CreditState = {
  version: 1;
  balance: number;
  transactions: CreditTransaction[];
};

type CreditStorage = Pick<Storage, "getItem" | "setItem">;

const freshState: CreditState = { version: 1, balance: initialCreditBalance, transactions: [] };

function parseState(raw: string | null): CreditState {
  if (!raw) return freshState;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return freshState;
    const candidate = value as Partial<CreditState>;
    if (candidate.version !== 1 || !Number.isSafeInteger(candidate.balance)
      || (candidate.balance ?? -1) < 0 || !Array.isArray(candidate.transactions)) return freshState;
    const transactions = candidate.transactions.filter((item): item is CreditTransaction => (
      item && typeof item.id === "string" && (item.action === "chat" || item.action === "video")
      && Number.isSafeInteger(item.amount) && item.amount > 0
      && Number.isFinite(item.createdAt) && (item.status === "reserved" || item.status === "spent")
    ));
    return { version: 1, balance: candidate.balance!, transactions };
  } catch {
    return freshState;
  }
}

export function createCreditStore(storage: CreditStorage) {
  const listeners = new Set<() => void>();
  let state: CreditState;
  try {
    state = parseState(storage.getItem(creditStorageKey));
  } catch {
    state = freshState;
  }

  // A refresh ends in-flight AI work. Restore reservations left by that page
  // before a new request can consume credits.
  const abandoned = state.transactions.filter((item) => item.status === "reserved");
  if (abandoned.length > 0) {
    const recovered: CreditState = {
      ...state,
      balance: state.balance + abandoned.reduce((sum, item) => sum + item.amount, 0),
      transactions: state.transactions.filter((item) => item.status === "spent")
    };
    try {
      storage.setItem(creditStorageKey, JSON.stringify(recovered));
      state = recovered;
    } catch {
      // Keep the saved balance until storage becomes writable again.
    }
  }

  function publish(next: CreditState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function persist(next: CreditState) {
    try {
      storage.setItem(creditStorageKey, JSON.stringify(next));
    } catch {
      throw new Error("积分保存失败，本次操作没有开始。请检查设备存储空间后重试。");
    }
    publish(next);
  }

  function reload() {
    let next: CreditState;
    try {
      next = parseState(storage.getItem(creditStorageKey));
    } catch {
      return;
    }
    if (JSON.stringify(next) !== JSON.stringify(state)) publish(next);
  }

  function reserve(action: CreditAction) {
    reload();
    const amount = creditCosts[action];
    if (state.balance < amount) {
      throw new Error(`积分不足：本次需要 ${amount} 积分，当前剩余 ${state.balance} 积分。`);
    }
    const id = crypto.randomUUID();
    persist({
      ...state,
      balance: state.balance - amount,
      transactions: [...state.transactions, { id, action, amount, createdAt: Date.now(), status: "reserved" as const }].slice(-100)
    });
    return id;
  }

  function complete(id: string) {
    const transaction = state.transactions.find((item) => item.id === id && item.status === "reserved");
    if (!transaction) return;
    persist({
      ...state,
      transactions: state.transactions.map((item) => item.id === id ? { ...item, status: "spent" } : item)
    });
  }

  function refund(id: string) {
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    persist({
      ...state,
      balance: state.balance + transaction.amount,
      transactions: state.transactions.filter((item) => item.id !== id)
    });
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reload,
    reserve,
    complete,
    refund
  };
}

let browserStore: ReturnType<typeof createCreditStore> | null = null;

function getBrowserStore() {
  if (browserStore) return browserStore;
  if (typeof window === "undefined") throw new Error("积分系统需要浏览器存储");
  browserStore = createCreditStore(window.localStorage);
  window.addEventListener("storage", (event) => {
    if (event.key === creditStorageKey) browserStore?.reload();
  });
  return browserStore;
}

export function useCredits() {
  const store = getBrowserStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, reserve: store.reserve, complete: store.complete, refund: store.refund };
}
