import React, { useState } from 'react';
import { Download, Copy, ExternalLink, ClipboardCheck, BookOpen, Globe, AlertTriangle, Loader2, Database, Search, Users, Brain, Activity, HelpCircle } from 'lucide-react';
import { Button } from './Button';
import { ReferenceItem, CopiedState } from '../types';
import DOMPurify from 'dompurify';

interface ReferenceCardProps {
  item: ReferenceItem;
  index: number;
  onCopy: (text: string, id: CopiedState) => void;
  copiedId: CopiedState;
  getSciHubLink: (doi: string) => string;
}

export const ReferenceCard: React.FC<ReferenceCardProps> = ({
  item,
  index,
  onCopy,
  copiedId,
  getSciHubLink
}) => {
  const apaId = `apa-${index}`;
  const [downloadError, setDownloadError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const askForConfirmation = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleDownload = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setDownloadError(false);
    setIsDownloading(true);
    
    // Step 1: Attempt primary download via proxy
    try {
      const response = await fetch(getSciHubLink(item.doi));
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${item.doi.replace(/\//g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setIsDownloading(false);
        return;
      }
    } catch (error) {
      console.warn("Primary proxy download failed, attempting alternative CDNs...", error);
    }

    // Step 2: Fallback to alternative CDNs / Sci-Hub mirrors directly
    const alternativeCDNs = [
      `https://sci.bban.top/pdf/${item.doi}.pdf`,
      `https://zero.sci-hub.se/${item.doi}.pdf`,
      `https://sci-hub.st/${item.doi}`,
      `https://sci-hub.se/${item.doi}`,
      `https://sci-hub.ru/${item.doi}`
    ];

    let alternativeSuccess = false;

    for (const cdnUrl of alternativeCDNs) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(cdnUrl, { 
          signal: controller.signal,
          // We can use default credentials or omit them
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `${item.doi.replace(/\//g, '_')}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          alternativeSuccess = true;
          break;
        }
      } catch (err) {
        console.warn(`Alternative CDN/Mirror ${cdnUrl} failed:`, err);
      }
    }

    if (alternativeSuccess) {
      setIsDownloading(false);
      return;
    }

    // Step 3: All strategies fail, set error state, inform user and allow manual DOI/Publisher access
    setDownloadError(true);
    setIsDownloading(false);
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all flex flex-col gap-5 group relative overflow-hidden">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
              {index + 1}
            </div>
            {item.isVerified ? (
              <span className="flex items-center gap-1 font-mono bg-emerald-50 px-2 py-0.5 rounded text-[10px] text-emerald-600 font-bold uppercase tracking-wider border border-emerald-100">
                <ClipboardCheck size={10} />
                Verified
              </span>
            ) : (
              <span className="font-mono bg-slate-50 px-2 py-0.5 rounded text-[10px] text-slate-400 font-bold uppercase tracking-wider border border-slate-100">
                {item.source === 'ai' ? 'AI Extracted' : 'Regex'}
              </span>
            )}
          </div>
          <h4 
            className="text-lg font-bold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.title) }}
          />
          {/* Author & Year info line */}
          {item.authors && item.authors.length > 0 && (
            <p className="text-sm text-slate-400 mt-1 font-medium">
              {item.authors.slice(0, 3).join(', ')}{item.authors.length > 3 ? ' et al.' : ''} {item.year ? `(${item.year})` : ''}
              {item.journal ? ` — ${item.journal}` : ''}
            </p>
          )}
        </div>
        
        {/* Download Buttons */}
        <div className="flex flex-col gap-2 shrink-0">
          <button 
            onClick={askForConfirmation}
            disabled={isDownloading}
            className={`flex items-center gap-2 py-3 px-6 rounded-2xl text-white font-bold text-sm shadow-lg shadow-indigo-100 transition-all active:scale-95 cursor-pointer ${
              isDownloading ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isDownloading ? (
              <><Loader2 size={18} className="animate-spin" /><span>Downloading...</span></>
            ) : (
              <><Download size={18} /><span>Download PDF</span></>
            )}
          </button>
          <a 
            href={`https://doi.org/${item.doi}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 font-medium text-xs transition-colors text-center justify-center border border-slate-100"
          >
            <Globe size={14} />
            <span>DOI.org (Publisher)</span>
          </a>
        </div>
      </div>

      {/* Alternative Search Databases */}
      <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-100 p-4 rounded-3xl text-xs gap-3">
        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 select-none">
          <Database size={13} className="text-slate-400" /> Alternatives / Alternatifler:
        </span>
        <div className="flex flex-wrap gap-1.5">
          <a 
            href={`https://libgen.is/scimag/?q=${encodeURIComponent(item.doi)}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 hover:text-indigo-600 font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <Database size={11} className="text-slate-500" /> LibGen
          </a>
          <a 
            href={`https://scholar.google.com/scholar?q=${encodeURIComponent(item.doi)}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 hover:text-indigo-600 font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <Search size={11} className="text-slate-500" /> Google Scholar
          </a>
          <a 
            href={`https://www.researchgate.net/search.Search.html?query=${encodeURIComponent(item.title || item.doi)}&type=publication`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 hover:text-indigo-600 font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <Users size={11} className="text-slate-500" /> ResearchGate
          </a>
          <a 
            href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(item.doi || item.title)}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 hover:text-indigo-600 font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <Activity size={11} className="text-slate-500" /> PubMed
          </a>
          <a 
            href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(item.doi)}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 hover:text-indigo-600 font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <Brain size={11} className="text-slate-500" /> Semantic Scholar
          </a>
        </div>
      </div>

      {/* Download fallback notice */}
      {downloadError && (
        <div className="bg-rose-50 border border-rose-150 rounded-[1.5rem] p-5 flex flex-col gap-3.5 text-rose-900 text-sm animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 text-rose-500 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <span className="font-extrabold block text-rose-950 text-base mb-1">
                Otomatik İndirme Başarısız / PDF Access Alert
              </span>
              <p className="text-rose-800 leading-relaxed text-xs">
                Bu dökümana Sci-Hub aynaları ve aktif veri dağıtım ağları (CDNs) üzerinden otomatik olarak erişilemedi. 
                Lütfen aşağıdaki resmi DOI/Yayıncı bağlantısını veya alternatif akademik veritabanlarını kullanarak el ile indirmeyi deneyin.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2.5 border-t border-rose-100/60">
            <a 
              href={`https://doi.org/${item.doi}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <ExternalLink size={13} />
              <span>Yayıncı Sayfasına Git / Open Publisher (doi.org)</span>
            </a>
            <a 
              href={`https://libgen.is/scimag/?q=${encodeURIComponent(item.doi)}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
            >
              <Database size={13} className="text-slate-500" />
              <span>LibGen Search</span>
            </a>
          </div>
        </div>
      )}

      {/* APA 6 Citation Block */}
      {item.apa6 && (
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 relative group/apa">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen size={12} />
              APA 6th Edition
            </span>
            <button
              onClick={() => onCopy(item.apa6!, apaId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                copiedId === apaId 
                  ? 'bg-emerald-100 text-emerald-600' 
                  : 'bg-white text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200'
              }`}
            >
              {copiedId === apaId ? <ClipboardCheck size={14} /> : <Copy size={14} />}
              {copiedId === apaId ? 'Copied!' : 'Copy Reference'}
            </button>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed font-serif select-all cursor-text">
            {item.apa6}
          </p>
        </div>
      )}

      {/* Confirmation Dialog Overlay */}
      {showConfirm && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-30 flex items-center justify-center p-6 rounded-[2rem] animate-in fade-in duration-250">
          <div className="bg-white rounded-[2rem] p-6 max-w-sm w-full border border-slate-100 text-center animate-in zoom-in-95 duration-250 flex flex-col gap-4.5 shadow-2xl">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto border border-indigo-100">
              <HelpCircle size={24} />
            </div>
            <div className="space-y-1.5 px-1">
              <h5 className="font-extrabold text-slate-900 text-base">
                İndirme Onayı / Download Confirm
              </h5>
              <p className="text-slate-500 text-xs leading-relaxed">
                Bu PDF dökümanını indirmek istediğinize emin misiniz? Arka planda aktif sunucular ve açık kaynak ağları taranacaktır.
              </p>
              <p className="text-slate-400 text-[10px] leading-snug">
                Are you sure you want to download this PDF? Active networks will be queried.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1.5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                İptal / Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleDownload();
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-lg shadow-indigo-150"
              >
                İndir / Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
