export interface ReferenceItem {
  title: string;
  doi: string;
  isVerified?: boolean;
  source?: 'regex' | 'ai' | 'official';
  // APA 6 metadata
  authors?: string[];
  year?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  apa6?: string; // Pre-formatted APA 6 citation
}

export interface ExtractionResult {
  paperTitle?: string;
  references: ReferenceItem[];
  skippedCount: number;
  rawText?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type CopiedState = number | string | null;
