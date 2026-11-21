export type UserRole = 'MASTER_ADMIN' | 'OPERATIONAL_ADMIN' | 'MEMBER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export type ModuleKey =
  | 'dashboard'
  | 'simulator'
  | 'finance'
  | 'events'
  | 'team'
  | 'documents'
  | 'settings';

export interface ModulePermissions {
  dashboard: boolean;
  simulator: boolean;
  finance: boolean;
  events: boolean;
  team: boolean;
  documents: boolean;
  settings: boolean;
  canEditQuotes: boolean;
  canApproveQuotes: boolean;
  canManageEvents: boolean;
  canManageFinance: boolean;
  canManageDocuments: boolean;
  canManageUsers: boolean;
  canDeleteRecords: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  roleTitle?: string;
  permissions: ModulePermissions;
  authorizedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
}

export interface InviteRecord {
  id: string;
  email: string;
  name: string;
  role: Exclude<UserRole, 'MASTER_ADMIN'>;
  roleTitle?: string;
  permissions?: ModulePermissions;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  invitedBy: string;
  authorizedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GuestBracket {
  id: string;
  label: string;
  minGuests: number;
  maxGuests: number | null;
  multiplier: number;
  extraFee: number;
  isProvisional?: boolean;
}

export interface CityTravelRule {
  id: string;
  city: string;
  defaultDistanceOneWayKm: number;
  defaultTolls: number;
  chargeMeal: boolean;
  extraTravelFee: number;
}

export interface PaymentTermsConfig {
  depositPercent: number;
  balanceDueDaysBeforeEvent: number;
  maxInstallments: number;
  notes: string;
  isProvisional?: boolean;
}

export interface PricingFormulaConfig {
  mode: 'PACKAGE_PLUS_EXTRAS' | 'ACTIVITIES_SUM_WITH_MARGIN';
  includeBracketExtraFee: boolean;
  applyGuestMultiplierOnBase: boolean;
  defaultMarginPercent: number;
  isProvisional?: boolean;
}

export interface SystemConfig {
  id?: string;
  companyName: string;
  baseAddress: string;
  baseCity: string;
  vehicleConsumptionKmPerL: number;
  fuelPricePerLiter: number;
  fuelPriceSource?: string;
  fuelPriceUpdatedAt?: string;
  vehicleWearPerKm?: number;
  defaultTollsEstimate?: number;
  defaultParkingEstimate?: number;
  defaultMealAllowance?: number;
  chargeMealInBaseCity?: boolean;
  paymentTerms: PaymentTermsConfig;
  guestBrackets: GuestBracket[];
  cityRules: CityTravelRule[];
  pricingFormula?: PricingFormulaConfig;
  eventStatuses?: string[];
  revenueCategories?: string[];
  expenseCategories?: string[];
  documentCategories?: string[];
  partnerCategories?: string[];
  authorizedUids: string[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface FuelHistoryEntry {
  id: string;
  pricePerLiter: number;
  source: string;
  notes?: string;
  recordedBy: string;
  recordedByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export interface PackageConfig {
  id: string;
  code: string;
  name: string;
  description?: string;
  basePrice: number;
  estimatedCost: number;
  active: boolean;
  isOperational: boolean;
  sortOrder: number;
  pricingRule?: {
    isProvisional?: boolean;
    notes?: string;
  };
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ActivityBillingType = 'INCLUDED' | 'ADDITIONAL' | 'PER_GUEST';

export interface ActivityConfig {
  id: string;
  name: string;
  description?: string;
  category: string;
  defaultPrice: number;
  estimatedCost: number;
  billingType: ActivityBillingType;
  packageIds: string[];
  active: boolean;
  sortOrder: number;
  rulesNotes?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CoupleRecord {
  id: string;
  coupleName: string;
  phone?: string;
  email?: string;
  weddingDate?: string;
  venue?: string;
  city?: string;
  notes?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type QuoteCityOption = 'Macaé' | 'Rio das Ostras' | 'Búzios' | 'Outra localidade';
export type QuoteStatus =
  | 'EM_ELABORACAO'
  | 'ENVIADO'
  | 'EM_NEGOCIACAO'
  | 'APROVADO'
  | 'REJEITADO'
  | 'EXPIRADO'
  | 'ARQUIVADO';

export interface QuoteActivityItem {
  activityId: string;
  name: string;
  category: string;
  billingType: ActivityBillingType;
  unitPrice: number;
  estimatedCost: number;
  includedInPackage: boolean;
  selected: boolean;
}

export interface TravelInput {
  distanceOneWayKm: number;
  distanceRoundTripKm: number;
  distanceTotalKm: number;
  distanceSource: string;
  vehicleConsumptionKmPerL: number;
  fuelPricePerLiter: number;
  fuelCost: number;
  tolls: number;
  parking: number;
  vehicleWearCost: number;
  mealAllowance: number;
  chargeMeal: boolean;
  manualTravelAdjustment: number;
  totalTravelCost: number;
}

export interface QuoteAdjustments {
  discountPercent: number;
  discountValue: number;
  surchargeValue: number;
  manualAdjustment: number;
  justification: string;
  adjustedBy?: string;
}

export interface QuoteCalculationSummary {
  packageBaseValue: number;
  activitiesTotal: number;
  guestBracketAdjustment: number;
  travelTotal: number;
  otherExpenses: number;
  discountTotal: number;
  surchargeTotal: number;
  suggestedTotal: number;
  finalTotal: number;
  estimatedInternalCost: number;
  estimatedProfit: number;
  estimatedMarginPercent: number;
}

export interface QuoteRecord {
  id: string;
  code: string;
  coupleId?: string;
  coupleName: string;
  phone?: string;
  email?: string;
  weddingDate?: string;
  venue?: string;
  cityOption: QuoteCityOption;
  customCity?: string;
  guestBracketId: string;
  guestBracketLabel?: string;
  estimatedGuests?: number;
  packageId: string;
  packageName?: string;
  status: QuoteStatus;
  currentVersionNumber: number;
  selectedActivities: QuoteActivityItem[];
  travelInput: TravelInput;
  adjustments: QuoteAdjustments;
  calculationSummary: QuoteCalculationSummary;
  observations?: string;
  convertedEventId?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuoteVersionRecord {
  id: string;
  quoteId: string;
  versionNumber: number;
  snapshotConfig: {
    packageSnapshot: { id: string; name: string; basePrice: number; estimatedCost: number };
    guestBracketSnapshot: GuestBracket;
    pricingFormulaSnapshot: PricingFormulaConfig;
    travelConfigSnapshot: {
      baseAddress: string;
      vehicleConsumptionKmPerL: number;
      fuelPricePerLiter: number;
      vehicleWearPerKm: number;
      chargeMealInBaseCity: boolean;
    };
  };
  selectedActivities: QuoteActivityItem[];
  travelInput: TravelInput;
  adjustments: QuoteAdjustments;
  calculationSummary: QuoteCalculationSummary;
  changeReason?: string;
  createdBy: string;
  createdByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export type EventStatus =
  | 'LEAD'
  | 'PRE_AGENDADO'
  | 'CONTRATADO'
  | 'EM_PLANEJAMENTO'
  | 'EM_EXECUCAO'
  | 'CONCLUIDO'
  | 'CANCELADO';

export interface PostEventFeedback {
  internalFeedback: string;
  postEventNotes: string;
  issuesIdentified: string;
  improvementSuggestions: string;
  lessonsLearned: string;
}

export interface EventRecord {
  id: string;
  code: string;
  coupleId?: string;
  coupleName: string;
  quoteId?: string;
  date: string;
  time?: string;
  venue?: string;
  city?: string;
  guestCount?: number;
  packageId?: string;
  packageName?: string;
  contractedValue: number;
  status: EventStatus;
  responsibleIds: string[];
  responsibleNames?: string[];
  observations?: string;
  conflictNote?: string;
  postEventFeedback?: PostEventFeedback;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ScheduleBlockType = 'INDISPONIVEL' | 'FERIADO' | 'EVENTO_INTERNO' | 'RESERVA';

export interface ScheduleBlockRecord {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  reason?: string;
  notes?: string;
  blockType: ScheduleBlockType;
  authorizedUids: string[];
  createdBy: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type TaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export interface EventTask {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  notes?: string;
  completedAt?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EventTaskWithEvent extends EventTask {
  eventCoupleName: string;
  eventDate: string;
}

export interface EventTimelineItem {
  id: string;
  eventId: string;
  timeSlot: string;
  activity: string;
  responsible?: string;
  notes?: string;
  status: 'PLANEJADO' | 'EM_EXECUCAO' | 'CONCLUIDO';
  sortOrder: number;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ContractRecord {
  id: string;
  eventId: string;
  eventName?: string;
  coupleName: string;
  quoteId?: string;
  contractedValue: number;
  depositPercent: number;
  depositAmount: number;
  installmentsCount: number;
  paymentTermsNotes?: string;
  status: 'ATIVO' | 'QUITADO' | 'CANCELADO';
  observations?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentEntry {
  paymentId?: string;
  amount: number;
  paidAt: string;
  method: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  recordedBy: string;
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
}

export interface PendingPaymentEntry {
  pendingId: string;
  amount: number;
  submittedAt: string;
  paymentDate: string;
  method: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  submittedBy: string;
  submittedByName: string;
  status: 'AGUARDANDO_CONFIRMACAO' | 'CONFIRMADO' | 'REJEITADO';
  rejectionReason?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}

export interface InstallmentRecord {
  id: string;
  contractId: string;
  eventId: string;
  eventName?: string;
  number: number;
  label: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'ATRASADO';
  paymentMethod?: string;
  paidAt?: string;
  notes?: string;
  paymentHistory: PaymentEntry[];
  pendingPayments?: PendingPaymentEntry[];
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  installmentId: string;
  contractId: string;
  eventId: string;
  coupleName: string;
  eventName?: string;
  eventDate?: string;
  amount: number;
  receivedAt: string;
  paymentMethod: string;
  installmentLabel?: string;
  contractedValue?: number;
  totalPaid?: number;
  remainingBalance?: number;
  paymentId?: string;
  notes?: string;
  fileName?: string;
  storagePath?: string;
  downloadUrl?: string;
  documentId?: string;
  emittedBy: string;
  emittedByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export type ExpenseType = 'FIXA' | 'VARIAVEL' | 'EVENTO' | 'GERAL';

export interface ExpenseRecord {
  id: string;
  name: string;
  type: ExpenseType;
  category: string;
  amount: number;
  date: string;
  eventId?: string;
  eventName?: string;
  responsibleId?: string;
  responsibleName?: string;
  status: 'PENDENTE' | 'PAGO';
  notes?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TeamMemberClassification = 'PERMANENTE' | 'SITUACIONAL';

export interface TeamMemberRecord {
  id: string;
  userId?: string;
  name: string;
  roleTitle: string;
  profileRole: UserRole;
  classification?: TeamMemberClassification;
  status: 'ATIVO' | 'INATIVO';
  email?: string;
  phone?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  linkedEventIds?: string[];
  responsibilities?: string;
  notes?: string;
  remunerationPerEvent?: number;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PartnerRecord {
  id: string;
  name: string;
  category: string;
  city?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  rating: number;
  notes?: string;
  logoUrl?: string;
  logoStoragePath?: string;
  active: boolean;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DocumentFolderRecord {
  id: string;
  name: string;
  parentId?: string;
  description?: string;
  authorizedUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocumentCategory = string;

export interface DocumentRecord {
  id: string;
  title: string;
  category: DocumentCategory;
  folderId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  downloadUrl?: string;
  storageMode: 'FIREBASE_STORAGE' | 'METADATA_ONLY';
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
  uploadedBy: string;
  uploadedByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PdfFieldKey =
  | 'coupleName'
  | 'eventType'
  | 'venue'
  | 'eventDate'
  | 'guestCount'
  | 'loveValue'
  | 'foreverValue';

export interface PdfFieldMapping {
  key: PdfFieldKey;
  label: string;
  pageIndex: number; // 0-based
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  maskColor: string;
  textColor: string;
  prefix?: string;
  uppercase?: boolean;
  enabled: boolean;
}

export interface PdfTemplateRecord {
  id: string;
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
  uploadedBy: string;
  uploadedByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuoteEmissionRecord {
  id: string;
  quoteId?: string;
  quoteCode: string;
  coupleName: string;
  templateId?: string;
  templateName: string;
  templateVersion?: string;
  fileName: string;
  storagePath?: string;
  downloadUrl?: string;
  storageMode: 'FIREBASE_STORAGE' | 'GENERATED_ON_DEMAND';
  documentId?: string;
  emittedBy: string;
  emittedByName?: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export interface AuditLogRecord {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  previousValueSummary?: string;
  newValueSummary?: string;
  authorizedUids: string[];
  createdAt?: unknown;
}
