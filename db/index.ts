import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';
import {
  Site, Assembly, Machine, ChecklistFramework, QuestionSet, Question,
  ChecklistInstance, ChecklistResponse, RiskEvaluation, FloorPlan, FloorPlanMarker,
} from './models';

let _database: Database | null = null;

export function getDatabase(): Database {
  if (_database) return _database;

  const adapter = new SQLiteAdapter({
    schema,
    dbName: 'puwer',
    jsi: false, // disabled — JSI on iOS/Hermes returns frozen _raw objects causing "Cannot assign to read-only property" crash
    migrations,
    onSetUpError: (error) => {
      console.error('[WatermelonDB] Setup error:', error);
    },
  });

  _database = new Database({
    adapter,
    modelClasses: [
      Site, Assembly, Machine, ChecklistFramework, QuestionSet, Question,
      ChecklistInstance, ChecklistResponse, RiskEvaluation, FloorPlan, FloorPlanMarker,
    ],
  });

  return _database;
}

export * from './models';
