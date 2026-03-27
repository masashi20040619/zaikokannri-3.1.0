
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Prize, PrizeCategory, Manufacturer } from './types';
import PrizeCard from './components/PrizeCard';
import PrizeFormModal from './components/PrizeFormModal';
import PlusIcon from './components/icons/PlusIcon';
import SearchIcon from './components/icons/SearchIcon';
import PrizeList from './components/PrizeList';
import Squares2x2Icon from './components/icons/Squares2x2Icon';
import QueueListIcon from './components/icons/QueueListIcon';
import CheckCircleIcon from './components/icons/CheckCircleIcon';
import ArrowPathIcon from './components/icons/ArrowPathIcon';
import SaveIcon from './components/icons/SaveIcon';
import CogIcon from './components/icons/CogIcon';
import ArrowDownTrayIcon from './components/icons/ArrowDownTrayIcon';
import ArrowUpTrayIcon from './components/icons/ArrowUpTrayIcon';
import TrashIcon from './components/icons/TrashIcon';
import ArchiveBoxIcon from './components/icons/ArchiveBoxIcon';
import { StorageService } from './services/storage';
import PriceHistoryChart from './components/PriceHistoryChart';
import PrizeDetailModal from './components/PrizeDetailModal';

const prizeCategories: PrizeCategory[] = ['マスコット', 'ぬいぐるみ', 'フィギュア', 'その他'];
const prizeManufacturers: Manufacturer[] = ['バンダイナムコ', 'タイトー', 'SEGA FAVE', 'FuRyu', 'Parade', 'SK', 'その他'];

type DisplayMode = 'card' | 'list';
type SortOrder = 'date-desc' | 'name-asc' | 'name-desc';

