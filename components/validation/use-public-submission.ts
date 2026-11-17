"use client";
import { useEffect, useRef, useState } from "react";
import { PublicSubmission } from "@/lib/validation/public-submission";
export function usePublicSubmission() {
  const request = useRef(new PublicSubmission());
  const [state, setState] = useState({
    busy: false,
    held: false,
    done: false,
    stopped: false,
    waiting: false,
    retryAt: 0,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!state.waiting) return;
    const timer = setTimeout(
      () => setState((previous) => ({ ...previous, waiting: false })),
      Math.max(0, state.retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.waiting, state.retryAt]);
  async function submit(url: string, payload: () => object) {
    const current = request.current;
    const update = () =>
      setState({
        busy: current.busy,
        held: current.body !== null,
        done: current.done,
        stopped: current.stopped,
        waiting: current.retryAt > Date.now(),
        retryAt: current.retryAt,
      });
    const result = current.send(url, payload);
    update();
    setError(await result);
    update();
  }
  return { submit, ...state, error };
}
