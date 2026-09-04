import React, { createContext, useCallback, useContext, useState } from 'react';

/**
 * Control review mode — the return visit that reviews whether the controls a
 * PUWER report recommended were actually fitted.
 *
 * Modelled on AdminReviewContext, with one addition: a round. Admin review is
 * scoped to a project, but a control review is scoped to a *frozen worklist*
 * inside that project, and the round id is what the read-only guards and the
 * new-hazard path (D6, not built in this phase) would key off.
 *
 * `isActive` is the route-level read-only guard. Within a control review the
 * parent evaluation's hazard, rating and control text are not editable — the
 * visit covers the report that was issued, it does not rewrite it — and the
 * edit screens are reached by route, so they check this rather than take a prop.
 */
interface ControlReviewContextValue {
  isActive: boolean;
  activeSiteId: string | null;
  /** Local WatermelonDB UUID of the round being worked, once one is opened. */
  activeRoundId: string | null;
  enterControlReview: (siteId: string, roundId?: string | null) => void;
  setActiveRoundId: (roundId: string | null) => void;
  exitControlReview: () => void;
}

const ControlReviewContext = createContext<ControlReviewContextValue | null>(null);

export function ControlReviewProvider({ children }: { children: React.ReactNode }) {
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  const enterControlReview = useCallback((siteId: string, roundId: string | null = null) => {
    setActiveSiteId(siteId);
    setActiveRoundId(roundId);
  }, []);

  const exitControlReview = useCallback(() => {
    setActiveSiteId(null);
    setActiveRoundId(null);
  }, []);

  return (
    <ControlReviewContext.Provider
      value={{
        isActive: activeSiteId !== null,
        activeSiteId,
        activeRoundId,
        enterControlReview,
        setActiveRoundId,
        exitControlReview,
      }}
    >
      {children}
    </ControlReviewContext.Provider>
  );
}

export function useControlReview(): ControlReviewContextValue {
  const ctx = useContext(ControlReviewContext);
  if (!ctx) throw new Error('useControlReview must be used inside <ControlReviewProvider>');
  return ctx;
}
