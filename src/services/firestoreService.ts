import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import {
  BOOTSTRAP_MASTER_EMAIL,
  DEFAULT_ACTIVITIES_SEED,
  DEFAULT_PACKAGES_SEED,
  DEFAULT_PDF_TEMPLATE_SEED,
  DEFAULT_SYSTEM_CONFIG_SEED,
  getDefaultPermissionsForRole,
} from '../lib/defaults';
import type {
  ActivityConfig,
  AuditLogRecord,
  ContractRecord,
  CoupleRecord,
  DocumentCategory,
  DocumentFolderRecord,
  DocumentRecord,
  EventRecord,
  EventStatus,
  EventTask,
  EventTaskWithEvent,
  EventTimelineItem,
  ExpenseRecord,
  FuelHistoryEntry,
  InstallmentRecord,
  InviteRecord,
  ModulePermissions,
  PackageConfig,
  PartnerRecord,
  PdfFieldMapping,
  PdfTemplateRecord,
  PendingPaymentEntry,
  PostEventFeedback,
  QuoteEmissionRecord,
  QuoteRecord,
  QuoteStatus,
  QuoteVersionRecord,
  ReceiptRecord,
  ScheduleBlockRecord,
  SystemConfig,
  TeamMemberRecord,
  UserProfile,
  UserRole,
} from '../lib/types';
import { clampNumber, clampString, generateCode, normalizeEmail, sanitizeId } from './validation';

function newDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