const App: React.FC = () => {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prizeToEdit, setPrizeToEdit] = useState<Prize | null>(null);
  const [historyPrize, setHistoryPrize] = useState<Prize | null>(null);
  const [detailPrize, setDetailPrize] = useState<Prize | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PrizeCategory | 'すべて'>('すべて');
  const [selectedManufacturer, setSelectedManufacturer] = useState<Manufacturer | 'すべて'>('すべて');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('card');
  const [sortOrder, setSortOrder] = useState<SortOrder>('date-desc');
  
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showTools, setShowTools] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportData = useCallback(() => {
    const dataStr = JSON.stringify(prizes, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `crane_stock_backup_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [prizes]);

  const processImportedData = useCallback(async (rawJson: any) => {
    try {
      const items = Array.isArray(rawJson) ? rawJson : [rawJson];
      
      // データの正規化とバリデーション
      const normalizedItems: Prize[] = items
        .filter((item: any) => item && typeof item === 'object' && (item.id || item.name))
        .map((item: any) => {
          const id = String(item.id || Date.now() + Math.random().toString(36).substr(2, 9));
          const history = item.history || [{
            timestamp: new Date().toISOString(),
            action: 'import',
            details: 'バックアップからインポートされました'
          }];
          
          return {
            ...item,
            id,
            name: String(item.name || '名称未設定'),
            quantity: Number(item.quantity) || 0,
            acquisitionDate: item.acquisitionDate || new Date().toISOString().split('T')[0],
            category: (prizeCategories.includes(item.category) ? item.category : 'その他') as PrizeCategory,
            manufacturer: (prizeManufacturers.includes(item.manufacturer) ? item.manufacturer : 'その他') as Manufacturer,
            history
          };
        });

      if (normalizedItems.length === 0) {
        alert('有効なアイテムが見つかりませんでした。');
        return;
      }

      const isFullBackup = Array.isArray(rawJson);
      const message = isFullBackup
        ? `バックアップから ${normalizedItems.length} 件のデータを復元しますか？現在のデータは上書きされます。`
        : `「${normalizedItems[0].name}」を追加または更新しますか？`;

      if (confirm(message)) {
        let nextPrizes: Prize[];
        
        if (isFullBackup) {
          nextPrizes = normalizedItems;
        } else {
          // 単一アイテムの追加/更新
          const newItem = normalizedItems[0];
          const existingIndex = prizes.findIndex(p => p.id === newItem.id);
          if (existingIndex >= 0) {
            nextPrizes = [...prizes];
            nextPrizes[existingIndex] = newItem;
          } else {
            nextPrizes = [...prizes, newItem];
          }
        }

        setPrizes(nextPrizes);
        
        // 自動保存を試行
        try {
          setSaveStatus('saving');
          await StorageService.savePrizes(nextPrizes);
          setIsDirty(false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          alert('データが正常に反映され、保存されました。');
        } catch (error) {
          console.error("Auto-save failed after import:", error);
          setIsDirty(true);
          alert('データは画面上に反映されましたが、保存に失敗しました。右上の「変更を保存」ボタンを手動で押してください。');
        }
      }
    } catch (error) {
      console.error("Import processing error:", error);
      alert('データの処理中にエラーが発生しました。');
    }
  }, [prizes]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawJson = JSON.parse(event.target?.result as string);
        await processImportedData(rawJson);
      } catch (error) {
        alert('ファイルの読み込みに失敗しました。正しいJSON形式であることを確認してください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [processImportedData]);

  const handleImportCode = useCallback(async () => {
    const code = prompt('バックアップJSONコードをここに貼り付けてください:');
    if (!code) return;

    try {
      const rawJson = JSON.parse(code);
      await processImportedData(rawJson);
    } catch (error) {
      alert('無効なJSON形式です。貼り付けた内容を確認してください。');
    }
  }, [processImportedData]);

  // Load data from IndexedDB
  useEffect(() => {
    const initData = async () => {
      try {
        let data = await StorageService.loadPrizes();
        if (data.length === 0) {
          const oldData = StorageService.getLocalStorageData();
          if (oldData && oldData.length > 0) {
            await StorageService.savePrizes(oldData);
            data = oldData;
          }
        }
        setPrizes(data);
      } catch (error) {
        console.error("Failed to load prizes", error);
      }
    };
    initData();
  }, []);

  const handleSaveToStorage = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await StorageService.savePrizes(prizes);
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Storage error:", error);
      const errorMessage = error instanceof Error ? error.message : "不明なエラー";
      alert(`保存に失敗しました。ストレージ容量が不足している可能性があります。\nエラー詳細: ${errorMessage}`);
      setSaveStatus('idle');
    }
  }, [prizes]);

  const handleSavePrize = useCallback((prize: Prize) => {
    setPrizes(prevPrizes => {
      const existingIndex = prevPrizes.findIndex(p => p.id === prize.id);
      const oldPrize = existingIndex > -1 ? prevPrizes[existingIndex] : null;
      let nextPrizes;
      
      const timestamp = new Date().toISOString();
      const details: string[] = [];

      if (oldPrize) {
        if (oldPrize.quantity !== prize.quantity) {
          details.push(`在庫数: ${oldPrize.quantity} → ${prize.quantity}`);
        }
        
        const oldPrice = oldPrize.priceHistory && oldPrize.priceHistory.length > 0
          ? oldPrize.priceHistory[oldPrize.priceHistory.length - 1].price
          : 0;
        const newPrice = prize.priceHistory && prize.priceHistory.length > 0
          ? prize.priceHistory[prize.priceHistory.length - 1].price
          : 0;
        
        if (oldPrice !== newPrice) {
          details.push(`相場: ${oldPrice} → ${newPrice}`);
        }

        if (oldPrize.name !== prize.name) details.push(`名称変更`);
        if (oldPrize.category !== prize.category) details.push(`カテゴリ変更`);
        if (oldPrize.manufacturer !== prize.manufacturer) details.push(`メーカー変更`);
      }

      const historyEntry = oldPrize
        ? { 
            timestamp, 
            action: 'edit' as const, 
            details: details.length > 0 ? `編集内容: ${details.join(', ')}` : '商品情報が更新されました' 
          }
        : { 
            timestamp, 
            action: 'registration' as const, 
            details: `商品が新規登録されました (初期在庫: ${prize.quantity})` 
          };

      const updatedPrize = {
        ...prize,
        history: [...(prize.history || []), historyEntry]
      };

      if (existingIndex > -1) {
        nextPrizes = [...prevPrizes];
        nextPrizes[existingIndex] = updatedPrize;
      } else {
        nextPrizes = [...prevPrizes, updatedPrize];
      }
      setIsDirty(true);
      return nextPrizes;
    });
  }, []);

  const handleDeletePrize = useCallback((prizeId: string) => {
    if (confirm('この景品を削除してもよろしいですか？')) {
      setPrizes(prevPrizes => {
        const next = prevPrizes.filter(p => p.id !== prizeId);
        setIsDirty(true);
        return next;
      });
    }
  }, []);

  const handleQuantityChange = useCallback((prizeId: string, newQuantity: number) => {
    setPrizes(prevPrizes => {
      const next = prevPrizes.map(p => {
        if (p.id === prizeId) {
          const timestamp = new Date().toISOString();
          const historyEntry = {
            timestamp,
            action: 'quantity_change' as const,
            details: `在庫数: ${p.quantity} → ${newQuantity}`
          };
          return { ...p, quantity: newQuantity, history: [...(p.history || []), historyEntry] };
        }
        return p;
      });
      setIsDirty(true);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const totalTypes = prizes.length;
    const totalQuantity = prizes.reduce((sum, p) => sum + p.quantity, 0);
    const categoryCount = prizes.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + p.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    // 総資産（相場 × 数量）
    const totalValue = prizes.reduce((sum, p) => {
      const latestPrice = p.priceHistory && p.priceHistory.length > 0
        ? p.priceHistory[p.priceHistory.length - 1].price
        : 0;
      return sum + (latestPrice * p.quantity);
    }, 0);

    return { totalTypes, totalQuantity, categoryCount, totalValue };
  }, [prizes]);

  const filteredAndSortedPrizes = useMemo(() => {
    const filtered = prizes
      .filter(prize => {
        const nameMatch = prize.name.toLowerCase().includes(searchTerm.toLowerCase());
        const categoryMatch = selectedCategory === 'すべて' || prize.category === selectedCategory;
        const manufacturerMatch = selectedManufacturer === 'すべて' || prize.manufacturer === selectedManufacturer;
        return nameMatch && categoryMatch && manufacturerMatch;
      });

      switch (sortOrder) {
        case 'name-asc':
          return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        case 'name-desc':
          return [...filtered].sort((a, b) => b.name.localeCompare(a.name, 'ja'));
        case 'date-desc':
        default:
          return [...filtered].sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime());
      }
  }, [prizes, searchTerm, selectedCategory, selectedManufacturer, sortOrder]);


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans pb-24">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportFile} 
        accept=".json" 
        className="hidden" 
      />

      <header className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-100 dark:border-slate-700">
        <div className="container mx-auto px-4 py-2 sm:py-3">
          <div className="flex flex-col gap-2 sm:gap-4">
            <div className="flex items-center justify-between w-full">
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-slate-800 dark:text-white flex items-center gap-2">
                <span className="bg-indigo-600 text-white p-1 rounded-lg sm:p-1.5 sm:rounded-xl"><ArchiveBoxIcon className="w-4 h-4 sm:w-6 sm:h-6" /></span>
                CRANE<span className="text-indigo-600">STOCK</span>
              </h1>
              
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={handleSaveToStorage}
                  disabled={saveStatus === 'saving'}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-black text-[10px] sm:text-xs transition-all ${
                    isDirty 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                  }`}
                >
                  {saveStatus === 'saving' ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <SaveIcon className="w-3 h-3" />}
                  <span className="hidden xs:inline">{saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '完了' : '保存'}</span>
                  <span className="xs:hidden">{saveStatus === 'saving' ? '...' : '保存'}</span>
                </button>
                <button onClick={() => setShowTools(!showTools)} className={`p-1.5 sm:p-2 rounded-full transition-colors ${showTools ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40' : 'bg-slate-50 dark:bg-slate-700'}`}>
                  <CogIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full">
              <div className="relative flex-grow">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="景品名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl shrink-0">
                <button onClick={() => setDisplayMode('card')} className={`p-1.5 rounded-xl transition-all ${displayMode === 'card' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}><Squares2x2Icon className="w-4 h-4" /></button>
                <button onClick={() => setDisplayMode('list')} className={`p-1.5 rounded-xl transition-all ${displayMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}><QueueListIcon className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Filters Row */}
          <div className="mt-4 flex flex-col sm:flex-row gap-4 min-w-0">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">カテゴリ</p>
              <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar w-full">
                {['すべて', ...prizeCategories].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat as any)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">メーカー</p>
              <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar w-full">
                {['すべて', ...prizeManufacturers].map(m => (
                  <button
                    key={m}
                    onClick={() => setSelectedManufacturer(m as any)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedManufacturer === m 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Tools Menu */}
        {showTools && (
          <div className="container mx-auto px-4 py-3 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
              <button 
                onClick={handleExportData}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] sm:text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                エクスポート
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] sm:text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                ファイル復元
              </button>
              <button 
                onClick={handleImportCode}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] sm:text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
                コード復元
              </button>
              <button 
                onClick={() => {
                  if (confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
                    setPrizes([]);
                    setIsDirty(true);
                  }
                }}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] sm:text-xs font-bold hover:bg-red-100 transition-colors"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                全データ削除
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-3 sm:py-6">
        <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex gap-3 sm:contents">
            <div className="flex-1 bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">コレクション価値</p>
              <p className="text-lg sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">¥{stats.totalValue.toLocaleString()}</p>
            </div>
            <div className="flex-1 bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">総在庫数</p>
              <p className="text-lg sm:text-2xl font-black text-slate-800 dark:text-white">{stats.totalQuantity} <span className="text-[10px] sm:text-sm font-normal text-slate-500">個</span></p>
            </div>
          </div>
          <div className="bg-indigo-600 p-4 sm:p-5 rounded-3xl shadow-xl shadow-indigo-100 dark:shadow-none text-white overflow-hidden relative sm:col-span-2">
            <div className="relative z-10">
              <p className="text-[9px] sm:text-[10px] font-black uppercase opacity-60 tracking-widest mb-2 text-indigo-100">カテゴリ分布</p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {prizeCategories.map(cat => (
                  <div key={cat} className="bg-white/10 backdrop-blur px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold">
                    {cat}: {stats.categoryCount[cat] || 0}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/10 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 blur-2xl"></div>
          </div>
        </div>

        {prizes.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700">
             <PlusIcon className="w-12 h-12 mx-auto text-slate-200 mb-4" />
             <h2 className="text-xl font-black">アイテムがありません</h2>
             <p className="text-slate-400 text-sm mt-1">右下の「+」ボタンから最初の景品を追加しましょう</p>
          </div>
        ) : displayMode === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedPrizes.map(prize => (
              <PrizeCard
                key={prize.id}
                prize={prize}
                onEdit={(p) => { setPrizeToEdit(p); setIsModalOpen(true); }}
                onDelete={handleDeletePrize}
                onQuantityChange={handleQuantityChange}
                onShowHistory={(p) => setHistoryPrize(p)}
                onShowDetail={(p) => setDetailPrize(p)}
              />
            ))}
          </div>
        ) : (
          <PrizeList
            prizes={filteredAndSortedPrizes}
            onEdit={(p) => { setPrizeToEdit(p); setIsModalOpen(true); }}
            onDelete={handleDeletePrize}
            onQuantityChange={handleQuantityChange}
            onShowDetail={(p) => setDetailPrize(p)}
          />
        )}
      </main>

      <button
        onClick={() => { setPrizeToEdit(null); setIsModalOpen(true); }}
        className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 bg-indigo-600 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-2xl shadow-indigo-300 transform transition-all hover:scale-110 active:scale-95 z-30"
      >
        <PlusIcon className="h-6 w-6 stroke-[3]" />
      </button>

      {/* History Modal */}
      {historyPrize && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white">{historyPrize.name}</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">相場推移グラフ</p>
              </div>
              <button onClick={() => setHistoryPrize(null)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <PriceHistoryChart history={historyPrize.priceHistory || []} height={220} />
            
            <div className="mt-8 space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
               {(historyPrize.priceHistory || []).slice().reverse().map((record, i) => (
                 <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 dark:border-slate-700/50">
                    <span className="text-xs font-bold text-slate-500">{record.date}</span>
                    <span className="text-sm font-black text-slate-800 dark:text-white">¥{record.price.toLocaleString()}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      )}

      <PrizeFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setPrizeToEdit(null); }}
        onSave={handleSavePrize}
        prizeToEdit={prizeToEdit}
      />

      {detailPrize && (
        <PrizeDetailModal
          prize={detailPrize}
          isOpen={!!detailPrize}
          onClose={() => setDetailPrize(null)}
          onShowPriceHistory={(p) => {
            setDetailPrize(null);
            setHistoryPrize(p);
          }}
        />
      )}
    </div>
  );
};

export default App;
