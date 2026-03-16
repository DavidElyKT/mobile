import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import Question from './Question';

export default class QuestionSet extends Model {
  static table = 'question_sets';
  static associations = {
    questions: { type: 'has_many' as const, foreignKey: 'question_set_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('set_name') setName!: string;
  @field('description') description!: string;
  @field('is_base') isBase!: boolean;
  @readonly @date('created_at') createdAt!: Date;

  @children('questions') questions!: Query<Question>;
}
