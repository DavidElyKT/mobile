import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import Question from './Question';

export default class QuestionSet extends Model {
  static table = 'question_sets';
  static associations = {
    questions: { type: 'has_many' as const, foreignKey: 'question_set_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('set_name') declare setName: string;
  @field('description') declare description: string | null;
  @field('is_base') declare isBase: boolean;
  @field('applies_to') declare appliesTo: 'asset' | 'site' | null; // added migration 003
  @readonly @date('created_at') declare createdAt: Date;

  @children('questions') declare questions: Query<Question>;
}
