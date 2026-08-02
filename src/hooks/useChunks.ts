import { useEffect, useState } from "react";
import { bookcourseApi } from "../api/bookcourseApi";
import type { ApiChunk } from "../types/api";

export function useChunks(bookId: string | null) {
  const [chunks, setChunks] = useState<ApiChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) return;
    let active = true;
    setLoading(true);
    bookcourseApi
      .getChunks(bookId)
      .then((result) => {
        if (!active) return;
        setChunks(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "chunk 加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  return { chunks, loading, error };
}
