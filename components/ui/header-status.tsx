"use client";

import { createContext, useContext, useState } from "react";

type SetStatus = (status: React.ReactNode) => void;

const HeaderStatusContext = createContext<SetStatus | null>(null);

/**
 * Renders `children` (the page header row) followed by a full-width status
 * row. Header actions publish into it with `useHeaderStatus()` so a long
 * message never sits beside the title and squeezes it.
 */
export function HeaderStatus({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<React.ReactNode>(null);

  return (
    <HeaderStatusContext.Provider value={setStatus}>
      {children}
      {status && <div className="mt-3">{status}</div>}
    </HeaderStatusContext.Provider>
  );
}

/** Setter for the enclosing header's status row, or null outside a header. */
export function useHeaderStatus(): SetStatus | null {
  return useContext(HeaderStatusContext);
}
