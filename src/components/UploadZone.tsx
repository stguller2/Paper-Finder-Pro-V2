import React, { useState } from 'react';
import { FileUp, HelpCircle, Zap, ShieldCheck, CheckCircle2, BookOpen, Sparkles, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './Button';

interface UploadZoneProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTextExtract: (text: string) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  useAI: boolean;
  setUseAI: (use: boolean) => void;
  aiStatus: { status: string; progress: number; queueLength: number; isHealthy: boolean };
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileUpload,
  onTextExtract,
  showHelp,
  setShowHelp,
  useAI,
  setUseAI,
  aiStatus
}) => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'text'>('pdf');
  const [inputText, setInputText] = useState('');

  const getValidationState = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return null;

    const doiRegex = /\b10\.\d{4,15}\/[-._;()/:A-Za-z0-9]+\b/gi;
    const matches = trimmed.match(doiRegex) || [];
    const count = matches.length;

    const isShort = trimmed.length < 120;
    const hasDoiClue = trimmed.toLowerCase().includes('10.') || trimmed.toLowerCase().includes('doi');

    if (isShort && hasDoiClue) {
      const isCleanDoiMatch = count === 1 && matches[0].toLowerCase().trim() === trimmed.toLowerCase().replace(/^(https?:\/\/)?(www\.)?(dx\.)?doi\.org\//i, '').trim();
      if (isCleanDoiMatch) {
         return {
           type: 'success',
           message: `✓ Geçerli standart DOI Formatı algılandı / Valid DOI format: ${matches[0]}`
         };
      } else if (count === 0) {
         return {
           type: 'error',
           message: `⚠ Geçersiz DOI Formatı / Invalid DOI: DOI standardı '10.' ile başlamalı ve bir taksim içermelidir (Örn: 10.1016/j.cell.2023.10.011)`
         };
      }
    }

    if (count > 0) {
      return {
        type: 'success',
        message: `✓ Metin içerisinde ${count} adet doğrudan DOI algılandı / Found ${count} direct DOI(s) in reference text`
      };
    } else {
      return {
        type: 'warning',
        message: `⚠ Doğrudan DOI bulunamadı. Çevrimdışı tarama için metinde DOI bulunmalıdır. Lütfen kaynakça listesine veya metne DOI ekleyin.`
      };
    }
  };

  const validation = getValidationState();

  return (
    <div className="space-y-8 select-none pointer-events-auto">
      {/* Tab Selectors */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-max mx-auto shadow-inner">
        <button 
          onClick={() => setActiveTab('pdf')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'pdf' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <FileUp size={16} />
          PDF Referans Ayıklama
        </button>
        <button 
          onClick={() => setActiveTab('text')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <BookOpen size={16} />
          Atıf / Metin Analizi
        </button>
      </div>

      <div className="border-4 border-dashed border-slate-200 rounded-[2.5rem] p-12 bg-white flex flex-col items-center transition-all hover:border-indigo-400 hover:bg-indigo-50/10 group relative overflow-hidden min-h-[400px] justify-center">
        <div className="absolute top-6 right-6">
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors flex items-center gap-2 text-sm font-semibold cursor-pointer"
            title="View extraction tips"
          >
            <HelpCircle size={20} />
            <span className="hidden sm:inline">How it works</span>
          </button>
        </div>

        {activeTab === 'pdf' ? (
          <div className="flex flex-col items-center text-center animate-in fade-in duration-300 w-full max-w-md">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileUp size={40} />
            </div>
            <h3 className="text-2xl font-bold mb-2 text-slate-800">Analyze Manuscript (PDF)</h3>
            <p className="text-slate-500 text-center mb-8 text-base leading-relaxed">
              Drop your academic PDF here. We will extract all references with DOI numbers and provide direct download links.
            </p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".pdf"
              onChange={onFileUpload}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Button variant="primary" as="span" className="px-10 py-4 text-lg rounded-2xl shadow-lg shadow-indigo-100 flex items-center gap-2">
                <FileUp size={20} /> Upload & Analyze PDF
              </Button>
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center animate-in fade-in duration-300 w-full max-w-xl space-y-5">
            <div className="w-16 h-16 bg-slate-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-2">
              <BookOpen size={30} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">Citations / Text Analysis (Metin Analizi)</h3>
            <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
              Paste standard references or raw text bibliographies below. The system will automatically extract all DOI numbers.
            </p>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Örn: John, S. et al. (2020). Atomic Orbitals. Journal of Physics, 12, 110. DOI: 10.1011/xyz&#10;Ya da makalenizin kaynakçasını doğrudan kopyalayıp buraya yapıştırın..."
              className="w-full h-36 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-slate-800 placeholder-slate-400 font-sans text-sm resize-none bg-slate-50"
            />
            {validation && (
              <div className={`w-full p-3.5 rounded-2xl border text-xs text-left animate-in fade-in duration-200 leading-relaxed ${
                validation.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
                validation.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-100 font-medium' :
                validation.type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-100 font-medium' :
                'bg-indigo-50 text-indigo-800 border-indigo-100'
              }`}>
                {validation.message}
              </div>
            )}
            <Button 
              variant="primary" 
              onClick={() => onTextExtract(inputText)}
              disabled={!inputText.trim() || validation?.type === 'error' || validation?.type === 'warning'}
              className="px-10 py-4 text-base rounded-2xl shadow-lg shadow-indigo-100 flex items-center gap-2 cursor-pointer"
            >
              <Sparkles size={18} /> Parse & Generate Links
            </Button>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 w-full flex flex-col items-center text-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-3.5 py-1.5 rounded-full">
              <ShieldCheck size={14} />
              Privacy-First Offline Extraction & Crossref/OpenAlex Official Integration
            </p>
            <p className="text-[11px] text-slate-400">
              Uzak yapay zekâ modeli kullanılmaz. Tüm işlemler yerel ve resmi akademik kayıtlar üzerinden gerçekleşir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
