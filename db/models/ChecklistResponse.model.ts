import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import ChecklistInstance from './ChecklistInstance';
import Question from './Question';

export default class ChecklistResponse extends Model {
  static table = 'checklist_responses';
  static associations = {
    checklist_instances: { type: 'belongs_to' as const, key: 'checklist_id' },
    questions: { type: 'belongs_to' as const, key: 'question_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('checklist_id') declare checklistId: string;
  @field('question_id') declare questionId: string;
  @field('answer') declare answer: 'Yes' | 'No' | 'N/A';
  @field('notes') declare notes: string;
  @field('photo_url') declare photoUrl: string;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('checklist_instances', 'checklist_id') declare checklist: ChecklistInstance;
  @relation('questions', 'question_id') declare question: Question;
}
