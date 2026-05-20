import React from 'react';
import { 
  Library, 
  AlertCircle,
  Clock,
  BookOpen,
  CreditCard,
  Info,
  Type,
  Layout,
  Hash,
  FileCheck,
  ChevronUp,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from './types';
import { Button } from './components/Button';
import { useExtraction } from './hooks/useExtraction';
import { UploadZone } from './components/UploadZone';
import { ResultsView } from './components/ResultsView';

const App: React.FC = () => {
  const {
    appState,
    result,
    progress,
    progressMessage,
    copiedId,
    useAI,
    setUseAI,
    showHelp,
    setShowHelp,
    aiStatus,
    onFileUpload,
    onTextExtract,
    onCopy,
    onCopyAll,
    onReset,
    getSciHubLink,
    onOpenAll,
    onDownloadFile,
  } = useExtraction();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-slate-900 animate-in fade-in duration-500">
      <header className="mb-12 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-100 text-indigo-600 rounded-2xl mb-4 shadow-sm">
          <Library size={32} />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-500">
          Paper Finder Pro
        </h1>
        <p className="text-indigo-600 text-xs font-mono font-bold uppercase tracking-wider mb-2">
          Academic DOI Linker & Citation Finder
        </p>
        <p className="text-slate-500 text-base max-w-xl mx-auto font-medium">
          Makalenizi yükleyin veya kaynakça metninizi yapıştırın. DOI numaralarını, APA formatlı atıfları ve Sci-Hub indirme linklerini çıkartın.
        </p>
      </header>

      <main>
        {appState === AppState.IDLE && (
          <div className="space-y-12 animate-in fade-in duration-300">
            <UploadZone 
              onFileUpload={onFileUpload}
              onTextExtract={onTextExtract}
              showHelp={showHelp}
              setShowHelp={setShowHelp}
              useAI={useAI}
              setUseAI={setUseAI}
              aiStatus={aiStatus}
            />

            {/* DNS Troubleshooting section (Turkish / English) */}
            <div className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-8 space-y-4">
              <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Info size={18} className="text-indigo-500" />
                DNS Engellerini Aşmak & Sorun Giderme / DNS Bypass Guide
              </h4>
              <p className="text-sm text-slate-500 leading-relaxed">
                Yasal veya bölgesel sağlayıcı kısıtlamaları nedeniyle Sci-Hub adresleri bazen DNS engellemelerine (NXDOMAIN hataları) takılabilmektedir. Bu engeli aşmak ve indirmelerin tam performanslı kararlılıkla çalışmasını sağlamak için cihazınızda veya tarayıcınızda <strong>Cloudflare DNS (1.1.1.1)</strong> veya <strong>Google DNS (8.8.8.8)</strong> kullanılması önerilir.
              </p>
              <div className="flex gap-4 text-xs font-mono text-indigo-600 font-bold">
                <span>⚡ Cloudflare DNS: 1.1.1.1</span>
                <span>⚡ Google DNS: 8.8.8.8</span>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PricingCard title="Free Plan" price="$0" features={["3 PDFs per day", "BibTeX Export", "RIS Export"]} buttonText="Current Plan" variant="secondary" />
              <PricingCard title="Researcher Pro" price="$4.99" features={["Unlimited PDFs", "Batch Download", "Priority Support"]} buttonText="Upgrade Now" variant="primary" isBestValue />
              <PricingCard title="Lab / Team" price="$19" features={["Up to 10 members", "Shared Library", "Admin Dashboard"]} buttonText="Contact Sales" variant="secondary" />
            </div>

            {/* Trust Badges */}
            <div className="bg-slate-50 rounded-[2.5rem] p-12 grid grid-cols-1 md:grid-cols-3 gap-8">
              <Badge icon={<Clock size={24} />} title="Save 2+ Hours" desc="Per paper analyzed." />
              <Badge icon={<BookOpen size={24} />} title="Zotero Ready" desc="Direct BibTeX/RIS exports." />
              <Badge icon={<CreditCard size={24} />} title="Student Friendly" desc="Affordable academic pricing." />
            </div>

            <AnimatePresence>
              {showHelp && <HelpSection onCollapse={() => setShowHelp(false)} />}
            </AnimatePresence>
          </div>
        )}

        {appState === AppState.EXTRACTING && (
          <LoadingView progress={progress} message={progressMessage} />
        )}

        {appState === AppState.ERROR && (
          <ErrorView error={progressMessage} onReset={onReset} />
        )}

        {appState === AppState.SUCCESS && result && (
          <ResultsView 
            result={result}
            onCopyAll={onCopyAll}
            onReset={onReset}
            copiedId={copiedId}
            onCopy={onCopy}
            getSciHubLink={getSciHubLink}
            onOpenAll={onOpenAll}
            onDownloadFile={onDownloadFile}
          />
        )}
      </main>
    </div>
  );
};

