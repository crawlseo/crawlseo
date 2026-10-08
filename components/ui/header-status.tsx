"use client";

import { createContext, useCallback, useContext, useId, useState } from "react";

type SetStatus = (status: React.ReactNode) => void;
type UpdateStatus = (id: string, status: React.ReactNode) => void;

const HeaderStatusContext = createContext<UpdateStatus | null>(null);

/**
 * Renders `children` (the page header row) followed by a full-width status
 * row. Header actions publish into it with `useHeaderStatus()` so a long
 * message never sits beside the title and squeezes it. Each action owns its
 * message so clearing one does not remove another action's feedback.
 */
export function HeaderStatus({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, React.ReactNode>>({});
  const updateStatus = useCallback<UpdateStatus>((id, status) => {
    setStatuses((current) => {
      if (status == null) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: status };
    });
  }, []);

  return (
    <HeaderStatusContext.Provider value={updateStatus}>
      {children}
      {Object.keys(statuses).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(statuses).map(([id, status]) => (
            <div key={id}>{status}</div>
          ))}
        </div>
      )}
    </HeaderStatusContext.Provider>
  );
}

/** Setter for this action's status row, or null outside a header. */
export function useHeaderStatus(): SetStatus | null {
  const updateStatus = useContext(HeaderStatusContext);
  const id = useId();
  const setStatus = useCallback<SetStatus>(
    (status) => updateStatus?.(id, status),
    [id, updateStatus]
  );
  return updateStatus ? setStatus : null;
}
