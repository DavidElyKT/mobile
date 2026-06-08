import React from 'react';
import { DatabaseProvider as WatermelonDBProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { getDatabase } from '@/db';

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <WatermelonDBProvider database={getDatabase()}>
      {children}
    </WatermelonDBProvider>
  );
}