// Sub-components for cleaner App.tsx
const PricingCard = ({ title, price, features, buttonText, variant, isBestValue }: any) => (
  <div className={`p-8 rounded-[2rem] border ${isBestValue ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 relative' : 'bg-white border-slate-100 shadow-sm'}`}>
    {isBestValue && <div className="absolute top-0 right-0 p-4 bg-indigo-500 text-white text-[10px] font-bold uppercase rounded-bl-xl">Best Value</div>}
    <h4 className="text-lg font-bold mb-2">{title}</h4>
    <div className="text-3xl font-black mb-6">{price}<span className="text-sm font-medium opacity-60">/mo</span></div>
    <ul className="space-y-3 text-sm mb-8">
      {features.map((f: string) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={16} /> {f}</li>)}
    </ul>
    <Button variant={isBestValue ? 'custom' : variant} className={`w-full rounded-xl cursor-pointer py-3.5 font-bold transition-all duration-150 ${isBestValue ? 'bg-white text-indigo-600 hover:bg-indigo-50 shadow-md hover:scale-[1.02]' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{buttonText}</Button>
  </div>
);

const Badge = ({ icon, title, desc }: any) => (
  <div className="text-center">
    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm text-indigo-600">{icon}</div>
    <h5 className="font-bold text-slate-800 mb-2">{title}</h5>
    <p className="text-slate-500 text-xs">{desc}</p>
  </div>
);

const LoadingView = ({ progress, message }: any) => (
  <div className="bg-white rounded-[2.5rem] p-16 shadow-xl text-center max-w-2xl mx-auto animate-in fade-in duration-300">
    <div className="relative w-24 h-24 mx-auto mb-8 animate-pulse">
      <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
    </div>
    <h3 className="text-2xl font-bold text-slate-800 mb-2">Processing Document</h3>
    <p className="text-slate-400 font-medium mb-8">{message}</p>
    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-4">
      <motion.div className="h-full bg-indigo-600" animate={{ width: `${progress}%` }} />
    </div>
  </div>
);

const ErrorView = ({ error, onReset }: any) => (
  <div className="bg-rose-50 border-2 border-rose-100 rounded-[2.5rem] p-12 text-center animate-in zoom-in-95 duration-300">
    <AlertCircle size={48} className="text-rose-500 mx-auto mb-6" />
    <h3 className="text-2xl font-bold text-rose-800 mb-3 block">Something went wrong</h3>
    <p className="text-rose-600 mb-10 max-w-md mx-auto block">{error}</p>
    <Button variant="primary" className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white" onClick={onReset}>Try Again</Button>
  </div>
);

const HelpSection = ({ onCollapse }: any) => (
  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
    <div className="flex items-center gap-3 mb-6"><Info size={20} className="text-indigo-600" /><h4 className="text-lg font-bold">Extraction Tips</h4></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <HelpItem icon={<Type size={18} />} title="Selectable Text" desc="PDF must have text, not just images." />
      <HelpItem icon={<Layout size={18} />} title="Bibliography" desc="Ensure a clear references section." />
      <HelpItem icon={<Hash size={18} />} title="Visible DOIs" desc="The tool looks for standard DOI strings." />
      <HelpItem icon={<FileCheck size={18} />} title="File Quality" desc="Standard academic layouts work best." />
    </div>
    <button onClick={onCollapse} className="mt-8 text-slate-400 text-xs font-bold flex items-center gap-1 mx-auto cursor-pointer"><ChevronUp size={14} /> Collapse</button>
  </motion.div>
);

const HelpItem = ({ icon, title, desc }: any) => (
  <div className="flex gap-4">
    <div className="text-indigo-500 shrink-0">{icon}</div>
    <div><p className="font-bold text-sm mb-1">{title}</p><p className="text-slate-500 text-xs">{desc}</p></div>
  </div>
);

export default App;
