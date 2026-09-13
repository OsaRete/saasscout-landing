export type WorkspaceRefresh = {
  activate: () => void;
  deactivate: () => void;
  passive: () => Promise<void>;
  authoritative: () => Promise<void>;
};

export function createWorkspaceRefresh<T>({
  request,
  accept,
  reject,
}: {
  request: () => Promise<T>;
  accept: (value: T) => void;
  reject: (error: unknown, hasAccepted: boolean) => void;
}): WorkspaceRefresh {
  let passiveInFlight: Promise<void> | null = null;
  let latestRequest = 0;
  let active = false;
  let hasAccepted = false;

  const start = (passive: boolean) => {
    const requestNumber = ++latestRequest;
    const pending = request()
      .then((value) => {
        if (active && requestNumber === latestRequest) {
          hasAccepted = true;
          accept(value);
        }
      })
      .catch((error: unknown) => {
        if (active && requestNumber === latestRequest)
          reject(error, hasAccepted);
      })
      .finally(() => {
        if (passiveInFlight === pending) passiveInFlight = null;
      });

    if (passive) passiveInFlight = pending;
    return pending;
  };

  return {
    activate: () => {
      active = true;
    },
    deactivate: () => {
      active = false;
    },
    passive: () => passiveInFlight ?? start(true),
    authoritative: () => start(false),
  };
}
