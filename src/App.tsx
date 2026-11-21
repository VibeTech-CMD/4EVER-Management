import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './lib/firebase';
import { DEFAULT_SYSTEM_CONFIG_SEED } from './lib/defaults';
import type {
  ActivityConfig,
  AuditLogRecord,
  ContractRecord,
  CoupleRecord,
  DocumentFolderRecord,
  DocumentRecord,
  EventRecord,
  EventTaskWithEvent,
  ExpenseRecord,
  FuelHistoryEntry,
  InstallmentRecord,
  InviteRecord,
  ModuleKey,
  PackageConfig,
  PartnerRecord,
  PdfTemplateRecord,
  QuoteEmissionRecord,
  QuoteRecord,
  ReceiptRecord,
  ScheduleBlockRecord,
  SystemConfig,
  TeamMemberRecord,
  UserProfile,
} from './lib/types';
import {
  bootstrapUserAndWorkspace,
  loadAllActiveEventTasks,
  subscribeAuthorizedCollection,
  subscribeSystemConfig,
  syncWorkspaceAuthorizedUids,
} from './services/firestoreService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Monogram4E } from './components/BrandMarks';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { EventsPage } from './pages/EventsPage';
import { FinancePage } from './pages/FinancePage';
import { TeamPage } from './pages/TeamPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SettingsPage } from './pages/SettingsPage';

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Real-time Firestore state
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [packages, setPackages] = useState<PackageConfig[]>([]);
  const [activities, setActivities] = useState<ActivityConfig[]>([]);
  const [couples, setCouples] = useState<CoupleRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlockRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [installments, setInstallments] = useState<InstallmentRecord[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [documentFolders, setDocumentFolders] = useState<DocumentFolderRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplateRecord[]>([]);
  const [quoteEmissions, setQuoteEmissions] = useState<QuoteEmissionRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [fuelHistory, setFuelHistory] = useState<FuelHistoryEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [tasks, setTasks] = useState<EventTaskWithEvent[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUserProfile(null);
        setAuthReady(true);
        return;
      }

      try {
        const res = await bootstrapUserAndWorkspace({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          emailVerified: fbUser.emailVerified,
        });

        if (!res.authorized || !res.profile) {
          setAccessDeniedMessage(res.reason || 'Acesso não autorizado.');
          await signOut(auth);
          setUserProfile(null);
        } else {
          setAccessDeniedMessage(null);
          setUserProfile(res.profile);
        }
      } catch (err) {
        setAccessDeniedMessage(
          err instanceof Error ? err.message : 'Erro ao validar acesso da equipe.'
        );
        setUserProfile(null);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Attach Firestore listeners only after auth is ready & userProfile is active
  useEffect(() => {
    if (!authReady || !userProfile) return;
    const uid = userProfile.uid;

    const unsubs = [
      subscribeSystemConfig(setSystemConfig),
      subscribeAuthorizedCollection<PackageConfig>('packages', uid, setPackages),
      subscribeAuthorizedCollection<ActivityConfig>('activities', uid, setActivities),
      subscribeAuthorizedCollection<CoupleRecord>('couples', uid, setCouples),
      subscribeAuthorizedCollection<QuoteRecord>('quotes', uid, setQuotes),
      subscribeAuthorizedCollection<EventRecord>('events', uid, setEvents),
      subscribeAuthorizedCollection<ScheduleBlockRecord>('scheduleBlocks', uid, setScheduleBlocks),
      subscribeAuthorizedCollection<ContractRecord>('contracts', uid, setContracts),
      subscribeAuthorizedCollection<InstallmentRecord>('installments', uid, setInstallments),
      subscribeAuthorizedCollection<ReceiptRecord>('receipts', uid, setReceipts),
      subscribeAuthorizedCollection<ExpenseRecord>('expenses', uid, setExpenses),
      subscribeAuthorizedCollection<TeamMemberRecord>('teamMembers', uid, setTeamMembers),
      subscribeAuthorizedCollection<PartnerRecord>('partners', uid, setPartners),
      subscribeAuthorizedCollection<DocumentFolderRecord>('documentFolders', uid, setDocumentFolders),
      subscribeAuthorizedCollection<DocumentRecord>('documents', uid, setDocuments),
      subscribeAuthorizedCollection<PdfTemplateRecord>('pdfTemplates', uid, setPdfTemplates),
      subscribeAuthorizedCollection<QuoteEmissionRecord>('quoteEmissions', uid, setQuoteEmissions),
      subscribeAuthorizedCollection<UserProfile>('users', uid, setUsers),
      subscribeAuthorizedCollection<InviteRecord>('invites', uid, setInvites),
      subscribeAuthorizedCollection<FuelHistoryEntry>('fuelHistory', uid, setFuelHistory),
      subscribeAuthorizedCollection<AuditLogRecord>('auditLogs', uid, setAuditLogs),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, userProfile]);

  const refreshTasks = useCallback(() => {
    if (!userProfile) return;
    if (events.length === 0) {
      setTasks([]);
      return;
    }
    void loadAllActiveEventTasks(events, userProfile.uid).then(setTasks);
  }, [events, userProfile]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const authorizedUids = useMemo(() => {
    const active = users.filter((u) => u.status === 'ACTIVE').map((u) => u.uid);
    if (userProfile && !active.includes(userProfile.uid)) {
      active.push(userProfile.uid);
    }
    return Array.from(new Set(active)).slice(0, 20);
  }, [users, userProfile]);

  // Auto-sync new active team UIDs when Master is online
  useEffect(() => {
    if (!userProfile || userProfile.role !== 'MASTER_ADMIN' || !systemConfig) return;
    const currentSysUids = systemConfig.authorizedUids || [];
    const hasNewMember = authorizedUids.some((u) => !currentSysUids.includes(u));
    if (hasNewMember) {
      void syncWorkspaceAuthorizedUids(authorizedUids, userProfile.uid);
    }
  }, [userProfile, systemConfig, authorizedUids]);

  const effectiveConfig: SystemConfig = useMemo(() => {
    if (systemConfig) return systemConfig;
    return DEFAULT_SYSTEM_CONFIG_SEED(userProfile?.uid || 'bootstrap');
  }, [systemConfig, userProfile]);

  const backupData = useMemo(
    () => ({
      systemConfig: effectiveConfig,
      packages,
      activities,
      couples,
      quotes,
      events,
      scheduleBlocks,
      contracts,
      installments,
      receipts,
      expenses,
      teamMembers,
      partners,
      documentFolders,
      documents,
      pdfTemplates,
      quoteEmissions,
      users,
      invites,
      fuelHistory,
      auditLogs,
    }),
    [
      effectiveConfig,
      packages,
      activities,
      couples,
      quotes,
      events,
      scheduleBlocks,
      contracts,
      installments,
      receipts,
      expenses,
      teamMembers,
      partners,
      documentFolders,
      documents,
      pdfTemplates,
      quoteEmissions,
      users,
      invites,
      fuelHistory,
      auditLogs,
    ]
  );

  const handleOpenEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setActiveModule('events');
  };

  const handleSelectModule = (mod: ModuleKey) => {
    setActiveModule(mod);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F3EE] flex flex-col items-center justify-center gap-4">
        <Monogram4E variant="green" size={48} />
        <p className="text-sm font-medium text-[#30483B]">Carregando 4EVER Management...</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <LoginPage
        accessDeniedMessage={accessDeniedMessage}
        onClearAccessDenied={() => setAccessDeniedMessage(null)}
      />
    );
  }

  return (
    <Layout
      activeModule={activeModule}
      onSelectModule={handleSelectModule}
      user={userProfile}
      onLogout={() => void signOut(auth)}
    >
      {activeModule === 'dashboard' && (
        <DashboardPage
          events={events}
          quotes={quotes}
          contracts={contracts}
          installments={installments}
          expenses={expenses}
          tasks={tasks}
          onNavigate={handleSelectModule}
          onOpenEvent={handleOpenEvent}
        />
      )}

      {activeModule === 'simulator' && (
        <SimulatorPage
          user={userProfile}
          authorizedUids={authorizedUids}
          config={effectiveConfig}
          packages={packages}
          activities={activities}
          couples={couples}
          quotes={quotes}
          onOpenEvent={handleOpenEvent}
        />
      )}

      {activeModule === 'events' && (
        <EventsPage
          user={userProfile}
          authorizedUids={authorizedUids}
          events={events}
          packages={packages}
          teamMembers={teamMembers}
          contracts={contracts}
          installments={installments}
          expenses={expenses}
          documents={documents}
          scheduleBlocks={scheduleBlocks}
          selectedEventId={selectedEventId}
          onSelectEventId={setSelectedEventId}
          onTasksChanged={refreshTasks}
        />
      )}

      {activeModule === 'finance' && (
        <FinancePage
          user={userProfile}
          authorizedUids={authorizedUids}
          config={effectiveConfig}
          events={events}
          contracts={contracts}
          installments={installments}
          expenses={expenses}
          teamMembers={teamMembers}
          receipts={receipts}
        />
      )}

      {activeModule === 'team' && (
        <TeamPage
          user={userProfile}
          authorizedUids={authorizedUids}
          teamMembers={teamMembers}
          invites={invites}
          events={events}
          partners={partners}
          config={effectiveConfig}
        />
      )}

      {activeModule === 'documents' && (
        <DocumentsPage
          user={userProfile}
          authorizedUids={authorizedUids}
          config={effectiveConfig}
          documents={documents}
          folders={documentFolders}
          events={events}
          couples={couples}
          contracts={contracts}
          partners={partners}
          teamMembers={teamMembers}
          quotes={quotes}
        />
      )}

      {activeModule === 'settings' && (
        <SettingsPage
          user={userProfile}
          authorizedUids={authorizedUids}
          config={effectiveConfig}
          packages={packages}
          activities={activities}
          fuelHistory={fuelHistory}
          users={users}
          auditLogs={auditLogs}
          backupData={backupData}
        />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
