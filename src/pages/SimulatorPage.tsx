import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarPlus,
  Check,
  Copy,
  Edit3,
  Eye,
  History,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ActivityConfig,
  CoupleRecord,
  PackageConfig,
  QuoteActivityItem,
  QuoteCityOption,
  QuoteRecord,
  QuoteStatus,
  QuoteVersionRecord,
  SystemConfig,
  UserProfile,
} from '../lib/types';
import { calculateQuoteTotals, calculateTravelCosts } from '../services/pricingEngine';
import {
  convertQuoteToEvent,
  createCouple,
  createQuoteWithVersion,
  deleteQuoteRecord,
  subscribeQuoteVersions,
  updateQuoteStatus,
  updateQuoteWithNewVersion,
} from '../services/firestoreService';
import { canApproveQuote, canDelete, canWriteOperationally } from '../services/rbac';
import { formatBRL, formatDateBR, generateCode } from '../services/validation';
import { FourEverFullLogo } from '../components/BrandMarks';

interface SimulatorPageProps {
  user: UserProfile;
  authorizedUids: string[];
  config: SystemConfig;
  packages: PackageConfig[];
  activities: ActivityConfig[];
  couples: CoupleRecord[];
  quotes: QuoteRecord[];
  onOpenEvent: (eventId: string) => void;
}

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  EM_ELABORACAO: 'Em elaboração',
  ENVIADO: 'Enviado',
  EM_NEGOCIACAO: 'Em negociação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  EXPIRADO: 'Expirado',
  ARQUIVADO: 'Arquivado',
};

const CITY_OPTIONS: QuoteCityOption[] = ['Macaé', 'Rio das Ostras', 'Búzios', 'Outra localidade'];

