import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  Camera,
  Check,
  ExternalLink,
  Instagram,
  Mail,
  MailPlus,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  EventRecord,
  InviteRecord,
  PartnerRecord,
  SystemConfig,
  TeamMemberClassification,
  TeamMemberRecord,
  UserProfile,
  UserRole,
} from '../lib/types';
import {
  DEFAULT_PARTNER_CATEGORIES,
  getDefaultPermissionsForRole,
} from '../lib/defaults';
import {
  createInvite,
  createOrUpdatePartner,
  createOrUpdateTeamMember,
  deleteBinaryFromStorage,
  deletePartner,
  syncWorkspaceAuthorizedUids,
  uploadBinaryToStorage,
} from '../services/firestoreService';
import { canWriteOperationally, isMaster, isOpOrMaster, ROLE_LABELS } from '../services/rbac';
import { formatBRL, isValidEmail } from '../services/validation';

interface TeamPageProps {
  user: UserProfile;
  authorizedUids: string[];
  teamMembers: TeamMemberRecord[];
  invites: InviteRecord[];
  events: EventRecord[];
  partners: PartnerRecord[];
  config: SystemConfig;
}

async function compressImageToDataUrl(file: File, maxDim = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.84;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 340000 && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 380000) {
          reject(new Error('A imagem é muito pesada para armazenamento inline sem Firebase Storage.'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

export const TeamPage: React.FC<TeamPageProps> = ({
  user,
  authorizedUids,
  teamMembers,
  invites,
  events,
  partners,
  config,
}) => {
  const canManageTeam = isOpOrMaster(user);
  const canWritePartner = canWriteOperationally(user);
  const master = isMaster(user);

  const [activeTab, setActiveTab] = useState<'team' | 'partners'>('team');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Team member form modal
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRecord | null>(null);
  const [mName, setMName] = useState('');
  const [mRoleTitle, setMRoleTitle] = useState('');
  const [mProfileRole, setMProfileRole] = useState<UserRole>('MEMBER');
  const [mClassification, setMClassification] = useState<TeamMemberClassification>('PERMANENTE');
  const [mStatus, setMStatus] = useState<'ATIVO' | 'INATIVO'>('ATIVO');
  const [mEmail, setMEmail] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mPhotoUrl, setMPhotoUrl] = useState('');
  const [mPhotoStoragePath, setMPhotoStoragePath] = useState('');
  const [mPhotoFile, setMPhotoFile] = useState<File | null>(null);
  const [mRemovePhoto, setMRemovePhoto] = useState(false);
  const [mLinkedEventIds, setMLinkedEventIds] = useState<string[]>([]);
  const [mResponsibilities, setMResponsibilities] = useState('');
  const [mNotes, setMNotes] = useState('');
  const [mRemuneration, setMRemuneration] = useState(0);
  const [savingMember, setSavingMember] = useState(false);

  // Photo preview modal
  const [photoPreview, setPhotoPreview] = useState<{ title: string; url: string } | null>(null);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRoleTitle, setInvRoleTitle] = useState('Cerimonialista / Assessoria');
  const [invRole, setInvRole] = useState<Exclude<UserRole, 'MASTER_ADMIN'>>('MEMBER');

  // Partners state
  const partnerCategories = config.partnerCategories?.length
    ? config.partnerCategories
    : DEFAULT_PARTNER_CATEGORIES;
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerCategoryFilter, setPartnerCategoryFilter] = useState('ALL');
  const [partnerStatusFilter, setPartnerStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [partnerMinRating, setPartnerMinRating] = useState<number>(0);

  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRecord | null>(null);
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState(partnerCategories[0] || 'Buffet');
  const [pCity, setPCity] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pInstagram, setPInstagram] = useState('');
  const [pWebsite, setPWebsite] = useState('');
  const [pRating, setPRating] = useState<number>(5);
  const [pActive, setPActive] = useState(true);
  const [pNotes, setPNotes] = useState('');
  const [pLogoUrl, setPLogoUrl] = useState('');
  const [pLogoStoragePath, setPLogoStoragePath] = useState('');
  const [pLogoFile, setPLogoFile] = useState<File | null>(null);
  const [pRemoveLogo, setPRemoveLogo] = useState(false);
  const [savingPartner, setSavingPartner] = useState(false);

  const [partnerDetail, setPartnerDetail] = useState<PartnerRecord | null>(null);
  const [confirmDeletePartnerId, setConfirmDeletePartnerId] = useState<string | null>(null);

  const openMemberForm = (member?: TeamMemberRecord) => {
    setEditingMember(member || null);
    setMName(member?.name || '');
    setMRoleTitle(member?.roleTitle || 'Assessora de Eventos');
    setMProfileRole(member?.profileRole || 'MEMBER');
    setMClassification(member?.classification || 'PERMANENTE');
    setMStatus(member?.status || 'ATIVO');
    setMEmail(member?.email || '');
    setMPhone(member?.phone || '');
    setMPhotoUrl(member?.photoUrl || '');
    setMPhotoStoragePath(member?.photoStoragePath || '');
    setMPhotoFile(null);
    setMRemovePhoto(false);
    setMLinkedEventIds(member?.linkedEventIds || []);
    setMResponsibilities(member?.responsibilities || '');
    setMNotes(member?.notes || '');
    setMRemuneration(member?.remunerationPerEvent || 0);
    setMemberModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) return;
    setSavingMember(true);
    setFeedback(null);

    try {
      let nextPhotoUrl = mRemovePhoto ? '' : mPhotoUrl;
      let nextPhotoPath = mRemovePhoto ? '' : mPhotoStoragePath;
      let warningText: string | null = null;

      if (mRemovePhoto && mPhotoStoragePath) {
        await deleteBinaryFromStorage(mPhotoStoragePath);
      }

      if (mPhotoFile) {
        const safeName = mPhotoFile.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const targetPath = `4ever-team/${editingMember?.id || `mbr_${Date.now()}`}_${safeName}`;
        const up = await uploadBinaryToStorage({ blob: mPhotoFile, storagePath: targetPath });
        if (up.storageMode === 'FIREBASE_STORAGE') {
          if (mPhotoStoragePath && mPhotoStoragePath !== up.storagePath) {
            await deleteBinaryFromStorage(mPhotoStoragePath);
          }
          nextPhotoUrl = up.downloadUrl;
          nextPhotoPath = up.storagePath;
        } else {
          try {
            nextPhotoUrl = await compressImageToDataUrl(mPhotoFile);
            nextPhotoPath = '';
            warningText =
              'Firebase Storage indisponível no momento; foto otimizada e salva diretamente no perfil.';
          } catch (err) {
            warningText = err instanceof Error ? err.message : 'Não foi possível salvar a foto.';
          }
        }
      }

      await createOrUpdateTeamMember({
        id: editingMember?.id,
        data: {
          userId: mClassification === 'SITUACIONAL' ? '' : editingMember?.userId || '',
          name: mName.trim(),
          roleTitle: mRoleTitle.trim() || 'Integrante',
          profileRole: mClassification === 'SITUACIONAL' ? 'VIEWER' : mProfileRole,
          classification: mClassification,
          status: mStatus,
          email: mEmail.trim(),
          phone: mPhone.trim(),
          photoUrl: nextPhotoUrl,
          photoStoragePath: nextPhotoPath,
          linkedEventIds: mLinkedEventIds.slice(0, 40),
          responsibilities: mResponsibilities.trim(),
          notes: mNotes.trim(),
          remunerationPerEvent: mRemuneration,
          authorizedUids,
          createdBy: editingMember?.createdBy || user.uid,
        },
      });
      setMemberModalOpen(false);
      setFeedback({
        type: warningText ? 'warning' : 'success',
        text: warningText || 'Perfil operacional da equipe salvo.',
      });
    } finally {
      setSavingMember(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(invEmail) || !invName.trim()) {
      setFeedback({ type: 'warning', text: 'Informe um nome e e-mail válido para convidar.' });
      return;
    }
    await createInvite({
      email: invEmail,
      name: invName.trim(),
      role: invRole,
      roleTitle: invRoleTitle,
      permissions: getDefaultPermissionsForRole(invRole),
      invitedBy: user.uid,
      invitedByName: user.name,
      authorizedUids,
    });
    setInviteModalOpen(false);
    setInvEmail('');
    setInvName('');
    setFeedback({
      type: 'success',
      text: 'Convite registrado. O integrante poderá acessar usando este e-mail.',
    });
  };

  const handleSyncAccess = async () => {
    setSyncing(true);
    try {
      await syncWorkspaceAuthorizedUids(authorizedUids, user.uid);
      setFeedback({
        type: 'success',
        text: 'Permissões de acesso da equipe sincronizadas em todos os módulos.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const openPartnerModal = (partner?: PartnerRecord) => {
    setEditingPartner(partner || null);
    setPName(partner?.name || '');
    setPCategory(partner?.category || partnerCategories[0] || 'Buffet');
    setPCity(partner?.city || '');
    setPPhone(partner?.phone || '');
    setPEmail(partner?.email || '');
    setPInstagram(partner?.instagram || '');
    setPWebsite(partner?.website || '');
    setPRating(typeof partner?.rating === 'number' ? partner.rating : 5);
    setPActive(partner ? partner.active : true);
    setPNotes(partner?.notes || '');
    setPLogoUrl(partner?.logoUrl || '');
    setPLogoStoragePath(partner?.logoStoragePath || '');
    setPLogoFile(null);
    setPRemoveLogo(false);
    setPartnerModalOpen(true);
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;
    setSavingPartner(true);
    setFeedback(null);

    try {
      let nextLogoUrl = pRemoveLogo ? '' : pLogoUrl;
      let nextLogoPath = pRemoveLogo ? '' : pLogoStoragePath;
      let warningText: string | null = null;

      if (pRemoveLogo && pLogoStoragePath) {
        await deleteBinaryFromStorage(pLogoStoragePath);
      }

      if (pLogoFile) {
        const safeName = pLogoFile.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const targetPath = `4ever-partners/${editingPartner?.id || `prt_${Date.now()}`}_${safeName}`;
        const up = await uploadBinaryToStorage({ blob: pLogoFile, storagePath: targetPath });
        if (up.storageMode === 'FIREBASE_STORAGE') {
          if (pLogoStoragePath && pLogoStoragePath !== up.storagePath) {
            await deleteBinaryFromStorage(pLogoStoragePath);
          }
          nextLogoUrl = up.downloadUrl;
          nextLogoPath = up.storagePath;
        } else {
          try {
            nextLogoUrl = await compressImageToDataUrl(pLogoFile);
            nextLogoPath = '';
            warningText =
              'Firebase Storage indisponível; logo otimizada e salva diretamente no cadastro do parceiro.';
          } catch (err) {
            warningText = err instanceof Error ? err.message : 'Não foi possível salvar a logo.';
          }
        }
      }

      await createOrUpdatePartner({
        id: editingPartner?.id,
        data: {
          name: pName.trim(),
          category: pCategory || 'Outros',
          city: pCity.trim(),
          phone: pPhone.trim(),
          email: pEmail.trim(),
          instagram: pInstagram.trim(),
          website: pWebsite.trim(),
          rating: pRating,
          notes: pNotes.trim(),
          logoUrl: nextLogoUrl,
          logoStoragePath: nextLogoPath,
          active: pActive,
          authorizedUids,
          createdBy: editingPartner?.createdBy || user.uid,
        },
      });
      setPartnerModalOpen(false);
      setFeedback({
        type: warningText ? 'warning' : 'success',
        text: warningText || 'Cadastro de parceiro salvo com sucesso.',
      });
    } finally {
      setSavingPartner(false);
    }
  };

  const filteredPartners = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    return [...partners]
      .filter((p) => {
        if (partnerCategoryFilter !== 'ALL' && p.category !== partnerCategoryFilter) return false;
        if (partnerStatusFilter === 'ACTIVE' && !p.active) return false;
        if (partnerStatusFilter === 'INACTIVE' && p.active) return false;
        if (p.rating < partnerMinRating) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.city || '').toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || b.rating - a.rating || a.name.localeCompare(b.name));
  }, [partners, partnerSearch, partnerCategoryFilter, partnerStatusFilter, partnerMinRating]);

  const memberCountLabel = `${teamMembers.length} ${teamMembers.length === 1 ? 'Integrante' : 'Integrantes'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-sans text-xl font-bold tracking-tight text-[#1F2A24] lining-nums">
              4EVER | {memberCountLabel}
            </h2>
            <p className="text-xs text-[#5C554C]">
              Gestão de equipe permanente e situacional separada da rede de parceiros e fornecedores
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'team' ? (
              <>
                {master && (
                  <>
                    <button
                      type="button"
                      onClick={handleSyncAccess}
                      disabled={syncing}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#EBE6DC] cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      Sincronizar Acesso
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#30483B]/40 text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#F5F3EE] cursor-pointer"
                    >
                      <MailPlus className="w-3.5 h-3.5" />
                      Convidar por E-mail
                    </button>
                  </>
                )}
                {canManageTeam && (
                  <button
                    type="button"
                    onClick={() => openMemberForm()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Adicionar Integrante
                  </button>
                )}
              </>
            ) : (
              canWritePartner && (
                <button
                  type="button"
                  onClick={() => openPartnerModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Parceiro
                </button>
              )
            )}
          </div>
        </div>

        {/* Segmented Sub-navigation */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E7E2D8]">
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'team'
                ? 'bg-[#30483B] text-white'
                : 'bg-[#F5F3EE] text-[#594634] hover:bg-[#EBE6DC]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Equipe Interna ({teamMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('partners')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'partners'
                ? 'bg-[#30483B] text-white'
                : 'bg-[#F5F3EE] text-[#594634] hover:bg-[#EBE6DC]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Parceiros & Fornecedores ({partners.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 border rounded-lg text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'warning'
              ? 'bg-[#FDF6E9] border-[#9A6012]/30 text-[#9A6012]'
              : 'bg-[#ECF6F0] border-[#1F6E43]/25 text-[#1F6E43]'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: EQUIPE */}
      {activeTab === 'team' && (
        <>
          {teamMembers.length === 0 ? (
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#594634]">Nenhum integrante operacional cadastrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teamMembers.map((member) => {
                const explicitIds = new Set(member.linkedEventIds || []);
                const linkedEvents = events.filter(
                  (ev) =>
                    explicitIds.has(ev.id) ||
                    ev.responsibleIds.includes(member.userId || member.id) ||
                    ev.responsibleNames?.includes(member.name)
                );
                const classification: TeamMemberClassification = member.classification || 'PERMANENTE';
                const initials = member.name
                  .split(' ')
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join('')
                  .toUpperCase();

                return (
                  <div
                    key={member.id}
                    className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        {member.photoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoPreview({ title: member.name, url: member.photoUrl || '' })
                            }
                            title="Ampliar foto"
                            className="w-12 h-12 rounded-xl overflow-hidden border border-[#D6CEC1] shrink-0 cursor-pointer hover:opacity-90"
                          >
                            <img
                              src={member.photoUrl}
                              alt={member.name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#F5F3EE] border border-[#D6CEC1] flex items-center justify-center text-xs font-semibold text-[#30483B] shrink-0">
                            {initials || '4E'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-serif text-lg font-semibold text-[#1F2A24] truncate">
                            {member.name}
                          </h3>
                          <p className="text-xs text-[#594634] font-medium">
                            {member.roleTitle} ·{' '}
                            {classification === 'SITUACIONAL'
                              ? 'Apoio Situacional (sem login)'
                              : ROLE_LABELS[member.profileRole]}
                          </p>
                          <p className="text-[11px] text-[#5C554C] mt-0.5">
                            Classificação:{' '}
                            <strong className="text-[#30483B]">
                              {classification === 'SITUACIONAL' ? 'Situacional' : 'Permanente'}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          member.status === 'ATIVO' ? 'text-[#1F6E43]' : 'text-[#5C554C]'
                        }`}
                      >
                        {member.status}
                      </span>
                    </div>

                    {(member.email || member.phone) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5C554C]">
                        {member.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3 text-[#A99A83]" />
                            {member.email}
                          </span>
                        )}
                        {member.phone && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-[#A99A83]" />
                            {member.phone}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-[#5C554C] leading-relaxed">
                      {member.responsibilities || 'Responsabilidades operacionais a definir.'}
                    </p>

                    {linkedEvents.length > 0 && (
                      <div className="text-[11px] text-[#594634]">
                        <span className="font-medium">Eventos:</span>{' '}
                        {linkedEvents
                          .slice(0, 3)
                          .map((ev) => ev.coupleName)
                          .join(', ')}
                        {linkedEvents.length > 3 ? ` (+${linkedEvents.length - 3})` : ''}
                      </div>
                    )}

                    <div className="pt-3 border-t border-[#E7E2D8] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#5C554C] tabular-nums">
                        Eventos vinculados:{' '}
                        <strong className="text-[#1F2A24]">{linkedEvents.length}</strong>
                        {member.remunerationPerEvent
                          ? ` · Ref. ${formatBRL(member.remunerationPerEvent)}/ev`
                          : ''}
                      </span>
                      {canManageTeam && (
                        <button
                          type="button"
                          onClick={() => openMemberForm(member)}
                          className="font-medium text-[#30483B] hover:underline cursor-pointer"
                        >
                          Editar perfil
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending Invites */}
          {invites.length > 0 && (
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                Convites de Acesso Registrados
              </h3>
              <div className="divide-y divide-[#E7E2D8] text-xs">
                {invites.map((inv) => (
                  <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#1F2A24]">
                        {inv.name} ({inv.email})
                      </p>
                      <p className="text-[#5C554C]">
                        {ROLE_LABELS[inv.role]} · {inv.roleTitle || 'Integrante'}
                      </p>
                    </div>
                    <span className="font-mono text-[#30483B] font-medium">{inv.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: PARCEIROS */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#A99A83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                placeholder="Buscar parceiro, cidade..."
                className="w-full pl-8 pr-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <select
              value={partnerCategoryFilter}
              onChange={(e) => setPartnerCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg"
            >
              <option value="ALL">Todas as categorias</option>
              {partnerCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={partnerStatusFilter}
              onChange={(e) => setPartnerStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg"
            >
              <option value="ALL">Todos os status</option>
              <option value="ACTIVE">Somente Ativos</option>
              <option value="INACTIVE">Somente Inativos</option>
            </select>
            <select
              value={partnerMinRating}
              onChange={(e) => setPartnerMinRating(Number(e.target.value))}
              className="px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg"
            >
              <option value={0}>Qualquer avaliação (0–5 ★)</option>
              <option value={3}>3+ estrelas</option>
              <option value={4}>4+ estrelas</option>
              <option value={5}>5 estrelas</option>
            </select>
          </div>

          {filteredPartners.length === 0 ? (
            <div className="bg-white border border-[#D6CEC1] rounded-xl p-10 text-center space-y-2">
              <Briefcase className="w-8 h-8 text-[#A99A83] mx-auto" />
              <p className="text-sm font-medium text-[#594634]">
                Nenhum parceiro cadastrado para os filtros selecionados.
              </p>
              <p className="text-xs text-[#5C554C]">
                Cadastre buffets, decoradores, fotógrafos, espaços e fornecedores parceiros separados da equipe interna.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPartners.map((partner) => (
                <div
                  key={partner.id}
                  className="bg-white border border-[#D6CEC1] rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {partner.logoUrl ? (
                          <button
                            type="button"
                            onClick={() => setPartnerDetail(partner)}
                            className="w-12 h-12 rounded-xl overflow-hidden border border-[#D6CEC1] shrink-0 bg-[#F5F3EE] cursor-pointer"
                          >
                            <img
                              src={partner.logoUrl}
                              alt={partner.name}
                              className="w-full h-full object-contain p-1"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#F5F3EE] border border-[#D6CEC1] flex items-center justify-center text-[#594634] shrink-0">
                            <Building2 className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-serif text-base font-semibold text-[#1F2A24] truncate">
                            {partner.name}
                          </h3>
                          <p className="text-xs text-[#594634] font-medium truncate">
                            {partner.category}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          partner.active ? 'text-[#1F6E43]' : 'text-[#5C554C]'
                        }`}
                      >
                        {partner.active ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </div>

                    {/* Stars */}
                    <div className="flex items-center gap-1" aria-label={`Avaliação ${partner.rating} de 5`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= Math.round(partner.rating)
                              ? 'fill-[#C69214] text-[#C69214]'
                              : 'text-[#D6CEC1]'
                          }`}
                        />
                      ))}
                      <span className="ml-1.5 text-[11px] font-mono text-[#5C554C] tabular-nums">
                        {partner.rating.toFixed(1)}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-[#5C554C]">
                      {partner.city && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#A99A83] shrink-0" />
                          <span>{partner.city}</span>
                        </p>
                      )}
                      {partner.phone && (
                        <p className="flex items-center gap-1.5 font-mono">
                          <Phone className="w-3.5 h-3.5 text-[#A99A83] shrink-0" />
                          <span>{partner.phone}</span>
                        </p>
                      )}
                      {partner.instagram && (
                        <p className="flex items-center gap-1.5">
                          <Instagram className="w-3.5 h-3.5 text-[#A99A83] shrink-0" />
                          <span className="truncate">{partner.instagram}</span>
                        </p>
                      )}
                    </div>

                    {partner.notes && (
                      <p className="text-[11px] text-[#5C554C] line-clamp-2 leading-relaxed">
                        {partner.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#E7E2D8] flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPartnerDetail(partner)}
                      className="font-medium text-[#30483B] hover:underline cursor-pointer"
                    >
                      Detalhes
                    </button>
                    <div className="flex items-center gap-2">
                      {canWritePartner && (
                        <button
                          type="button"
                          onClick={() => openPartnerModal(partner)}
                          className="font-medium text-[#594634] hover:underline cursor-pointer"
                        >
                          Editar
                        </button>
                      )}
                      {canManageTeam &&
                        (confirmDeletePartnerId === partner.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await deletePartner(partner.id, partner.logoStoragePath);
                                setConfirmDeletePartnerId(null);
                                setFeedback({ type: 'success', text: 'Parceiro removido.' });
                              }}
                              className="px-2 py-0.5 bg-[#A6342F] text-white rounded text-[11px] font-medium cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePartnerId(null)}
                              className="text-[11px] text-[#5C554C] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePartnerId(partner.id)}
                            title="Excluir parceiro"
                            className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member Modal */}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMember}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                {editingMember ? 'Editar Integrante' : 'Novo Integrante'}
              </h3>
              <button type="button" onClick={() => setMemberModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Upload Block */}
            <div className="flex flex-wrap items-center gap-4 p-3.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg">
              {mPhotoFile ? (
                <div className="w-16 h-16 rounded-xl bg-white border border-[#D6CEC1] flex items-center justify-center text-[10px] text-center p-1 text-[#30483B] font-medium shrink-0">
                  {mPhotoFile.name.slice(0, 18)}
                </div>
              ) : mPhotoUrl && !mRemovePhoto ? (
                <img
                  src={mPhotoUrl}
                  alt={mName || 'Foto'}
                  className="w-16 h-16 rounded-xl object-cover border border-[#D6CEC1] shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white border border-[#D6CEC1] flex items-center justify-center text-[#A99A83] shrink-0">
                  <Camera className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <p className="font-medium text-[#594634]">Foto do Integrante</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D6CEC1] rounded-lg font-medium text-[#30483B] cursor-pointer hover:bg-[#EBE6DC]">
                    <Upload className="w-3.5 h-3.5" />
                    {mPhotoUrl && !mRemovePhoto ? 'Substituir Foto' : 'Enviar Foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setMPhotoFile(f);
                        if (f) setMRemovePhoto(false);
                      }}
                    />
                  </label>
                  {(mPhotoUrl || mPhotoFile) && !mRemovePhoto && (
                    <button
                      type="button"
                      onClick={() => {
                        setMPhotoFile(null);
                        setMRemovePhoto(true);
                      }}
                      className="px-2.5 py-1.5 text-[#A6342F] hover:bg-[#FCEEEE] rounded-lg cursor-pointer"
                    >
                      Remover Foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Nome Completo *</label>
                <input
                  required
                  type="text"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Função Operacional</label>
                <input
                  type="text"
                  value={mRoleTitle}
                  onChange={(e) => setMRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Classificação</label>
                <select
                  value={mClassification}
                  onChange={(e) =>
                    setMClassification(e.target.value as TeamMemberClassification)
                  }
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="PERMANENTE">Permanente (equipe fixa)</option>
                  <option value="SITUACIONAL">Situacional (apoio sem login)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Status</label>
                <select
                  value={mStatus}
                  onChange={(e) => setMStatus(e.target.value as 'ATIVO' | 'INATIVO')}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">
                  Diária Base / Evento (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  value={mRemuneration}
                  onChange={(e) => setMRemuneration(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">E-mail de Contato</label>
                <input
                  type="email"
                  value={mEmail}
                  onChange={(e) => setMEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={mPhone}
                  onChange={(e) => setMPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Perfil de Acesso</label>
                <select
                  value={mClassification === 'SITUACIONAL' ? 'VIEWER' : mProfileRole}
                  disabled={!master || mClassification === 'SITUACIONAL'}
                  onChange={(e) => setMProfileRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg disabled:bg-[#F5F3EE]"
                >
                  <option value="MASTER_ADMIN">Master Administrador</option>
                  <option value="OPERATIONAL_ADMIN">Administrador Operacional</option>
                  <option value="MEMBER">Integrante</option>
                  <option value="VIEWER">Visualização / Sem Login</option>
                </select>
              </div>
            </div>

            {/* Linked events multi-select */}
            <div className="space-y-1.5">
              <label className="block font-medium text-[#594634]">
                Eventos Vinculados ({mLinkedEventIds.length})
              </label>
              {events.length === 0 ? (
                <p className="text-[11px] text-[#5C554C]">Nenhum evento cadastrado ainda.</p>
              ) : (
                <div className="max-h-32 overflow-y-auto border border-[#D6CEC1] rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-[#F5F3EE]/50">
                  {events.map((ev) => {
                    const checked = mLinkedEventIds.includes(ev.id);
                    return (
                      <label
                        key={ev.id}
                        className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-[#1F2A24]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setMLinkedEventIds((prev) =>
                              checked ? prev.filter((id) => id !== ev.id) : [...prev, ev.id]
                            )
                          }
                          className="accent-[#30483B]"
                        />
                        <span className="truncate">
                          {ev.coupleName} ({ev.date})
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">Responsabilidades</label>
              <textarea
                rows={2}
                value={mResponsibilities}
                onChange={(e) => setMResponsibilities(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">Observações Internas</label>
              <textarea
                rows={2}
                value={mNotes}
                onChange={(e) => setMNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
              <button
                type="button"
                onClick={() => setMemberModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingMember}
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                {savingMember ? 'Salvando...' : 'Salvar Integrante'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendInvite}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                Convidar Integrante para Acesso
              </h3>
              <button type="button" onClick={() => setInviteModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Nome *</label>
              <input
                required
                type="text"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">
                E-mail (Google ou corporativo) *
              </label>
              <input
                required
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Perfil de Permissão</label>
                <select
                  value={invRole}
                  onChange={(e) => setInvRole(e.target.value as Exclude<UserRole, 'MASTER_ADMIN'>)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="OPERATIONAL_ADMIN">Administrador Operacional</option>
                  <option value="MEMBER">Integrante</option>
                  <option value="VIEWER">Visualização</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Função na Equipe</label>
                <input
                  type="text"
                  value={invRoleTitle}
                  onChange={(e) => setInvRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Registrar Convite
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Partner CRUD Modal */}
      {partnerModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePartner}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                {editingPartner ? 'Editar Parceiro' : 'Novo Parceiro / Fornecedor'}
              </h3>
              <button type="button" onClick={() => setPartnerModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Logo Upload Block */}
            <div className="flex flex-wrap items-center gap-4 p-3.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg">
              {pLogoFile ? (
                <div className="w-16 h-16 rounded-xl bg-white border border-[#D6CEC1] flex items-center justify-center text-[10px] text-center p-1 text-[#30483B] font-medium shrink-0">
                  {pLogoFile.name.slice(0, 18)}
                </div>
              ) : pLogoUrl && !pRemoveLogo ? (
                <img
                  src={pLogoUrl}
                  alt={pName || 'Logo'}
                  className="w-16 h-16 rounded-xl object-contain p-1 bg-white border border-[#D6CEC1] shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white border border-[#D6CEC1] flex items-center justify-center text-[#A99A83] shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <p className="font-medium text-[#594634]">Logo do Parceiro</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D6CEC1] rounded-lg font-medium text-[#30483B] cursor-pointer hover:bg-[#EBE6DC]">
                    <Upload className="w-3.5 h-3.5" />
                    {pLogoUrl && !pRemoveLogo ? 'Substituir Logo' : 'Enviar Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setPLogoFile(f);
                        if (f) setPRemoveLogo(false);
                      }}
                    />
                  </label>
                  {(pLogoUrl || pLogoFile) && !pRemoveLogo && (
                    <button
                      type="button"
                      onClick={() => {
                        setPLogoFile(null);
                        setPRemoveLogo(true);
                      }}
                      className="px-2.5 py-1.5 text-[#A6342F] hover:bg-[#FCEEEE] rounded-lg cursor-pointer"
                    >
                      Remover Logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Nome / Empresa *</label>
                <input
                  required
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Categoria *</label>
                <select
                  value={pCategory}
                  onChange={(e) => setPCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  {partnerCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!partnerCategories.includes(pCategory) && pCategory && (
                    <option value={pCategory}>{pCategory}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Cidade</label>
                <input
                  type="text"
                  value={pCity}
                  onChange={(e) => setPCity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={pPhone}
                  onChange={(e) => setPPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">E-mail</label>
                <input
                  type="email"
                  value={pEmail}
                  onChange={(e) => setPEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Instagram</label>
                <input
                  type="text"
                  placeholder="@parceiro"
                  value={pInstagram}
                  onChange={(e) => setPInstagram(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Site / Portfólio</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={pWebsite}
                  onChange={(e) => setPWebsite(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
            </div>

            {/* Interactive Star Rating + Active */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-[#F5F3EE] rounded-lg border border-[#D6CEC1]">
              <div>
                <p className="font-medium text-[#594634] mb-1">Avaliação Interna (0 a 5 estrelas)</p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setPRating(star)}
                      className="p-0.5 cursor-pointer hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= pRating
                            ? 'fill-[#C69214] text-[#C69214]'
                            : 'text-[#D6CEC1]'
                        }`}
                      />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPRating(0)}
                    className="ml-2 text-[11px] text-[#5C554C] hover:underline cursor-pointer"
                  >
                    Zerar
                  </button>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-[#1F2A24]">
                <input
                  type="checkbox"
                  checked={pActive}
                  onChange={(e) => setPActive(e.target.checked)}
                  className="accent-[#30483B]"
                />
                <span>Parceiro Ativo para Indicações</span>
              </label>
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">
                Observações / Diferenciais / Condições Comerciais
              </label>
              <textarea
                rows={3}
                value={pNotes}
                onChange={(e) => setPNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
              <button
                type="button"
                onClick={() => setPartnerModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPartner}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {savingPartner ? 'Salvando...' : 'Salvar Parceiro'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Partner Detail Modal */}
      {partnerDetail && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between gap-3 border-b border-[#D6CEC1] pb-3">
              <div className="flex items-center gap-3">
                {partnerDetail.logoUrl ? (
                  <img
                    src={partnerDetail.logoUrl}
                    alt={partnerDetail.name}
                    className="w-14 h-14 rounded-xl object-contain p-1 bg-[#F5F3EE] border border-[#D6CEC1]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-[#F5F3EE] border border-[#D6CEC1] flex items-center justify-center text-[#594634]">
                    <Building2 className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                    {partnerDetail.name}
                  </h3>
                  <p className="text-[#594634] font-medium">{partnerDetail.category}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPartnerDetail(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(partnerDetail.rating)
                      ? 'fill-[#C69214] text-[#C69214]'
                      : 'text-[#D6CEC1]'
                  }`}
                />
              ))}
              <span className="ml-2 text-[#5C554C] font-mono">
                {partnerDetail.rating.toFixed(1)} · {partnerDetail.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="space-y-1.5 text-[#1F2A24]">
              {partnerDetail.city && (
                <p>
                  <strong className="text-[#594634]">Cidade:</strong> {partnerDetail.city}
                </p>
              )}
              {partnerDetail.phone && (
                <p>
                  <strong className="text-[#594634]">Telefone:</strong>{' '}
                  <span className="font-mono">{partnerDetail.phone}</span>
                </p>
              )}
              {partnerDetail.email && (
                <p>
                  <strong className="text-[#594634]">E-mail:</strong> {partnerDetail.email}
                </p>
              )}
              {partnerDetail.instagram && (
                <p>
                  <strong className="text-[#594634]">Instagram:</strong> {partnerDetail.instagram}
                </p>
              )}
              {partnerDetail.website && (
                <p className="flex items-center gap-1.5">
                  <strong className="text-[#594634]">Site:</strong>
                  <a
                    href={partnerDetail.website.startsWith('http') ? partnerDetail.website : `https://${partnerDetail.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#30483B] hover:underline"
                  >
                    {partnerDetail.website}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              )}
              {partnerDetail.notes && (
                <div className="pt-2 border-t border-[#E7E2D8]">
                  <p className="font-medium text-[#594634] mb-1">Observações</p>
                  <p className="text-[#5C554C] leading-relaxed whitespace-pre-line">
                    {partnerDetail.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
              {canWritePartner && (
                <button
                  type="button"
                  onClick={() => {
                    const target = partnerDetail;
                    setPartnerDetail(null);
                    openPartnerModal(target);
                  }}
                  className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
                >
                  Editar Parceiro
                </button>
              )}
              <button
                type="button"
                onClick={() => setPartnerDetail(null)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Enlarged Preview Modal */}
      {photoPreview && (
        <div
          className="fixed inset-0 z-50 bg-[#1F2A24]/75 flex items-center justify-center p-4"
          onClick={() => setPhotoPreview(null)}
        >
          <div
            className="bg-white border border-[#D6CEC1] rounded-xl p-4 max-w-md w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-serif text-base font-semibold text-[#1F2A24]">
                {photoPreview.title}
              </h4>
              <button type="button" onClick={() => setPhotoPreview(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              className="w-full max-h-[65vh] object-contain rounded-lg bg-[#F5F3EE]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
