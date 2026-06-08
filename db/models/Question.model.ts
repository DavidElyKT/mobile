import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';
import QuestionSet from './QuestionSet';

export default class Question extends Model {
  static table = 'questions';
  static associations = {
    question_sets: { type: 'belongs_to' as const, key: 'question_set_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('question_set_id') declare questionSetId: string;
  @field('question_reference') declare questionReference: string;
  @field('question_number') declare questionNumber: string;
  @field('question_text') declare questionText: string;
  @field('regulation_number') declare regulationNumber: number;
  @field('q_index') declare qIndex: number;
  @field('pinned_note') declare pinnedNote: string | null;

  @relation('question_sets', 'question_set_id') declare questionSet: QuestionSet;
}
