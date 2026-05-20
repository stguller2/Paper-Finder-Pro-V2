import React, { useState, useCallback } from 'react';
import { AppState, ExtractionResult, CopiedState, ReferenceItem } from '../types';
import { extractDoisFromPdf } from '../services/pdfService';
import { refineReferences } from '../services/aiService';

export const useExtraction = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [copiedId, setCopiedId] = useState<CopiedState>(null);

  const useAI = false;
  const setUseAI = () => {};
  const aiStatus = {
    status: 'ready',
    progress: 100,
    queueLength: 0,
    isHealthy: true
  };

  const onCopy = useCallback((text: string, id: CopiedState) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }).catch(err => {
      console.error('Copy to clipboard failed:', err);
    });
  }, []);

  const onReset = useCallback(() => {
    setAppState(AppState.IDLE);
    setResult(null);
    setProgress(0);
    setProgressMessage('');
  }, []);

  const getSciHubLink = useCallback((doi: string) => {
    return `/api/scihub/download/${doi.trim()}`;
  }, []);

  const onOpenAll = useCallback(() => {
    if (!result || result.references.length === 0) return;
    
    const list = result.references.slice(0, 15);
    list.forEach(ref => {
      window.open(getSciHubLink(ref.doi), '_blank');
    });
  }, [result, getSciHubLink]);

  const onDownloadFile = useCallback((content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, []);

  const onCopyAll = useCallback(() => {
    if (!result || result.references.length === 0) return;
    const dois = result.references.map(r => r.doi).join('\n');
    onCopy(dois, 'copy-all');
  }, [result, onCopy]);

  const onFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAppState(AppState.EXTRACTING);
    setProgress(2);
    setProgressMessage('Reading input file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1];
        
        // 1. Core PDF.js pattern scan
        const rawResult = await extractDoisFromPdf(base64, (p, msg) => {
          setProgress(p);
          setProgressMessage(msg);
        });

        // 2. Metadata refinement from official registries (non-AI standard search)
        if (rawResult.references && rawResult.references.length > 0) {
          setProgress(85);
          setProgressMessage('Refining metadata details from official Registries (Crossref & OpenAlex)...');
          try {
            const refined = await refineReferences(rawResult.references);
            setResult({
              ...rawResult,
              references: refined.references,
              skippedCount: refined.skippedCount || 0
            });
          } catch (refineErr) {
            console.error('Metadata refinement failed:', refineErr);
            setResult(rawResult);
          }
        } else {
          setResult(rawResult);
        }

        setAppState(AppState.SUCCESS);
      } catch (err: any) {
        console.error('Extraction lifecycle failed:', err);
        setAppState(AppState.ERROR);
        setProgressMessage(err.message || 'An error occurred during reference analysis.');
      }
    };

    reader.onerror = () => {
      setAppState(AppState.ERROR);
      setProgressMessage('Failed to read biological input file.');
    };

    reader.readAsDataURL(file);
  }, []);

  const onTextExtract = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/gi;
    const foundDois = Array.from(new Set(trimmed.match(doiRegex) || []));

    const isShort = trimmed.length < 120;
    const hasDoiClue = trimmed.toLowerCase().includes('10.') || trimmed.toLowerCase().includes('doi');

    if (isShort && hasDoiClue && foundDois.length === 0) {
      setAppState(AppState.ERROR);
      setProgressMessage('Format Hatası: Girilen metin geçerli bir DOI standardına uymuyor (Örn: 10.1016/j.cell.2023.10.011) / Invalid DOI format standard.');
      return;
    }

    if (foundDois.length === 0) {
      setAppState(AppState.ERROR);
      setProgressMessage('Hata: Çevrimdışı tarama aktifken metinde doğrudan DOI bulunmalıdır. Lütfen metine DOI ekleyin.');
      return;
    }

    setAppState(AppState.EXTRACTING);
    setProgress(5);
    setProgressMessage('Analyzing citation text / Atıf metni analiz ediliyor...');

    try {
      setProgress(40);
      setProgressMessage(`Found ${foundDois.length} DOIs in text. Fetching metadata...`);
      const rawResult: ExtractionResult = {
        references: foundDois.map(doi => ({
          title: `Extracted Reference (${doi})`,
          doi: doi,
          source: 'regex'
        })),
        skippedCount: 0,
        rawText: text
      };

      if (rawResult.references.length > 0) {
        setProgress(80);
        setProgressMessage('Refining metadata details from official Registries...');
        const refined = await refineReferences(rawResult.references);
        setResult({
          ...rawResult,
          references: refined.references,
          skippedCount: refined.skippedCount || 0
        });
      } else {
        setResult(rawResult);
      }

      setAppState(AppState.SUCCESS);
    } catch (err: any) {
      console.error('Text extraction failed:', err);
      setAppState(AppState.ERROR);
      setProgressMessage(err.message || 'An error occurred during reference analysis.');
    }
  }, []);

  return {
    appState,
    result,
    progress,
    progressMessage,
    useAI,
    setUseAI,
    showHelp,
    setShowHelp,
    copiedId,
    aiStatus,
    onFileUpload,
    onTextExtract,
    onCopy,
    onCopyAll,
    onReset,
    getSciHubLink,
    onOpenAll,
    onDownloadFile
  };
};
