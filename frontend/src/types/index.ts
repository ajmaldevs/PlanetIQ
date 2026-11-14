export type PageId =
  | 'landing'
  | 'dashboard'
  | 'ocean'
  | 'atmosphere'
  | 'land'
  | 'assistant'
  | 'about';

export interface EnvironmentalMetric {
  id: string;
  label: string;
  value: string;
  unit: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  description: string;
  source: string;
}

export interface DatasetMeta {
  id: string;
  name: string;
  mission: string;
  agency: string;
  resolution: string;
  cadence: string;
  units: string;
  status: 'active' | 'pending_approval' | 'sample';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  content: string;
  sources?: string[];
  suggestedFollowUps?: string[];
}
