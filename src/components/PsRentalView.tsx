import React, { useState, useEffect, useMemo } from 'react';
import { 
  Gamepad2, 
  Play, 
  Square, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  User, 
  Coins, 
  AlertCircle,
  X,
  Timer,
  Hourglass,
  Sliders,
  History,
  Search,
  Sparkles,
  Phone,
  Flame,
  ArrowRight,
  BookmarkPlus,
  RefreshCw,
  Edit3,
  RotateCcw
} from 'lucide-react';
import { useData, calculatePsRentalCost } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PsRental, PsSavedTime } from '../types';
import { formatRupiah, formatTime } from '../utils/formatters';

export const PsRentalView: React.FC = () => {
  const { 
    psRentals, 
    psSavedTimes,
    startPsRental, 
    stopPsRental, 
    addPsPlayTime,
    setPsManualTime,
    savePsRemainingTime,
    usePsSavedTime,
    deletePsSavedTime,
    addPsSavedTimeManual,
    addPsUnit, 
    updatePsUnit,
    deletePsUnit 
  } = useData();

  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Live timer tick every second for real-time countdown & auto-stop when time is up
  const [, setTick] = useState(0);
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      setTick((t) => t + 1);

      psRentals.forEach((unit) => {
        if (unit.status === 'in_use' && unit.expectedEndTime) {
          const endMs = new Date(unit.expectedEndTime).getTime();
          const diffMs = endMs - Date.now();
          if (diffMs <= 0) {
            const sessionKey = `autostop_${unit.id}_${unit.startTime}`;
            if (!sessionStorage.getItem(sessionKey)) {
              sessionStorage.setItem(sessionKey, 'true');
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification('Waktu Rental PS Habis!', {
                    body: `Unit ${unit.unitName} (${unit.customerName || 'Pemain'}) telah selesai otomatis dan disimpan.`,
                  });
                } catch (e) {
                  console.error(e);
                }
              }
              stopPsRental(unit.id, true).catch((err) => console.error('Auto stop error:', err));
            }
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [psRentals]);

  // Main navigation tab: 'stations' | 'saved_times'
  const [activeTab, setActiveTab] = useState<'stations' | 'saved_times'>('stations');
  const [savedTimeSearch, setSavedTimeSearch] = useState('');

  // Modals state
  const [startModalUnit, setStartModalUnit] = useState<PsRental | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60); // 30, 60, 90, 120, or custom, 0 = open billing
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('45');
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [selectedSavedTimeToUse, setSelectedSavedTimeToUse] = useState<PsSavedTime | null>(null);

  // Extend Playing Time Modal (+ Tambah Jam Main)
  const [extendModalUnit, setExtendModalUnit] = useState<PsRental | null>(null);
  const [extendMinutes, setExtendMinutes] = useState<number>(30); // 30, 60, 120, or custom
  const [isCustomExtend, setIsCustomExtend] = useState(false);
  const [customExtendInput, setCustomExtendInput] = useState<string>('15');
  const [customExtendCost, setCustomExtendCost] = useState<number | ''>('');
  const [extendNotes, setExtendNotes] = useState('');

  // Save Remaining Time Modal (Simpan Sisa Waktu)
  const [saveTimeModalUnit, setSaveTimeModalUnit] = useState<PsRental | null>(null);
  const [saveTimeCustomer, setSaveTimeCustomer] = useState('');
  const [saveTimeMinutes, setSaveTimeMinutes] = useState<number>(15);
  const [saveTimeNotes, setSaveTimeNotes] = useState('');

  // Apply Saved Time to Unit Modal
  const [applySavedTimeItem, setApplySavedTimeItem] = useState<PsSavedTime | null>(null);
  const [targetUnitId, setTargetUnitId] = useState<string>('');

  // Add Manual Saved Time for Customer Modal
  const [addSavedTimeModal, setAddSavedTimeModal] = useState(false);
  const [newSavedCustomer, setNewSavedCustomer] = useState('');
  const [newSavedPhone, setNewSavedPhone] = useState('');
  const [newSavedMinutes, setNewSavedMinutes] = useState<number>(30);
  const [newSavedNotes, setNewSavedNotes] = useState('');

  // Add / Edit Station Modal
  const [unitModal, setUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<PsRental | null>(null);
  const [unitForm, setUnitForm] = useState({
    unitName: '',
    psType: 'PS4' as 'PS3' | 'PS4' | 'PS5',
    hourlyRate: 5000,
    halfHourlyRate: 3000,
  });

  // Active saved times count
  const activeSavedTimes = useMemo(() => {
    return psSavedTimes.filter((s) => s.status === 'active');
  }, [psSavedTimes]);

  const filteredSavedTimes = useMemo(() => {
    if (!savedTimeSearch.trim()) return activeSavedTimes;
    const q = savedTimeSearch.toLowerCase().trim();
    return activeSavedTimes.filter(
      (s) =>
        s.customerName.toLowerCase().includes(q) ||
        s.customerPhone?.toLowerCase().includes(q) ||
        s.savedFromUnitName?.toLowerCase().includes(q) ||
        s.notes?.toLowerCase().includes(q)
    );
  }, [activeSavedTimes, savedTimeSearch]);

  const availableUnits = useMemo(() => {
    return psRentals.filter((u) => u.status === 'available');
  }, [psRentals]);

  // Helper to calculate remaining or elapsed time and cost
  const getRentalTimerInfo = (unit: PsRental) => {
    if (!unit.startTime) return null;
    const nowMs = Date.now();

    // If unit has an expectedEndTime (Paket Waktu Tertentu)
    if (unit.expectedEndTime) {
      const endMs = new Date(unit.expectedEndTime).getTime();
      const diffMs = endMs - nowMs;
      const isOvertime = diffMs <= 0;
      const absMs = Math.abs(diffMs);

      const hours = Math.floor(absMs / 3600000);
      const minutes = Math.floor((absMs % 3600000) / 60000);
      const seconds = Math.floor((absMs % 60000) / 1000);

      const timeFormatted = `${hours > 0 ? `${hours}j ` : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}d`;
      const exactRemainingMinutes = Math.max(0, Math.ceil(diffMs / 60000));

      return {
        isOvertime,
        exactRemainingMinutes,
        timeString: isOvertime ? `WAKTU HABIS (+${timeFormatted})` : `Sisa Waktu: ${timeFormatted}`,
        cost: unit.totalCost || calculatePsRentalCost(unit, unit.durationMinutes || 60),
        isOpenBilling: false,
      };
    } else {
      // Khusus Open Billing: per jam dibagi 60 menit (hitung per menit berjalan)
      const startMs = new Date(unit.startTime).getTime();
      const elapsedMs = Math.max(0, nowMs - startMs);

      const hours = Math.floor(elapsedMs / 3600000);
      const minutes = Math.floor((elapsedMs % 3600000) / 60000);
      const seconds = Math.floor((elapsedMs % 60000) / 1000);

      const elapsedMinutes = Math.max(1, Math.ceil(elapsedMs / 60000));
      const ratePerHour = unit.hourlyRate || 5000;
      const ratePerMinute = ratePerHour / 60;
      const cost = Math.round(elapsedMinutes * ratePerMinute);

      const timeFormatted = `${hours > 0 ? `${hours}j ` : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}d`;

      return {
        isOvertime: false,
        exactRemainingMinutes: 0,
        timeString: `OPEN BILLING: ${timeFormatted}`,
        cost,
        isOpenBilling: true,
        elapsedMinutes,
        ratePerHour,
        ratePerMinute,
      };
    }
  };

  // Handlers: Start Session
  const handleOpenStart = (unit: PsRental) => {
    setStartModalUnit(unit);
    setCustomerName('');
    setCustomerPhone('');
    setDurationMinutes(60);
    setIsCustomDuration(false);
    setSelectedSavedTimeToUse(null);
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startModalUnit) return;

    let finalMinutes = durationMinutes;
    let customCost: number | undefined = undefined;

    if (selectedSavedTimeToUse) {
      finalMinutes = selectedSavedTimeToUse.remainingMinutes;
      customCost = 0; // Free because it was paid previously
    } else if (isCustomDuration) {
      finalMinutes = Math.max(1, Number(customMinutesInput) || 30);
    }

    await startPsRental(
      startModalUnit.id,
      customerName.trim() || 'Pemain PS',
      finalMinutes,
      customCost,
      selectedSavedTimeToUse ? `Pakai Sisa Waktu (${selectedSavedTimeToUse.remainingMinutes} Menit)` : '',
      selectedSavedTimeToUse?.id
    );

    setStartModalUnit(null);
  };

  // Handlers: Extend Playing Time (+ Tambah Jam Main)
  const handleOpenExtend = (unit: PsRental) => {
    setExtendModalUnit(unit);
    setExtendMinutes(30);
    setIsCustomExtend(false);
    setCustomExtendInput('15');
    setCustomExtendCost('');
    setExtendNotes('');
  };

  const handleSaveExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendModalUnit) return;

    const addedMin = isCustomExtend
      ? Math.max(1, Number(customExtendInput) || 15)
      : extendMinutes;

    const overrideCost = customExtendCost !== '' ? Number(customExtendCost) : undefined;

    await addPsPlayTime(extendModalUnit.id, addedMin, overrideCost, extendNotes.trim());
    setExtendModalUnit(null);
  };

  // Handlers: Save Remaining Time (Simpan Sisa Waktu)
  const handleOpenSaveRemaining = (unit: PsRental) => {
    setSaveTimeModalUnit(unit);
    const timerInfo = getRentalTimerInfo(unit);
    const remMin = timerInfo ? Math.max(1, timerInfo.exactRemainingMinutes) : 15;
    setSaveTimeMinutes(remMin);
    // Kosongkan nama jika masih default 'Pemain' agar kasir mengisi nama pelanggan sebenarnya (contoh: Budi)
    const existingName = (unit.customerName && unit.customerName !== 'Pemain' && unit.customerName !== 'Pemain PS') 
      ? unit.customerName 
      : '';
    setSaveTimeCustomer(existingName);
    setSaveTimeNotes(`Simpan sisa waktu dari ${unit.unitName}`);
  };

  const handleConfirmSaveRemaining = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTimeModalUnit) return;

    await savePsRemainingTime(
      saveTimeModalUnit.id,
      saveTimeCustomer.trim() || 'Pemain PS',
      saveTimeMinutes,
      saveTimeNotes.trim()
    );

    setSaveTimeModalUnit(null);
  };

  // Handlers: Apply Saved Time to an Available Unit
  const handleOpenApplySavedTime = (savedItem: PsSavedTime) => {
    setApplySavedTimeItem(savedItem);
    if (availableUnits.length > 0) {
      setTargetUnitId(availableUnits[0].id);
    } else {
      setTargetUnitId('');
    }
  };

  const handleConfirmApplySavedTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applySavedTimeItem || !targetUnitId) return;

    await usePsSavedTime(applySavedTimeItem.id, targetUnitId);
    setApplySavedTimeItem(null);
    setActiveTab('stations');
  };

  // Handlers: Add Manual Saved Time
  const handleSaveManualSavedTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSavedCustomer.trim() || newSavedMinutes <= 0) return;

    await addPsSavedTimeManual(
      newSavedCustomer.trim(),
      newSavedMinutes,
      newSavedNotes.trim(),
      newSavedPhone.trim()
    );

    setAddSavedTimeModal(false);
    setNewSavedCustomer('');
    setNewSavedPhone('');
    setNewSavedMinutes(30);
    setNewSavedNotes('');
  };

  // Handlers: Unit Master Add / Edit
  const handleOpenUnitModal = (unitToEdit?: PsRental) => {
    if (unitToEdit) {
      setEditingUnit(unitToEdit);
      setUnitForm({
        unitName: unitToEdit.unitName,
        psType: unitToEdit.psType,
        hourlyRate: unitToEdit.hourlyRate || 5000,
        halfHourlyRate: unitToEdit.halfHourlyRate || 3000,
      });
    } else {
      setEditingUnit(null);
      setUnitForm({
        unitName: `PS ${psRentals.length + 1} (PS4)`,
        psType: 'PS4',
        hourlyRate: 5000,
        halfHourlyRate: 3000,
      });
    }
    setUnitModal(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitForm.unitName.trim()) return;

    if (editingUnit) {
      await updatePsUnit(editingUnit.id, {
        unitName: unitForm.unitName.trim(),
        psType: unitForm.psType,
        hourlyRate: Number(unitForm.hourlyRate) || 5000,
        halfHourlyRate: Number(unitForm.halfHourlyRate) || 3000,
      });
    } else {
      await addPsUnit({
        unitName: unitForm.unitName.trim(),
        psType: unitForm.psType,
        hourlyRate: Number(unitForm.hourlyRate) || 5000,
        halfHourlyRate: Number(unitForm.halfHourlyRate) || 3000,
      });
    }

    setUnitModal(false);
    setEditingUnit(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Realtime Cloud Sync Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Gamepad2 className="w-6 h-6 text-indigo-600" />
              Rental PlayStation Realtime
            </h1>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Tersinkron Firebase
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Billing paket 30 menit & per jam, tambah jam otomatis, simpan sisa waktu pelanggan, dan kontrol waktu manual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenUnitModal()}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Unit PS</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 text-xs">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('stations')}
            className={`flex items-center gap-2 px-4 py-2.5 font-extrabold border-b-2 transition cursor-pointer ${
              activeTab === 'stations'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Unit Station PS ({psRentals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('saved_times')}
            className={`flex items-center gap-2 px-4 py-2.5 font-extrabold border-b-2 transition cursor-pointer ${
              activeTab === 'saved_times'
                ? 'border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Tabungan Sisa Waktu Pelanggan</span>
            {activeSavedTimes.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-600 text-white">
                {activeSavedTimes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: UNIT STATION PLAYSTATION                              */}
      {/* ============================================================ */}
      {activeTab === 'stations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {psRentals.map((unit) => {
              const isPlaying = unit.status === 'in_use';
              const timerInfo = isPlaying ? getRentalTimerInfo(unit) : null;
              const hourly = unit.hourlyRate || 5000;
              const halfHourly = unit.halfHourlyRate || 3000;

              return (
                <div
                  key={unit.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between transition shadow-xs ${
                    isPlaying
                      ? timerInfo?.isOvertime
                        ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-400'
                        : 'bg-white border-indigo-200 ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Top Console Type & Status Badge */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 rounded-md font-extrabold text-[10px] uppercase tracking-wider ${
                          unit.psType === 'PS5'
                            ? 'bg-purple-100 text-purple-700'
                            : unit.psType === 'PS4'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {unit.psType}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          isPlaying
                            ? timerInfo?.isOvertime
                              ? 'bg-rose-600 text-white animate-pulse'
                              : 'bg-indigo-600 text-white'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isPlaying ? (
                          timerInfo?.isOvertime ? 'WAKTU HABIS' : 'SEDANG MAIN'
                        ) : (
                          'TERSEDIA'
                        )}
                      </span>
                    </div>

                    {/* Station Name & Edit Button */}
                    <h3 className="font-extrabold text-slate-900 text-base mt-2 flex items-center justify-between">
                      <span>{unit.unitName}</span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenUnitModal(unit)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition"
                          title="Edit Tarif & Unit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && !isPlaying && (
                          <button
                            onClick={() => deletePsUnit(unit.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                            title="Hapus Unit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </h3>

                    {/* Master Tarif Display */}
                    <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2 font-medium">
                      <span>
                        1 Jam: <b className="text-indigo-700 font-bold">{formatRupiah(hourly)}</b>
                      </span>
                      <span>•</span>
                      <span>
                        30 Mnt: <b className="text-teal-700 font-bold">{formatRupiah(halfHourly)}</b>
                      </span>
                    </div>

                    {/* Active Playing Info Box */}
                    {isPlaying && timerInfo ? (
                      <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1 font-medium">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            Penyewa:
                          </span>
                          <span className="font-bold text-slate-900">{unit.customerName || 'Pemain'}</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Mulai:
                          </span>
                          <span className="font-mono text-slate-700">
                            {unit.startTime ? formatTime(unit.startTime) : '-'}
                          </span>
                        </div>

                        {/* Live Timer Countdown Badge */}
                        {/* Live Timer Countdown or Open Billing Badge */}
                        <div
                          className={`py-2 px-2.5 rounded-xl text-center font-mono font-extrabold text-xs shadow-xs ${
                            timerInfo.isOpenBilling
                              ? 'bg-amber-500 text-white shadow-amber-500/20'
                              : timerInfo.isOvertime
                              ? 'bg-rose-600 text-white animate-bounce shadow-rose-600/20'
                              : 'bg-indigo-600 text-white shadow-indigo-600/20'
                          }`}
                        >
                          {timerInfo.timeString}
                        </div>

                        {/* Total Cost Display (Biaya Berjalan untuk Open Billing) */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                          <span className="text-slate-600 font-semibold">
                            {timerInfo.isOpenBilling ? (
                              <span className="text-amber-800 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Tagihan Berjalan:
                              </span>
                            ) : (
                              'Total Tagihan:'
                            )}
                          </span>
                          <div className="text-right">
                            <span className={`font-extrabold text-sm ${timerInfo.isOpenBilling ? 'text-amber-700' : 'text-indigo-700'}`}>
                              {formatRupiah(timerInfo.cost)}
                            </span>
                            {timerInfo.isOpenBilling && (
                              <div className="text-[10px] text-amber-700 font-medium">
                                ({timerInfo.elapsedMinutes} mnt × {formatRupiah(Math.round(timerInfo.ratePerMinute || 83))}/mnt)
                              </div>
                            )}
                          </div>
                        </div>

                        {unit.notes && (
                          <p className="text-[10px] text-slate-500 italic bg-white p-1.5 rounded-lg border border-slate-100">
                            {unit.notes}
                          </p>
                        )}

                        {/* QUICK ACTION BUTTONS SAAT MAIN */}
                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                          {/* 1. Tambah Jam / Waktu Main */}
                          <button
                            type="button"
                            onClick={() => handleOpenExtend(unit)}
                            className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>+ Tambah Jam / Waktu</span>
                          </button>

                          {/* 2. Simpan Sisa Waktu (Pelanggan pulang lebih awal) */}
                          {!timerInfo.isOpenBilling && (
                            <button
                              type="button"
                              onClick={() => handleOpenSaveRemaining(unit)}
                              className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                              title="Simpan sisa waktu untuk main di kemudian hari"
                            >
                              <BookmarkPlus className="w-3.5 h-3.5 text-teal-600" />
                              <span>Simpan Sisa Waktu (Pulang Awal)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-5 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs space-y-1">
                        <Gamepad2 className="w-6 h-6 mx-auto text-slate-300" />
                        <p className="font-medium">Unit ini siap disewakan</p>
                      </div>
                    )}
                  </div>

                  {/* Station Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    {isPlaying ? (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await stopPsRental(unit.id, true);
                            } catch (err: any) {
                              console.error('Stop rental error:', err);
                              alert('Gagal menyelesaikan rental: ' + (err.message || err));
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition active:scale-95 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Selesai & Bayar</span>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Batalkan sesi rental di ${unit.unitName} (Reset tanpa simpan pembayaran)?`)) {
                              stopPsRental(unit.id, false);
                            }
                          }}
                          className="px-3 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                          title="Batal / Reset Sesi (Tanpa Simpan Transaksi)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Batal</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenStart(unit)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition active:scale-95 shadow-xs cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Mulai Rental</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: TABUNGAN SISA WAKTU PELANGGAN                         */}
      {/* ============================================================ */}
      {activeTab === 'saved_times' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-teal-600" />
                Daftar Tabungan Sisa Waktu Pelanggan ({filteredSavedTimes.length})
              </h3>
              <p className="text-xs text-slate-500">
                Pelanggan yang berhenti lebih awal dapat melanjutkan sisa waktunya di kemudian hari.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Cari nama pelanggan..."
                  value={savedTimeSearch}
                  onChange={(e) => setSavedTimeSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {filteredSavedTimes.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 space-y-2">
              <History className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-bold text-slate-600">Belum Ada Tabungan Sisa Waktu Tersimpan</p>
              <p>
                Ketika ada pelanggan seperti <b>Budi</b> yang berhenti main sebelum waktunya habis, klik tombol{' '}
                <span className="text-teal-700 font-bold">"Simpan Sisa Waktu"</span> pada unit PS-nya.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSavedTimes.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl border border-teal-200/80 shadow-xs space-y-3 relative hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-100 text-teal-800">
                        {item.psType || 'PS4'} • {item.savedFromUnitName || 'Unit PS'}
                      </span>
                      <h4 className="font-extrabold text-slate-900 text-base mt-1">
                        {item.customerName}
                      </h4>
                      {item.customerPhone && (
                        <p className="text-[11px] text-slate-500 font-medium">{item.customerPhone}</p>
                      )}
                    </div>

                    <button
                      onClick={() => deletePsSavedTime(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Hapus Tabungan Sisa Waktu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Sisa Menit Box */}
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                        Sisa Waktu Tersimpan
                      </span>
                      <div className="text-xl font-black text-teal-900 font-mono">
                        {item.remainingMinutes} <span className="text-xs font-normal">Menit</span>
                      </div>
                    </div>

                    <span className="text-2xl">⏱️</span>
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      {item.notes}
                    </p>
                  )}

                  <div className="text-[10px] text-slate-400">
                    Disimpan: {new Date(item.savedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* Button Gunakan Sisa Waktu */}
                  <button
                    onClick={() => handleOpenApplySavedTime(item)}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-98 cursor-pointer"
                  >
                    <span>Gunakan Main Sekarang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: MULAI RENTAL DENGAN PAKET 30 MNT / PER JAM         */}
      {/* ============================================================ */}
      {startModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Mulai Sesi Rental PS</h3>
                <p className="text-slate-500">
                  {startModalUnit.unitName} • 1 Jam: {formatRupiah(startModalUnit.hourlyRate || 5000)} | 30 Mnt: {formatRupiah(startModalUnit.halfHourlyRate || 3000)}
                </p>
              </div>
              <button
                onClick={() => setStartModalUnit(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartSession} className="space-y-4">
              {/* Opsi Gunakan Tabungan Sisa Waktu jika Ada */}
              {activeSavedTimes.length > 0 && !selectedSavedTimeToUse && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-teal-900 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      Gunakan Sisa Waktu Pelanggan?
                    </span>
                    <span className="text-[10px] text-teal-700 font-bold">{activeSavedTimes.length} Pelanggan</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSavedTimes.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setSelectedSavedTimeToUse(st);
                          setCustomerName(st.customerName);
                          setDurationMinutes(st.remainingMinutes);
                          setIsCustomDuration(false);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-teal-100 border border-teal-300 rounded-lg text-[11px] font-bold text-teal-900 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{st.customerName}</span>
                        <span className="text-teal-600">({st.remainingMinutes} mnt)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Jika Sedang Menggunakan Sisa Waktu */}
              {selectedSavedTimeToUse && (
                <div className="p-3 bg-teal-600 text-white rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold opacity-80">Menggunakan Sisa Waktu:</span>
                    <h4 className="font-black text-sm">{selectedSavedTimeToUse.customerName} ({selectedSavedTimeToUse.remainingMinutes} Menit)</h4>
                    <p className="text-[10px] opacity-90">Gratis (Biaya Rp 0 karena sisa waktu sebelumnya)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSavedTimeToUse(null)}
                    className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold"
                  >
                    Batal
                  </button>
                </div>
              )}

              {/* Nama Pelanggan (Opsional / Tidak Perlu di Awal) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 font-bold">
                    Nama Penyewa <span className="text-slate-400 font-normal text-[11px]">(Opsional / Tidak Wajib di Awal)</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">
                    Diisi nanti saat minta sisa waktu
                  </span>
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Bisa dikosongkan (otomatis 'Pemain') atau isi jika ada nama..."
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-semibold placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Pilihan Paket Durasi Bermain */}
              {!selectedSavedTimeToUse && (
                <div className="space-y-2">
                  <label className="block text-slate-700 font-bold">
                    Pilih Paket Durasi Sewa
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {/* Paket 30 Menit */}
                    <button
                      type="button"
                      onClick={() => {
                        setDurationMinutes(30);
                        setIsCustomDuration(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        durationMinutes === 30 && !isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">30 Menit</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatRupiah(startModalUnit.halfHourlyRate || 3000)}
                      </div>
                    </button>

                    {/* Paket 1 Jam */}
                    <button
                      type="button"
                      onClick={() => {
                        setDurationMinutes(60);
                        setIsCustomDuration(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        durationMinutes === 60 && !isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">1 Jam</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatRupiah(startModalUnit.hourlyRate || 5000)}
                      </div>
                    </button>

                    {/* Paket 1.5 Jam (1 Jam 30 Mnt) */}
                    <button
                      type="button"
                      onClick={() => {
                        setDurationMinutes(90);
                        setIsCustomDuration(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        durationMinutes === 90 && !isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">1.5 Jam</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatRupiah((startModalUnit.hourlyRate || 5000) + (startModalUnit.halfHourlyRate || 3000))}
                      </div>
                    </button>

                    {/* Paket 2 Jam */}
                    <button
                      type="button"
                      onClick={() => {
                        setDurationMinutes(120);
                        setIsCustomDuration(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        durationMinutes === 120 && !isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">2 Jam</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatRupiah((startModalUnit.hourlyRate || 5000) * 2)}
                      </div>
                    </button>

                    {/* Paket 3 Jam */}
                    <button
                      type="button"
                      onClick={() => {
                        setDurationMinutes(180);
                        setIsCustomDuration(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        durationMinutes === 180 && !isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">3 Jam</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatRupiah((startModalUnit.hourlyRate || 5000) * 3)}
                      </div>
                    </button>

                    {/* Waktu Custom / Manual */}
                    <button
                      type="button"
                      onClick={() => setIsCustomDuration(true)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        isCustomDuration
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-xs">Waktu Manual</div>
                      <div className="text-[10px] opacity-80 mt-0.5">Kustom Menit</div>
                    </button>
                  </div>

                  {/* Input Jika Memilih Waktu Manual */}
                  {isCustomDuration && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-900 text-xs">Durasi Manual (Menit):</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="5"
                            step="5"
                            value={customMinutesInput}
                            onChange={(e) => setCustomMinutesInput(e.target.value)}
                            className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-center font-extrabold text-indigo-900"
                          />
                          <span className="font-bold text-indigo-800 text-xs">Menit</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Biaya dihitung otomatis berdasarkan tarif per jam & 30 menit.
                      </p>
                    </div>
                  )}

                  {/* Open Billing Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setDurationMinutes(0);
                      setIsCustomDuration(false);
                    }}
                    className={`w-full py-2 px-3 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                      durationMinutes === 0 && !isCustomDuration
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Open Billing (Main Sepuasnya • Bayar Sesuai Durasi Akhir)
                  </button>
                </div>
              )}

              {/* Ringkasan Total Biaya */}
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-600 font-semibold">Total Biaya Rental:</span>
                  <div className="font-black text-indigo-950 text-base">
                    {selectedSavedTimeToUse
                      ? 'Rp 0 (Sisa Waktu)'
                      : durationMinutes === 0 && !isCustomDuration
                      ? `Hitung per Menit (${formatRupiah(Math.round((startModalUnit.hourlyRate || 5000) / 60))}/mnt)`
                      : formatRupiah(
                          calculatePsRentalCost(
                            startModalUnit,
                            isCustomDuration ? Number(customMinutesInput) || 30 : durationMinutes
                          )
                        )}
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 font-mono">
                  {selectedSavedTimeToUse
                    ? `Durasi: ${selectedSavedTimeToUse.remainingMinutes} Menit`
                    : durationMinutes === 0 && !isCustomDuration
                    ? 'Durasi: Open Billing'
                    : `Durasi: ${isCustomDuration ? customMinutesInput : durationMinutes} Menit`}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition shadow-md shadow-indigo-600/20 active:scale-98 cursor-pointer"
                >
                  Nyalakan Timer & Mulai Main
                </button>
                <button
                  type="button"
                  onClick={() => setStartModalUnit(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: TAMBAH JAM / WAKTU MAIN SAAT SEDANG BERJALAN        */}
      {/* ============================================================ */}
      {extendModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  Tambah Waktu Main PS
                </h3>
                <p className="text-slate-500">
                  {extendModalUnit.unitName} • Pemain: <b>{extendModalUnit.customerName}</b>
                </p>
              </div>
              <button
                onClick={() => setExtendModalUnit(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExtend} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Tarif 30 Menit:</span>
                  <span className="font-bold text-teal-800">{formatRupiah(extendModalUnit.halfHourlyRate || 3000)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Tarif 1 Jam:</span>
                  <span className="font-bold text-indigo-800">{formatRupiah(extendModalUnit.hourlyRate || 5000)}</span>
                </div>
              </div>

              {/* Pilihan Cepat Tambah Waktu */}
              <div className="space-y-2">
                <label className="block text-slate-700 font-bold">
                  Pilih Penambahan Waktu:
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {/* +30 Menit */}
                  <button
                    type="button"
                    onClick={() => {
                      setExtendMinutes(30);
                      setIsCustomExtend(false);
                      setCustomExtendCost('');
                    }}
                    className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                      extendMinutes === 30 && !isCustomExtend
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <div className="text-sm font-bold">+30 Menit</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      +{formatRupiah(extendModalUnit.halfHourlyRate || 3000)}
                    </div>
                  </button>

                  {/* +1 Jam */}
                  <button
                    type="button"
                    onClick={() => {
                      setExtendMinutes(60);
                      setIsCustomExtend(false);
                      setCustomExtendCost('');
                    }}
                    className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                      extendMinutes === 60 && !isCustomExtend
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <div className="text-sm font-bold">+1 Jam (60 Mnt)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      +{formatRupiah(extendModalUnit.hourlyRate || 5000)}
                    </div>
                  </button>

                  {/* +2 Jam */}
                  <button
                    type="button"
                    onClick={() => {
                      setExtendMinutes(120);
                      setIsCustomExtend(false);
                      setCustomExtendCost('');
                    }}
                    className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                      extendMinutes === 120 && !isCustomExtend
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <div className="text-sm font-bold">+2 Jam (120 Mnt)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      +{formatRupiah((extendModalUnit.hourlyRate || 5000) * 2)}
                    </div>
                  </button>

                  {/* Waktu Manual Kustom */}
                  <button
                    type="button"
                    onClick={() => setIsCustomExtend(true)}
                    className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                      isCustomExtend
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-extrabold ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <div className="text-sm font-bold">+ Waktu Custom</div>
                    <div className="text-[11px] opacity-80 mt-0.5">Bebas Menit</div>
                  </button>
                </div>
              </div>

              {/* Input Custom Tambah Menit */}
              {isCustomExtend && (
                <div className="p-3 bg-indigo-50 rounded-xl space-y-2 border border-indigo-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 text-xs">Tambah Menit:</span>
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={customExtendInput}
                      onChange={(e) => setCustomExtendInput(e.target.value)}
                      className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-center font-extrabold text-indigo-900 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 text-xs">Biaya Tambahan (Rp):</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      placeholder="Otomatis"
                      value={customExtendCost}
                      onChange={(e) => setCustomExtendCost(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-28 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-right font-extrabold text-indigo-900 text-xs font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Kosongkan biaya tambahan agar otomatis dihitung dari tarif master.
                  </p>
                </div>
              )}

              {/* Catatan Tambahan */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Tambah 30 mnt bayar nanti / bonus 15 mnt"
                  value={extendNotes}
                  onChange={(e) => setExtendNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              {/* Ringkasan Penambahan */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950 font-bold">
                <span>
                  Otomatis Kalkulasi Tambah:{' '}
                  <b>{isCustomExtend ? customExtendInput : extendMinutes} Menit</b>
                </span>
                <span className="text-emerald-800 font-black">
                  +
                  {formatRupiah(
                    customExtendCost !== ''
                      ? Number(customExtendCost)
                      : calculatePsRentalCost(
                          extendModalUnit,
                          isCustomExtend ? Number(customExtendInput) || 15 : extendMinutes
                        )
                  )}
                </span>
              </div>

              {/* Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition shadow-md shadow-indigo-600/20 active:scale-98 cursor-pointer"
                >
                  Simpan & Perpanjang Waktu
                </button>
                <button
                  type="button"
                  onClick={() => setExtendModalUnit(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: SIMPAN SISA WAKTU (PELANGGAN PULANG LEBIH AWAL)     */}
      {/* ============================================================ */}
      {saveTimeModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <BookmarkPlus className="w-4 h-4 text-teal-600" />
                  Simpan Sisa Waktu Bermain
                </h3>
                <p className="text-slate-500">{saveTimeModalUnit.unitName}</p>
              </div>
              <button
                onClick={() => setSaveTimeModalUnit(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSaveRemaining} className="space-y-4">
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-2xl text-teal-900 space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  Skenario Sisa Waktu:
                </p>
                <p className="text-[11px] text-teal-800 leading-relaxed">
                  Pelanggan (misalkan <b>Budi</b>) minta berhenti sekarang dan menyimpan sisa waktunya. Unit station PS akan otomatis <b>langsung kosong & siap disewa</b> pemain lain. Budi bisa melanjutkan sisa waktunya di kemudian hari.
                </p>
              </div>

              <div>
                <label className="block text-slate-800 font-extrabold mb-1 flex items-center justify-between">
                  <span>Nama Pelanggan (Wajib Diisi untuk Sisa Waktu) *</span>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-100 px-2 py-0.5 rounded-md">
                    Contoh: Budi
                  </span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 w-4 h-4" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Tulis nama pelanggan (contoh: Budi)..."
                    value={saveTimeCustomer}
                    onChange={(e) => setSaveTimeCustomer(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-teal-400 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold text-slate-900 text-xs shadow-xs"
                  />
                </div>
                <p className="text-[10px] text-teal-800 mt-1">
                  Nama ini akan dicatat di buku <b>Tabungan Sisa Waktu</b> agar saat pelanggan datang kembali, kasir tinggal mencari namanya untuk melanjutkan main.
                </p>
              </div>

              {/* Sisa Waktu Terakhir (Otomatis dari Hitungan Mundur Stasiun) */}
              <div className="p-3.5 bg-slate-50 border border-teal-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-teal-800 tracking-wider">
                    Sisa Waktu Terakhir (Otomatis):
                  </span>
                  <div className="text-2xl font-black text-teal-900 font-mono flex items-baseline gap-1 mt-0.5">
                    <span>{saveTimeMinutes}</span>
                    <span className="text-xs font-bold text-slate-700">Menit</span>
                    {saveTimeMinutes >= 60 && (
                      <span className="text-xs font-medium text-slate-500">
                        ({(saveTimeMinutes / 60).toFixed(1)} Jam)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Dihitung otomatis dari sisa hitungan mundur unit <b>{saveTimeModalUnit.unitName}</b> saat ini.
                  </p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-700">
                  <Clock className="w-6 h-6" />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Pulang karena ada urusan, lanjut main besok sore"
                  value={saveTimeNotes}
                  onChange={(e) => setSaveTimeNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-xs transition shadow-md shadow-teal-600/20 active:scale-98 cursor-pointer"
                >
                  Simpan Sisa Waktu & Kosongkan Station
                </button>
                <button
                  type="button"
                  onClick={() => setSaveTimeModalUnit(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: GUNAKAN SISA WAKTU UNTUK MAIN DI UNIT STATION       */}
      {/* ============================================================ */}
      {applySavedTimeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <Play className="w-4 h-4 text-teal-600 fill-current" />
                  Pakai Sisa Waktu Pelanggan
                </h3>
                <p className="text-slate-500">
                  {applySavedTimeItem.customerName} ({applySavedTimeItem.remainingMinutes} Menit)
                </p>
              </div>
              <button
                onClick={() => setApplySavedTimeItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmApplySavedTime} className="space-y-4">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl text-teal-900 space-y-1">
                <p className="font-bold">Informasi Tabungan:</p>
                <p className="text-[11px]">
                  Pelanggan <b>{applySavedTimeItem.customerName}</b> memiliki tabungan waktu sebesar{' '}
                  <b>{applySavedTimeItem.remainingMinutes} Menit</b>. Biaya rental adalah <b>Rp 0 (Gratis)</b> karena sudah dibayar saat sesi sebelumnya.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Pilih Station PS yang Tersedia:
                </label>

                {availableUnits.length === 0 ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
                    Semua station PS saat ini sedang terpakai. Harap tunggu hingga ada unit yang selesai atau kosong.
                  </div>
                ) : (
                  <select
                    value={targetUnitId}
                    onChange={(e) => setTargetUnitId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:ring-2 focus:ring-teal-500"
                  >
                    {availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName} ({u.psType})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={availableUnits.length === 0 || !targetUnitId}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl text-xs transition shadow-md shadow-teal-600/20 active:scale-98 cursor-pointer"
                >
                  Nyalakan Timer & Mulai Main
                </button>
                <button
                  type="button"
                  onClick={() => setApplySavedTimeItem(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 6: CATAT SISA WAKTU MANUAL UNTUK PELANGGAN             */}
      {/* ============================================================ */}
      {addSavedTimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <BookmarkPlus className="w-4 h-4 text-teal-600" />
                  Tambah Tabungan Sisa Waktu Manual
                </h3>
                <p className="text-slate-500">Catat saldo waktu bermain pelanggan</p>
              </div>
              <button
                onClick={() => setAddSavedTimeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualSavedTime} className="space-y-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nama Pelanggan *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={newSavedCustomer}
                  onChange={(e) => setNewSavedCustomer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">No. WhatsApp / HP</label>
                <input
                  type="text"
                  placeholder="0812-xxxx-xxxx (opsional)"
                  value={newSavedPhone}
                  onChange={(e) => setNewSavedPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Jumlah Sisa Waktu (Menit) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={newSavedMinutes}
                    onChange={(e) => setNewSavedMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-32 px-3 py-2 bg-white border border-teal-300 rounded-xl text-center font-black text-teal-900 text-sm font-mono"
                  />
                  <span className="font-bold text-slate-600">Menit</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan</label>
                <input
                  type="text"
                  placeholder="Contoh: Sisa waktu kemarin main di PS 1"
                  value={newSavedNotes}
                  onChange={(e) => setNewSavedNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-xs transition shadow-xs cursor-pointer"
                >
                  Simpan Tabungan Sisa Waktu
                </button>
                <button
                  type="button"
                  onClick={() => setAddSavedTimeModal(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 7: TAMBAH / EDIT UNIT STATION PLAYSTATION              */}
      {/* ============================================================ */}
      {unitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs animate-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {editingUnit ? `Edit Unit: ${editingUnit.unitName}` : 'Tambah Unit PlayStation Baru'}
                </h3>
                <p className="text-slate-500">Konfigurasi nama station dan tarif per jam & 30 menit</p>
              </div>
              <button
                onClick={() => setUnitModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUnit} className="space-y-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nama Station / Unit *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PS 1 (PS4 Slim)"
                  value={unitForm.unitName}
                  onChange={(e) => setUnitForm({ ...unitForm, unitName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Tipe Konsol</label>
                <select
                  value={unitForm.psType}
                  onChange={(e) => setUnitForm({ ...unitForm, psType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs"
                >
                  <option value="PS4">PlayStation 4 (PS4)</option>
                  <option value="PS5">PlayStation 5 (PS5)</option>
                  <option value="PS3">PlayStation 3 (PS3)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Tarif 1 Jam (Rp) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={unitForm.hourlyRate}
                    onChange={(e) => setUnitForm({ ...unitForm, hourlyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-extrabold text-indigo-900 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Tarif 30 Menit (Rp) *
                  </label>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    required
                    value={unitForm.halfHourlyRate}
                    onChange={(e) => setUnitForm({ ...unitForm, halfHourlyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-extrabold text-teal-900 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-indigo-50 text-indigo-900 rounded-xl text-[11px] border border-indigo-100">
                💡 <b>Kustomisasi Tarif:</b> Contoh tarif 1 jam Rp 5.000, setiap paket / penambahan 30 menit Rp 3.000.
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition shadow-xs cursor-pointer"
                >
                  {editingUnit ? 'Perbarui Unit PS' : 'Simpan Unit PS'}
                </button>
                <button
                  type="button"
                  onClick={() => setUnitModal(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
