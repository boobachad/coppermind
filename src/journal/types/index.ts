export interface JournalEntry {
  id: string;
  date: string;
  expectedScheduleImage: string;
  actualScheduleImage: string;
  reflectionText: string;
  dayX: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateJournalEntryInput {
  date: string;
  reflectionText?: string;
  expectedScheduleImage?: string;
  actualScheduleImage?: string;
}

export interface UpdateJournalEntryInput {
  reflectionText?: string;
  expectedScheduleImage?: string;
  actualScheduleImage?: string;
}
