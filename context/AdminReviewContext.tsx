import React, { createContext, useContext, useState } from 'react';

interface AdminReviewContextValue {
  isReviewMode: boolean;
  activeSiteId: string | null;
  enterReviewMode: (siteId: string) => void;
  exitReviewMode: () => void;
}

const AdminReviewContext = createContext<AdminReviewContextValue | null>(null);

export function AdminReviewProvider({ children }: { children: React.ReactNode }) {
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  function enterReviewMode(siteId: string) {
    setActiveSiteId(siteId);
  }

  function exitReviewMode() {
    setActiveSiteId(null);
  }

  return (
    <AdminReviewContext.Provider
      value={{
        isReviewMode: activeSiteId !== null,
        activeSiteId,
        enterReviewMode,
        exitReviewMode,
      }}
    >
      {children}
    </AdminReviewContext.Provider>
  );
}

export function useAdminReview(): AdminReviewContextValue {
  const ctx = useContext(AdminReviewContext);
  if (!ctx) throw new Error('useAdminReview must be used inside <AdminReviewProvider>');
  return ctx;
}
