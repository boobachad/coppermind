export interface NapchartData {
  elements: NapchartElement[];
  shape: 'circle' | 'wide' | 'line';
  lanes: number;
  colorTags?: Array<{ color: string; tag: string }>;
}

export interface NapchartElement {
  start: number; // 0-1440 minutes
  end: number;   // 0-1440 minutes
  text?: string;
  color?: string;
  lane?: number;
  id?: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  expectedScheduleImage: string;
  actualScheduleImage: string;
  reflectionText: string;
  expectedScheduleData: NapchartData | null;
  actualScheduleData: NapchartData | null;
  dayX: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateJournalEntryInput {
  date: string;
  reflectionText?: string;
  expectedScheduleImage?: string;
  actualScheduleImage?: string;
  expectedScheduleData?: NapchartData;
  actualScheduleData?: NapchartData;
}

export interface UpdateJournalEntryInput {
  reflectionText?: string;
  expectedScheduleImage?: string;
  actualScheduleImage?: string;
  expectedScheduleData?: NapchartData;
  actualScheduleData?: NapchartData;
}
