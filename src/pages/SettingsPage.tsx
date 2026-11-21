import React, { useEffect, useState } from 'react';
import {
  DatabaseBackup,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ActivityBillingType,
  ActivityConfig,
  AuditLogRecord,
  FuelHistoryEntry,
  PackageConfig,
  SystemConfig,
  UserProfile,
  UserRole,
} from '../lib/types';
import {
  addFuelHistoryEntry,
  deleteActivityConfig,
  downloadWorkspaceBackupJson,
  saveActivityConfig,
  savePackageConfig,
  saveSystemConfig,
  updateUserRoleOrStatus,
} from '../services/firestoreService';
import {
  DEFAULT_DOCUMENT_CATEGORIES,
  DEFAULT_PARTNER_CATEGORIES,
  getDefaultPermissionsForRole,
} from '../lib/defaults';
import { isMaster, ROLE_LABELS } from '../services/rbac';
import { formatBRL } from '../services/validation';

export type SettingsSubTab =
  | 'packages'
  | 'activities'
  | 'pricing'
  | 'travel'
  | 'finance'
  | 'users'
  | 'audit'
  | 'architecture';

interface SettingsPageProps {
  user: UserProfile;
  authorizedUids: string[];
  config: SystemConfig;
  packages: PackageConfig[];
  activities: ActivityConfig[];
  fuelHistory: FuelHistoryEntry[];
  users: UserProfile[];
  auditLogs: AuditLogRecord[];
  backupData?: Record<string, unknown>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  authorizedUids,
  config,
  packages,
  activities,
  fuelHistory,
  users,
  auditLogs,
  backupData,
}) => {
  const master = isMaster(user);
  const [subTab, setSubTab] = useState<SettingsSubTab>('packages');

  const [draftConfig, setDraftConfig] = useState<SystemConfig>(config);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Fuel update form
  const [newFuelPrice, setNewFuelPrice] = useState(config.fuelPricePerLiter);
  const [newFuelSource, setNewFuelSource] = useState('Atualização manual (posto / referência ANP)');

  // Package edit modal
  const [pkgModal, setPkgModal] = useState<PackageConfig | null>(null);
  const [isNewPkg, setIsNewPkg] = useState(false);

  // Activity edit modal & inline delete
  const [actModal, setActModal] = useState<ActivityConfig | null>(null);
  const [isNewAct, setIsNewAct] = useState(false);
  const [confirmDeleteActId, setConfirmDeleteActId] = useState<string | null>(null);

  // Editable categories helpers
  const [newDocCategory, setNewDocCategory] = useState('');
  const [newPartnerCategory, setNewPartnerCategory] = useState('');

  useEffect(() => {
    setDraftConfig(config);
    setNewFuelPrice(config.fuelPricePerLiter);
  }, [config]);

  const handleSaveConfig = async (summary: string) => {
    setSaving(true);
    setNotice(null);
    try {
      await saveSystemConfig({
        config: { ...draftConfig, authorizedUids },
        actorUid: user.uid,
        actorName: user.name,
        summary,
      });
      setNotice({
        type: 'success',
        text: 'Configuração salva e aplicada para novos registros (históricos antigos preservados).',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddFuelPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addFuelHistoryEntry({
        pricePerLiter: newFuelPrice,
        source: newFuelSource,
        actorUid: user.uid,
        actorName: user.name,
        authorizedUids,
        currentConfig: draftConfig,
      });
      setNotice({ type: 'success', text: 'Novo preço do combustível registrado no histórico.' });
    } finally {
      setSaving(false);
    }
  };

  if (!master && !user.permissions.settings) {
    return (
      <div className="bg-white border border-[#D6CEC1] rounded-xl p-8 text-center space-y-2">
        <h2 className="font-serif text-xl font-semibold text-[#1F2A24]">Acesso Restrito ao Master</h2>
        <p className="text-xs text-[#5C554C]">
          Apenas o Administrador Master possui permissão para alterar parâmetros globais, categorias e usuários.
        </p>
      </div>
    );
  }

  const docCats = draftConfig.documentCategories?.length
    ? draftConfig.documentCategories
    : DEFAULT_DOCUMENT_CATEGORIES;
  const partnerCats = draftConfig.partnerCategories?.length
    ? draftConfig.partnerCategories
    : DEFAULT_PARTNER_CATEGORIES;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#1F2A24]">
            Configuração Geral (Centro de Controle Master)
          </h2>
          <p className="text-xs text-[#5C554C]">
            Parâmetros comerciais, categorias, equipe, auditoria e exportação de backup portátil.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadWorkspaceBackupJson(
              backupData || {
                systemConfig: config,
                packages,
                activities,
                users,
                auditLogs,
              }
            )
          }
          title="Baixar uma cópia completa dos dados operacionais do sistema em arquivo .json"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F5F3EE] border border-[#D6CEC1] text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#EBE6DC] cursor-pointer"
        >
          <DatabaseBackup className="w-4 h-4" />
          Exportar Backup JSON
        </button>
      </div>

      {notice && (
        <div
          className={`p-3.5 border rounded-lg text-xs flex items-center justify-between gap-3 ${
            notice.type === 'warning'
              ? 'bg-[#FDF6E9] border-[#9A6012]/30 text-[#9A6012]'
              : 'bg-[#ECF6F0] border-[#1F6E43]/25 text-[#1F6E43]'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-navigation: balanced 4x2 equal-width grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white border border-[#D6CEC1] rounded-xl p-2">
        {[
          { key: 'packages', label: 'Pacotes' },
          { key: 'activities', label: 'Atividades' },
          { key: 'pricing', label: 'Precificação & Faixas' },
          { key: 'travel', label: 'Deslocamento & Combustível' },
          { key: 'finance', label: 'Financeiro & Categorias' },
          { key: 'users', label: 'Usuários & Perfis' },
          { key: 'audit', label: 'Histórico Administrativo' },
          { key: 'architecture', label: 'Arquitetura & Portabilidade' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key as SettingsSubTab)}
            className={`w-full min-h-[42px] px-3 py-2 flex items-center justify-center text-center text-xs font-medium leading-tight lg:whitespace-nowrap rounded-lg cursor-pointer transition-colors ${
              subTab === t.key
                ? 'bg-[#30483B] text-white'
                : 'bg-[#F5F3EE]/60 text-[#5C554C] hover:bg-[#F5F3EE] hover:text-[#1F2A24]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. PACOTES */}
      {subTab === 'packages' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">Pacotes Configuráveis</h3>
            <button
              type="button"
              onClick={() => {
                setIsNewPkg(true);
                setPkgModal({
                  id: '',
                  code: 'NOVO',
                  name: '',
                  description: '',
                  basePrice: 0,
                  estimatedCost: 0,
                  active: true,
                  isOperational: true,
                  sortOrder: packages.length + 1,
                  authorizedUids,
                  createdBy: user.uid,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Pacote
            </button>
          </div>
          <div className="divide-y divide-[#E7E2D8] text-xs">
            {[...packages]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((pkg) => (
                <div key={pkg.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="font-semibold text-sm text-[#1F2A24]">
                      {pkg.name} ({pkg.code}) ·{' '}
                      <span className={pkg.active ? 'text-[#1F6E43]' : 'text-[#5C554C]'}>
                        {pkg.active ? 'Ativo' : 'Inativo'}
                      </span>{' '}
                      · {pkg.isOperational ? 'Operacional' : 'Estrutura futura'}
                    </p>
                    <p className="text-[#5C554C] mt-0.5">{pkg.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono tabular-nums">
                      <p className="font-semibold text-[#30483B]">Base: {formatBRL(pkg.basePrice)}</p>
                      <p className="text-[#5C554C]">Custo est.: {formatBRL(pkg.estimatedCost)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewPkg(false);
                        setPkgModal(pkg);
                      }}
                      className="px-3 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg font-medium text-[#30483B] cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 2. ATIVIDADES */}
      {subTab === 'activities' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
              Atividades e Entregáveis ({activities.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setIsNewAct(true);
                setActModal({
                  id: '',
                  name: '',
                  description: '',
                  category: 'Planejamento',
                  defaultPrice: 0,
                  estimatedCost: 0,
                  billingType: 'INCLUDED',
                  packageIds: ['love', 'forever'],
                  active: true,
                  sortOrder: activities.length + 1,
                  rulesNotes: '',
                  authorizedUids,
                  createdBy: user.uid,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Atividade
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#D6CEC1] text-[#594634]">
                  <th className="py-2.5 px-3 font-semibold">Atividade & Descrição</th>
                  <th className="py-2.5 px-3 font-semibold">Categoria</th>
                  <th className="py-2.5 px-3 font-semibold">Pacotes</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Valor Adicional</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Custo Est.</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E2D8]">
                {[...activities]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((act) => (
                    <tr key={act.id}>
                      <td className="py-2.5 px-3 max-w-xs">
                        <p className="font-medium text-[#1F2A24]">
                          {act.name}{' '}
                          {!act.active && <span className="text-[#A6342F]">(Inativa)</span>}
                        </p>
                        {act.description && (
                          <p className="text-[11px] text-[#5C554C] line-clamp-1">{act.description}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#5C554C]">{act.category}</td>
                      <td className="py-2.5 px-3 text-[#5C554C]">{act.packageIds.join(', ') || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatBRL(act.defaultPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatBRL(act.estimatedCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewAct(false);
                            setActModal(act);
                          }}
                          className="text-[#30483B] font-medium hover:underline cursor-pointer"
                        >
                          Editar
                        </button>
                        {confirmDeleteActId === act.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteActivityConfig(act, user.uid, user.name);
                                setConfirmDeleteActId(null);
                              }}
                              className="px-2 py-0.5 bg-[#A6342F] text-white rounded text-[11px] cursor-pointer"
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteActId(null)}
                              className="text-[11px] text-[#5C554C] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteActId(act.id)}
                            className="text-[#A6342F] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. PRECIFICAÇÃO & FAIXAS DE CONVIDADOS */}
      {subTab === 'pricing' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                Faixas de Convidados & Fórmula de Precificação (Parâmetros Provisórios)
              </h3>
              <p className="text-[#5C554C]">
                Defina multiplicadores, taxas por faixa e margem comercial padrão
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveConfig('Atualização de faixas de convidados e fórmula')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Regras
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-[#594634] mb-1">Margem Comercial Padrão (%)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={draftConfig.pricingFormula?.defaultMarginPercent || 0}
                onChange={(e) =>
                  setDraftConfig((c) => ({
                    ...c,
                    pricingFormula: {
                      mode: c.pricingFormula?.mode || 'PACKAGE_PLUS_EXTRAS',
                      includeBracketExtraFee: c.pricingFormula?.includeBracketExtraFee ?? true,
                      applyGuestMultiplierOnBase: c.pricingFormula?.applyGuestMultiplierOnBase ?? true,
                      defaultMarginPercent: Number(e.target.value || 0),
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
              />
            </div>
            <label className="flex items-center gap-2 pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={draftConfig.pricingFormula?.applyGuestMultiplierOnBase ?? true}
                onChange={(e) =>
                  setDraftConfig((c) => ({
                    ...c,
                    pricingFormula: {
                      ...(c.pricingFormula || {
                        mode: 'PACKAGE_PLUS_EXTRAS',
                        includeBracketExtraFee: true,
                        defaultMarginPercent: 0,
                      }),
                      applyGuestMultiplierOnBase: e.target.checked,
                    },
                  }))
                }
                className="accent-[#30483B]"
              />
              <span>Aplicar multiplicador de faixa sobre valor-base</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[#594634]">Faixas Editáveis</p>
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((c) => ({
                    ...c,
                    guestBrackets: [
                      ...c.guestBrackets,
                      {
                        id: `faixa_${Date.now()}`,
                        label: 'Nova faixa',
                        minGuests: 0,
                        maxGuests: 100,
                        multiplier: 1,
                        extraFee: 0,
                        isProvisional: true,
                      },
                    ],
                  }))
                }
                className="text-[#30483B] font-medium hover:underline cursor-pointer"
              >
                + Adicionar faixa
              </button>
            </div>
            <div className="space-y-2">
              {draftConfig.guestBrackets.map((b, idx) => (
                <div key={b.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => {
                      const next = [...draftConfig.guestBrackets];
                      next[idx] = { ...b, label: e.target.value };
                      setDraftConfig((c) => ({ ...c, guestBrackets: next }));
                    }}
                    className="col-span-5 px-2.5 py-1.5 border border-[#D6CEC1] rounded"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={b.multiplier}
                    onChange={(e) => {
                      const next = [...draftConfig.guestBrackets];
                      next[idx] = { ...b, multiplier: Number(e.target.value || 1) };
                      setDraftConfig((c) => ({ ...c, guestBrackets: next }));
                    }}
                    title="Multiplicador"
                    className="col-span-3 px-2.5 py-1.5 border border-[#D6CEC1] rounded font-mono"
                  />
                  <input
                    type="number"
                    step="10"
                    value={b.extraFee}
                    onChange={(e) => {
                      const next = [...draftConfig.guestBrackets];
                      next[idx] = { ...b, extraFee: Number(e.target.value || 0) };
                      setDraftConfig((c) => ({ ...c, guestBrackets: next }));
                    }}
                    title="Taxa extra (R$)"
                    className="col-span-3 px-2.5 py-1.5 border border-[#D6CEC1] rounded font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraftConfig((c) => ({
                        ...c,
                        guestBrackets: c.guestBrackets.filter((_, i) => i !== idx),
                      }))
                    }
                    className="col-span-1 text-[#A6342F] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. DESLOCAMENTO & COMBUSTÍVEL */}
      {subTab === 'travel' && (
        <div className="space-y-6 text-xs">
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                Parâmetros de Deslocamento (Base & Consumo)
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveConfig('Atualização de parâmetros de deslocamento')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Deslocamento
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#594634] mb-1">Endereço-base Operacional</label>
                <input
                  type="text"
                  value={draftConfig.baseAddress}
                  onChange={(e) => setDraftConfig((c) => ({ ...c, baseAddress: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">
                  Consumo Veículo (km/L — provisório)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={draftConfig.vehicleConsumptionKmPerL}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      vehicleConsumptionKmPerL: Number(e.target.value || 5),
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Desgaste Veículo (R$/km)</label>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  value={draftConfig.vehicleWearPerKm || 0}
                  onChange={(e) =>
                    setDraftConfig((c) => ({ ...c, vehicleWearPerKm: Number(e.target.value || 0) }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Alimentação Padrão (R$)</label>
                <input
                  type="number"
                  min={0}
                  value={draftConfig.defaultMealAllowance || 0}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      defaultMealAllowance: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <label className="flex items-center gap-2 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(draftConfig.chargeMealInBaseCity)}
                  onChange={(e) =>
                    setDraftConfig((c) => ({ ...c, chargeMealInBaseCity: e.target.checked }))
                  }
                  className="accent-[#30483B]"
                />
                <span>Cobrar alimentação automaticamente em Macaé</span>
              </label>
            </div>
          </div>

          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
              Preço do Combustível & Histórico (Preparado p/ ANP)
            </h3>
            <form onSubmit={handleAddFuelPrice} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Novo Preço (R$/L)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.1}
                  value={newFuelPrice}
                  onChange={(e) => setNewFuelPrice(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#594634] mb-1">Fonte da Informação</label>
                <input
                  type="text"
                  value={newFuelSource}
                  onChange={(e) => setNewFuelSource(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Atualizar & Registrar
              </button>
            </form>

            {fuelHistory.length > 0 && (
              <div className="divide-y divide-[#E7E2D8] pt-2">
                {fuelHistory.slice(0, 8).map((f) => (
                  <div key={f.id} className="py-2 flex items-center justify-between">
                    <span>
                      <strong className="font-mono">{formatBRL(f.pricePerLiter)}/L</strong> · {f.source}
                    </span>
                    <span className="text-[#5C554C]">{f.recordedByName || 'Master'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. FINANCEIRO & CATEGORIAS */}
      {subTab === 'finance' && (
        <div className="space-y-6 text-xs">
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                Condições Comerciais & Categorias Operacionais
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveConfig('Atualização de condições financeiras e categorias')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Financeiro & Categorias
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Entrada Padrão (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draftConfig.paymentTerms.depositPercent}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      paymentTerms: { ...c.paymentTerms, depositPercent: Number(e.target.value || 0) },
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">
                  Prazo Saldo Antes do Evento (dias)
                </label>
                <input
                  type="number"
                  min={0}
                  value={draftConfig.paymentTerms.balanceDueDaysBeforeEvent}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      paymentTerms: {
                        ...c.paymentTerms,
                        balanceDueDaysBeforeEvent: Number(e.target.value || 1),
                      },
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Máx. Parcelas</label>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.paymentTerms.maxInstallments}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      paymentTerms: {
                        ...c.paymentTerms,
                        maxInstallments: Number(e.target.value || 1),
                      },
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-medium text-[#594634] mb-1">Texto de Condição na Proposta</label>
                <textarea
                  rows={2}
                  value={draftConfig.paymentTerms.notes}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      paymentTerms: { ...c.paymentTerms, notes: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Editable Document & Partner Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Document Categories */}
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-base font-semibold text-[#1F2A24]">
                  Categorias de Documentos ({docCats.length})
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((c) => ({
                      ...c,
                      documentCategories: DEFAULT_DOCUMENT_CATEGORIES,
                    }))
                  }
                  className="text-[11px] text-[#30483B] hover:underline cursor-pointer"
                >
                  Restaurar padrão
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value)}
                  placeholder="Nova categoria de documento..."
                  className="flex-1 px-3 py-1.5 border border-[#D6CEC1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newDocCategory.trim();
                    if (!clean || docCats.includes(clean)) return;
                    setDraftConfig((c) => ({
                      ...c,
                      documentCategories: [...docCats, clean].slice(0, 40),
                    }));
                    setNewDocCategory('');
                  }}
                  className="px-3 py-1.5 bg-[#30483B] text-white rounded-lg font-medium cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
              <div className="divide-y divide-[#E7E2D8] max-h-56 overflow-y-auto">
                {docCats.map((cat) => (
                  <div key={cat} className="py-1.5 flex items-center justify-between">
                    <span className="text-[#1F2A24]">{cat}</span>
                    {docCats.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftConfig((c) => ({
                            ...c,
                            documentCategories: docCats.filter((x) => x !== cat),
                          }))
                        }
                        className="text-[#A6342F] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Partner Categories */}
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-base font-semibold text-[#1F2A24]">
                  Categorias de Parceiros ({partnerCats.length})
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((c) => ({
                      ...c,
                      partnerCategories: DEFAULT_PARTNER_CATEGORIES,
                    }))
                  }
                  className="text-[11px] text-[#30483B] hover:underline cursor-pointer"
                >
                  Restaurar padrão
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPartnerCategory}
                  onChange={(e) => setNewPartnerCategory(e.target.value)}
                  placeholder="Nova categoria de parceiro..."
                  className="flex-1 px-3 py-1.5 border border-[#D6CEC1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newPartnerCategory.trim();
                    if (!clean || partnerCats.includes(clean)) return;
                    setDraftConfig((c) => ({
                      ...c,
                      partnerCategories: [...partnerCats, clean].slice(0, 40),
                    }));
                    setNewPartnerCategory('');
                  }}
                  className="px-3 py-1.5 bg-[#30483B] text-white rounded-lg font-medium cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
              <div className="divide-y divide-[#E7E2D8] max-h-56 overflow-y-auto">
                {partnerCats.map((cat) => (
                  <div key={cat} className="py-1.5 flex items-center justify-between">
                    <span className="text-[#1F2A24]">{cat}</span>
                    {partnerCats.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftConfig((c) => ({
                            ...c,
                            partnerCategories: partnerCats.filter((x) => x !== cat),
                          }))
                        }
                        className="text-[#A6342F] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. USUÁRIOS & PERFIS */}
      {subTab === 'users' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4 text-xs">
          <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
            Usuários Autenticados & Permissões
          </h3>
          <div className="divide-y divide-[#E7E2D8]">
            {users.map((u) => {
              const isSelf = u.uid === user.uid;
              return (
                <div key={u.uid} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-[#1F2A24]">{u.name}</p>
                    <p className="text-[#5C554C]">
                      {u.email} · {ROLE_LABELS[u.role]} · {u.status}
                    </p>
                  </div>
                  {master && !isSelf && (
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => {
                          const newRole = e.target.value as UserRole;
                          void updateUserRoleOrStatus({
                            targetUser: u,
                            updates: {
                              role: newRole,
                              permissions: getDefaultPermissionsForRole(newRole),
                            },
                            actorUid: user.uid,
                            actorName: user.name,
                            authorizedUids,
                          });
                        }}
                        className="px-2.5 py-1.5 border border-[#D6CEC1] rounded-lg bg-[#F5F3EE]"
                      >
                        <option value="OPERATIONAL_ADMIN">Administrador Operacional</option>
                        <option value="MEMBER">Integrante</option>
                        <option value="VIEWER">Visualização</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          void updateUserRoleOrStatus({
                            targetUser: u,
                            updates: { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
                            actorUid: user.uid,
                            actorName: user.name,
                            authorizedUids,
                          })
                        }
                        className="px-3 py-1.5 border border-[#D6CEC1] rounded-lg hover:bg-[#F5F3EE] cursor-pointer"
                      >
                        {u.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. HISTÓRICO ADMINISTRATIVO */}
      {subTab === 'audit' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4 text-xs">
          <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
            Histórico de Alterações Administrativas ({auditLogs.length})
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-[#5C554C] py-6 text-center">Nenhum registro de auditoria ainda.</p>
          ) : (
            <div className="divide-y divide-[#E7E2D8]">
              {auditLogs.slice(0, 50).map((log) => (
                <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#1F2A24]">
                      {log.action} · {log.entityLabel || log.entityId}
                    </p>
                    <p className="text-[#5C554C]">
                      {log.userName} · {log.newValueSummary || log.previousValueSummary}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#5C554C]">{log.entityType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. ARQUITETURA & PORTABILIDADE */}
      {subTab === 'architecture' && (
        <div className="space-y-6 text-xs">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#1F2A24]">
              <Layers className="w-5 h-5 text-[#30483B]" />
              <h3 className="font-serif text-lg font-semibold">Arquitetura em Três Camadas — 4EVER</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-xl bg-[#F5F3EE] border border-[#D6CEC1] text-[#1F2A24] space-y-2">
                <p className="font-semibold text-[#594634]">CAMADA 1 — INTERFACE</p>
                <p className="leading-relaxed">
                  React + TypeScript + Tailwind CSS: Dashboard operacional, Simulador de orçamentos com prévia comercial, Calendário com bloqueios, Financeiro com confirmação manual e comprovante PDF, Equipe/Parceiros e Documentos.
                </p>
              </div>
              <div className="p-6 rounded-xl bg-[#A99A83] text-[#1F2A24] space-y-2">
                <p className="font-semibold">CAMADA 2 — REGRAS & CÁLCULOS</p>
                <p className="leading-relaxed">
                  Motor dinâmico de precificação, cálculo de deslocamento, geração de comprovantes financeiros PDF (pdf-lib), RBAC e validação de conflitos de agenda.
                </p>
              </div>
              <div className="p-6 rounded-xl bg-[#30483B] text-[#F5F3EE] space-y-2">
                <p className="font-semibold text-[#A99A83]">CAMADA 3 — BANCO & ARMAZENAMENTO</p>
                <p className="leading-relaxed">
                  Firebase Authentication, Cloud Firestore com Security Rules validadas e Firebase Storage para documentos, fotos e comprovantes.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2D8] pb-3">
              <div>
                <h4 className="font-serif text-base font-semibold text-[#1F2A24]">
                  Portabilidade (GitHub, Hostinger & Backup JSON)
                </h4>
                <p className="text-[#5C554C]">
                  Código fonte estruturado sem lock-in de plataforma, pronto para versionamento e hospedagem própria.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadWorkspaceBackupJson(
                    backupData || {
                      systemConfig: config,
                      packages,
                      activities,
                      users,
                      auditLogs,
                    }
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white rounded-lg font-medium cursor-pointer"
              >
                <DatabaseBackup className="w-4 h-4" />
                Baixar Backup JSON Completo
              </button>
            </div>
            <div className="p-3.5 rounded-lg bg-[#F5F3EE] border border-[#D6CEC1] text-[#594634] space-y-1">
              <p className="font-semibold text-[#1F2A24]">O que é o Backup JSON?</p>
              <p className="leading-relaxed">
                É um arquivo de segurança portátil contendo toda a base cadastral e operacional da 4EVER (configurações, pacotes, atividades, casais, orçamentos, eventos, contratos, parcelas, comprovantes, despesas, equipe, parceiros e histórico). Ele permite guardar uma cópia de segurança local fora da nuvem e migrar dados facilmente sem depender de nenhuma plataforma.
              </p>
            </div>
            <ul className="space-y-1.5 text-[#5C554C] list-disc pl-5">
              <li>
                <strong>Hostinger / Build de Produção:</strong> execute <code className="font-mono text-[#1F2A24]">npm install && npm run build</code> para gerar <code className="font-mono text-[#1F2A24]">dist/</code> (ou execute <code className="font-mono text-[#1F2A24]">npm start</code> com Express).
              </li>
              <li>
                <strong>Domínios Autorizados no Firebase Auth:</strong> ao publicar em domínio próprio (ex.: <code className="font-mono text-[#1F2A24]">gestao.4evercerimonial.com.br</code>), adicione o domínio em <em>Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</em>.
              </li>
              <li>
                <strong>Firebase Storage:</strong> ative o bucket em <em>Firebase Console &gt; Storage</em> para persistência binária de documentos, comprovantes e fotos da equipe.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* PACKAGE EDIT MODAL */}
      {pkgModal && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await savePackageConfig({
                pkg: pkgModal,
                isNew: isNewPkg,
                actorUid: user.uid,
                actorName: user.name,
              });
              setPkgModal(null);
            }}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
              {isNewPkg ? 'Criar Pacote' : `Editar ${pkgModal.name}`}
            </h3>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Nome</label>
              <input
                required
                type="text"
                value={pkgModal.name}
                onChange={(e) => setPkgModal({ ...pkgModal, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Valor Base (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={pkgModal.basePrice}
                  onChange={(e) => setPkgModal({ ...pkgModal, basePrice: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Custo Estimado (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={pkgModal.estimatedCost}
                  onChange={(e) =>
                    setPkgModal({ ...pkgModal, estimatedCost: Number(e.target.value || 0) })
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Descrição</label>
              <textarea
                rows={2}
                value={pkgModal.description || ''}
                onChange={(e) => setPkgModal({ ...pkgModal, description: e.target.value })}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pkgModal.active}
                  onChange={(e) => setPkgModal({ ...pkgModal, active: e.target.checked })}
                  className="accent-[#30483B]"
                />
                <span>Ativo</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pkgModal.isOperational}
                  onChange={(e) => setPkgModal({ ...pkgModal, isOperational: e.target.checked })}
                  className="accent-[#30483B]"
                />
                <span>Operacional no Simulador</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPkgModal(null)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Salvar Pacote
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ACTIVITY EDIT MODAL */}
      {actModal && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await saveActivityConfig({
                activity: actModal,
                isNew: isNewAct,
                actorUid: user.uid,
                actorName: user.name,
              });
              setActModal(null);
            }}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs"
          >
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
              {isNewAct ? 'Nova Atividade' : 'Editar Atividade'}
            </h3>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Nome da Atividade *</label>
              <input
                required
                type="text"
                value={actModal.name}
                onChange={(e) => setActModal({ ...actModal, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Descrição Operacional</label>
              <textarea
                rows={2}
                value={actModal.description || ''}
                onChange={(e) => setActModal({ ...actModal, description: e.target.value })}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Categoria</label>
                <input
                  type="text"
                  value={actModal.category}
                  onChange={(e) => setActModal({ ...actModal, category: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Tipo de Cobrança</label>
                <select
                  value={actModal.billingType}
                  onChange={(e) =>
                    setActModal({ ...actModal, billingType: e.target.value as ActivityBillingType })
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="INCLUDED">Incluída no pacote</option>
                  <option value="ADDITIONAL">Adicional fixo</option>
                  <option value="PER_GUEST">Por convidado</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Valor Adicional (R$)</label>
                <input
                  type="number"
                  min={0}
                  value={actModal.defaultPrice}
                  onChange={(e) =>
                    setActModal({ ...actModal, defaultPrice: Number(e.target.value || 0) })
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Custo Estimado (R$)</label>
                <input
                  type="number"
                  min={0}
                  value={actModal.estimatedCost}
                  onChange={(e) =>
                    setActModal({ ...actModal, estimatedCost: Number(e.target.value || 0) })
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Regras / Notas Comerciais</label>
              <input
                type="text"
                value={actModal.rulesNotes || ''}
                onChange={(e) => setActModal({ ...actModal, rulesNotes: e.target.value })}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-[#594634]">Incluída nos Pacotes:</p>
              <div className="flex flex-wrap gap-3">
                {packages
                  .filter((p) => p.isOperational)
                  .map((p) => {
                    const checked = actModal.packageIds.includes(p.id);
                    return (
                      <label key={p.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setActModal({
                              ...actModal,
                              packageIds: checked
                                ? actModal.packageIds.filter((id) => id !== p.id)
                                : [...actModal.packageIds, p.id],
                            })
                          }
                          className="accent-[#30483B]"
                        />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={actModal.active}
                onChange={(e) => setActModal({ ...actModal, active: e.target.checked })}
                className="accent-[#30483B]"
              />
              <span>Atividade ativa</span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActModal(null)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Salvar Atividade
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
