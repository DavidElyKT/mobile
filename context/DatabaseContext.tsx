import React from 'react';
import { database } from '@/db';

export { database };

// WatermelonDB's DatabaseProvider requires a real native database instance.
// In Expo Go (no dev build) database is null, so we skip the provider.
// When running a custom dev build, import and use DatabaseProvider from
// '@nozbe/watermelondb/DatabaseProvider' here.
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
