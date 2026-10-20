import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Smartphone, 
  Layers, 
  Gamepad2, 
  Coins, 
  CheckCircle2, 
  X, 
  SlidersHorizontal,
  Save,
  Fuel,
  TrendingUp,
  AlertTriangle,
  Camera,
  ScanLine,
  Sparkles
} from 'lucide-react';
import { 
  useData, 
  DEFAULT_ADMIN_TIERS, 
  getProductAdminRanges, 
  DEFAULT_DANA_RANGES, 
  DEFAULT_TRANSFER_RANGES,
  DEFAULT_GOPAY_RANGES,
  DEFAULT_OVO_RANGES
} from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Product, PsRental, AdminFeeTier, AdminRange } from '../types';
import { formatRupiah, formatNumberWithDots, parseNumberFromDots } from '../utils/formatters';
import { ScannerModal, ScannedVoucherData } from './ScannerModal';

export const ProductsView: React.FC = () => {
  const { 
    products, 
    psRentals, 
    settings, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    adjustStock,
    addPsUnit,
    updatePsUnit,
    deletePsUnit,
    updateSettings 
  } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Active Master Tab: 'all' | 'barang' | 'ppob_range' | 'ps'
  const [activeMasterTab, setActiveMasterTab] = useState<'all' | 'barang' | 'ppob_range' | 'ps'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'barang' | 'ppob_range' | 'ps'>('barang');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPsUnit, setEditingPsUnit] = useState<PsRental | null>(null);

  // Scanner State for Data Master
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerContext, setScannerContext] = useState<'master_search' | 'master_form'>('master_search');
  const [scannerFeedback, setScannerFeedback] = useState<string | null>(null);

  // Scanner handlers for Data Master
  const handleScannerSelectProduct = (product: Product) => {
    setSearchQuery(product.name);
    setScannerFeedback(`Produk "${product.name}" (${product.sku || 'Tanpa SKU'}) terpilih dan difilter di Data Master.`);
    setTimeout(() => setScannerFeedback(null), 4500);
  };

  const handleScannerBarcode = (scannedCode: string) => {
    if (scannerContext === 'master_form') {
      setBarangForm((prev) => ({ ...prev, sku: scannedCode }));
      setScannerFeedback(`Kode Barcode/SKU "${scannedCode}" berhasil dimasukkan ke form.`);
      setTimeout(() => setScannerFeedback(null), 4500);
    } else {
      // In master search: open modal to add new product with this barcode prefilled!
      setBarangForm({
        name: '',
        category: 'Sembako',
        sku: scannedCode,
        price: 0,
        cost: 0,
        stock: 10,
        minStock: 2,
        unit: 'Pcs',
        isFuel: false,
      });
      setModalType('barang');
      setEditingProduct(null);
      setIsAddModalOpen(true);
      setScannerFeedback(`Membuka form pendaftaran produk baru dengan kode barcode "${scannedCode}".`);
      setTimeout(() => setScannerFeedback(null), 4500);
    }
  };

  const handleScannerVoucherInfo = (info: ScannedVoucherData) => {
    if (scannerContext === 'master_form') {
      setBarangForm((prev) => ({
        ...prev,
        name: info.name || prev.name,
        category: 'Pulsa',
        sku: info.sku || prev.sku,
      }));
      setScannerFeedback(`Informasi voucher "${info.name}" (${info.quota || ''}) dimasukkan ke form.`);
      setTimeout(() => setScannerFeedback(null), 4500);
    } else {
      // Open add product modal pre-filled with voucher data!
      setBarangForm({
        name: info.name,
        category: 'Pulsa',
        sku: info.sku || `VCR-${Date.now().toString().slice(-4)}`,
        price: 25000,
        cost: 22000,
        stock: 50,
        minStock: 5,
        unit: 'Pcs',
        isFuel: false,
      });
      setModalType('barang');
      setEditingProduct(null);
      setIsAddModalOpen(true);
      setScannerFeedback(`Membuka form pendaftaran voucher baru "${info.name}".`);
      setTimeout(() => setScannerFeedback(null), 4500);
    }
  };

  // Form State: Barang & Pulsa
  const [barangForm, setBarangForm] = useState({
    name: '',
    category: 'Pulsa',
    sku: '',
    price: 12000,
    cost: 10250,
    stock: 999,
    minStock: 10,
    unit: 'Trx',
    isFuel: false,
  });

  // Form State: PPOB Range (Disimpan mandiri per layanan)
  const [ppobForm, setPpobForm] = useState<{
    name: string;
    provider: string;
    sku: string;
    adminRanges: AdminRange[];
  }>({
    name: 'DANA',
    provider: 'DANA',
    sku: 'PPOB-DANA',
    adminRanges: [...DEFAULT_DANA_RANGES],
  });

  // Form State: Rental PS (Tarif 1 Jam & Tarif 30 Menit)
  const [psForm, setPsForm] = useState({
    unitName: '',
    psType: 'PS4' as 'PS3' | 'PS4' | 'PS5',
    hourlyRate: 5000,
    halfHourlyRate: 3000,
  });

  // Admin Fee Tiers Editor State (Fallback global)
  const [tiers, setTiers] = useState<AdminFeeTier[]>(() => {
    return settings.adminFeeTiers && settings.adminFeeTiers.length > 0
      ? settings.adminFeeTiers
      : DEFAULT_ADMIN_TIERS;
  });
  const [isTierSaved, setIsTierSaved] = useState(false);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const isRange = p.masterType === 'ppob_range' || p.category.toLowerCase().includes('ppob range');
      if (activeMasterTab === 'barang' && isRange) return false;
      if (activeMasterTab === 'ppob_range' && !isRange) return false;

      const q = searchQuery.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    });
  }, [products, activeMasterTab, searchQuery]);

  // Filtered PS Stations
  const filteredPsStations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return psRentals.filter((ps) => {
      return (
        ps.unitName.toLowerCase().includes(q) ||
        ps.psType.toLowerCase().includes(q)
      );
    });
  }, [psRentals, searchQuery]);

  // Save Barang or Pulsa
  const handleSaveBarang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barangForm.name.trim()) return;

    if (editingProduct) {
      await updateProduct(editingProduct.id, {
        name: barangForm.name.trim(),
        category: barangForm.category,
        sku: barangForm.sku.trim(),
        price: Number(barangForm.price),
        cost: Number(barangForm.cost),
        stock: Number(barangForm.stock),
        minStock: Number(barangForm.minStock),
        unit: barangForm.unit.trim() || 'Pcs',
        isFuel: barangForm.category === 'BBM' || barangForm.isFuel,
        masterType: 'barang',
      });
    } else {
      await addProduct({
        name: barangForm.name.trim(),
        category: barangForm.category,
        sku: barangForm.sku.trim() || `PRD-${Date.now().toString().slice(-4)}`,
        price: Number(barangForm.price),
        cost: Number(barangForm.cost),
        stock: Number(barangForm.stock),
        minStock: Number(barangForm.minStock),
        unit: barangForm.unit.trim() || 'Pcs',
        isFuel: barangForm.category === 'BBM' || barangForm.isFuel,
        masterType: 'barang',
      });
    }
    setIsAddModalOpen(false);
    setEditingProduct(null);
  };

  // Save PPOB Range Item (Range disimpan mandiri di data master per layanan)
  const handleSavePpob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ppobForm.name.trim()) return;

    // Filter valid ranges and sort ascending by min
    const validRanges = ppobForm.adminRanges
      .map((r) => ({
        min: Number(r.min) || 0,
        max: Number(r.max) || 0,
        fee: Number(r.fee) || 0,
      }))
      .filter((r) => r.max >= r.min && r.fee >= 0)
      .sort((a, b) => a.min - b.min);

    if (validRanges.length === 0) {
      alert('Harap tentukan minimal satu rentang nominal dan biaya admin!');
      return;
    }

    if (editingProduct) {
      await updateProduct(editingProduct.id, {
        name: ppobForm.name.trim(),
        category: 'PPOB Range',
        sku: ppobForm.sku.trim() || editingProduct.sku,
        ppobProvider: ppobForm.provider,
        adminRanges: validRanges,
        masterType: 'ppob_range',
      });
    } else {
      await addProduct({
        name: ppobForm.name.trim(),
        category: 'PPOB Range',
        sku: ppobForm.sku.trim() || `PPOB-${Date.now().toString().slice(-4)}`,
        price: 100000,
        cost: 100000,
        stock: 9999,
        minStock: 10,
        unit: 'Trx',
        masterType: 'ppob_range',
        ppobProvider: ppobForm.provider,
        adminRanges: validRanges,
      });
    }
    setIsAddModalOpen(false);
    setEditingProduct(null);
  };

  // Save PS Station
  const handleSavePs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!psForm.unitName.trim()) return;

    if (editingPsUnit) {
      await updatePsUnit(editingPsUnit.id, {
        unitName: psForm.unitName.trim(),
        psType: psForm.psType,
        hourlyRate: Number(psForm.hourlyRate) || 5000,
        halfHourlyRate: Number(psForm.halfHourlyRate) || 3000,
      });
    } else {
      await addPsUnit({
        unitName: psForm.unitName.trim(),
        psType: psForm.psType,
        hourlyRate: Number(psForm.hourlyRate) || 5000,
        halfHourlyRate: Number(psForm.halfHourlyRate) || 3000,
      });
    }
    setIsAddModalOpen(false);
    setEditingPsUnit(null);
    setPsForm({ unitName: '', psType: 'PS4', hourlyRate: 5000, halfHourlyRate: 3000 });
  };

  const handleEditPs = (ps: PsRental) => {
    setEditingPsUnit(ps);
    setModalType('ps');
    setPsForm({
      unitName: ps.unitName,
      psType: ps.psType,
      hourlyRate: ps.hourlyRate || 5000,
      halfHourlyRate: ps.halfHourlyRate || 3000,
    });
    setIsAddModalOpen(true);
  };

  // Save Admin Fee Tiers (Global fallback)
  const handleSaveTiers = async () => {
    await updateSettings({ adminFeeTiers: tiers });
    setIsTierSaved(true);
    setTimeout(() => setIsTierSaved(false), 3000);
  };

  const handleOpenAddFuel = () => {
    setModalType('barang');
    setEditingProduct(null);
    setEditingPsUnit(null);
    setBarangForm({
      name: 'Pertalite / Pertamax',
      category: 'BBM',
      sku: `BBM-${Math.floor(100 + Math.random() * 900)}`,
      price: 10000,
      cost: 9000,
      stock: 100,
      minStock: 10,
      unit: 'Liter',
      isFuel: true,
    });
    setIsAddModalOpen(true);
  };

  const handleOpenAdd = (type: 'barang' | 'ppob_range' | 'ps') => {
    setModalType(type);
    setEditingProduct(null);
    setEditingPsUnit(null);
    if (type === 'barang') {
      setBarangForm({
        name: '',
        category: 'Pulsa',
        sku: `PRD-${Math.floor(100 + Math.random() * 900)}`,
        price: 12000,
        cost: 10250,
        stock: 999,
        minStock: 10,
        unit: 'Trx',
        isFuel: false,
      });
    } else if (type === 'ppob_range') {
      setPpobForm({
        name: '',
        provider: 'DANA',
        sku: `PPOB-${Math.floor(100 + Math.random() * 900)}`,
        adminRanges: [
          { min: 10000, max: 100000, fee: 2000 },
          { min: 100001, max: 250000, fee: 3000 },
          { min: 250001, max: 500000, fee: 4000 },
          { min: 500001, max: 1000000, fee: 5000 },
          { min: 1000001, max: 999999999, fee: 10000 },
        ],
      });
    } else if (type === 'ps') {
      setPsForm({
        unitName: '',
        psType: 'PS4',
        hourlyRate: 5000,
        halfHourlyRate: 3000,
      });
    }
    setIsAddModalOpen(true);
  };

  const handleEditProduct = (p: Product) => {
    setEditingProduct(p);
    setModalType('barang');
    setBarangForm({
      name: p.name,
      category: p.category,
      sku: p.sku || '',
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      minStock: p.minStock || 5,
      unit: p.unit || 'Pcs',
      isFuel: p.isFuel || false,
    });
    setIsAddModalOpen(true);
  };

  const handleEditPpob = (p: Product) => {
    setEditingProduct(p);
    setModalType('ppob_range');
    setPpobForm({
      name: p.name,
      provider: p.ppobProvider || 'DANA',
      sku: p.sku || '',
      adminRanges: getProductAdminRanges(p),
    });
    setIsAddModalOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center max-w-lg mx-auto space-y-4 my-10 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Akses Terbatas Khusus Admin</h2>
        <p className="text-xs text-slate-500">
          Akun Kasir hanya berfokus pada transaksi penjualan di kasir dan laporan. Pengelolaan Data Master Barang dan Layanan hanya dapat dilakukan oleh Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Data Master Usaha</h1>
          <p className="text-xs text-slate-500">
            Kelola 3 jenis input master: <b>Barang & Pulsa</b>, <b>PPOB Range (DANA/Transfer)</b>, dan <b>Rental PlayStation</b>.
          </p>
        </div>

        {/* Quick Add Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Scan Barcode & Voucher button in Data Master */}
          <button
            onClick={() => {
              setScannerContext('master_search');
              setIsScannerOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Scan Barcode produk atau Voucher Kuota dengan Kamera HP"
          >
            <ScanLine className="w-4 h-4" />
            <span>Scan Barcode / Voucher</span>
          </button>

          <button
            onClick={() => handleOpenAdd('barang')}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Barang / Pulsa</span>
          </button>

          <button
            onClick={handleOpenAddFuel}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Fuel className="w-4 h-4" />
            <span>+ Bensin / BBM (Liter)</span>
          </button>

          <button
            onClick={() => handleOpenAdd('ppob_range')}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ PPOB Range</span>
          </button>

          <button
            onClick={() => handleOpenAdd('ps')}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Unit PS</span>
          </button>
        </div>
      </div>

      {/* Scanner notification banner if active */}
      {scannerFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{scannerFeedback}</span>
          </div>
          <button
            onClick={() => setScannerFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[
            { id: 'all', label: 'Semua Master', icon: Layers },
            { id: 'barang', label: 'Barang, Pulsa & BBM', icon: Package },
            { id: 'ppob_range', label: 'PPOB Range (DANA/Transfer)', icon: Smartphone },
            { id: 'ps', label: 'Rental PlayStation', icon: Gamepad2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMasterTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMasterTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar with Scan Button parallel (consistent with Kasir) */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari data master (nama, SKU)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-teal-500"
            />
            {/* Shortcut camera inside search bar */}
            <button
              type="button"
              onClick={() => {
                setScannerContext('master_search');
                setIsScannerOpen(true);
              }}
              title="Buka kamera untuk scan Barcode atau Voucher"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 transition p-1 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setScannerContext('master_search');
              setIsScannerOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap cursor-pointer shrink-0"
            title="Scan Barcode produk atau Voucher Kuota dengan Kamera HP"
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scan (Kamera & AI)</span>
            <span className="sm:hidden">Scan</span>
          </button>
        </div>
      </div>

      {/* SUB-SECTION A: DAFTAR LAYANAN PPOB RANGE DENGAN ATURAN RANGE MANDIRI */}
      {(activeMasterTab === 'all' || activeMasterTab === 'ppob_range') && (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600" />
                Daftar Layanan PPOB Range (DANA, Transfer Bank, dll) & Aturan Range Mandiri
              </h3>
              <p className="text-[11px] text-slate-500">
                Setiap nama layanan menyimpan aturan rentang nominal (min - max) dan biaya admin tersendiri di Data Master.
              </p>
            </div>

            <button
              onClick={() => handleOpenAdd('ppob_range')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Layanan PPOB</span>
            </button>
          </div>

          {/* Cards of PPOB services with their configured ranges */}
          {products.filter(p => p.masterType === 'ppob_range' || p.category.toLowerCase().includes('ppob range')).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              Belum ada layanan PPOB Range. Klik tombol "+ Tambah Layanan PPOB" untuk menambahkan (misal DANA, Transfer Antar Bank).
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products
                .filter(p => p.masterType === 'ppob_range' || p.category.toLowerCase().includes('ppob range'))
                .map((p) => {
                  const ranges = getProductAdminRanges(p);
                  return (
                    <div
                      key={p.id}
                      className="border border-slate-200 bg-slate-50/50 rounded-2xl p-4 space-y-3 hover:border-blue-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                            {p.ppobProvider?.slice(0, 3).toUpperCase() || 'PPOB'}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                            <p className="text-[10px] text-slate-400 font-mono">
                              SKU: {p.sku || '-'} • Provider: {p.ppobProvider || 'E-Wallet'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleEditPpob(p)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                            title="Edit Aturan & Range"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => deleteProduct(p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Hapus Layanan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Display Range Tiers for this service */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
                        <div className="bg-slate-100/70 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                          <span>Rentang Nominal Transaksi</span>
                          <span>Biaya Admin</span>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto font-mono text-[11px]">
                          {ranges.map((r, i) => (
                            <div key={i} className="px-3 py-1.5 flex items-center justify-between">
                              <span className="text-slate-700">
                                {formatRupiah(r.min)} - {r.max > 100000000 ? 'Tak Terbatas' : formatRupiah(r.max)}
                              </span>
                              <span className="font-bold text-blue-700">
                                {formatRupiah(r.fee)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Total: <b>{ranges.length} rentang</b> admin</span>
                        <button
                          onClick={() => handleEditPpob(p)}
                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline"
                        >
                          Atur Ulang Range →
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* SUB-SECTION B: DATA MASTER BARANG, PULSA & PPOB */}
      {activeMasterTab !== 'ps' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-600" />
              Daftar Barang, Pulsa & Layanan PPOB ({filteredProducts.length})
            </h3>
            <span className="text-[11px] text-slate-400">
              Pulsa masuk ke barang dengan harga jual dan modal tetap
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Nama Item / Layanan</th>
                  <th className="px-4 py-3">Tipe / Kategori</th>
                  <th className="px-4 py-3">Harga Jual</th>
                  <th className="px-4 py-3">Harga Modal (HPP)</th>
                  <th className="px-4 py-3">Keuntungan (Margin)</th>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const isRange = p.masterType === 'ppob_range' || p.category.toLowerCase().includes('ppob range');
                  const isPulsa = p.category.toLowerCase().includes('pulsa');
                  const margin = p.price - p.cost;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{p.sku || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            isRange
                              ? 'bg-blue-100 text-blue-700'
                              : isPulsa
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-teal-700">
                        {isRange ? <span className="text-blue-700 font-bold">Nominal Fleksibel</span> : formatRupiah(p.price)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {isRange ? '-' : formatRupiah(p.cost)}
                      </td>
                      <td className="px-4 py-3">
                        {isRange ? (
                          <span className="text-blue-600 font-medium">+ Sesuai Tier Admin</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">+{formatRupiah(margin)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-700">
                        {isRange ? '∞' : `${p.stock} ${p.unit}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {isRange ? (
                            <button
                              onClick={() => handleEditPpob(p)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                              title="Edit Range & Layanan PPOB"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleEditProduct(p)}
                              className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                              title="Edit Barang / Pulsa"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => deleteProduct(p.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-SECTION C: DATA MASTER RENTAL PLAYSTATION */}
      {(activeMasterTab === 'all' || activeMasterTab === 'ps') && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-indigo-600" />
              Daftar Unit Rental PlayStation ({filteredPsStations.length})
            </h3>
            <button
              onClick={() => handleOpenAdd('ps')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Unit PS
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Nama Unit / Station</th>
                  <th className="px-4 py-3">Tipe Konsol</th>
                  <th className="px-4 py-3">Tarif per Jam</th>
                  <th className="px-4 py-3">Tarif 30 Menit</th>
                  <th className="px-4 py-3">Status Saat Ini</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPsStations.map((ps) => (
                  <tr key={ps.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-bold text-slate-800">{ps.unitName}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-100 text-indigo-700">
                        {ps.psType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-indigo-900">{formatRupiah(ps.hourlyRate || 5000)} / jam</td>
                    <td className="px-4 py-3 font-bold text-teal-800">{formatRupiah(ps.halfHourlyRate || 3000)} / 30 mnt</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ps.status === 'in_use' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ps.status === 'in_use' ? 'Sedang Main' : 'Tersedia'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleEditPs(ps)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                          title="Edit Tarif & Nama Unit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => deletePsUnit(ps.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                            title="Hapus Unit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT DATA MASTER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className={`bg-white rounded-3xl ${modalType === 'ppob_range' ? 'max-w-xl' : 'max-w-md'} w-full shadow-2xl overflow-hidden my-auto animate-in zoom-in-95`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">
                  {modalType === 'barang'
                    ? editingProduct
                      ? 'Edit Barang / Pulsa'
                      : 'Tambah Barang & Pulsa'
                    : modalType === 'ppob_range'
                    ? editingProduct
                      ? `Edit Layanan PPOB: ${editingProduct.name}`
                      : 'Tambah Layanan PPOB Baru'
                    : editingPsUnit
                    ? `Edit Unit: ${editingPsUnit.unitName}`
                    : 'Tambah Unit Rental PS'}
                </h3>
                <p className="text-[11px] text-slate-400">Master Data Usaha</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TAB SELECTOR DALAM MODAL */}
            {!editingProduct && (
              <div className="flex border-b border-slate-100 text-xs font-bold bg-slate-50">
                <button
                  type="button"
                  onClick={() => setModalType('barang')}
                  className={`flex-1 py-2.5 text-center transition ${
                    modalType === 'barang' ? 'bg-white text-teal-700 border-b-2 border-teal-600' : 'text-slate-500'
                  }`}
                >
                  Barang & Pulsa
                </button>
                <button
                  type="button"
                  onClick={() => setModalType('ppob_range')}
                  className={`flex-1 py-2.5 text-center transition ${
                    modalType === 'ppob_range' ? 'bg-white text-blue-700 border-b-2 border-blue-600' : 'text-slate-500'
                  }`}
                >
                  PPOB Range
                </button>
                <button
                  type="button"
                  onClick={() => setModalType('ps')}
                  className={`flex-1 py-2.5 text-center transition ${
                    modalType === 'ps' ? 'bg-white text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500'
                  }`}
                >
                  Rental PS
                </button>
              </div>
            )}

            {/* FORM 1: BARANG & PULSA */}
            {modalType === 'barang' && (
              <form onSubmit={handleSaveBarang} className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Nama Barang / Pulsa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Pulsa Telkomsel 10rb / Beras 5kg"
                    value={barangForm.name}
                    onChange={(e) => setBarangForm({ ...barangForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Kategori</label>
                    <select
                      value={barangForm.category}
                      onChange={(e) => setBarangForm({ ...barangForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 text-xs"
                    >
                      <option value="Pulsa">Pulsa & Data (Fixed)</option>
                      <option value="BBM">BBM (Bahan Bakar)</option>
                      <option value="Sembako">Sembako</option>
                      <option value="Makanan">Makanan</option>
                      <option value="Minuman">Minuman</option>
                      <option value="Snack">Snack</option>
                      <option value="Lainnya">Lain-lain</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-600 font-medium">Kode Barcode / SKU / QR</label>
                      <button
                        type="button"
                        onClick={() => {
                          setScannerContext('master_form');
                          setIsScannerOpen(true);
                        }}
                        className="text-[11px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 hover:underline cursor-pointer"
                        title="Scan Barcode fisik atau Voucher Kuota dengan kamera hp"
                      >
                        <ScanLine className="w-3 h-3 text-teal-600" />
                        <span>Scan Kamera HP</span>
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="Contoh: 89910010010 atau PLS-10"
                        value={barangForm.sku}
                        onChange={(e) => setBarangForm({ ...barangForm, sku: e.target.value })}
                        className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setScannerContext('master_form');
                          setIsScannerOpen(true);
                        }}
                        title="Buka Kamera untuk scan Barcode atau Voucher"
                        className="absolute right-2 p-1.5 text-slate-400 hover:text-teal-600 transition rounded-lg hover:bg-slate-200/60 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Harga Jual (Rp) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatNumberWithDots(barangForm.price)}
                      onChange={(e) => setBarangForm({ ...barangForm, price: parseNumberFromDots(e.target.value) })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-extrabold text-teal-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Harga Modal / Beli (HPP) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatNumberWithDots(barangForm.cost)}
                      onChange={(e) => setBarangForm({ ...barangForm, cost: parseNumberFromDots(e.target.value) })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-extrabold text-slate-700"
                    />
                  </div>
                </div>

                <div className="p-3 bg-teal-50 rounded-xl border border-teal-100 flex items-center justify-between">
                  <span className="text-teal-900 font-medium">Keuntungan (Margin):</span>
                  <span className="font-bold text-teal-800 text-sm">
                    +{formatRupiah(Math.max(0, barangForm.price - barangForm.cost))}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Stok Awal</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberWithDots(barangForm.stock)}
                      onChange={(e) => setBarangForm({ ...barangForm, stock: parseNumberFromDots(e.target.value) })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Satuan</label>
                    <input
                      type="text"
                      placeholder="Trx / Pcs / Liter"
                      value={barangForm.unit}
                      onChange={(e) => setBarangForm({ ...barangForm, unit: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition"
                  >
                    Simpan Barang / Pulsa
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {/* FORM 2: PPOB RANGE (DANA, GOPAY, TRANSFER - DENGAN RANGE MANDIRI PER LAYANAN) */}
            {modalType === 'ppob_range' && (
              <form onSubmit={handleSavePpob} className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Nama Layanan E-Wallet / Transfer *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: DANA / Transfer Antar Bank / GoPay / OVO"
                    value={ppobForm.name}
                    onChange={(e) => setPpobForm({ ...ppobForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Cukup satu nama layanan (misal "DANA"). Kasir bisa mengetik nominal berapapun saat transaksi.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Provider Layanan</label>
                    <select
                      value={ppobForm.provider}
                      onChange={(e) => setPpobForm({ ...ppobForm, provider: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 text-xs font-semibold"
                    >
                      <option value="DANA">DANA (E-Wallet)</option>
                      <option value="Bank Transfer">Transfer Uang Antar Bank</option>
                      <option value="GoPay">GoPay (E-Wallet)</option>
                      <option value="OVO">OVO (E-Wallet)</option>
                      <option value="ShopeePay">ShopeePay</option>
                      <option value="LinkAja">LinkAja</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Kode SKU</label>
                    <input
                      type="text"
                      placeholder="PPOB-DANA"
                      value={ppobForm.sku}
                      onChange={(e) => setPpobForm({ ...ppobForm, sku: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* TEMPLATE CEPAT */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-700 font-bold">
                      Aturan Rentang Nominal & Biaya Admin *
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPpobForm({
                          ...ppobForm,
                          adminRanges: [...DEFAULT_DANA_RANGES],
                        })
                      }
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 transition cursor-pointer"
                    >
                      ⚡ Template E-Wallet (2rb - 10rb)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPpobForm({
                          ...ppobForm,
                          adminRanges: [...DEFAULT_TRANSFER_RANGES],
                        })
                      }
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 transition cursor-pointer"
                    >
                      ⚡ Template Transfer Bank (2.5rb - 12rb)
                    </button>
                  </div>
                </div>

                {/* TABEL RENTANG NOMINAL MIN, MAX & ADMIN FEE */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider grid grid-cols-12 gap-2">
                    <span className="col-span-4">Nominal Min (Rp)</span>
                    <span className="col-span-4">Nominal Max (Rp)</span>
                    <span className="col-span-3 text-right">Biaya Admin (Rp)</span>
                    <span className="col-span-1 text-center">Aksi</span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto p-1 space-y-1">
                    {ppobForm.adminRanges.map((r, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center px-2 py-1">
                        <div className="col-span-4">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={r.min}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPpobForm((prev) => ({
                                ...prev,
                                adminRanges: prev.adminRanges.map((item, i) =>
                                  i === idx ? { ...item, min: val } : item
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                          />
                        </div>

                        <div className="col-span-4">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={r.max}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPpobForm((prev) => ({
                                ...prev,
                                adminRanges: prev.adminRanges.map((item, i) =>
                                  i === idx ? { ...item, max: val } : item
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                          />
                        </div>

                        <div className="col-span-3">
                          <input
                            type="number"
                            min="0"
                            step="500"
                            required
                            value={r.fee}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPpobForm((prev) => ({
                                ...prev,
                                adminRanges: prev.adminRanges.map((item, i) =>
                                  i === idx ? { ...item, fee: val } : item
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-extrabold text-blue-700 text-right"
                          />
                        </div>

                        <div className="col-span-1 flex justify-center">
                          {ppobForm.adminRanges.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPpobForm((prev) => ({
                                  ...prev,
                                  adminRanges: prev.adminRanges.filter((_, i) => i !== idx),
                                }));
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Hapus baris range"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const last = ppobForm.adminRanges[ppobForm.adminRanges.length - 1];
                        const nextMin = last ? last.max + 1 : 10000;
                        const nextMax = nextMin + 100000;
                        const nextFee = last ? last.fee + 1000 : 2000;
                        setPpobForm((prev) => ({
                          ...prev,
                          adminRanges: [...prev.adminRanges, { min: nextMin, max: nextMax, fee: nextFee }],
                        }));
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Tambah Baris Range</span>
                    </button>

                    <span className="text-[10px] text-slate-400">
                      {ppobForm.adminRanges.length} rentang terdaftar
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 text-blue-900 rounded-xl text-xs space-y-1 border border-blue-100">
                  <p className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    Otomatisasi Kasir:
                  </p>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Saat layanan <b>"{ppobForm.name || 'PPOB'}"</b> dipilih di kasir, nominal berapapun yang ditulis akan otomatis memunculkan biaya admin sesuai tabel di atas.
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-xs cursor-pointer"
                  >
                    {editingProduct ? 'Perbarui Layanan PPOB' : 'Simpan Layanan PPOB'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingProduct(null);
                    }}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {/* FORM 3: RENTAL PLAYSTATION */}
            {modalType === 'ps' && (
              <form onSubmit={handleSavePs} className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Nama Unit / Station PS *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PS 5 (VIP Room)"
                    value={psForm.unitName}
                    onChange={(e) => setPsForm({ ...psForm, unitName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Tipe Konsol</label>
                  <select
                    value={psForm.psType}
                    onChange={(e) => setPsForm({ ...psForm, psType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 text-xs"
                  >
                    <option value="PS4">PlayStation 4 (PS4)</option>
                    <option value="PS5">PlayStation 5 (PS5)</option>
                    <option value="PS3">PlayStation 3 (PS3)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Tarif per Jam (Rp) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1000"
                      step="500"
                      value={psForm.hourlyRate}
                      onChange={(e) => setPsForm({ ...psForm, hourlyRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 font-extrabold text-indigo-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Tarif 30 Menit (Rp) *
                    </label>
                    <input
                      type="number"
                      required
                      min="500"
                      step="500"
                      value={psForm.halfHourlyRate}
                      onChange={(e) => setPsForm({ ...psForm, halfHourlyRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 font-extrabold text-indigo-900"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-indigo-50 text-indigo-900 rounded-xl text-[11px] border border-indigo-100">
                  💡 <b>Setting Fleksibel:</b> Tarif 1 jam (misal Rp 5.000) dan tarif 30 menit (misal Rp 3.000) akan menjadi acuan hitung otomatis saat mulai main atau tambah waktu.
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-xs cursor-pointer"
                  >
                    {editingPsUnit ? 'Perbarui Unit PS' : 'Simpan Unit PS'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingPsUnit(null);
                    }}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Scanner Modal for Data Master (AI Vision Voucher & Barcode / QR) */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        sourceContext={scannerContext}
        title={scannerContext === 'master_form' ? 'Scan Barcode / Voucher ke Form Master' : 'Scan & Cari di Data Master'}
        subtitle={
          scannerContext === 'master_form'
            ? 'Arahkan kamera ke barcode produk atau foto voucher untuk otomatis mengisi form'
            : 'Scan barcode produk fisik atau voucher kuota untuk mengecek dan mengelola di Data Master'
        }
        onSelectProduct={handleScannerSelectProduct}
        onApplySearchQuery={(q) => {
          setSearchQuery(q);
          setScannerFeedback(`Memfilter data master dengan pencarian: "${q}"`);
          setTimeout(() => setScannerFeedback(null), 4000);
        }}
        onScannedBarcode={handleScannerBarcode}
        onScannedVoucherInfo={handleScannerVoucherInfo}
      />
    </div>
  );
};