export const SimulatorPage: React.FC<SimulatorPageProps> = ({
  user,
  authorizedUids,
  config,
  packages,
  activities,
  couples,
  quotes,
  onOpenEvent,
}) => {
  const operationalPackages = useMemo(
    () =>
      packages
        .filter((p) => p.active && p.isOperational)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [packages]
  );

  const canWrite = canWriteOperationally(user);
  const canApprove = canApproveQuote(user);
  const canRemove = canDelete(user);

  const [activeTab, setActiveTab] = useState<'editor' | 'saved'>('editor');

  const [editingQuote, setEditingQuote] = useState<QuoteRecord | null>(null);
  const [changeReason, setChangeReason] = useState('');

  // Form fields
  const [coupleId, setCoupleId] = useState('');
  const [coupleName, setCoupleName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [venue, setVenue] = useState('');
  const [cityOption, setCityOption] = useState<QuoteCityOption>('Macaé');
  const [customCity, setCustomCity] = useState('');
  const [guestBracketId, setGuestBracketId] = useState(
    config.guestBrackets[3]?.id || config.guestBrackets[0]?.id || ''
  );
  const [estimatedGuests, setEstimatedGuests] = useState(90);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [observations, setObservations] = useState('');
  const [otherExpenses, setOtherExpenses] = useState(0);

  // Travel inputs
  const [distanceOneWayKm, setDistanceOneWayKm] = useState(12);
  const [distanceSource, setDistanceSource] = useState('Informação manual (referência regional)');
  const [vehicleConsumption, setVehicleConsumption] = useState(config.vehicleConsumptionKmPerL || 5);
  const [fuelPrice, setFuelPrice] = useState(config.fuelPricePerLiter || 6.19);
  const [tolls, setTolls] = useState(config.defaultTollsEstimate || 0);
  const [parking, setParking] = useState(config.defaultParkingEstimate || 0);
  const [vehicleWearPerKm, setVehicleWearPerKm] = useState(config.vehicleWearPerKm ?? 0.45);
  const [chargeMeal, setChargeMeal] = useState(false);
  const [mealAllowance, setMealAllowance] = useState(config.defaultMealAllowance ?? 85);
  const [manualTravelAdj, setManualTravelAdj] = useState(0);

  // Activities override map
  const [quoteActivities, setQuoteActivities] = useState<QuoteActivityItem[]>([]);

  // Adjustments & Discounts
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountValue, setDiscountValue] = useState(0);
  const [surchargeValue, setSurchargeValue] = useState(0);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [justification, setJustification] = useState('');

  // UI feedbacks & Modals
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [clientPreviewOpen, setClientPreviewOpen] = useState(false);
  const [historyQuote, setHistoryQuote] = useState<QuoteRecord | null>(null);
  const [versions, setVersions] = useState<QuoteVersionRecord[]>([]);
  const [confirmDeleteQuoteId, setConfirmDeleteQuoteId] = useState<string | null>(null);

  // Saved quotes filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!selectedPackageId && operationalPackages.length > 0) {
      setSelectedPackageId(operationalPackages[0].id);
    }
  }, [operationalPackages, selectedPackageId]);

  const currentPackage = useMemo(
    () =>
      operationalPackages.find((p) => p.id === selectedPackageId) ||
      operationalPackages[0] || {
        id: 'love',
        code: 'LOVE',
        name: 'Pacote Love',
        basePrice: 1370,
        estimatedCost: 480,
        active: true,
        isOperational: true,
        sortOrder: 1,
        authorizedUids,
        createdBy: user.uid,
      },
    [operationalPackages, selectedPackageId, authorizedUids, user.uid]
  );

  const currentGuestBracket = useMemo(
    () =>
      config.guestBrackets.find((b) => b.id === guestBracketId) ||
      config.guestBrackets[0] || {
        id: 'default',
        label: 'Padrão',
        minGuests: 1,
        maxGuests: 100,
        multiplier: 1,
        extraFee: 0,
      },
    [config.guestBrackets, guestBracketId]
  );

  const rebuildActivitiesForPackage = (pkgId: string) => {
    const activeActs = activities
      .filter((a) => a.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const mapped: QuoteActivityItem[] = activeActs.map((act) => {
      const included = act.packageIds.includes(pkgId);
      return {
        activityId: act.id,
        name: act.name,
        category: act.category,
        billingType: act.billingType,
        unitPrice: act.defaultPrice,
        estimatedCost: act.estimatedCost,
        includedInPackage: included,
        selected: included,
      };
    });
    setQuoteActivities(mapped);
  };

  useEffect(() => {
    if (!editingQuote && currentPackage?.id && activities.length > 0) {
      rebuildActivitiesForPackage(currentPackage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPackage.id, activities.length]);

  const handleCityChange = (newCity: QuoteCityOption) => {
    setCityOption(newCity);
    const rule = config.cityRules.find((r) => r.city === newCity);
    if (rule) {
      setDistanceOneWayKm(rule.defaultDistanceOneWayKm);
      setTolls(rule.defaultTolls);
      setChargeMeal(newCity === 'Macaé' ? Boolean(config.chargeMealInBaseCity) : rule.chargeMeal);
      setDistanceSource('Referência configurada por cidade (editável manualmente)');
    } else {
      setChargeMeal(true);
      setDistanceSource('Inserção manual para outra localidade');
    }
  };

  useEffect(() => {
    if (!historyQuote) {
      setVersions([]);
      return;
    }
    const unsub = subscribeQuoteVersions(historyQuote.id, user.uid, setVersions);
    return () => unsub();
  }, [historyQuote, user.uid]);

  const travelCalculation = useMemo(
    () =>
      calculateTravelCosts({
        cityOption,
        distanceOneWayKm,
        distanceSource,
        vehicleConsumptionKmPerL: vehicleConsumption,
        fuelPricePerLiter: fuelPrice,
        tolls,
        parking,
        vehicleWearPerKm,
        mealAllowance,
        chargeMeal,
        manualTravelAdjustment: manualTravelAdj,
      }),
    [
      cityOption,
      distanceOneWayKm,
      distanceSource,
      vehicleConsumption,
      fuelPrice,
      tolls,
      parking,
      vehicleWearPerKm,
      mealAllowance,
      chargeMeal,
      manualTravelAdj,
    ]
  );

  const calculationSummary = useMemo(
    () =>
      calculateQuoteTotals({
        pkg: currentPackage,
        guestBracket: currentGuestBracket,
        estimatedGuests,
        selectedActivities: quoteActivities,
        travelInput: travelCalculation,
        adjustments: {
          discountPercent,
          discountValue,
          surchargeValue,
          manualAdjustment,
          justification,
          adjustedBy: user.name,
        },
        otherExpenses,
        config,
      }),
    [
      currentPackage,
      currentGuestBracket,
      estimatedGuests,
      quoteActivities,
      travelCalculation,
      discountPercent,
      discountValue,
      surchargeValue,
      manualAdjustment,
      justification,
      user.name,
      otherExpenses,
      config,
    ]
  );

  const resetForm = () => {
    setEditingQuote(null);
    setChangeReason('');
    setCoupleId('');
    setCoupleName('');
    setPhone('');
    setEmail('');
    setWeddingDate('');
    setVenue('');
    setCityOption('Macaé');
    setCustomCity('');
    setEstimatedGuests(90);
    setObservations('');
    setOtherExpenses(0);
    setDiscountPercent(0);
    setDiscountValue(0);
    setSurchargeValue(0);
    setManualAdjustment(0);
    setJustification('');
    setVehicleConsumption(config.vehicleConsumptionKmPerL || 5);
    setFuelPrice(config.fuelPricePerLiter || 6.19);
    setVehicleWearPerKm(config.vehicleWearPerKm ?? 0.45);
    setMealAllowance(config.defaultMealAllowance ?? 85);
    setManualTravelAdj(0);
    handleCityChange('Macaé');
    if (operationalPackages[0]) {
      setSelectedPackageId(operationalPackages[0].id);
      rebuildActivitiesForPackage(operationalPackages[0].id);
    }
  };

  const loadQuoteIntoEditor = (quote: QuoteRecord, asDuplicate = false) => {
    setEditingQuote(asDuplicate ? null : quote);
    setChangeReason(asDuplicate ? `Duplicado de ${quote.code}` : '');
    setCoupleId(quote.coupleId || '');
    setCoupleName(asDuplicate ? `${quote.coupleName} (Cópia)` : quote.coupleName);
    setPhone(quote.phone || '');
    setEmail(quote.email || '');
    setWeddingDate(quote.weddingDate || '');
    setVenue(quote.venue || '');
    setCityOption(quote.cityOption);
    setCustomCity(quote.customCity || '');
    setGuestBracketId(quote.guestBracketId);
    setEstimatedGuests(quote.estimatedGuests || 90);
    setSelectedPackageId(quote.packageId);
    setObservations(quote.observations || '');
    setOtherExpenses(quote.calculationSummary?.otherExpenses || 0);
    setQuoteActivities(quote.selectedActivities || []);

    const tr = quote.travelInput;
    setDistanceOneWayKm(tr.distanceOneWayKm);
    setDistanceSource(tr.distanceSource);
    setVehicleConsumption(tr.vehicleConsumptionKmPerL);
    setFuelPrice(tr.fuelPricePerLiter);
    setTolls(tr.tolls);
    setParking(tr.parking);
    setVehicleWearPerKm(
      tr.distanceTotalKm > 0 ? Number((tr.vehicleWearCost / tr.distanceTotalKm).toFixed(2)) : 0.45
    );
    setChargeMeal(tr.chargeMeal);
    setMealAllowance(tr.mealAllowance || config.defaultMealAllowance || 85);
    setManualTravelAdj(tr.manualTravelAdjustment || 0);

    const adj = quote.adjustments;
    setDiscountPercent(adj.discountPercent || 0);
    setDiscountValue(adj.discountValue || 0);
    setSurchargeValue(adj.surchargeValue || 0);
    setManualAdjustment(adj.manualAdjustment || 0);
    setJustification(adj.justification || '');

    setActiveTab('editor');
    setFeedback(null);
  };

  const handleSelectExistingCouple = (selectedId: string) => {
    setCoupleId(selectedId);
    const found = couples.find((c) => c.id === selectedId);
    if (found) {
      setCoupleName(found.coupleName);
      setPhone(found.phone || '');
      setEmail(found.email || '');
      setWeddingDate(found.weddingDate || '');
      setVenue(found.venue || '');
      if (found.city === 'Macaé' || found.city === 'Rio das Ostras' || found.city === 'Búzios') {
        handleCityChange(found.city);
      } else if (found.city) {
        setCityOption('Outra localidade');
        setCustomCity(found.city);
      }
    }
  };

  const toggleActivity = (activityId: string) => {
    setQuoteActivities((prev) =>
      prev.map((a) => (a.activityId === activityId ? { ...a, selected: !a.selected } : a))
    );
  };

  const handleSaveQuote = async (targetStatus?: QuoteStatus) => {
    setFeedback(null);
    if (!coupleName.trim()) {
      setFeedback({ type: 'error', text: 'Informe o nome dos noivos antes de salvar o orçamento.' });
      return;
    }

    setSaving(true);
    try {
      let linkedCoupleId = coupleId;
      if (!linkedCoupleId) {
        linkedCoupleId = await createCouple({
          coupleName: coupleName.trim(),
          phone,
          email,
          weddingDate,
          venue,
          city: cityOption === 'Outra localidade' ? customCity : cityOption,
          authorizedUids,
          createdBy: user.uid,
        });
        setCoupleId(linkedCoupleId);
      }

      const snapshotConfig: QuoteVersionRecord['snapshotConfig'] = {
        packageSnapshot: {
          id: currentPackage.id,
          name: currentPackage.name,
          basePrice: currentPackage.basePrice,
          estimatedCost: currentPackage.estimatedCost,
        },
        guestBracketSnapshot: currentGuestBracket,
        pricingFormulaSnapshot: config.pricingFormula || {
          mode: 'PACKAGE_PLUS_EXTRAS',
          includeBracketExtraFee: true,
          applyGuestMultiplierOnBase: true,
          defaultMarginPercent: 0,
        },
        travelConfigSnapshot: {
          baseAddress: config.baseAddress,
          vehicleConsumptionKmPerL: vehicleConsumption,
          fuelPricePerLiter: fuelPrice,
          vehicleWearPerKm,
          chargeMealInBaseCity: Boolean(config.chargeMealInBaseCity),
        },
      };

      const adjustmentsPayload = {
        discountPercent,
        discountValue,
        surchargeValue,
        manualAdjustment,
        justification,
        adjustedBy: user.name,
      };

      if (editingQuote) {
        await updateQuoteWithNewVersion({
          quoteId: editingQuote.id,
          existingQuote: editingQuote,
          updates: {
            coupleId: linkedCoupleId,
            coupleName: coupleName.trim(),
            phone,
            email,
            weddingDate,
            venue,
            cityOption,
            customCity: cityOption === 'Outra localidade' ? customCity : '',
            guestBracketId: currentGuestBracket.id,
            guestBracketLabel: currentGuestBracket.label,
            estimatedGuests,
            packageId: currentPackage.id,
            packageName: currentPackage.name,
            status: targetStatus || editingQuote.status,
            selectedActivities: quoteActivities,
            travelInput: travelCalculation,
            adjustments: adjustmentsPayload,
            calculationSummary,
            observations,
            authorizedUids,
          },
          snapshotConfig,
          changeReason: changeReason || 'Atualização do orçamento no simulador',
          actorUid: user.uid,
          actorName: user.name,
        });
        setFeedback({
          type: 'success',
          text: `Orçamento ${editingQuote.code} atualizado e nova versão v${
            (editingQuote.currentVersionNumber || 1) + 1
          } salva no histórico.`,
        });
      } else {
        const code = generateCode('ORC');
        await createQuoteWithVersion({
          payload: {
            code,
            coupleId: linkedCoupleId,
            coupleName: coupleName.trim(),
            phone,
            email,
            weddingDate,
            venue,
            cityOption,
            customCity: cityOption === 'Outra localidade' ? customCity : '',
            guestBracketId: currentGuestBracket.id,
            guestBracketLabel: currentGuestBracket.label,
            estimatedGuests,
            packageId: currentPackage.id,
            packageName: currentPackage.name,
            status: targetStatus || 'EM_ELABORACAO',
            selectedActivities: quoteActivities,
            travelInput: travelCalculation,
            adjustments: adjustmentsPayload,
            calculationSummary,
            observations,
            convertedEventId: '',
            authorizedUids,
            createdBy: user.uid,
          },
          snapshotConfig,
          changeReason: 'Versão inicial criada no simulador',
          actorName: user.name,
        });
        setFeedback({
          type: 'success',
          text: `Orçamento ${code} salvo com histórico v1 preservado.`,
        });
        setActiveTab('saved');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao salvar orçamento.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (quote: QuoteRecord) => {
    if (quote.convertedEventId) {
      onOpenEvent(quote.convertedEventId);
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const evtId = await convertQuoteToEvent({
        quote,
        config,
        actorUid: user.uid,
        actorName: user.name,
      });
      setFeedback({
        type: 'success',
        text: `Orçamento ${quote.code} convertido em Evento com checklist e contrato financeiro!`,
      });
      onOpenEvent(evtId);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível converter o orçamento.',
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredQuotes = useMemo(() => {
    return [...quotes]
      .filter((q) => {
        const matchesSearch =
          !searchTerm.trim() ||
          q.coupleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          q.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (q.venue || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b.code.localeCompare(a.code));
  }, [quotes, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Segmented Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#D6CEC1] rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'editor'
                ? 'bg-[#30483B] text-white'
                : 'text-[#5C554C] hover:text-[#1F2A24]'
            }`}
          >
            {editingQuote ? `Editando ${editingQuote.code}` : 'Simulador de Proposta'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'saved'
                ? 'bg-[#30483B] text-white'
                : 'text-[#5C554C] hover:text-[#1F2A24]'
            }`}
          >
            Orçamentos Salvos ({quotes.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editingQuote && activeTab === 'editor' && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#D6CEC1] text-xs font-medium text-[#594634] rounded-lg hover:bg-[#F5F3EE] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Limpar / Novo
            </button>
          )}
          <button
            type="button"
            onClick={() => setClientPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#30483B]/30 text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#F5F3EE] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            Prévia Comercial do Cliente
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'bg-[#FCEEEE] border-[#A6342F]/25 text-[#A6342F]'
              : 'bg-[#ECF6F0] border-[#1F6E43]/25 text-[#1F6E43]'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: SIMULATOR EDITOR */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Form Column */}
          <div className="xl:col-span-8 space-y-6">
            {/* 1. Informações do Casal */}
            <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D6CEC1] pb-3">
                <div>
                  <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                    01. Informações do Casal
                  </h2>
                  <p className="text-xs text-[#5C554C]">Dados cadastrais e local do casamento</p>
                </div>
                {couples.length > 0 && (
                  <select
                    value={coupleId}
                    onChange={(e) => handleSelectExistingCouple(e.target.value)}
                    className="px-3 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs text-[#1F2A24]"
                    aria-label="Selecionar casal existente"
                  >
                    <option value="">Novo casal (criar cadastro)</option>
                    {couples.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.coupleName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Nome dos Noivos *
                  </label>
                  <input
                    type="text"
                    value={coupleName}
                    onChange={(e) => setCoupleName(e.target.value)}
                    placeholder="Ex.: Gilbert & Andressa"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(22) 99999-9999"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="casal@email.com"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Data do Casamento</label>
                  <input
                    type="date"
                    value={weddingDate}
                    onChange={(e) => setWeddingDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Local / Espaço do Evento</label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="Ex.: Alpha Atlântico - Ajuda de Cima"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#594634] mb-1">Observações Gerais</label>
                  <textarea
                    rows={2}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Detalhes específicos da cerimônia, recepção ou solicitações do casal..."
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
              </div>
            </section>

            {/* 2. Pacote & Faixa de Convidados */}
            <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-5">
              <div className="border-b border-[#D6CEC1] pb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                    02. Pacote & Número de Convidados
                  </h2>
                  <p className="text-xs text-[#5C554C]">
                    Parâmetros editáveis pelo Administrador Master na Configuração Geral
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {operationalPackages.map((pkg) => {
                  const selected = currentPackage.id === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        if (editingQuote) {
                          rebuildActivitiesForPackage(pkg.id);
                        }
                      }}
                      className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-[#30483B] bg-[#30483B]/5'
                          : 'border-[#D6CEC1] bg-white hover:bg-[#F5F3EE]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif text-base font-semibold text-[#1F2A24]">
                          {pkg.name}
                        </span>
                        <span className="font-mono text-sm font-semibold text-[#30483B] tabular-nums">
                          {formatBRL(pkg.basePrice)}
                        </span>
                      </div>
                      <p className="text-xs text-[#5C554C] mt-1.5 line-clamp-2">
                        {pkg.description}
                      </p>
                      <p className="text-[11px] text-[#594634] mt-2">
                        Valor base provisório configurável
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Faixa de Convidados
                  </label>
                  <select
                    value={currentGuestBracket.id}
                    onChange={(e) => {
                      const b = config.guestBrackets.find((item) => item.id === e.target.value);
                      setGuestBracketId(e.target.value);
                      if (b) {
                        setEstimatedGuests(b.maxGuests || b.minGuests);
                      }
                    }}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  >
                    {config.guestBrackets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} (x{b.multiplier.toFixed(2)}
                        {b.extraFee > 0 ? ` + ${formatBRL(b.extraFee)}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Quantidade Estimada de Convidados
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={estimatedGuests}
                    onChange={(e) => setEstimatedGuests(Math.max(1, Number(e.target.value || 1)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </section>

            {/* 3. Composição de Atividades */}
            <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
              <div className="border-b border-[#D6CEC1] pb-3">
                <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                  03. Composição do Pacote & Atividades
                </h2>
                <p className="text-xs text-[#5C554C]">
                  Atividades incluídas no {currentPackage.name} e itens adicionais configuráveis
                </p>
              </div>

              <div className="divide-y divide-[#E7E2D8]">
                {quoteActivities.map((act) => (
                  <label
                    key={act.activityId}
                    className="py-2.5 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F5F3EE]/50 px-2 rounded-lg"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={act.selected}
                        onChange={() => toggleActivity(act.activityId)}
                        className="mt-1 accent-[#30483B] w-4 h-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1F2A24]">{act.name}</p>
                        <p className="text-xs text-[#5C554C]">
                          {act.category} ·{' '}
                          {act.includedInPackage
                            ? 'Incluída no pacote'
                            : act.billingType === 'PER_GUEST'
                            ? 'Cobrança por convidado'
                            : 'Opcional adicional'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-medium text-[#30483B] tabular-nums shrink-0">
                      {act.includedInPackage
                        ? 'Incluída'
                        : act.unitPrice > 0
                        ? `+ ${formatBRL(act.unitPrice)}`
                        : 'Sem acréscimo'}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* 4. Localidade & Deslocamento */}
            <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
              <div className="border-b border-[#D6CEC1] pb-3">
                <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                  04. Localidade & Custos de Deslocamento
                </h2>
                <p className="text-xs text-[#5C554C]">
                  Base operacional: {config.baseAddress} · Fórmula: Distância total ÷ consumo × preço/L
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CITY_OPTIONS.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCityChange(city)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      cityOption === city
                        ? 'bg-[#30483B] text-white border-[#30483B]'
                        : 'bg-[#F5F3EE] text-[#1F2A24] border-[#D6CEC1] hover:bg-[#EBE6DC]'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              {cityOption === 'Outra localidade' && (
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Nome da Cidade / Localidade
                  </label>
                  <input
                    type="text"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Informe a cidade do evento"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Distância Ida (km — manual)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={distanceOneWayKm}
                    onChange={(e) => setDistanceOneWayKm(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Distância Total (Ida + Volta)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`${travelCalculation.distanceTotalKm} km`}
                    className="w-full px-3.5 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums text-[#5C554C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Origem da Distância
                  </label>
                  <input
                    type="text"
                    value={distanceSource}
                    onChange={(e) => setDistanceSource(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Consumo (km/l — provisório)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.5"
                    value={vehicleConsumption}
                    onChange={(e) => setVehicleConsumption(Math.max(0.5, Number(e.target.value || 5)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Combustível (R$/L)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Desgaste (R$/km)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={vehicleWearPerKm}
                    onChange={(e) => setVehicleWearPerKm(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Pedágios (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={tolls}
                    onChange={(e) => setTolls(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Estacionamento (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={parking}
                    onChange={(e) => setParking(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Ajuste Manual Deslocamento (R$)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={manualTravelAdj}
                    onChange={(e) => setManualTravelAdj(Number(e.target.value || 0))}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E7E2D8]">
                <label className="inline-flex items-center gap-2 text-xs text-[#1F2A24] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chargeMeal}
                    onChange={(e) => setChargeMeal(e.target.checked)}
                    className="accent-[#30483B] w-4 h-4"
                  />
                  <span>
                    Aplicar alimentação da equipe ({cityOption === 'Macaé' ? 'não cobrada automaticamente em Macaé' : 'regra externa'})
                  </span>
                </label>
                {chargeMeal && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#594634]">Valor alimentação (R$):</span>
                    <input
                      type="number"
                      min={0}
                      value={mealAllowance}
                      onChange={(e) => setMealAllowance(Math.max(0, Number(e.target.value || 0)))}
                      className="w-28 px-2.5 py-1 bg-white border border-[#D6CEC1] rounded-lg text-xs font-mono tabular-nums"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* 5. Ajustes, Descontos & Justificativa */}
            <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
              <div className="border-b border-[#D6CEC1] pb-3">
                <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                  05. Ajustes, Descontos & Acréscimos
                </h2>
                <p className="text-xs text-[#5C554C]">
                  Alterações pontuais aplicam-se somente a este orçamento, preservando a tabela mestre.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Desconto (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
                    className="w-full px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Desconto Fixo (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="10"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Acréscimo (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="10"
                    value={surchargeValue}
                    onChange={(e) => setSurchargeValue(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">Outras Despesas (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="10"
                    value={otherExpenses}
                    onChange={(e) => setOtherExpenses(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#594634] mb-1">
                    Justificativa do Ajuste / Desconto
                  </label>
                  <input
                    type="text"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Ex.: Pagamento à vista ou negociação de fechamento"
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                  />
                </div>
                {editingQuote && (
                  <div>
                    <label className="block text-xs font-medium text-[#594634] mb-1">
                      Motivo da Nova Versão (Histórico)
                    </label>
                    <input
                      type="text"
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      placeholder="Descreva o motivo da alteração para o histórico"
                      className="w-full px-3.5 py-2 bg-white border border-[#D6CEC1] rounded-lg text-sm"
                    />
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sticky Right Column — Live Calculation Breakdown */}
          <aside className="xl:col-span-4 xl:sticky xl:top-24 space-y-4">
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-5">
              <div className="border-b border-[#D6CEC1] pb-3">
                <p className="text-xs font-medium text-[#594634]">Detalhamento Interno do Cálculo</p>
                <h3 className="font-serif text-xl font-semibold text-[#1F2A24] mt-0.5">
                  {currentPackage.name}
                </h3>
                <p className="text-xs text-[#5C554C] mt-0.5">
                  {currentGuestBracket.label} · {estimatedGuests} convidados ·{' '}
                  {cityOption === 'Outra localidade' ? customCity || 'Outra localidade' : cityOption}
                </p>
              </div>

              <dl className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[#5C554C]">Valor-base do pacote</dt>
                  <dd className="font-mono tabular-nums font-medium">
                    {formatBRL(calculationSummary.packageBaseValue)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5C554C]">Ajuste faixa de convidados</dt>
                  <dd className="font-mono tabular-nums font-medium">
                    {formatBRL(calculationSummary.guestBracketAdjustment)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5C554C]">Atividades adicionais</dt>
                  <dd className="font-mono tabular-nums font-medium">
                    {formatBRL(calculationSummary.activitiesTotal)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5C554C]">
                    Deslocamento ({travelCalculation.distanceTotalKm} km · Comb. {formatBRL(travelCalculation.fuelCost)})
                  </dt>
                  <dd className="font-mono tabular-nums font-medium">
                    {formatBRL(calculationSummary.travelTotal)}
                  </dd>
                </div>
                {calculationSummary.otherExpenses > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[#5C554C]">Outras despesas estimadas</dt>
                    <dd className="font-mono tabular-nums font-medium">
                      {formatBRL(calculationSummary.otherExpenses)}
                    </dd>
                  </div>
                )}
                <div className="pt-2 border-t border-[#E7E2D8] flex justify-between font-medium">
                  <dt className="text-[#1F2A24]">Valor sugerido</dt>
                  <dd className="font-mono tabular-nums text-[#1F2A24]">
                    {formatBRL(calculationSummary.suggestedTotal)}
                  </dd>
                </div>
                {calculationSummary.discountTotal > 0 && (
                  <div className="flex justify-between text-[#A6342F]">
                    <dt>Descontos aplicados</dt>
                    <dd className="font-mono tabular-nums">- {formatBRL(calculationSummary.discountTotal)}</dd>
                  </div>
                )}
                {calculationSummary.surchargeTotal !== 0 && (
                  <div className="flex justify-between text-[#594634]">
                    <dt>Acréscimos / Ajustes</dt>
                    <dd className="font-mono tabular-nums">+ {formatBRL(calculationSummary.surchargeTotal)}</dd>
                  </div>
                )}
              </dl>

              <div className="p-4 bg-[#30483B] text-[#F5F3EE] rounded-lg space-y-1">
                <p className="text-xs text-[#A99A83]">Valor Final da Proposta</p>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {formatBRL(calculationSummary.finalTotal)}
                </p>
                <p className="text-[11px] text-[#F5F3EE]/80 tabular-nums">
                  Entrada {config.paymentTerms.depositPercent}%:{' '}
                  {formatBRL((calculationSummary.finalTotal * config.paymentTerms.depositPercent) / 100)}
                </p>
              </div>

              <div className="p-3.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg space-y-1.5 text-xs">
                <p className="font-semibold text-[#594634]">Visão Interna de Margem (Confidencial)</p>
                <div className="flex justify-between">
                  <span className="text-[#5C554C]">Custo interno estimado</span>
                  <span className="font-mono tabular-nums">
                    {formatBRL(calculationSummary.estimatedInternalCost)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-[#1F2A24]">Resultado estimado</span>
                  <span
                    className={`font-mono tabular-nums ${
                      calculationSummary.estimatedProfit >= 0 ? 'text-[#1F6E43]' : 'text-[#A6342F]'
                    }`}
                  >
                    {formatBRL(calculationSummary.estimatedProfit)} ({calculationSummary.estimatedMarginPercent}%)
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {canWrite && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveQuote()}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#30483B] text-white text-sm font-medium rounded-lg hover:bg-[#24372D] disabled:opacity-60 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      {saving
                        ? 'Salvando...'
                        : editingQuote
                        ? 'Salvar Nova Versão'
                        : 'Salvar Orçamento'}
                    </button>
                    {canApprove && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSaveQuote('ENVIADO')}
                        className="w-full py-2 px-4 bg-[#F5F3EE] border border-[#D6CEC1] text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#EBE6DC] cursor-pointer"
                      >
                        Salvar e Marcar como Enviado
                      </button>
                    )}
                  </>
                )}

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setClientPreviewOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-[#D6CEC1] text-xs font-medium text-[#594634] rounded-lg hover:bg-[#F5F3EE] cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Prévia Comercial do Cliente
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* TAB 2: SAVED QUOTES & EMISSIONS */}
      {activeTab === 'saved' && (
        <div className="space-y-6">
          <section className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-sans text-base font-semibold text-[#1F2A24]">
                  Orçamentos Salvos & Histórico
                </h2>
                <p className="text-xs text-[#5C554C]">
                  Cada orçamento preserva os parâmetros da sua versão histórica no momento do cálculo
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#A99A83] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar casal, código ou local..."
                    className="pl-9 pr-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs w-60"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs"
                >
                  <option value="ALL">Todos os status</option>
                  {Object.entries(QUOTE_STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredQuotes.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm font-medium text-[#594634]">
                  {quotes.length === 0
                    ? 'Crie seu primeiro orçamento.'
                    : 'Nenhum orçamento encontrado com os filtros atuais.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setActiveTab('editor');
                  }}
                  className="px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                >
                  Abrir Simulador
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#D6CEC1] text-[#594634]">
                      <th className="py-3 px-3 font-semibold">Código</th>
                      <th className="py-3 px-3 font-semibold">Casal / Evento</th>
                      <th className="py-3 px-3 font-semibold">Pacote & Convidados</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-3 font-semibold text-right">Valor Final</th>
                      <th className="py-3 px-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E2D8]">
                    {filteredQuotes.map((q) => (
                      <tr key={q.id} className="hover:bg-[#F5F3EE]/50">
                        <td className="py-3.5 px-3 font-mono tabular-nums font-medium text-[#30483B]">
                          {q.code} · v{q.currentVersionNumber}
                        </td>
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-[#1F2A24]">{q.coupleName}</p>
                          <p className="text-[#5C554C]">
                            {q.weddingDate ? formatDateBR(q.weddingDate) : 'Data a definir'} ·{' '}
                            {q.cityOption === 'Outra localidade' ? q.customCity : q.cityOption}
                          </p>
                        </td>
                        <td className="py-3.5 px-3 text-[#5C554C]">
                          {q.packageName} · {q.guestBracketLabel || `${q.estimatedGuests} conv.`}
                        </td>
                        <td className="py-3.5 px-3">
                          {canApprove ? (
                            <select
                              value={q.status}
                              onChange={(e) =>
                                updateQuoteStatus({
                                  quote: q,
                                  newStatus: e.target.value as QuoteStatus,
                                  actorUid: user.uid,
                                  actorName: user.name,
                                })
                              }
                              className="px-2 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-xs font-medium text-[#1F2A24]"
                            >
                              {Object.entries(QUOTE_STATUS_LABELS).map(([k, lbl]) => (
                                <option key={k} value={k}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{QUOTE_STATUS_LABELS[q.status]}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-[#1F2A24]">
                          {formatBRL(q.calculationSummary?.finalTotal)}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {q.status === 'APROVADO' && (
                              <button
                                type="button"
                                onClick={() => handleConvert(q)}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#30483B] text-white rounded text-[11px] font-medium hover:bg-[#24372D] whitespace-nowrap shrink-0 cursor-pointer"
                                title={q.convertedEventId ? 'Abrir evento vinculado' : 'Converter em evento'}
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                {q.convertedEventId ? 'Ver Evento' : 'Converter em Evento'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setHistoryQuote(q)}
                              className="p-1.5 rounded hover:bg-[#F5F3EE] text-[#594634] cursor-pointer"
                              title="Histórico de versões"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => loadQuoteIntoEditor(q, false)}
                                  className="p-1.5 rounded hover:bg-[#F5F3EE] text-[#30483B] cursor-pointer"
                                  title="Editar orçamento"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => loadQuoteIntoEditor(q, true)}
                                  className="p-1.5 rounded hover:bg-[#F5F3EE] text-[#594634] cursor-pointer"
                                  title="Duplicar orçamento"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuoteStatus({
                                      quote: q,
                                      newStatus: 'ARQUIVADO',
                                      actorUid: user.uid,
                                      actorName: user.name,
                                    })
                                  }
                                  className="p-1.5 rounded hover:bg-[#F5F3EE] text-[#5C554C] cursor-pointer"
                                  title="Arquivar"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {canRemove && (
                              confirmDeleteQuoteId === q.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void deleteQuoteRecord(q, user.uid, user.name);
                                      setConfirmDeleteQuoteId(null);
                                    }}
                                    className="px-2 py-1 bg-[#A6342F] text-white rounded text-[11px] cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteQuoteId(null)}
                                    className="px-2 py-1 border border-[#D6CEC1] rounded text-[11px] cursor-pointer"
                                  >
                                    Não
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteQuoteId(q.id)}
                                  className="p-1.5 rounded hover:bg-[#FCEEEE] text-[#A6342F] cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* CLIENT COMMERCIAL PROPOSAL PREVIEW MODAL (SUMMARIZED PREVIEW - UNCHANGED) */}
      {clientPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#D6CEC1] rounded-xl max-w-2xl w-full p-8 space-y-6 my-8">
            <div className="flex items-start justify-between gap-4 border-b border-[#D6CEC1] pb-5">
              <FourEverFullLogo variant="dark-on-light" className="h-10 w-auto" />
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#30483B] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Prévia
                </button>
                <button
                  type="button"
                  onClick={() => setClientPreviewOpen(false)}
                  className="p-1.5 text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-[#594634] font-medium">PROPOSTA COMERCIAL · VÁLIDA POR 30 DIAS</p>
              <h3 className="font-serif text-2xl font-semibold text-[#1F2A24]">
                {coupleName || 'Casal a confirmar'}
              </h3>
              <p className="text-sm text-[#5C554C]">
                Evento: Casamento · Local: {venue || 'A definir'} (
                {cityOption === 'Outra localidade' ? customCity || 'Outra localidade' : cityOption}) · Data:{' '}
                {weddingDate ? formatDateBR(weddingDate) : 'A definir'} · Quantidade: {estimatedGuests} pessoas
              </p>
            </div>

            <div className="p-5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-lg font-semibold text-[#30483B]">
                  {currentPackage.name}
                </h4>
                <span className="font-mono text-xl font-semibold text-[#1F2A24] tabular-nums">
                  {formatBRL(calculationSummary.finalTotal)}
                </span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#1F2A24] pt-2">
                {quoteActivities
                  .filter((a) => a.selected)
                  .map((a) => (
                    <li key={a.activityId} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#30483B] shrink-0" />
                      <span>{a.name}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="space-y-1.5 text-xs text-[#5C554C]">
              <p className="font-semibold text-[#30483B]">Formas de Pagamento</p>
              <p>{config.paymentTerms.notes}</p>
              <p className="font-mono tabular-nums text-[#1F2A24]">
                Entrada ({config.paymentTerms.depositPercent}%):{' '}
                {formatBRL((calculationSummary.finalTotal * config.paymentTerms.depositPercent) / 100)} · Saldo:{' '}
                {formatBRL(
                  calculationSummary.finalTotal -
                    (calculationSummary.finalTotal * config.paymentTerms.depositPercent) / 100
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VERSION HISTORY DRAWER */}
      {historyQuote && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/50 flex justify-end">
          <div className="bg-white w-full max-w-lg h-full p-6 overflow-y-auto space-y-5 border-l border-[#D6CEC1]">
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-4">
              <div>
                <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                  Histórico de Versões — {historyQuote.code}
                </h3>
                <p className="text-xs text-[#5C554C]">{historyQuote.coupleName}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryQuote(null)}
                className="p-1.5 text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {versions.length === 0 ? (
                <p className="text-xs text-[#5C554C]">Carregando versões históricas...</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[#30483B]">
                        Versão v{v.versionNumber}
                      </span>
                      <span className="font-mono font-semibold text-[#1F2A24] tabular-nums">
                        {formatBRL(v.calculationSummary?.finalTotal)}
                      </span>
                    </div>
                    <p className="text-[#594634] font-medium">
                      Pacote: {v.snapshotConfig?.packageSnapshot?.name} ·{' '}
                      {v.snapshotConfig?.guestBracketSnapshot?.label}
                    </p>
                    <p className="text-[#5C554C]">
                      Motivo: {v.changeReason || 'Registro de versão'} · por {v.createdByName || 'Equipe'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
