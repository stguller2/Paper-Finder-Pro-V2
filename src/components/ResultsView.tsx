import React, { useState, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Trash2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Library,
  Zap,
  Layers,
  BookOpen,
  Share2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
  X,
  Link,
  Search,
  ExternalLink as OpenIcon
} from 'lucide-react';
import { Button } from './Button';
import { ReferenceCard } from './ReferenceCard';
import { ExtractionResult, CopiedState } from '../types';
import DOMPurify from 'dompurify';

interface ResultsViewProps {
  result: ExtractionResult;
  onCopyAll: () => void;
  onReset: () => void;
  copiedId: CopiedState;
  onCopy: (text: string, id: CopiedState) => void;
  getSciHubLink: (doi: string) => string;
  onOpenAll: () => void;
  onDownloadFile: (content: string, filename: string, type: string) => void;
}

const ITEMS_PER_PAGE = 10;

export const ResultsView: React.FC<ResultsViewProps> = ({
  result,
  onCopyAll,
  onReset,
  copiedId,
  onCopy,
  getSciHubLink,
  onOpenAll,
  onDownloadFile,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const cancelBatchRef = useRef(false);

  const [batchState, setBatchState] = useState<{
    isActive: boolean;
    currentIndex: number;
    successCount: number;
    failCount: number;
    currentTitle: string;
    isCompleted: boolean;
    statusText: string;
  }>({
    isActive: false,
    currentIndex: 0,
    successCount: 0,
    failCount: 0,
    currentTitle: '',
    isCompleted: false,
    statusText: ''
  });

  const handleStopBatch = () => {
    cancelBatchRef.current = true;
    setBatchState(prev => ({
      ...prev,
      isCompleted: true,
      statusText: 'Toplu indirme durduruldu / Batch download stopped by user.'
    }));
  };

  const fetchPdfBlob = async (doi: string): Promise<Blob | null> => {
    try {
      const response = await fetch(getSciHubLink(doi));
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && (contentType.includes('pdf') || contentType.includes('octet-stream'))) {
        const blob = await response.blob();
        if (blob.size > 15000) {
          return blob;
        }
      }
    } catch (e) {
      console.warn(`Proxy failed for batch DOI ${doi}`, e);
    }

    const cdns = [
      `https://sci.bban.top/pdf/${doi}.pdf`,
      `https://zero.sci-hub.se/${doi}.pdf`,
      `https://sci-hub.st/${doi}`,
      `https://sci-hub.se/${doi}`,
      `https://sci-hub.ru/${doi}`
    ];

    for (const url of cdns) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && (contentType.includes('pdf') || contentType.includes('octet-stream'))) {
          const blob = await res.blob();
          if (blob.size > 15000) {
            return blob;
          }
        }
      } catch (err) {
        console.warn(`Alternative path failed for batch ${url}`, err);
      }
    }
    return null;
  };

  const handleBatchDownloadAllPDFs = async () => {
    if (batchState.isActive || result.references.length === 0) return;

    cancelBatchRef.current = false;

    setBatchState({
      isActive: true,
      currentIndex: 0,
      successCount: 0,
      failCount: 0,
      currentTitle: result.references[0]?.title || '',
      isCompleted: false,
      statusText: 'Bağlantı kuruluyor...'
    });

    for (let i = 0; i < result.references.length; i++) {
      if (cancelBatchRef.current) {
        break;
      }

      const item = result.references[i];
      setBatchState(prev => {
        if (cancelBatchRef.current) return prev;
        return {
          ...prev,
          currentIndex: i,
          currentTitle: item.title,
          statusText: `Sci-Hub sunucuları ve alternatif CDN kanalları taranıyor...`
        };
      });

      try {
        const blob = await fetchPdfBlob(item.doi);
        
        if (cancelBatchRef.current) {
          break;
        }

        if (blob) {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `${item.doi.replace(/\//g, '_')}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          setBatchState(prev => {
            if (cancelBatchRef.current) return prev;
            return {
              ...prev,
              successCount: prev.successCount + 1,
              statusText: 'Başarıyla indirildi / Downloaded successfully.'
            };
          });
        } else {
          setBatchState(prev => {
            if (cancelBatchRef.current) return prev;
            return {
              ...prev,
              failCount: prev.failCount + 1,
              statusText: 'Alternatif kaynaklarda bulunamadı / Not found in mirrors.'
            };
          });
        }
      } catch (err) {
        console.error('Trigger download failed', err);
        setBatchState(prev => {
          if (cancelBatchRef.current) return prev;
          return {
            ...prev,
            failCount: prev.failCount + 1,
            statusText: 'İndirme hatası oluştu / Download error.'
          };
        });
      }

      if (cancelBatchRef.current) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    if (cancelBatchRef.current) {
      return;
    }

    setBatchState(prev => ({
      ...prev,
      isCompleted: true,
      statusText: 'Toplu indirme işlemi tamamlandı! / Batch download complete.'
    }));
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredReferences = useMemo(() => {
    if (!searchQuery.trim()) return result.references;
    const query = searchQuery.toLowerCase().trim();
    return result.references.filter(item => {
      const matchTitle = item.title && item.title.toLowerCase().includes(query);
      const matchDoi = item.doi && item.doi.toLowerCase().includes(query);
      const matchJournal = item.journal && item.journal.toLowerCase().includes(query);
      const matchAuthors = item.authors && item.authors.some(author => author.toLowerCase().includes(query));
      return matchTitle || matchDoi || matchJournal || matchAuthors;
    });
  }, [result.references, searchQuery]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(filteredReferences.length / ITEMS_PER_PAGE);

  const paginatedReferences = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredReferences.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReferences, currentPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const visiblePages = useMemo(() => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  const copyAllAPA = () => {
    const apaList = result.references
      .filter(r => r.apa6)
      .map(r => r.apa6)
      .join('\n\n');
    onCopy(apaList || 'No APA citations available', 'copy-all-apa');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Summary Banner */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-green-100 text-green-600 p-3 rounded-2xl">
            <CheckCircle2 size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-xl font-bold text-slate-800 line-clamp-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.paperTitle || "Analysis Complete") }}
            />
            <p className="text-slate-500 font-medium">{result.references.length} References with DOI identified</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="custom"
            onClick={handleBatchDownloadAllPDFs}
            disabled={batchState.isActive}
            className="font-bold flex items-center gap-1.5 px-4 py-2.5 text-xs rounded-xl cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            {batchState.isActive ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>{batchState.isActive ? 'İndiriliyor...' : "Tümünü İndir (PDF)"}</span>
          </Button>
          <Button
            variant="custom"
            onClick={copyAllAPA}
            className={`font-bold text-xs px-3 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${copiedId === 'copy-all-apa' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100'}`}
          >
            {copiedId === 'copy-all-apa' ? <ClipboardCheck size={14} /> : <BookOpen size={14} />}
            <span>{copiedId === 'copy-all-apa' ? 'Başarıyla Kopyalandı!' : 'Tüm APA Kopyala'}</span>
          </Button>
          <div className="w-px h-6 bg-slate-100 hidden md:block" />
          <Button variant="ghost" onClick={onReset} className="text-slate-400 hover:text-rose-500 font-bold text-xs px-3 py-2.5 rounded-xl">
            <Trash2 size={14} />
            <span>Sıfırla / Reset</span>
          </Button>
        </div>
      </div>

      {/* Batch Downloading Progress Overlay */}
      {batchState.isActive && (() => {
        const progressPercent = batchState.isCompleted 
          ? 100 
          : Math.min(100, Math.round(((batchState.currentIndex + 1) / result.references.length) * 100));
        
        return (
          <div className="bg-slate-950 border border-slate-800 text-white rounded-[2rem] p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden">
            {/* Ambient pattern backdrop */}
            <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
              <Layers size={180} className="text-white animate-pulse" />
            </div>

            <div className="relative z-10 space-y-6">
              {/* Top Row: Title, Sub-details & Dismiss Action */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {batchState.isCompleted ? (
                    <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-2xl border border-emerald-500/30">
                      <CheckCircle2 size={24} />
                    </div>
                  ) : (
                    <div className="bg-indigo-500/20 text-indigo-400 p-2.5 rounded-2xl border border-indigo-500/30 animate-pulse">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                      <span>
                        {batchState.isCompleted 
                          ? 'Masaüstü Toplu İndirme Raporu / Batch Download Complete' 
                          : 'Toplu İndirme Devam Ediyor / Batch Download Active'}
                      </span>
                    </h3>
                    <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                      {batchState.isCompleted 
                        ? 'Tüm referanslar sırayla analiz edildi. Başarılı dosyalar yerel diskine kaydedildi.' 
                        : 'Belgeler alternatif bilimsel sunucu kanallarından aranıp cihazınıza indiriliyor.'}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    handleStopBatch();
                    setBatchState(prev => ({ ...prev, isActive: false }));
                  }}
                  className="p-2 -mt-1 -mr-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/15 transition-all cursor-pointer"
                  title="Yenile / Kapat"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Grid Layout containing statistics counters */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.04] border border-white/5 rounded-2.5xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-md">
                  <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    SUCCESS
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400">{batchState.successCount}</span>
                </div>
                
                <div className="bg-white/[0.04] border border-white/5 rounded-2.5xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-md">
                  <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    FAILED
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-rose-400">{batchState.failCount}</span>
                </div>

                <div className="bg-white/[0.04] border border-white/5 rounded-2.5xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-md">
                  <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Layers size={13} />
                    TOTAL LIST
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-slate-100">{result.references.length}</span>
                </div>
              </div>

              {/* Active Item Description panel */}
              {!batchState.isCompleted && (
                <div className="bg-white/[0.02] border border-white/5 rounded-[1.5rem] p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="font-mono text-zinc-400">ŞU AN İNDİRİLEN: {batchState.currentIndex + 1} / {result.references.length}</span>
                    <span className="bg-indigo-500/25 text-indigo-300 font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">RUNNING</span>
                  </div>
                  
                  <h4 className="text-sm font-bold text-slate-100 leading-snug truncate">
                    {batchState.currentTitle || 'Sıradaki dosya yükleniyor...'}
                  </h4>

                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 bg-white/[0.03] px-3.5 py-2.5 rounded-xl border border-white/[0.02]">
                    <Loader2 size={13} className="animate-spin text-indigo-400 shrink-0" />
                    <span className="truncate">{batchState.statusText}</span>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={handleStopBatch}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-extrabold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-950/20"
                    >
                      <X size={13} />
                      <span>İndirmeyi Durdur / Stop Downloading</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Progress Loading Bar */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold font-mono text-slate-300">
                  <span>İlerleme Oranı / Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden p-[2px] backdrop-blur-md">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${batchState.isCompleted ? 'bg-emerald-400' : 'bg-indigo-500'}`} 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Manual Dismiss buttons insidecompleted report card */}
              {batchState.isCompleted && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button 
                    variant="custom"
                    onClick={() => setBatchState(prev => ({ ...prev, isActive: false }))}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-2xl cursor-pointer shadow-lg shadow-emerald-500/10 transition-all duration-150 transform hover:scale-[1.02] active:scale-95"
                  >
                    <span>Raporu Kapat / Close Report</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Proxy Info */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-[2rem] p-5 flex items-center gap-4 shadow-sm">
        <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shrink-0">
          <ShieldCheck size={20} />
        </div>
        <p className="text-sm text-indigo-700 leading-relaxed">
          <span className="font-bold">Dynamic Proxy Active:</span> Download links rotate between mirrors automatically.
          Papers after 2021 may have limited availability.
        </p>
      </div>

      {/* Skipped Notification */}
      {result.skippedCount > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-4 text-amber-800 shadow-sm">
          <AlertCircle size={20} className="flex-shrink-0" />
          <p className="font-medium text-sm">
            <span className="font-bold">{result.skippedCount}</span> references without DOI were skipped.
          </p>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <Search size={20} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Ada, yazara, dergi veya DOI'ye göre ara... / Search by title, author, journal, DOI..."
            className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white text-slate-800 placeholder-slate-400 rounded-2xl text-sm outline-none transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-rose-500 transition-colors"
              title="Aramayı Temizle / Clear Search"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between md:justify-end gap-3 px-1 md:px-0">
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl whitespace-nowrap">
            {searchQuery ? (
              <span>
                Bulunan: <strong className="text-indigo-600 font-extrabold">{filteredReferences.length}</strong> / Toplam: <strong>{result.references.length}</strong>
              </span>
            ) : (
              <span>Toplam Kaynak: <strong className="text-slate-700 font-extrabold">{result.references.length}</strong></span>
            )}
          </span>
        </div>
      </div>

      {/* Reference List */}
      <div className="grid grid-cols-1 gap-6">
        {paginatedReferences.length > 0 ? (
          paginatedReferences.map((item, idx) => {
            const originalIndex = result.references.indexOf(item);
            const actualIndex = originalIndex >= 0 ? originalIndex : idx;
            return (
              <ReferenceCard
                key={actualIndex}
                item={item}
                index={actualIndex}
                onCopy={onCopy}
                copiedId={copiedId}
                getSciHubLink={getSciHubLink}
              />
            );
          })
        ) : (
          <div className="bg-white py-20 rounded-[2.5rem] border border-slate-100 text-center flex flex-col items-center">
            <div className="bg-slate-50 p-6 rounded-full mb-4 text-slate-300">
              <Search size={48} />
            </div>
            <h3 className="text-xl font-bold text-slate-700">Arama Sonucu Bulunamadı / No Results Found</h3>
            <p className="text-slate-400 text-xs mt-2 max-w-sm px-4">
              "{searchQuery}" aramasına uygun hiçbir referans bulunamadı. Lütfen filtreyi temizleyin veya başka bir kelime deneyin.
            </p>
            <Button variant="secondary" className="mt-8 cursor-pointer" onClick={() => handleSearchChange('')}>
              Filtreyi Temizle / Clear Filter
            </Button>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-sm text-slate-500 font-medium">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredReferences.length)} of {filteredReferences.length}
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="First page"
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>

            {visiblePages.map((page, i) =>
              page === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm">…</span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    currentPage === page
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Last page"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Batch Actions */}
      {result.references.length > 0 && (
        <div className="bg-indigo-900 text-white rounded-[2.5rem] p-10 shadow-2xl shadow-indigo-200 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Zap size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
              <Layers size={28} />
              Batch Actions
            </h3>
            <p className="mb-8 text-indigo-100 max-w-2xl leading-relaxed text-lg">
              Export all references at once or open all download links in new tabs.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                variant="custom"
                disabled={batchState.isActive}
                className="bg-white text-indigo-900 hover:bg-indigo-50 border-none px-8 py-4 rounded-2xl font-extrabold shadow-xl flex items-center gap-2 cursor-pointer relative"
                onClick={handleBatchDownloadAllPDFs}
              >
                {batchState.isActive ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                <span>
                  {batchState.isActive ? 'Tümü İndiriliyor...' : `Tüm PDF'leri İndir / Download All PDFs (${result.references.length})`}
                </span>
                {batchState.isActive && (
                  <span className="absolute -top-2 -right-2 bg-rose-500 text-white font-mono text-[9px] px-2 py-0.5 rounded-full shadow-lg">
                    {batchState.currentIndex + 1}/{result.references.length}
                  </span>
                )}
              </Button>

              <Button
                variant="custom"
                className="bg-indigo-800 text-white border-indigo-700 hover:bg-indigo-700 px-8 py-4 rounded-2xl font-bold border"
                onClick={onOpenAll}
              >
                <OpenIcon size={20} />
                Bağlantıları Yeni Sekmelerde Aç / Open All Links in Tabs ({result.references.length})
              </Button>

              <Button
                variant="custom"
                className="bg-indigo-800 text-white border-indigo-700 hover:bg-indigo-700 px-8 py-4 rounded-2xl font-bold border"
                onClick={() => {
                  const apaContent = result.references
                    .filter(r => r.apa6)
                    .map(r => r.apa6)
                    .join('\n\n');
                  onDownloadFile(apaContent, 'references_apa6.txt', 'text/plain');
                }}
              >
                <BookOpen size={20} />
                Export APA 6 References
              </Button>

              <Button
                variant="custom"
                className="bg-indigo-800 text-white border-indigo-700 hover:bg-indigo-700 px-8 py-4 rounded-2xl font-bold border"
                onClick={() => {
                  const risContent = result.references.map(r =>
                    `TY  - JOUR\nTI  - ${r.title}\nDO  - ${r.doi}${r.authors ? '\n' + r.authors.map(a => `AU  - ${a}`).join('\n') : ''}${r.year ? `\nPY  - ${r.year}` : ''}${r.journal ? `\nJO  - ${r.journal}` : ''}${r.volume ? `\nVL  - ${r.volume}` : ''}${r.issue ? `\nIS  - ${r.issue}` : ''}${r.pages ? `\nSP  - ${r.pages}` : ''}\nUR  - https://doi.org/${r.doi}\nER  - `
                  ).join('\n\n');
                  onDownloadFile(risContent, 'references.ris', 'text/plain');
                }}
              >
                <Share2 size={20} />
                Export RIS (Zotero/Mendeley)
              </Button>

              <Button
                variant="custom"
                className="bg-indigo-800 text-white border-indigo-700 hover:bg-indigo-700 px-8 py-4 rounded-2xl font-bold border"
                onClick={() => {
                  const doiContent = result.references
                    .map(r => r.doi)
                    .filter(Boolean)
                    .join('\n');
                  onDownloadFile(doiContent, 'dois.txt', 'text/plain');
                }}
              >
                <Link size={20} />
                Export DOIs (.txt)
              </Button>

              <Button
                variant="custom"
                className="text-indigo-200 hover:bg-white/10 px-8 py-4 rounded-2xl cursor-pointer"
                onClick={() => {
                  const text = result.references.map((r, i) =>
                    `[${i + 1}] ${r.apa6 || r.title}\n    Download: ${getSciHubLink(r.doi)}`
                  ).join('\n\n');
                  onDownloadFile(text, 'reading_list.txt', 'text/plain');
                }}
              >
                <FileText size={20} />
                Export Reading List
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
