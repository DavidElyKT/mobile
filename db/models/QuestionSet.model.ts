import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Question from './Question';
import ChecklistFramework from './ChecklistFramework.model';

export default class QuestionSet extends Model {
  static table = 'question_sets';
  static associations = {
    questions: { type: 'has_many' as const, foreignKey: 'question_set_id' },
    checklist_frameworks: { type: 'belongs_to' as const, key: 'framework_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('set_name') declare setName: string;
  @field('description') declare description: string | null;
  @field('is_base') declare isBase: boolean;
  @field('applies_to') declare appliesTo: 'assembly' | 'site' | null;
  @field('framework_id') declare frameworkId: string;
  @readonly @date('created_at') declare createdAt: Date;

  @children('questions') declare questions: Query<Question>;
  @relation('checklist_frameworks', 'framework_id') declare framework: ChecklistFramework;
}
