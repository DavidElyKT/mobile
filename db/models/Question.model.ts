import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';
import QuestionSet from './QuestionSet';

export default class Question extends Model {
  static table = 'questions';
  static associations = {
    question_sets: { type: 'belongs_to' as const, key: 'question_set_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('question_set_id') questionSetId!: string;
  @field('question_reference') questionReference!: string;
  @field('question_number') questionNumber!: string;
  @field('question_text') questionText!: string;
  @field('regulation_number') regulationNumber!: number;
  @field('q_index') qIndex!: number;

  @relation('question_sets', 'question_set_id') questionSet!: QuestionSet;
}
