import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import QuestionSet from './QuestionSet.model';

export default class ChecklistFramework extends Model {
  static table = 'checklist_frameworks';
  static associations = {
    question_sets: { type: 'has_many' as const, foreignKey: 'framework_id' },
  };

  @field('server_id')      declare serverId:      number | null;
  @field('framework_name') declare frameworkName:  string;
  @field('description')    declare description:    string | null;
  @field('applies_to')     declare appliesTo:      'assembly' | 'site';
  @readonly @date('created_at') declare createdAt: Date;

  @children('question_sets') declare questionSets: Query<QuestionSet>;
}
