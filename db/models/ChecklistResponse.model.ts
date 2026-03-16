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

  @field('server_id') serverId!: number | null;
  @field('checklist_id') checklistId!: string;
  @field('question_id') questionId!: string;
  @field('answer') answer!: 'Yes' | 'No' | 'N/A';
  @field('notes') notes!: string;
  @field('photo_url') photoUrl!: string;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('checklist_instances', 'checklist_id') checklist!: ChecklistInstance;
  @relation('questions', 'question_id') question!: Question;
}
