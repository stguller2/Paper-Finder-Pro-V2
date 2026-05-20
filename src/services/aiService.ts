import axios from 'axios';
import { ExtractionResult, ReferenceItem } from '../types';

const API_BASE = '/api/ai';

export const getAIStatus = async (): Promise<{ status: string; progress: number; queueLength: number; isHealthy: boolean }> => {
  try {
    const res = await axios.get(`${API_BASE}/status`, { timeout: 3000 });
    return res.data;
  } catch (err) {
    console.error('Failed to get AI readiness state:', err);
    return { status: 'offline', progress: 0, queueLength: 0, isHealthy: false };
  }
};

export const refineReferences = async (references: ReferenceItem[]): Promise<ExtractionResult> => {
  if (references.length === 0) {
    return { references: [], skippedCount: 0 };
  }
  
  try {
    const res = await axios.post(`${API_BASE}/refine`, { references }, { timeout: 45000 });
    return res.data;
  } catch (err: any) {
    console.error('Metadata API refinement request failed:', err);
    throw new Error(err.response?.data?.error || 'Metadata API refinement failed');
  }
};

export const extractReferencesFromText = async (text: string): Promise<ExtractionResult> => {
  if (!text) {
    return { references: [], skippedCount: 0 };
  }
  
  try {
    const res = await axios.post(`${API_BASE}/extract`, { text }, { timeout: 45000 });
    return res.data;
  } catch (err: any) {
    console.error('Gemini API extraction request failed:', err);
    throw new Error(err.response?.data?.error || 'Gemini Extraction failed');
  }
};