export async function logAudit(params: {
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  previousValueSummary?: string;
  newValueSummary?: string;
  authorizedUids: string[];
}) {
  const id = newDocId('log');
  const path = `auditLogs/${id}`;
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      userId: params.userId,
      userName: clampString(params.userName, 120) || 'Equipe 4EVER',
      action: clampString(params.action, 80),
      entityType: clampString(params.entityType, 60),
      entityId: clampString(params.entityId, 128),
      entityLabel: clampString(params.entityLabel, 200),
      previousValueSummary: clampString(params.previousValueSummary, 1000),
      newValueSummary: clampString(params.newValueSummary, 1000),
      authorizedUids: params.authorizedUids.length ? params.authorizedUids.slice(0, 20) : [params.userId],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export interface BootstrapResult {
  authorized: boolean;
  profile: UserProfile | null;
  reason?: string;
}

export async function bootstrapUserAndWorkspace(authUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}): Promise<BootstrapResult> {
  const email = normalizeEmail(authUser.email || '');
  if (!authUser.emailVerified || !email) {
    return {
      authorized: false,
      profile: null,
      reason: 'Seu e-mail precisa estar verificado para acessar o 4EVER Management.',
    };
  }

  const userPath = `users/${authUser.uid}`;
  let existingUserSnap;
  try {
    existingUserSnap = await getDoc(doc(db, 'users', authUser.uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (existingUserSnap.exists()) {
    const profile = existingUserSnap.data() as UserProfile;
    if (profile.status !== 'ACTIVE') {
      return {
        authorized: false,
        profile: null,
        reason: 'Seu usuário está desativado. Contate o Administrador Master.',
      };
    }

    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-critical login timestamp update
    }

    if (profile.role === 'MASTER_ADMIN') {
      await ensureDefaultWorkspaceSeed(authUser.uid, profile.name);
    }

    return { authorized: true, profile };
  }

  // First-time user: check if bootstrap master email or invited team member
  const isBootstrapMaster = email === BOOTSTRAP_MASTER_EMAIL;
  if (isBootstrapMaster) {
    const displayName = clampString(authUser.displayName || 'Administrador Master 4EVER', 120);
    const newProfile: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastLoginAt'> = {
      uid: authUser.uid,
      name: displayName,
      email,
      role: 'MASTER_ADMIN',
      status: 'ACTIVE',
      roleTitle: 'Direção & Administração Master',
      permissions: getDefaultPermissionsForRole('MASTER_ADMIN'),
      authorizedUids: [authUser.uid],
    };

    try {
      await setDoc(doc(db, 'users', authUser.uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }

    await ensureDefaultWorkspaceSeed(authUser.uid, displayName);
    return { authorized: true, profile: newProfile as UserProfile };
  }

  // Check invite by exact lowercase email doc ID
  const invitePath = `invites/${email}`;
  let inviteSnap;
  try {
    inviteSnap = await getDoc(doc(db, 'invites', email));
  } catch {
    return {
      authorized: false,
      profile: null,
      reason: `O e-mail ${email} ainda não possui convite cadastrado pelo Administrador Master.`,
    };
  }

  if (!inviteSnap.exists()) {
    return {
      authorized: false,
      profile: null,
      reason: `O e-mail ${email} não está autorizado para acesso interno. Solicite ao Administrador Master o pré-cadastro.`,
    };
  }

  const invite = inviteSnap.data() as InviteRecord;
  if (invite.status !== 'PENDING') {
    return {
      authorized: false,
      profile: null,
      reason: 'Este convite não está mais pendente ou foi revogado.',
    };
  }

  const authUids = Array.from(new Set([...(invite.authorizedUids || []), authUser.uid])).slice(0, 20);
  const newProfile: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastLoginAt'> = {
    uid: authUser.uid,
    name: clampString(authUser.displayName || invite.name, 120),
    email,
    role: invite.role,
    status: 'ACTIVE',
    roleTitle: clampString(invite.roleTitle || 'Integrante da Equipe', 100),
    permissions: invite.permissions || getDefaultPermissionsForRole(invite.role),
    authorizedUids: authUids,
  };

  try {
    await setDoc(doc(db, 'users', authUser.uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'invites', email), {
      status: 'ACCEPTED',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  return { authorized: true, profile: newProfile as UserProfile };
}

export async function ensureDefaultWorkspaceSeed(masterUid: string, masterName: string) {
  // Seed systemConfig/main if missing
  try {
    const cfgRef = doc(db, 'systemConfig', 'main');
    const cfgSnap = await getDoc(cfgRef);
    if (!cfgSnap.exists()) {
      await setDoc(cfgRef, {
        ...DEFAULT_SYSTEM_CONFIG_SEED(masterUid),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'systemConfig/main');
  }

  // Seed default packages if missing
  for (const pkg of DEFAULT_PACKAGES_SEED(masterUid)) {
    const pkgRef = doc(db, 'packages', pkg.id);
    try {
      const snap = await getDoc(pkgRef);
      if (!snap.exists()) {
        const { id: _id, ...pkgData } = pkg;
        await setDoc(pkgRef, {
          ...pkgData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `packages/${pkg.id}`);
    }
  }

  // Seed default activities if none exist yet
  try {
    const actSnap = await getDocs(
      query(collection(db, 'activities'), where('authorizedUids', 'array-contains', masterUid))
    );
    if (actSnap.empty) {
      const batch = writeBatch(db);
      for (const act of DEFAULT_ACTIVITIES_SEED(masterUid)) {
        const { id, ...actData } = act;
        batch.set(doc(db, 'activities', id), {
          ...actData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'activities');
  }

  // Ensure Master Admin has a teamMembers profile
  try {
    const tmRef = doc(db, 'teamMembers', masterUid);
    const tmSnap = await getDoc(tmRef);
    if (!tmSnap.exists()) {
      await setDoc(tmRef, {
        userId: masterUid,
        name: clampString(masterName, 120),
        roleTitle: 'Direção & Cerimonial Master',
        profileRole: 'MASTER_ADMIN',
        classification: 'PERMANENTE',
        status: 'ATIVO',
        email: BOOTSTRAP_MASTER_EMAIL,
        phone: '',
        photoUrl: '',
        photoStoragePath: '',
        linkedEventIds: [],
        responsibilities: 'Gestão estratégica, aprovação final de propostas, configuração geral e condução de eventos.',
        notes: 'Administrador Master inicial do 4EVER Management.',
        remunerationPerEvent: 0,
        authorizedUids: [masterUid],
        createdBy: masterUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `teamMembers/${masterUid}`);
  }

  // Seed default PDF proposal template if missing
  try {
    const tplRef = doc(db, 'pdfTemplates', 'default_4ever_v1');
    const tplSnap = await getDoc(tplRef);
    if (!tplSnap.exists()) {
      await setDoc(tplRef, {
        ...DEFAULT_PDF_TEMPLATE_SEED(masterUid, masterName),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pdfTemplates/default_4ever_v1');
  }
}

// Subscribe helper for authorized workspace collections
export function subscribeAuthorizedCollection<T>(
  collectionName: string,
  uid: string,
  onData: (items: T[]) => void
): Unsubscribe {
  const q = query(collection(db, collectionName), where('authorizedUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as T);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export function subscribeSystemConfig(
  onData: (config: SystemConfig | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'systemConfig', 'main'),
    (snap) => {
      onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as SystemConfig) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'systemConfig/main');
    }
  );
}

// =========================================================================
// QUOTES & IMMUTABLE VERSIONS
// =========================================================================

export async function createQuoteWithVersion(params: {
  payload: Omit<QuoteRecord, 'id' | 'createdAt' | 'updatedAt' | 'currentVersionNumber'>;
  snapshotConfig: QuoteVersionRecord['snapshotConfig'];
  changeReason: string;
  actorName: string;
}): Promise<string> {
  const quoteId = newDocId('orc');
  const quotePath = `quotes/${quoteId}`;
  try {
    await setDoc(doc(db, 'quotes', quoteId), {
      ...params.payload,
      coupleName: clampString(params.payload.coupleName, 160),
      phone: clampString(params.payload.phone, 40),
      email: clampString(params.payload.email, 160),
      venue: clampString(params.payload.venue, 180),
      customCity: clampString(params.payload.customCity, 100),
      observations: clampString(params.payload.observations, 2000),
      currentVersionNumber: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const versionId = 'v1';
    await setDoc(doc(db, 'quotes', quoteId, 'versions', versionId), {
      quoteId,
      versionNumber: 1,
      snapshotConfig: params.snapshotConfig,
      selectedActivities: params.payload.selectedActivities,
      travelInput: params.payload.travelInput,
      adjustments: params.payload.adjustments,
      calculationSummary: params.payload.calculationSummary,
      changeReason: clampString(params.changeReason || 'Criação inicial do orçamento', 500),
      createdBy: params.payload.createdBy,
      createdByName: clampString(params.actorName, 120),
      authorizedUids: params.payload.authorizedUids,
      createdAt: serverTimestamp(),
    });

    await logAudit({
      userId: params.payload.createdBy,
      userName: params.actorName,
      action: 'CREATE_QUOTE',
      entityType: 'Quote',
      entityId: quoteId,
      entityLabel: `${params.payload.code} — ${params.payload.coupleName}`,
      newValueSummary: `Versão v1 · Total R$ ${params.payload.calculationSummary.finalTotal.toFixed(2)}`,
      authorizedUids: params.payload.authorizedUids,
    });

    return quoteId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, quotePath);
  }
}

export async function updateQuoteWithNewVersion(params: {
  quoteId: string;
  existingQuote: QuoteRecord;
  updates: Partial<Omit<QuoteRecord, 'id' | 'createdAt' | 'createdBy'>>;
  snapshotConfig: QuoteVersionRecord['snapshotConfig'];
  changeReason: string;
  actorUid: string;
  actorName: string;
}) {
  const quotePath = `quotes/${params.quoteId}`;
  const nextVersion = (params.existingQuote.currentVersionNumber || 1) + 1;
  try {
    const mergedActivities = params.updates.selectedActivities || params.existingQuote.selectedActivities;
    const mergedTravel = params.updates.travelInput || params.existingQuote.travelInput;
    const mergedAdj = params.updates.adjustments || params.existingQuote.adjustments;
    const mergedSummary = params.updates.calculationSummary || params.existingQuote.calculationSummary;
    const mergedAuthUids = params.updates.authorizedUids || params.existingQuote.authorizedUids;

    await updateDoc(doc(db, 'quotes', params.quoteId), {
      ...params.updates,
      coupleName: clampString(params.updates.coupleName ?? params.existingQuote.coupleName, 160),
      phone: clampString(params.updates.phone ?? params.existingQuote.phone, 40),
      email: clampString(params.updates.email ?? params.existingQuote.email, 160),
      venue: clampString(params.updates.venue ?? params.existingQuote.venue, 180),
      customCity: clampString(params.updates.customCity ?? params.existingQuote.customCity, 100),
      observations: clampString(params.updates.observations ?? params.existingQuote.observations, 2000),
      currentVersionNumber: nextVersion,
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'quotes', params.quoteId, 'versions', `v${nextVersion}`), {
      quoteId: params.quoteId,
      versionNumber: nextVersion,
      snapshotConfig: params.snapshotConfig,
      selectedActivities: mergedActivities,
      travelInput: mergedTravel,
      adjustments: mergedAdj,
      calculationSummary: mergedSummary,
      changeReason: clampString(params.changeReason || `Atualização v${nextVersion}`, 500),
      createdBy: params.actorUid,
      createdByName: clampString(params.actorName, 120),
      authorizedUids: mergedAuthUids,
      createdAt: serverTimestamp(),
    });

    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'UPDATE_QUOTE_VERSION',
      entityType: 'Quote',
      entityId: params.quoteId,
      entityLabel: `${params.existingQuote.code} — ${params.updates.coupleName || params.existingQuote.coupleName}`,
      previousValueSummary: `v${params.existingQuote.currentVersionNumber} · R$ ${params.existingQuote.calculationSummary.finalTotal.toFixed(2)}`,
      newValueSummary: `v${nextVersion} · R$ ${mergedSummary.finalTotal.toFixed(2)} (${params.changeReason || 'Edição'})`,
      authorizedUids: mergedAuthUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, quotePath);
  }
}

export async function updateQuoteStatus(params: {
  quote: QuoteRecord;
  newStatus: QuoteStatus;
  actorUid: string;
  actorName: string;
}) {
  const path = `quotes/${params.quote.id}`;
  try {
    await updateDoc(doc(db, 'quotes', params.quote.id), {
      status: params.newStatus,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'UPDATE_QUOTE_STATUS',
      entityType: 'Quote',
      entityId: params.quote.id,
      entityLabel: `${params.quote.code} — ${params.quote.coupleName}`,
      previousValueSummary: params.quote.status,
      newValueSummary: params.newStatus,
      authorizedUids: params.quote.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteQuoteRecord(quote: QuoteRecord, actorUid: string, actorName: string) {
  const path = `quotes/${quote.id}`;
  try {
    await deleteDoc(doc(db, 'quotes', quote.id));
    await logAudit({
      userId: actorUid,
      userName: actorName,
      action: 'DELETE_QUOTE',
      entityType: 'Quote',
      entityId: quote.id,
      entityLabel: `${quote.code} — ${quote.coupleName}`,
      previousValueSummary: `Status ${quote.status}`,
      newValueSummary: 'Excluído',
      authorizedUids: quote.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeQuoteVersions(
  quoteId: string,
  uid: string,
  onData: (versions: QuoteVersionRecord[]) => void
): Unsubscribe {
  const path = `quotes/${quoteId}/versions`;
  const q = query(collection(db, 'quotes', quoteId, 'versions'), where('authorizedUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as QuoteVersionRecord)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// =========================================================================
// COUPLES
// =========================================================================

export async function createCouple(params: {
  coupleName: string;
  phone?: string;
  email?: string;
  weddingDate?: string;
  venue?: string;
  city?: string;
  notes?: string;
  authorizedUids: string[];
  createdBy: string;
}): Promise<string> {
  const id = newDocId('casal');
  try {
    await setDoc(doc(db, 'couples', id), {
      coupleName: clampString(params.coupleName, 160),
      phone: clampString(params.phone, 40),
      email: clampString(params.email, 160),
      weddingDate: clampString(params.weddingDate, 30),
      venue: clampString(params.venue, 180),
      city: clampString(params.city, 100),
      notes: clampString(params.notes, 1500),
      authorizedUids: params.authorizedUids,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `couples/${id}`);
  }
}

// =========================================================================
// QUOTE TO EVENT CONVERSION & EVENTS / CHECKLIST / TIMELINE
// =========================================================================

export async function convertQuoteToEvent(params: {
  quote: QuoteRecord;
  config: SystemConfig;
  actorUid: string;
  actorName: string;
}): Promise<string> {
  const { quote, config, actorUid, actorName } = params;
  if (quote.convertedEventId) {
    return quote.convertedEventId;
  }

  const eventId = newDocId('evt');
  const eventCode = generateCode('EVT');
  const resolvedCity = quote.cityOption === 'Outra localidade' ? (quote.customCity || 'Outra localidade') : quote.cityOption;
  const eventDate = quote.weddingDate || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Create Event
    await setDoc(doc(db, 'events', eventId), {
      code: eventCode,
      coupleId: quote.coupleId || '',
      coupleName: clampString(quote.coupleName, 160),
      quoteId: quote.id,
      date: eventDate,
      time: '16:00',
      venue: clampString(quote.venue || 'Local a definir', 180),
      city: clampString(resolvedCity, 100),
      guestCount: clampNumber(quote.estimatedGuests || 0, 0),
      packageId: quote.packageId,
      packageName: clampString(quote.packageName || '', 100),
      contractedValue: clampNumber(quote.calculationSummary.finalTotal, 0),
      status: 'CONTRATADO' as EventStatus,
      responsibleIds: [actorUid],
      responsibleNames: [clampString(actorName, 120)],
      observations: clampString(quote.observations || `Convertido do orçamento ${quote.code}`, 3000),
      postEventFeedback: {
        internalFeedback: '',
        postEventNotes: '',
        issuesIdentified: '',
        improvementSuggestions: '',
        lessonsLearned: '',
      },
      authorizedUids: quote.authorizedUids,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Link quote -> event to prevent duplicate conversion
    await updateDoc(doc(db, 'quotes', quote.id), {
      convertedEventId: eventId,
      status: 'APROVADO',
      updatedAt: serverTimestamp(),
    });

    // 3. Seed initial checklist tasks from selected activities
    const selectedActs = quote.selectedActivities.filter((a) => a.selected);
    const taskBatch = writeBatch(db);
    selectedActs.slice(0, 20).forEach((act) => {
      const taskId = newDocId('tsk');
      taskBatch.set(doc(db, 'events', eventId, 'tasks', taskId), {
        eventId,
        title: clampString(act.name, 200),
        description: clampString(`Atividade originada do ${quote.packageName || 'pacote contratado'}`, 1000),
        assigneeId: actorUid,
        assigneeName: clampString(actorName, 120),
        dueDate: eventDate,
        priority: 'MEDIA',
        status: 'PENDENTE',
        notes: '',
        completedAt: '',
        authorizedUids: quote.authorizedUids,
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await taskBatch.commit();

    // 4. Create initial Financial Contract & Installments from configurable Payment Terms
    await createContractWithInstallments({
      eventId,
      eventName: quote.coupleName,
      coupleName: quote.coupleName,
      quoteId: quote.id,
      contractedValue: quote.calculationSummary.finalTotal,
      depositPercent: config.paymentTerms.depositPercent,
      installmentsCount: 3,
      eventDate,
      balanceDueDaysBeforeEvent: config.paymentTerms.balanceDueDaysBeforeEvent,
      paymentTermsNotes: config.paymentTerms.notes,
      authorizedUids: quote.authorizedUids,
      createdBy: actorUid,
    });

    await logAudit({
      userId: actorUid,
      userName: actorName,
      action: 'CONVERT_QUOTE_TO_EVENT',
      entityType: 'Event',
      entityId: eventId,
      entityLabel: `${eventCode} — ${quote.coupleName}`,
      previousValueSummary: `Orçamento ${quote.code}`,
      newValueSummary: `Evento + Checklist (${selectedActs.length} tarefas) + Contrato Financeiro criados`,
      authorizedUids: quote.authorizedUids,
    });

    return eventId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `events/${eventId}`);
  }
}

export async function createEventRecord(params: {
  payload: Omit<EventRecord, 'id' | 'code' | 'createdAt' | 'updatedAt'>;
  actorName: string;
}): Promise<string> {
  const id = newDocId('evt');
  const code = generateCode('EVT');
  try {
    await setDoc(doc(db, 'events', id), {
      ...params.payload,
      code,
      coupleName: clampString(params.payload.coupleName, 160),
      venue: clampString(params.payload.venue, 180),
      city: clampString(params.payload.city, 100),
      observations: clampString(params.payload.observations, 3000),
      postEventFeedback: params.payload.postEventFeedback || {
        internalFeedback: '',
        postEventNotes: '',
        issuesIdentified: '',
        improvementSuggestions: '',
        lessonsLearned: '',
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.payload.createdBy,
      userName: params.actorName,
      action: 'CREATE_EVENT',
      entityType: 'Event',
      entityId: id,
      entityLabel: `${code} — ${params.payload.coupleName}`,
      newValueSummary: `Data ${params.payload.date} · Status ${params.payload.status}`,
      authorizedUids: params.payload.authorizedUids,
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `events/${id}`);
  }
}

export async function updateEventRecord(
  eventId: string,
  updates: Partial<Omit<EventRecord, 'id' | 'createdAt' | 'createdBy'>>,
  actorUid: string,
  actorName: string,
  authorizedUids: string[]
) {
  try {
    await updateDoc(doc(db, 'events', eventId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: actorUid,
      userName: actorName,
      action: 'UPDATE_EVENT',
      entityType: 'Event',
      entityId: eventId,
      entityLabel: updates.coupleName || eventId,
      newValueSummary: `Status: ${updates.status || 'atualizado'}`,
      authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `events/${eventId}`);
  }
}

export async function updateEventFeedback(
  event: EventRecord,
  feedback: PostEventFeedback,
  actorUid: string
) {
  try {
    await updateDoc(doc(db, 'events', event.id), {
      postEventFeedback: feedback,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `events/${event.id}`);
  }
}

export function subscribeEventTasks(
  eventId: string,
  uid: string,
  onData: (tasks: EventTask[]) => void
): Unsubscribe {
  const path = `events/${eventId}/tasks`;
  return onSnapshot(
    query(collection(db, 'events', eventId, 'tasks'), where('authorizedUids', 'array-contains', uid)),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as EventTask));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createEventTask(eventId: string, task: Omit<EventTask, 'id' | 'eventId' | 'createdAt' | 'updatedAt'>) {
  const id = newDocId('tsk');
  try {
    await setDoc(doc(db, 'events', eventId, 'tasks', id), {
      ...task,
      eventId,
      title: clampString(task.title, 200),
      description: clampString(task.description, 1000),
      notes: clampString(task.notes, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `events/${eventId}/tasks/${id}`);
  }
}

export async function updateEventTask(
  eventId: string,
  taskId: string,
  updates: Partial<Omit<EventTask, 'id' | 'eventId' | 'createdAt' | 'createdBy'>>
) {
  try {
    await updateDoc(doc(db, 'events', eventId, 'tasks', taskId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `events/${eventId}/tasks/${taskId}`);
  }
}

export async function deleteEventTask(eventId: string, taskId: string) {
  try {
    await deleteDoc(doc(db, 'events', eventId, 'tasks', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `events/${eventId}/tasks/${taskId}`);
  }
}

export function subscribeEventTimeline(
  eventId: string,
  uid: string,
  onData: (items: EventTimelineItem[]) => void
): Unsubscribe {
  const path = `events/${eventId}/timeline`;
  return onSnapshot(
    query(collection(db, 'events', eventId, 'timeline'), where('authorizedUids', 'array-contains', uid)),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as EventTimelineItem)
        .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot) || a.sortOrder - b.sortOrder);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createTimelineItem(
  eventId: string,
  item: Omit<EventTimelineItem, 'id' | 'eventId' | 'createdAt' | 'updatedAt'>
) {
  const id = newDocId('tl');
  try {
    await setDoc(doc(db, 'events', eventId, 'timeline', id), {
      ...item,
      eventId,
      timeSlot: clampString(item.timeSlot, 20),
      activity: clampString(item.activity, 200),
      responsible: clampString(item.responsible, 120),
      notes: clampString(item.notes, 600),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `events/${eventId}/timeline/${id}`);
  }
}

export async function updateTimelineItem(
  eventId: string,
  itemId: string,
  updates: Partial<Omit<EventTimelineItem, 'id' | 'eventId' | 'createdAt' | 'createdBy'>>
) {
  try {
    await updateDoc(doc(db, 'events', eventId, 'timeline', itemId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `events/${eventId}/timeline/${itemId}`);
  }
}

export async function deleteTimelineItem(eventId: string, itemId: string) {
  try {
    await deleteDoc(doc(db, 'events', eventId, 'timeline', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `events/${eventId}/timeline/${itemId}`);
  }
}

// =========================================================================
// FINANCEIRO (CONTRACTS, INSTALLMENTS, PAYMENTS, EXPENSES)
// =========================================================================

export async function createContractWithInstallments(params: {
  eventId: string;
  eventName: string;
  coupleName: string;
  quoteId?: string;
  contractedValue: number;
  depositPercent: number;
  installmentsCount: number;
  eventDate: string;
  balanceDueDaysBeforeEvent: number;
  paymentTermsNotes?: string;
  observations?: string;
  authorizedUids: string[];
  createdBy: string;
}): Promise<string> {
  const contractId = newDocId('ctr');
  const value = clampNumber(params.contractedValue, 0);
  const depPct = Math.min(100, Math.max(0, Number(params.depositPercent || 25)));
  const depositAmount = Number(((value * depPct) / 100).toFixed(2));
  const remaining = Number(Math.max(0, value - depositAmount).toFixed(2));
  const count = Math.max(1, Math.min(24, Math.floor(params.installmentsCount || 1)));

  try {
    await setDoc(doc(db, 'contracts', contractId), {
      eventId: params.eventId,
      eventName: clampString(params.eventName, 160),
      coupleName: clampString(params.coupleName, 160),
      quoteId: params.quoteId || '',
      contractedValue: value,
      depositPercent: depPct,
      depositAmount,
      installmentsCount: count + (depositAmount > 0 ? 1 : 0),
      paymentTermsNotes: clampString(params.paymentTermsNotes, 500),
      status: 'ATIVO',
      observations: clampString(params.observations, 1000),
      authorizedUids: params.authorizedUids,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const eventTime = new Date(params.eventDate || Date.now() + 30 * 86400000).getTime();
    const limitTime = eventTime - Math.max(1, params.balanceDueDaysBeforeEvent) * 86400000;
    const nowTime = Date.now();
    const span = Math.max(86400000, limitTime - nowTime);

    const instBatch = writeBatch(db);
    let instNumber = 1;

    if (depositAmount > 0) {
      const depId = newDocId('inst');
      instBatch.set(doc(db, 'installments', depId), {
        contractId,
        eventId: params.eventId,
        eventName: clampString(params.eventName, 160),
        number: instNumber++,
        label: `Entrada (${depPct}%)`,
        dueDate: todayStr,
        amount: depositAmount,
        paidAmount: 0,
        status: 'PENDENTE',
        paymentMethod: '',
        paidAt: '',
        notes: 'Entrada para confirmação da reserva.',
        paymentHistory: [],
        authorizedUids: params.authorizedUids,
        createdBy: params.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (remaining > 0) {
      const perInst = Number((remaining / count).toFixed(2));
      for (let i = 0; i < count; i++) {
        const isLast = i === count - 1;
        const amt = isLast ? Number((remaining - perInst * (count - 1)).toFixed(2)) : perInst;
        const dueMs = nowTime + Math.round((span * (i + 1)) / count);
        const dueDate = new Date(dueMs).toISOString().slice(0, 10);
        const instId = newDocId('inst');
        instBatch.set(doc(db, 'installments', instId), {
          contractId,
          eventId: params.eventId,
          eventName: clampString(params.eventName, 160),
          number: instNumber++,
          label: `Parcela ${i + 1}/${count}`,
          dueDate,
          amount: amt,
          paidAmount: 0,
          status: 'PENDENTE',
          paymentMethod: '',
          paidAt: '',
          notes: '',
          paymentHistory: [],
          authorizedUids: params.authorizedUids,
          createdBy: params.createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await instBatch.commit();
    return contractId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `contracts/${contractId}`);
  }
}

export async function recordInstallmentPayment(params: {
  installment: InstallmentRecord;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  actorUid: string;
  actorName: string;
}): Promise<string> {
  const {
    installment,
    paymentAmount,
    paymentDate,
    paymentMethod,
    notes,
    attachmentUrl,
    attachmentName,
    actorUid,
    actorName,
  } = params;
  const paymentId = newDocId('pay');
  const added = clampNumber(paymentAmount, 0);
  const newPaid = Number(Math.min(installment.amount, installment.paidAmount + added).toFixed(2));
  const newStatus: InstallmentRecord['status'] =
    newPaid >= installment.amount - 0.01 ? 'PAGO' : newPaid > 0 ? 'PARCIAL' : 'PENDENTE';

  const newEntry = {
    paymentId,
    amount: added,
    paidAt: paymentDate,
    method: clampString(paymentMethod, 60),
    notes: clampString(notes, 300),
    attachmentUrl: clampString(attachmentUrl, 1000),
    attachmentName: clampString(attachmentName, 200),
    recordedBy: actorUid,
    confirmedBy: actorUid,
    confirmedByName: clampString(actorName, 120),
    confirmedAt: new Date().toISOString().slice(0, 10),
  };

  try {
    await updateDoc(doc(db, 'installments', installment.id), {
      paidAmount: newPaid,
      status: newStatus,
      paymentMethod: clampString(paymentMethod, 60),
      paidAt: paymentDate,
      notes: clampString(notes || installment.notes, 500),
      paymentHistory: [...(installment.paymentHistory || []), newEntry].slice(-50),
      updatedAt: serverTimestamp(),
    });

    await logAudit({
      userId: actorUid,
      userName: actorName,
      action: 'CONFIRM_PAYMENT',
      entityType: 'Installment',
      entityId: installment.id,
      entityLabel: `${installment.eventName || installment.eventId} — ${installment.label}`,
      previousValueSummary: `Pago R$ ${installment.paidAmount.toFixed(2)}`,
      newValueSummary: `Confirmado R$ ${added.toFixed(2)} · Acumulado R$ ${newPaid.toFixed(2)} (${newStatus}) via ${paymentMethod}`,
      authorizedUids: installment.authorizedUids,
    });
    return paymentId;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `installments/${installment.id}`);
  }
}

export async function submitPendingPayment(params: {
  installment: InstallmentRecord;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  actorUid: string;
  actorName: string;
}): Promise<string> {
  const pendingId = newDocId('pend');
  const entry: PendingPaymentEntry = {
    pendingId,
    amount: clampNumber(params.paymentAmount, 0),
    submittedAt: new Date().toISOString().slice(0, 10),
    paymentDate: params.paymentDate,
    method: clampString(params.paymentMethod, 60),
    notes: clampString(params.notes, 300),
    attachmentUrl: clampString(params.attachmentUrl, 1000),
    attachmentName: clampString(params.attachmentName, 200),
    submittedBy: params.actorUid,
    submittedByName: clampString(params.actorName, 120),
    status: 'AGUARDANDO_CONFIRMACAO',
  };

  try {
    // Does NOT alter paidAmount or status — requires explicit confirmation
    await updateDoc(doc(db, 'installments', params.installment.id), {
      pendingPayments: [...(params.installment.pendingPayments || []), entry].slice(-30),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'SUBMIT_PAYMENT_PROOF',
      entityType: 'Installment',
      entityId: params.installment.id,
      entityLabel: `${params.installment.eventName || params.installment.eventId} — ${params.installment.label}`,
      newValueSummary: `Comprovante/pagamento pendente de R$ ${entry.amount.toFixed(2)} aguardando confirmação manual`,
      authorizedUids: params.installment.authorizedUids,
    });
    return pendingId;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `installments/${params.installment.id}`);
  }
}

export async function confirmPendingPayment(params: {
  installment: InstallmentRecord;
  pendingId: string;
  actorUid: string;
  actorName: string;
}): Promise<string> {
  const target = (params.installment.pendingPayments || []).find(
    (p) => p.pendingId === params.pendingId && p.status === 'AGUARDANDO_CONFIRMACAO'
  );
  if (!target) {
    throw new Error('Pagamento pendente não encontrado ou já processado.');
  }
  const paymentId = newDocId('pay');
  const added = clampNumber(target.amount, 0);
  const newPaid = Number(
    Math.min(params.installment.amount, params.installment.paidAmount + added).toFixed(2)
  );
  const newStatus: InstallmentRecord['status'] =
    newPaid >= params.installment.amount - 0.01 ? 'PAGO' : newPaid > 0 ? 'PARCIAL' : 'PENDENTE';

  const confirmedHistoryEntry = {
    paymentId,
    amount: added,
    paidAt: target.paymentDate,
    method: target.method,
    notes: target.notes || '',
    attachmentUrl: target.attachmentUrl || '',
    attachmentName: target.attachmentName || '',
    recordedBy: target.submittedBy,
    confirmedBy: params.actorUid,
    confirmedByName: clampString(params.actorName, 120),
    confirmedAt: new Date().toISOString().slice(0, 10),
  };

  const updatedPendings = (params.installment.pendingPayments || []).map((p) =>
    p.pendingId === params.pendingId
      ? {
          ...p,
          status: 'CONFIRMADO' as const,
          reviewedByName: params.actorName,
          reviewedAt: new Date().toISOString().slice(0, 10),
        }
      : p
  );

  try {
    await updateDoc(doc(db, 'installments', params.installment.id), {
      paidAmount: newPaid,
      status: newStatus,
      paymentMethod: target.method,
      paidAt: target.paymentDate,
      paymentHistory: [...(params.installment.paymentHistory || []), confirmedHistoryEntry].slice(-50),
      pendingPayments: updatedPendings,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'MANUAL_CONFIRM_PENDING_PAYMENT',
      entityType: 'Installment',
      entityId: params.installment.id,
      entityLabel: `${params.installment.eventName || params.installment.eventId} — ${params.installment.label}`,
      previousValueSummary: `Pago R$ ${params.installment.paidAmount.toFixed(2)}`,
      newValueSummary: `Abatido manualmente R$ ${added.toFixed(2)} · Total pago R$ ${newPaid.toFixed(2)} (${newStatus})`,
      authorizedUids: params.installment.authorizedUids,
    });
    return paymentId;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `installments/${params.installment.id}`);
  }
}

export async function rejectPendingPayment(params: {
  installment: InstallmentRecord;
  pendingId: string;
  reason: string;
  actorUid: string;
  actorName: string;
}) {
  const updatedPendings = (params.installment.pendingPayments || []).map((p) =>
    p.pendingId === params.pendingId
      ? {
          ...p,
          status: 'REJEITADO' as const,
          rejectionReason: clampString(params.reason || 'Não validado pela conferência financeira', 200),
          reviewedByName: params.actorName,
          reviewedAt: new Date().toISOString().slice(0, 10),
        }
      : p
  );

  try {
    await updateDoc(doc(db, 'installments', params.installment.id), {
      pendingPayments: updatedPendings,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'REJECT_PENDING_PAYMENT',
      entityType: 'Installment',
      entityId: params.installment.id,
      entityLabel: `${params.installment.eventName || params.installment.eventId} — ${params.installment.label}`,
      newValueSummary: `Comprovante rejeitado sem abatimento: ${params.reason || 'Conferência'}`,
      authorizedUids: params.installment.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `installments/${params.installment.id}`);
  }
}

export async function createExpense(params: Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = newDocId('desp');
  try {
    await setDoc(doc(db, 'expenses', id), {
      ...params,
      name: clampString(params.name, 160),
      category: clampString(params.category, 80),
      amount: clampNumber(params.amount, 0),
      notes: clampString(params.notes, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `expenses/${id}`);
  }
}

export async function updateExpenseStatus(expense: ExpenseRecord, status: 'PENDENTE' | 'PAGO') {
  try {
    await updateDoc(doc(db, 'expenses', expense.id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `expenses/${expense.id}`);
  }
}

export async function deleteExpense(expenseId: string) {
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseId}`);
  }
}

// =========================================================================
// TEAM, USERS & INVITES
// =========================================================================

export async function createInvite(params: {
  email: string;
  name: string;
  role: Exclude<UserRole, 'MASTER_ADMIN'>;
  roleTitle: string;
  permissions: ModulePermissions;
  invitedBy: string;
  invitedByName: string;
  authorizedUids: string[];
}) {
  const email = normalizeEmail(params.email);
  try {
    await setDoc(doc(db, 'invites', email), {
      email,
      name: clampString(params.name, 120),
      role: params.role,
      roleTitle: clampString(params.roleTitle, 100),
      permissions: params.permissions,
      status: 'PENDING',
      invitedBy: params.invitedBy,
      authorizedUids: params.authorizedUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.invitedBy,
      userName: params.invitedByName,
      action: 'INVITE_USER',
      entityType: 'Invite',
      entityId: email,
      entityLabel: `${params.name} (${email})`,
      newValueSummary: `Perfil ${params.role}`,
      authorizedUids: params.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `invites/${email}`);
  }
}

export async function updateUserRoleOrStatus(params: {
  targetUser: UserProfile;
  updates: { role?: UserRole; status?: 'ACTIVE' | 'INACTIVE'; permissions?: ModulePermissions; roleTitle?: string };
  actorUid: string;
  actorName: string;
  authorizedUids: string[];
}) {
  try {
    await updateDoc(doc(db, 'users', params.targetUser.uid), {
      ...params.updates,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'UPDATE_USER_ACCESS',
      entityType: 'User',
      entityId: params.targetUser.uid,
      entityLabel: `${params.targetUser.name} (${params.targetUser.email})`,
      previousValueSummary: `Perfil ${params.targetUser.role} · Status ${params.targetUser.status}`,
      newValueSummary: `Perfil ${params.updates.role || params.targetUser.role} · Status ${params.updates.status || params.targetUser.status}`,
      authorizedUids: params.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.targetUser.uid}`);
  }
}

export async function createOrUpdateTeamMember(params: {
  id?: string;
  data: Omit<TeamMemberRecord, 'id' | 'createdAt' | 'updatedAt'>;
}) {
  const id = params.id || newDocId('mbr');
  try {
    if (params.id) {
      const { createdBy: _cb, ...rest } = params.data;
      await updateDoc(doc(db, 'teamMembers', id), {
        ...rest,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'teamMembers', id), {
        ...params.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `teamMembers/${id}`);
  }
}

export async function syncWorkspaceAuthorizedUids(activeUids: string[], actorUid: string) {
  const collections = [
    'systemConfig',
    'fuelHistory',
    'packages',
    'activities',
    'couples',
    'quotes',
    'events',
    'scheduleBlocks',
    'contracts',
    'installments',
    'receipts',
    'expenses',
    'teamMembers',
    'partners',
    'documentFolders',
    'documents',
    'pdfTemplates',
    'quoteEmissions',
    'auditLogs',
    'users',
    'invites',
  ];

  const cleanUids = Array.from(new Set(activeUids)).slice(0, 20);
  for (const col of collections) {
    try {
      const snap = await getDocs(
        query(collection(db, col), where('authorizedUids', 'array-contains', actorUid))
      );
      const batch = writeBatch(db);
      let count = 0;
      snap.docs.forEach((d) => {
        const current = (d.data().authorizedUids as string[]) || [];
        const missing = cleanUids.some((u) => !current.includes(u));
        if (missing) {
          batch.update(d.ref, { authorizedUids: cleanUids });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
    } catch {
      // Skip immutable collections
    }
  }
}

// =========================================================================
// STORAGE UPLOAD HELPERS & DOCUMENTS
// =========================================================================

export async function uploadBinaryToStorage(params: {
  blob: Blob;
  storagePath: string;
}): Promise<{
  downloadUrl: string;
  storagePath: string;
  storageMode: 'FIREBASE_STORAGE' | 'METADATA_ONLY';
  storageWarning?: string;
}> {
  try {
    const storageRef = ref(storage, params.storagePath);
    await uploadBytes(storageRef, params.blob);
    const downloadUrl = await getDownloadURL(storageRef);
    return {
      downloadUrl,
      storagePath: params.storagePath,
      storageMode: 'FIREBASE_STORAGE',
    };
  } catch (err) {
    return {
      downloadUrl: '',
      storagePath: '',
      storageMode: 'METADATA_ONLY',
      storageWarning:
        err instanceof Error
          ? `Firebase Storage não autorizado ou não ativado no Console (${err.message}).`
          : 'Firebase Storage indisponível no momento.',
    };
  }
}

export async function deleteBinaryFromStorage(storagePath?: string) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Non-fatal if already deleted or Storage unconfigured
  }
}

export async function uploadDocumentRecord(params: {
  file: File | Blob | null;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  title: string;
  category: DocumentCategory;
  folderId?: string;
  isTemplate?: boolean;
  eventId?: string;
  eventName?: string;
  coupleId?: string;
  coupleName?: string;
  contractId?: string;
  partnerId?: string;
  partnerName?: string;
  memberId?: string;
  memberName?: string;
  quoteId?: string;
  paymentId?: string;
  notes?: string;
  externalUrl?: string;
  uploadedBy: string;
  uploadedByName: string;
  authorizedUids: string[];
}): Promise<{ id: string; downloadUrl: string; storagePath: string; storageWarning?: string }> {
  const id = newDocId('doc');
  let storageMode: 'FIREBASE_STORAGE' | 'METADATA_ONLY' = 'METADATA_ONLY';
  let storagePath = '';
  let downloadUrl = clampString(params.externalUrl || '', 1000);
  let storageWarning: string | undefined;

  const resolvedFileName =
    params.fileName || (params.file instanceof File ? params.file.name : '');
  const resolvedMime =
    params.mimeType || (params.file instanceof File ? params.file.type : params.file?.type || '');
  const resolvedSize = params.fileSize ?? params.file?.size ?? 0;

  if (params.file) {
    const safeName = (resolvedFileName || 'arquivo.pdf').replace(/[^a-zA-Z0-9._\-]/g, '_');
    const targetPath = `4ever-documents/${id}_${safeName}`;
    const up = await uploadBinaryToStorage({ blob: params.file, storagePath: targetPath });
    if (up.storageMode === 'FIREBASE_STORAGE') {
      storageMode = 'FIREBASE_STORAGE';
      storagePath = up.storagePath;
      downloadUrl = up.downloadUrl;
    } else {
      storageWarning = up.storageWarning
        ? `${up.storageWarning} Metadados registrados sem armazenamento binário.`
        : 'Firebase Storage indisponível no momento.';
    }
  }

  try {
    await setDoc(doc(db, 'documents', id), {
      title: clampString(params.title, 160),
      category: clampString(params.category, 80) || 'Outros',
      folderId: params.folderId || '',
      fileName: clampString(resolvedFileName, 200),
      mimeType: clampString(resolvedMime, 120),
      fileSize: resolvedSize,
      storagePath,
      downloadUrl,
      storageMode,
      isTemplate: Boolean(params.isTemplate),
      eventId: params.eventId || '',
      eventName: clampString(params.eventName, 160),
      coupleId: params.coupleId || '',
      coupleName: clampString(params.coupleName, 160),
      contractId: params.contractId || '',
      partnerId: params.partnerId || '',
      partnerName: clampString(params.partnerName, 160),
      memberId: params.memberId || '',
      memberName: clampString(params.memberName, 160),
      quoteId: params.quoteId || '',
      paymentId: params.paymentId || '',
      notes: clampString(params.notes, 1000),
      uploadedBy: params.uploadedBy,
      uploadedByName: clampString(params.uploadedByName, 120),
      authorizedUids: params.authorizedUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, downloadUrl, storagePath, storageWarning };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `documents/${id}`);
  }
}

export async function updateDocumentRecordMeta(
  docId: string,
  updates: Partial<Pick<DocumentRecord, 'folderId' | 'category' | 'title' | 'notes'>>
) {
  try {
    await updateDoc(doc(db, 'documents', docId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `documents/${docId}`);
  }
}

export async function deleteDocumentRecord(docId: string, storagePath?: string) {
  try {
    await deleteDoc(doc(db, 'documents', docId));
    if (storagePath) {
      await deleteBinaryFromStorage(storagePath);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `documents/${docId}`);
  }
}

// =========================================================================
// MASTER CONFIGURATION UPDATES (SETTINGS)
// =========================================================================

export async function saveSystemConfig(params: {
  config: SystemConfig;
  actorUid: string;
  actorName: string;
  summary: string;
}) {
  const { id: _id, ...payload } = params.config;
  try {
    await setDoc(doc(db, 'systemConfig', 'main'), {
      ...payload,
      updatedBy: params.actorUid,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: 'UPDATE_SYSTEM_CONFIG',
      entityType: 'SystemConfig',
      entityId: 'main',
      entityLabel: 'Configuração Geral 4EVER',
      newValueSummary: params.summary,
      authorizedUids: params.config.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'systemConfig/main');
  }
}

export async function addFuelHistoryEntry(params: {
  pricePerLiter: number;
  source: string;
  notes?: string;
  actorUid: string;
  actorName: string;
  authorizedUids: string[];
  currentConfig: SystemConfig;
}) {
  const id = newDocId('fuel');
  try {
    await setDoc(doc(db, 'fuelHistory', id), {
      pricePerLiter: clampNumber(params.pricePerLiter, 0.01),
      source: clampString(params.source || 'Atualização manual', 160),
      notes: clampString(params.notes, 300),
      recordedBy: params.actorUid,
      recordedByName: clampString(params.actorName, 120),
      authorizedUids: params.authorizedUids,
      createdAt: serverTimestamp(),
    });

    await saveSystemConfig({
      config: {
        ...params.currentConfig,
        fuelPricePerLiter: clampNumber(params.pricePerLiter, 0),
        fuelPriceSource: clampString(params.source || 'Atualização manual', 160),
        fuelPriceUpdatedAt: new Date().toISOString().slice(0, 10),
      },
      actorUid: params.actorUid,
      actorName: params.actorName,
      summary: `Preço do combustível atualizado para R$ ${params.pricePerLiter.toFixed(2)}/L (${params.source})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `fuelHistory/${id}`);
  }
}

export async function savePackageConfig(params: {
  pkg: Omit<PackageConfig, 'createdAt' | 'updatedAt'>;
  isNew: boolean;
  actorUid: string;
  actorName: string;
}) {
  const { id, ...rest } = params.pkg;
  const docId = sanitizeId(id || newDocId('pkg'));
  try {
    if (params.isNew) {
      await setDoc(doc(db, 'packages', docId), {
        ...rest,
        createdBy: params.actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const { createdBy: _cb, ...updateData } = rest;
      await updateDoc(doc(db, 'packages', docId), {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: params.isNew ? 'CREATE_PACKAGE' : 'UPDATE_PACKAGE',
      entityType: 'Package',
      entityId: docId,
      entityLabel: params.pkg.name,
      newValueSummary: `Valor Base R$ ${params.pkg.basePrice.toFixed(2)} · Ativo: ${params.pkg.active ? 'Sim' : 'Não'}`,
      authorizedUids: params.pkg.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `packages/${docId}`);
  }
}

export async function saveActivityConfig(params: {
  activity: Omit<ActivityConfig, 'createdAt' | 'updatedAt'>;
  isNew: boolean;
  actorUid: string;
  actorName: string;
}) {
  const { id, ...rest } = params.activity;
  const docId = sanitizeId(id || newDocId('act'));
  try {
    if (params.isNew) {
      await setDoc(doc(db, 'activities', docId), {
        ...rest,
        createdBy: params.actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const { createdBy: _cb, ...updateData } = rest;
      await updateDoc(doc(db, 'activities', docId), {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: params.isNew ? 'CREATE_ACTIVITY' : 'UPDATE_ACTIVITY',
      entityType: 'Activity',
      entityId: docId,
      entityLabel: params.activity.name,
      newValueSummary: `Preço R$ ${params.activity.defaultPrice.toFixed(2)} · Custo R$ ${params.activity.estimatedCost.toFixed(2)}`,
      authorizedUids: params.activity.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `activities/${docId}`);
  }
}

export async function deleteActivityConfig(activity: ActivityConfig, actorUid: string, actorName: string) {
  try {
    await deleteDoc(doc(db, 'activities', activity.id));
    await logAudit({
      userId: actorUid,
      userName: actorName,
      action: 'DELETE_ACTIVITY',
      entityType: 'Activity',
      entityId: activity.id,
      entityLabel: activity.name,
      newValueSummary: 'Atividade excluída',
      authorizedUids: activity.authorizedUids,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `activities/${activity.id}`);
  }
}

// =========================================================================
// SCHEDULE BLOCKS (BLOQUEIO DE DATAS E PERÍODOS)
// =========================================================================

export async function createOrUpdateScheduleBlock(params: {
  id?: string;
  data: Omit<ScheduleBlockRecord, 'id' | 'createdAt' | 'updatedAt'>;
}): Promise<string> {
  const id = params.id || newDocId('blk');
  try {
    if (params.id) {
      const { createdBy: _cb, ...rest } = params.data;
      await updateDoc(doc(db, 'scheduleBlocks', id), {
        ...rest,
        title: clampString(rest.title, 140),
        reason: clampString(rest.reason, 300),
        notes: clampString(rest.notes, 1000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'scheduleBlocks', id), {
        ...params.data,
        title: clampString(params.data.title, 140),
        reason: clampString(params.data.reason, 300),
        notes: clampString(params.data.notes, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `scheduleBlocks/${id}`);
  }
}

export async function deleteScheduleBlock(blockId: string) {
  try {
    await deleteDoc(doc(db, 'scheduleBlocks', blockId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `scheduleBlocks/${blockId}`);
  }
}

// =========================================================================
// DOCUMENT FOLDERS (PASTAS & SUBPASTAS)
// =========================================================================

export async function createOrUpdateDocumentFolder(params: {
  id?: string;
  name: string;
  parentId?: string;
  description?: string;
  authorizedUids: string[];
  actorUid: string;
}): Promise<string> {
  const id = params.id || newDocId('fld');
  try {
    if (params.id) {
      await updateDoc(doc(db, 'documentFolders', id), {
        name: clampString(params.name, 120),
        parentId: params.parentId || '',
        description: clampString(params.description, 300),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'documentFolders', id), {
        name: clampString(params.name, 120),
        parentId: params.parentId || '',
        description: clampString(params.description, 300),
        authorizedUids: params.authorizedUids,
        createdBy: params.actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `documentFolders/${id}`);
  }
}

export async function deleteDocumentFolder(folderId: string) {
  try {
    await deleteDoc(doc(db, 'documentFolders', folderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `documentFolders/${folderId}`);
  }
}

// =========================================================================
// PARTNERS (PARCEIROS & FORNECEDORES INDEPENDENTE DA EQUIPE)
// =========================================================================

export async function createOrUpdatePartner(params: {
  id?: string;
  data: Omit<PartnerRecord, 'id' | 'createdAt' | 'updatedAt'>;
}): Promise<string> {
  const id = params.id || newDocId('prt');
  try {
    if (params.id) {
      const { createdBy: _cb, ...rest } = params.data;
      await updateDoc(doc(db, 'partners', id), {
        ...rest,
        name: clampString(rest.name, 140),
        category: clampString(rest.category, 80),
        rating: Math.min(5, Math.max(0, Number(rest.rating || 0))),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'partners', id), {
        ...params.data,
        name: clampString(params.data.name, 140),
        category: clampString(params.data.category, 80),
        rating: Math.min(5, Math.max(0, Number(params.data.rating || 0))),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `partners/${id}`);
  }
}

export async function deletePartner(partnerId: string, logoStoragePath?: string) {
  try {
    await deleteDoc(doc(db, 'partners', partnerId));
    if (logoStoragePath) {
      await deleteBinaryFromStorage(logoStoragePath);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `partners/${partnerId}`);
  }
}

// =========================================================================
// PDF QUOTE TEMPLATES & EMISSIONS
// =========================================================================

export async function savePdfTemplate(params: {
  id?: string;
  name: string;
  version: string;
  fileName: string;
  storagePath?: string;
  downloadUrl?: string;
  storageMode: 'FIREBASE_STORAGE' | 'REFERENCE_ASSET' | 'INLINE_BASE64';
  baseDataUrl?: string;
  isActive: boolean;
  isSystemDefault?: boolean;
  fieldMappings: PdfFieldMapping[];
  notes?: string;
  actorUid: string;
  actorName: string;
  authorizedUids: string[];
  existingTemplates?: PdfTemplateRecord[];
}): Promise<string> {
  const id = params.id || newDocId('tpl');
  try {
    if (params.isActive && params.existingTemplates) {
      for (const other of params.existingTemplates) {
        if (other.id !== id && other.isActive) {
          await updateDoc(doc(db, 'pdfTemplates', other.id), {
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    if (params.id) {
      await updateDoc(doc(db, 'pdfTemplates', id), {
        name: clampString(params.name, 160),
        version: clampString(params.version, 40),
        fileName: clampString(params.fileName, 200),
        storagePath: clampString(params.storagePath, 400),
        downloadUrl: clampString(params.downloadUrl, 1000),
        storageMode: params.storageMode,
        baseDataUrl: params.baseDataUrl || '',
        isActive: params.isActive,
        isSystemDefault: Boolean(params.isSystemDefault),
        fieldMappings: params.fieldMappings,
        notes: clampString(params.notes, 1000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'pdfTemplates', id), {
        name: clampString(params.name, 160),
        version: clampString(params.version, 40),
        fileName: clampString(params.fileName, 200),
        storagePath: clampString(params.storagePath, 400),
        downloadUrl: clampString(params.downloadUrl, 1000),
        storageMode: params.storageMode,
        baseDataUrl: params.baseDataUrl || '',
        isActive: params.isActive,
        isSystemDefault: Boolean(params.isSystemDefault),
        fieldMappings: params.fieldMappings,
        notes: clampString(params.notes, 1000),
        uploadedBy: params.actorUid,
        uploadedByName: clampString(params.actorName, 120),
        authorizedUids: params.authorizedUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await logAudit({
      userId: params.actorUid,
      userName: params.actorName,
      action: params.id ? 'UPDATE_PDF_TEMPLATE' : 'UPLOAD_PDF_TEMPLATE',
      entityType: 'PdfTemplate',
      entityId: id,
      entityLabel: `${params.name} (${params.version})`,
      newValueSummary: `Modelo ${params.isActive ? 'ATIVO' : 'inativo'} · ${params.fileName}`,
      authorizedUids: params.authorizedUids,
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pdfTemplates/${id}`);
  }
}

export async function activatePdfTemplate(
  targetId: string,
  allTemplates: PdfTemplateRecord[],
  actorUid: string,
  actorName: string
) {
  try {
    for (const tpl of allTemplates) {
      const shouldBeActive = tpl.id === targetId;
      if (tpl.isActive !== shouldBeActive) {
        await updateDoc(doc(db, 'pdfTemplates', tpl.id), {
          isActive: shouldBeActive,
          updatedAt: serverTimestamp(),
        });
      }
    }
    const target = allTemplates.find((t) => t.id === targetId);
    if (target) {
      await logAudit({
        userId: actorUid,
        userName: actorName,
        action: 'ACTIVATE_PDF_TEMPLATE',
        entityType: 'PdfTemplate',
        entityId: targetId,
        entityLabel: `${target.name} (${target.version})`,
        newValueSummary: 'Definido como modelo ativo para emissão de propostas',
        authorizedUids: target.authorizedUids,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pdfTemplates/${targetId}`);
  }
}

export async function deletePdfTemplate(template: PdfTemplateRecord) {
  try {
    await deleteDoc(doc(db, 'pdfTemplates', template.id));
    if (template.storagePath) {
      await deleteBinaryFromStorage(template.storagePath);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `pdfTemplates/${template.id}`);
  }
}

export async function recordQuoteEmission(params: {
  quoteId?: string;
  quoteCode: string;
  coupleName: string;
  templateId?: string;
  templateName: string;
  templateVersion?: string;
  fileName: string;
  pdfBytes: Uint8Array;
  emittedBy: string;
  emittedByName: string;
  authorizedUids: string[];
}): Promise<{ emissionId: string; downloadUrl: string; storageWarning?: string }> {
  const emissionId = newDocId('emi');
  const blob = new Blob([params.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  const docRes = await uploadDocumentRecord({
    file: blob,
    fileName: params.fileName,
    mimeType: 'application/pdf',
    fileSize: params.pdfBytes.byteLength,
    title: `Proposta Comercial — ${params.coupleName}`,
    category: 'Propostas',
    coupleName: params.coupleName,
    quoteId: params.quoteId || '',
    notes: `Emitido via modelo ${params.templateName} (${params.templateVersion || 'v1.0'})`,
    uploadedBy: params.emittedBy,
    uploadedByName: params.emittedByName,
    authorizedUids: params.authorizedUids,
  });

  try {
    await setDoc(doc(db, 'quoteEmissions', emissionId), {
      quoteId: params.quoteId || '',
      quoteCode: clampString(params.quoteCode || 'SIMULACAO', 60),
      coupleName: clampString(params.coupleName, 160),
      templateId: params.templateId || '',
      templateName: clampString(params.templateName, 160),
      templateVersion: clampString(params.templateVersion || 'v1.0', 40),
      fileName: clampString(params.fileName, 200),
      storagePath: docRes.storagePath || '',
      downloadUrl: docRes.downloadUrl || '',
      storageMode: docRes.downloadUrl ? 'FIREBASE_STORAGE' : 'GENERATED_ON_DEMAND',
      documentId: docRes.id,
      emittedBy: params.emittedBy,
      emittedByName: clampString(params.emittedByName, 120),
      authorizedUids: params.authorizedUids,
      createdAt: serverTimestamp(),
    });
    return {
      emissionId,
      downloadUrl: docRes.downloadUrl,
      storageWarning: docRes.storageWarning,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `quoteEmissions/${emissionId}`);
  }
}

// =========================================================================
// PAYMENT RECEIPTS (COMPROVANTES PDF OFICIAIS)
// =========================================================================

export async function createReceiptRecord(params: {
  receiptNumber: string;
  installmentId: string;
  contractId: string;
  eventId: string;
  coupleName: string;
  eventName: string;
  eventDate?: string;
  amount: number;
  receivedAt: string;
  paymentMethod: string;
  installmentLabel: string;
  contractedValue: number;
  totalPaid: number;
  remainingBalance: number;
  paymentId: string;
  notes?: string;
  fileName: string;
  pdfBytes: Uint8Array;
  emittedBy: string;
  emittedByName: string;
  authorizedUids: string[];
}): Promise<{ receiptId: string; downloadUrl: string; storageWarning?: string }> {
  const receiptId = newDocId('rec');
  const blob = new Blob([params.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  const docRes = await uploadDocumentRecord({
    file: blob,
    fileName: params.fileName,
    mimeType: 'application/pdf',
    fileSize: params.pdfBytes.byteLength,
    title: `Comprovante ${params.receiptNumber} — ${params.coupleName}`,
    category: 'Comprovantes de Pagamento',
    eventId: params.eventId,
    eventName: params.eventName,
    coupleName: params.coupleName,
    contractId: params.contractId,
    paymentId: params.paymentId,
    notes: `Recebimento de R$ ${params.amount.toFixed(2)} (${params.installmentLabel}) via ${params.paymentMethod}`,
    uploadedBy: params.emittedBy,
    uploadedByName: params.emittedByName,
    authorizedUids: params.authorizedUids,
  });

  try {
    await setDoc(doc(db, 'receipts', receiptId), {
      receiptNumber: params.receiptNumber,
      installmentId: params.installmentId,
      contractId: params.contractId,
      eventId: params.eventId,
      coupleName: clampString(params.coupleName, 160),
      eventName: clampString(params.eventName, 160),
      eventDate: clampString(params.eventDate, 30),
      amount: clampNumber(params.amount, 0),
      receivedAt: params.receivedAt,
      paymentMethod: clampString(params.paymentMethod, 60),
      installmentLabel: clampString(params.installmentLabel, 100),
      contractedValue: clampNumber(params.contractedValue, 0),
      totalPaid: clampNumber(params.totalPaid, 0),
      remainingBalance: clampNumber(params.remainingBalance, 0),
      paymentId: params.paymentId,
      notes: clampString(params.notes, 500),
      fileName: clampString(params.fileName, 200),
      storagePath: docRes.storagePath || '',
      downloadUrl: docRes.downloadUrl || '',
      documentId: docRes.id,
      emittedBy: params.emittedBy,
      emittedByName: clampString(params.emittedByName, 120),
      authorizedUids: params.authorizedUids,
      createdAt: serverTimestamp(),
    });
    return {
      receiptId,
      downloadUrl: docRes.downloadUrl,
      storageWarning: docRes.storageWarning,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `receipts/${receiptId}`);
  }
}

// =========================================================================
// DASHBOARD AGGREGATED ACTIVE EVENT TASKS LOADER
// =========================================================================

export async function loadAllActiveEventTasks(
  events: EventRecord[],
  uid: string
): Promise<EventTaskWithEvent[]> {
  const activeEvents = events.filter((e) => e.status !== 'CANCELADO');
  const results: EventTaskWithEvent[] = [];

  await Promise.all(
    activeEvents.slice(0, 30).map(async (ev) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'events', ev.id, 'tasks'), where('authorizedUids', 'array-contains', uid))
        );
        snap.docs.forEach((d) => {
          const data = d.data() as Omit<EventTask, 'id'>;
          results.push({
            ...data,
            id: d.id,
            eventCoupleName: ev.coupleName,
            eventDate: ev.date,
          });
        });
      } catch {
        // Non-blocking per-event task fetch
      }
    })
  );

  return results;
}

// =========================================================================
// PORTABLE WORKSPACE BACKUP EXPORT (JSON)
// =========================================================================

export function downloadWorkspaceBackupJson(payload: Record<string, unknown>) {
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      system: '4EVER Management',
      ...payload,
    },
    null,
    2
  );
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `4ever-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
