// WatermelonDB requires JSI native modules and a custom dev build.
// This stub keeps imports happy while running in Expo Go.
// Uncomment and replace with the real implementation once you run:
//   npx expo prebuild && npx expo run:android  (or run:ios)
//
// import { Database } from '@nozbe/watermelondb';
// import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
// import schema from './schema';
// import { Site, Assembly, Machine, QuestionSet, Question,
//   ChecklistInstance, ChecklistResponse, RiskEvaluation } from './models';
//
// const adapter = new SQLiteAdapter({ schema, dbName: 'puwer', jsi: true });
// export const database = new Database({
//   adapter,
//   modelClasses: [Site, Assembly, Machine, QuestionSet, Question,
//     ChecklistInstance, ChecklistResponse, RiskEvaluation],
// });

export const database = null as any;

export * from './models';
