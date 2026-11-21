import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarOff,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  List,
  MapPin,
  Plus,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ContractRecord,
  DocumentRecord,
  EventRecord,
  EventStatus,
  EventTask,
  EventTimelineItem,
  ExpenseRecord,
  InstallmentRecord,
  PackageConfig,
  PostEventFeedback,
  ScheduleBlockRecord,
  ScheduleBlockType,
  TaskPriority,
  TeamMemberRecord,
  UserProfile,
} from '../lib/types';
import {
  createEventRecord,
  createEventTask,
  createOrUpdateScheduleBlock,
  createTimelineItem,
  deleteEventTask,
  deleteScheduleBlock,
  deleteTimelineItem,
  subscribeEventTasks,
  subscribeEventTimeline,
  updateEventFeedback,
  updateEventRecord,
  updateEventTask,
  updateTimelineItem,
} from '../services/firestoreService';
import { canWriteOperationally } from '../services/rbac';
import { formatBRL, formatDateBR } from '../services/validation';

interface EventsPageProps {
  user: UserProfile;
  authorizedUids: string[];
  events: EventRecord[];
  scheduleBlocks: ScheduleBlockRecord[];
  packages: PackageConfig[];
  teamMembers: TeamMemberRecord[];
  contracts: ContractRecord[];
  installments: InstallmentRecord[];
  expenses: ExpenseRecord[];
  documents: DocumentRecord[];
  selectedEventId: string | null;
  onSelectEventId: (id: string | null) => void;
  onTasksChanged?: () => void;
}

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  LEAD: 'Lead',
  PRE_AGENDADO: 'Pré-agendado',
  CONTRATADO: 'Contratado',
  EM_PLANEJAMENTO: 'Em planejamento',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

const BLOCK_TYPE_LABELS: Record<ScheduleBlockType, string> = {
  INDISPONIVEL: 'Agenda Indisponível',
  FERIADO: 'Feriado / Recesso',
  EVENTO_INTERNO: 'Compromisso Interno',
  RESERVA: 'Reserva / Pré-bloqueio',
};

export const EventsPage: React.FC<EventsPageProps> = ({
  user,
  authorizedUids,
  events,
  scheduleBlocks,
  packages,
  teamMembers,
  contracts,
  installments,
  expenses,
  documents,
  selectedEventId,
  onSelectEventId,
  onTasksChanged,
}) => {
  const canWrite = canWriteOperationally(user);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create Event modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newCoupleName, setNewCoupleName] = useState('');
  const [newDate, setNewDate] = useState(todayStr);
  const [newTime, setNewTime] = useState('16:00');
  const [newVenue, setNewVenue] = useState('');
  const [newCity, setNewCity] = useState('Macaé');
  const [newGuestCount, setNewGuestCount] = useState(90);
  const [newPackageId, setNewPackageId] = useState('');
  const [newContractedVal, setNewContractedVal] = useState(0);
  const [newStatus, setNewStatus] = useState<EventStatus>('PRE_AGENDADO');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Schedule Block modal
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlockRecord | null>(null);
  const [blkTitle, setBlkTitle] = useState('');
  const [blkStart, setBlkStart] = useState(todayStr);
  const [blkEnd, setBlkEnd] = useState(todayStr);
  const [blkType, setBlkType] = useState<ScheduleBlockType>('INDISPONIVEL');
  const [blkReason, setBlkReason] = useState('');

  // Selected Event Detail Sheet
  const activeEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const [detailTab, setDetailTab] = useState<
    'resumo' | 'checklist' | 'cronograma' | 'financeiro' | 'feedback'
  >('resumo');

  const [tasks, setTasks] = useState<EventTask[]>([]);
  const [timeline, setTimeline] = useState<EventTimelineItem[]>([]);

  // New Task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIA');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');

  // New Timeline form
  const [tlTime, setTlTime] = useState('16:00');
  const [tlActivity, setTlActivity] = useState('');
  const [tlResponsible, setTlResponsible] = useState('');
  const [tlNotes, setTlNotes] = useState('');

  // Feedback state
  const [feedbackForm, setFeedbackForm] = useState<PostEventFeedback>({
    internalFeedback: '',
    postEventNotes: '',
    issuesIdentified: '',
    improvementSuggestions: '',
    lessonsLearned: '',
  });
  const [feedbackSavedMsg, setFeedbackSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!activeEvent) {
      setTasks([]);
      setTimeline([]);
      return;
    }
    setFeedbackForm(
      activeEvent.postEventFeedback || {
        internalFeedback: '',
        postEventNotes: '',
        issuesIdentified: '',
        improvementSuggestions: '',
        lessonsLearned: '',
      }
    );
    setFeedbackSavedMsg(null);

    const u1 = subscribeEventTasks(activeEvent.id, user.uid, setTasks);
    const u2 = subscribeEventTimeline(activeEvent.id, user.uid, setTimeline);
    return () => {
      u1();
      u2();
    };
  }, [activeEvent, user.uid]);

  const upcomingStripEvents = useMemo(
    () =>
      events
        .filter((e) => e.status !== 'CANCELADO' && e.status !== 'CONCLUIDO' && e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 12),
    [events, todayStr]
  );

  const filteredEvents = useMemo(
    () =>
      events
        .filter((e) => statusFilter === 'ALL' || e.status === statusFilter)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events, statusFilter]
  );

  const getBlocksForDate = (dateStr: string) =>
    scheduleBlocks.filter((b) => b.startDate <= dateStr && dateStr <= b.endDate);

  // Conflict check for New Event modal
  const createDateConflicts = useMemo(() => {
    const overlappingEvents = events.filter(
      (e) => e.status !== 'CANCELADO' && e.date === newDate
    );
    const overlappingBlocks = scheduleBlocks.filter(
      (b) => b.startDate <= newDate && newDate <= b.endDate
    );
    return { overlappingEvents, overlappingBlocks };
  }, [events, scheduleBlocks, newDate]);

  // Calendar Month Grid
  const monthDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const cells: Array<{ dateStr: string; dayNum: number; inMonth: boolean }> = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ dateStr: d.toISOString().slice(0, 10), dayNum: d.getDate(), inMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      cells.push({ dateStr: dt.toISOString().slice(0, 10), dayNum: d, inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const idx = cells.length - (startWeekday + lastDay.getDate()) + 1;
      const dt = new Date(year, month + 1, idx);
      cells.push({ dateStr: dt.toISOString().slice(0, 10), dayNum: dt.getDate(), inMonth: false });
    }
    return cells;
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const start = new Date(cursorDate);
    start.setDate(cursorDate.getDate() - cursorDate.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        dateStr: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      };
    });
  }, [cursorDate]);

  const navigatePeriod = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (viewMode === 'week') {
      next.setDate(next.getDate() + dir * 7);
    } else {
      next.setMonth(next.getMonth() + dir);
    }
    setCursorDate(next);
  };

  const handleJumpToCalendar = (ev: EventRecord) => {
    const dt = new Date(`${ev.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      setCursorDate(dt);
    }
    if (viewMode === 'list') {
      setViewMode('month');
    }
    setHighlightedDate(ev.date);
    onSelectEventId(ev.id);
  };

  const openBlockModal = (block?: ScheduleBlockRecord, presetDate?: string) => {
    setEditingBlock(block || null);
    setBlkTitle(block?.title || '');
    setBlkStart(block?.startDate || presetDate || todayStr);
    setBlkEnd(block?.endDate || presetDate || todayStr);
    setBlkType(block?.blockType || 'INDISPONIVEL');
    setBlkReason(block?.reason || '');
    setBlockModalOpen(true);
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blkTitle.trim() || !blkStart || !blkEnd) return;
    const normalizedEnd = blkEnd < blkStart ? blkStart : blkEnd;
    await createOrUpdateScheduleBlock({
      id: editingBlock?.id,
      data: {
        title: blkTitle.trim(),
        startDate: blkStart,
        endDate: normalizedEnd,
        blockType: blkType,
        reason: blkReason,
        notes: '',
        authorizedUids,
        createdBy: editingBlock?.createdBy || user.uid,
        createdByName: editingBlock?.createdByName || user.name,
      },
    });
    setBlockModalOpen(false);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoupleName.trim() || !newDate) return;
    setSaving(true);
    try {
      const pkg = packages.find((p) => p.id === newPackageId);
      const conflictSummary: string[] = [];
      if (createDateConflicts.overlappingEvents.length > 0) {
        conflictSummary.push(
          `Conflito com evento(s): ${createDateConflicts.overlappingEvents
            .map((x) => x.coupleName)
            .join(', ')}`
        );
      }
      if (createDateConflicts.overlappingBlocks.length > 0) {
        conflictSummary.push(
          `Data em bloqueio: ${createDateConflicts.overlappingBlocks
            .map((b) => b.title)
            .join(', ')}`
        );
      }

      const evtId = await createEventRecord({
        payload: {
          coupleName: newCoupleName.trim(),
          date: newDate,
          time: newTime,
          venue: newVenue,
          city: newCity,
          guestCount: newGuestCount,
          packageId: pkg?.id || '',
          packageName: pkg?.name || '',
          contractedValue: newContractedVal,
          status: newStatus,
          responsibleIds: [user.uid],
          responsibleNames: [user.name],
          observations: newNotes,
          conflictNote: conflictSummary.join(' | ').slice(0, 290),
          authorizedUids,
          createdBy: user.uid,
        },
        actorName: user.name,
      });
      setCreateOpen(false);
      setNewCoupleName('');
      setNewVenue('');
      setNewNotes('');
      onSelectEventId(evtId);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !taskTitle.trim()) return;
    const assignee = teamMembers.find((m) => m.id === taskAssigneeId);
    await createEventTask(activeEvent.id, {
      title: taskTitle.trim(),
      assigneeId: assignee?.userId || user.uid,
      assigneeName: assignee?.name || user.name,
      dueDate: taskDueDate || activeEvent.date,
      priority: taskPriority,
      status: 'PENDENTE',
      authorizedUids,
      createdBy: user.uid,
    });
    setTaskTitle('');
    onTasksChanged?.();
  };

  const handleAddTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !tlActivity.trim()) return;
    await createTimelineItem(activeEvent.id, {
      timeSlot: tlTime || '16:00',
      activity: tlActivity.trim(),
      responsible: tlResponsible,
      notes: tlNotes,
      status: 'PLANEJADO',
      sortOrder: timeline.length + 1,
      authorizedUids,
      createdBy: user.uid,
    });
    setTlActivity('');
    setTlNotes('');
  };

  const handleSaveFeedback = async () => {
    if (!activeEvent) return;
    await updateEventFeedback(activeEvent, feedbackForm, user.uid);
    setFeedbackSavedMsg('Feedback pós-evento salvo.');
  };

  const eventContracts = useMemo(
    () => (activeEvent ? contracts.filter((c) => c.eventId === activeEvent.id) : []),
    [contracts, activeEvent]
  );
  const eventInstallments = useMemo(
    () => (activeEvent ? installments.filter((i) => i.eventId === activeEvent.id) : []),
    [installments, activeEvent]
  );
  const eventExpenses = useMemo(
    () => (activeEvent ? expenses.filter((ex) => ex.eventId === activeEvent.id) : []),
    [expenses, activeEvent]
  );
  const eventDocuments = useMemo(
    () => (activeEvent ? documents.filter((d) => d.eventId === activeEvent.id) : []),
    [documents, activeEvent]
  );

  return (
    <div className="space-y-6">
      {/* Quick Access Strip for Upcoming Events */}
      {upcomingStripEvents.length > 0 && (
        <section className="bg-white border border-[#D6CEC1] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-sans text-sm font-semibold text-[#1F2A24]">
                Acesso Rápido — Próximos Eventos ({upcomingStripEvents.length})
              </h2>
              <p className="text-[11px] text-[#5C554C]">
                Clique em "Ir no calendário" para posicionar o calendário e abrir o detalhamento completo
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
            {upcomingStripEvents.map((ev) => (
              <div
                key={ev.id}
                className={`min-w-[235px] max-w-[255px] shrink-0 p-3.5 rounded-lg border flex flex-col justify-between gap-2.5 ${
                  highlightedDate === ev.date
                    ? 'bg-[#30483B]/5 border-[#30483B]'
                    : 'bg-[#F5F3EE]/60 border-[#D6CEC1]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-[#30483B] tabular-nums">
                      {formatDateBR(ev.date)} {ev.time ? `· ${ev.time}` : ''}
                    </span>
                    <span className="text-[#594634] font-medium truncate">
                      {EVENT_STATUS_LABELS[ev.status]}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#1F2A24] truncate">{ev.coupleName}</p>
                  <p className="text-[11px] text-[#5C554C] truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0 text-[#A99A83]" />
                    <span className="truncate">{ev.venue || ev.city || 'Local a definir'}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleJumpToCalendar(ev)}
                  className="w-full py-1.5 px-2.5 bg-white border border-[#30483B]/35 text-[11px] font-medium text-[#30483B] rounded hover:bg-[#30483B] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  Ir no calendário
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#D6CEC1] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'month' ? 'bg-white text-[#30483B] shadow-sm' : 'text-[#5C554C]'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Mês
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'week' ? 'bg-white text-[#30483B] shadow-sm' : 'text-[#5C554C]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-[#30483B] shadow-sm' : 'text-[#5C554C]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
          </div>

          {viewMode !== 'list' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigatePeriod(-1)}
                className="p-1.5 rounded-lg border border-[#D6CEC1] hover:bg-[#F5F3EE] cursor-pointer"
                aria-label="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-semibold text-[#1F2A24] min-w-[140px] text-center capitalize">
                {cursorDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => navigatePeriod(1)}
                className="p-1.5 rounded-lg border border-[#D6CEC1] hover:bg-[#F5F3EE] cursor-pointer"
                aria-label="Próximo período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs"
          >
            <option value="ALL">Todos os status</option>
            {Object.entries(EVENT_STATUS_LABELS).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>

          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => openBlockModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F5F3EE] border border-[#594634]/35 text-[#594634] text-xs font-medium rounded-lg hover:bg-[#EBE6DC] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarOff className="w-3.5 h-3.5" />
                Bloqueio de Período
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Novo Evento
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active Schedule Blocks Legend Bar */}
      {scheduleBlocks.length > 0 && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-[#594634] inline-flex items-center gap-1.5">
            <CalendarOff className="w-3.5 h-3.5" />
            Períodos Bloqueados ({scheduleBlocks.length}):
          </span>
          {scheduleBlocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openBlockModal(b)}
              className="px-2.5 py-1 rounded border border-[#594634]/30 bg-[#594634]/10 text-[#594634] hover:bg-[#594634]/20 text-[11px] font-medium cursor-pointer"
            >
              {b.title} ({formatDateBR(b.startDate)}
              {b.endDate !== b.startDate ? ` a ${formatDateBR(b.endDate)}` : ''})
            </button>
          ))}
        </div>
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#D6CEC1] bg-[#F5F3EE] text-[11px] font-semibold text-[#594634] text-center py-2.5">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-[#E7E2D8]">
            {monthDays.map((cell) => {
              const dayEvents = filteredEvents.filter((e) => e.date === cell.dateStr);
              const dayBlocks = getBlocksForDate(cell.dateStr);
              const isHighlighted = highlightedDate === cell.dateStr;
              return (
                <div
                  key={cell.dateStr}
                  className={`min-h-[112px] p-2 space-y-1 ${
                    isHighlighted
                      ? 'bg-[#30483B]/10 ring-1 ring-inset ring-[#30483B]'
                      : dayBlocks.length > 0
                      ? 'bg-[#594634]/8'
                      : cell.inMonth
                      ? 'bg-white'
                      : 'bg-[#F5F3EE]/50 text-[#5C554C]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono tabular-nums font-medium">{cell.dayNum}</p>
                    {dayBlocks.length > 0 && (
                      <CalendarOff className="w-3 h-3 text-[#594634]" />
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayBlocks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openBlockModal(b)}
                        className="w-full text-left px-1.5 py-0.5 rounded bg-[#594634]/15 border border-[#594634]/35 text-[#594634] text-[10px] font-medium truncate cursor-pointer"
                        title={`${BLOCK_TYPE_LABELS[b.blockType]}: ${b.title}`}
                      >
                        Bloqueio: {b.title}
                      </button>
                    ))}
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectEventId(ev.id)}
                        className="w-full text-left px-2 py-1 rounded bg-[#30483B] text-white text-[11px] hover:bg-[#24372D] truncate cursor-pointer"
                        title={`${ev.coupleName} (${EVENT_STATUS_LABELS[ev.status]})`}
                      >
                        {ev.time ? `${ev.time} ` : ''}
                        {ev.coupleName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayEvents = filteredEvents.filter((e) => e.date === day.dateStr);
            const dayBlocks = getBlocksForDate(day.dateStr);
            return (
              <div
                key={day.dateStr}
                className={`border rounded-xl p-3 space-y-2.5 min-h-[200px] ${
                  dayBlocks.length > 0
                    ? 'bg-[#594634]/5 border-[#594634]/35'
                    : 'bg-white border-[#D6CEC1]'
                }`}
              >
                <p className="text-xs font-semibold text-[#594634] border-b border-[#E7E2D8] pb-1.5 capitalize">
                  {day.label}
                </p>
                {dayBlocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openBlockModal(b)}
                    className="w-full text-left p-2 rounded-lg bg-[#594634]/15 border border-[#594634]/30 text-[#594634] text-[11px] font-medium cursor-pointer"
                  >
                    <p className="truncate">Bloqueio: {b.title}</p>
                  </button>
                ))}
                {dayEvents.length === 0 && dayBlocks.length === 0 ? (
                  <p className="text-[11px] text-[#5C554C]">Sem eventos</p>
                ) : (
                  dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelectEventId(ev.id)}
                      className="w-full text-left p-2.5 rounded-lg bg-[#30483B] text-white text-xs space-y-1 hover:bg-[#24372D] cursor-pointer"
                    >
                      <p className="font-semibold truncate">{ev.coupleName}</p>
                      <p className="text-[11px] text-[#F5F3EE]/80 truncate">
                        {ev.time || '16:00'} · {EVENT_STATUS_LABELS[ev.status]}
                      </p>
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-[#594634]">Não existem eventos cadastrados.</p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cadastrar primeiro evento
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#D6CEC1] text-[#594634]">
                    <th className="py-3 px-3 font-semibold">Código</th>
                    <th className="py-3 px-3 font-semibold">Casal</th>
                    <th className="py-3 px-3 font-semibold">Data & Local</th>
                    <th className="py-3 px-3 font-semibold">Pacote</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 px-3 font-semibold text-right">Valor</th>
                    <th className="py-3 px-3 font-semibold text-right">Calendário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E2D8]">
                  {filteredEvents.map((ev) => {
                    const hasBlock = getBlocksForDate(ev.date).length > 0;
                    return (
                      <tr
                        key={ev.id}
                        onClick={() => onSelectEventId(ev.id)}
                        className="hover:bg-[#F5F3EE]/60 cursor-pointer"
                      >
                        <td className="py-3 px-3 font-mono text-[#30483B] font-medium">{ev.code}</td>
                        <td className="py-3 px-3 font-semibold text-[#1F2A24]">{ev.coupleName}</td>
                        <td className="py-3 px-3 text-[#5C554C]">
                          {formatDateBR(ev.date)} · {ev.venue || 'A definir'} ({ev.city || '—'})
                          {hasBlock && (
                            <span className="ml-1.5 text-[11px] font-medium text-[#9A6012]">
                              · Em bloqueio
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#5C554C]">{ev.packageName || '—'}</td>
                        <td className="py-3 px-3 font-medium text-[#30483B]">
                          {EVENT_STATUS_LABELS[ev.status]}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-medium">
                          {formatBRL(ev.contractedValue)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToCalendar(ev);
                            }}
                            className="px-2.5 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-[11px] font-medium text-[#30483B] hover:bg-[#EBE6DC] cursor-pointer"
                          >
                            Ir no calendário
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SCHEDULE BLOCK MODAL */}
      {blockModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBlock}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                {editingBlock ? 'Editar Bloqueio de Período' : 'Novo Bloqueio de Período'}
              </h3>
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Título / Descrição *</label>
              <input
                required
                type="text"
                value={blkTitle}
                onChange={(e) => setBlkTitle(e.target.value)}
                placeholder="Ex.: Recesso de equipe ou Feriado regional"
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Tipo de Bloqueio</label>
              <select
                value={blkType}
                onChange={(e) => setBlkType(e.target.value as ScheduleBlockType)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              >
                {Object.entries(BLOCK_TYPE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Data Início *</label>
                <input
                  required
                  type="date"
                  value={blkStart}
                  onChange={(e) => setBlkStart(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Data Término *</label>
                <input
                  required
                  type="date"
                  value={blkEnd}
                  min={blkStart}
                  onChange={(e) => setBlkEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Motivo / Observação</label>
              <textarea
                rows={2}
                value={blkReason}
                onChange={(e) => setBlkReason(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              {editingBlock && canWrite ? (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteScheduleBlock(editingBlock.id);
                    setBlockModalOpen(false);
                  }}
                  className="px-3 py-2 text-[#A6342F] border border-[#A6342F]/35 rounded-lg hover:bg-[#FCEEEE] cursor-pointer"
                >
                  Remover Bloqueio
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBlockModalOpen(false)}
                  className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                {canWrite && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
                  >
                    Salvar Bloqueio
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* CREATE EVENT MODAL (WITH LIVE CONFLICT & BLOCK WARNINGS) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateEvent}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-lg w-full p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">Cadastrar Novo Evento</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(createDateConflicts.overlappingEvents.length > 0 ||
              createDateConflicts.overlappingBlocks.length > 0) && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-[#9A6012]/40 bg-[#FDF6E9] text-xs text-[#9A6012] space-y-1"
              >
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Alerta de Agenda para {formatDateBR(newDate)}
                </p>
                {createDateConflicts.overlappingEvents.length > 0 && (
                  <p>
                    Já existe evento agendado nesta data:{' '}
                    <strong>
                      {createDateConflicts.overlappingEvents.map((ev) => ev.coupleName).join(', ')}
                    </strong>
                    .
                  </p>
                )}
                {createDateConflicts.overlappingBlocks.length > 0 && (
                  <p>
                    Esta data está em período bloqueado:{' '}
                    <strong>
                      {createDateConflicts.overlappingBlocks.map((b) => b.title).join(', ')}
                    </strong>
                    .
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#594634] mb-1">Nome do Casal *</label>
                <input
                  required
                  type="text"
                  value={newCoupleName}
                  onChange={(e) => setNewCoupleName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Data *</label>
                <input
                  required
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Horário</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Local</label>
                <input
                  type="text"
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Cidade</label>
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Pacote</label>
                <select
                  value={newPackageId}
                  onChange={(e) => setNewPackageId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                >
                  <option value="">Selecionar pacote</option>
                  {packages
                    .filter((p) => p.active && p.isOperational)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Valor Contratado (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={newContractedVal}
                  onChange={(e) => setNewContractedVal(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Convidados</label>
                <input
                  type="number"
                  min={0}
                  value={newGuestCount}
                  onChange={(e) => setNewGuestCount(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Status Inicial</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as EventStatus)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                >
                  {Object.entries(EVENT_STATUS_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#594634] mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] text-xs font-medium rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Criar Evento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EVENT FULL DETAIL SHEET */}
      {activeEvent && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex justify-end">
          <div className="bg-white w-full max-w-3xl h-full flex flex-col border-l border-[#D6CEC1]">
            <div className="p-6 border-b border-[#D6CEC1] flex items-start justify-between gap-4 bg-[#F5F3EE]">
              <div>
                <p className="text-xs font-mono text-[#594634]">
                  {activeEvent.code} · {formatDateBR(activeEvent.date)} {activeEvent.time || ''}
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#1F2A24] mt-0.5">
                  {activeEvent.coupleName}
                </h3>
                <p className="text-xs text-[#5C554C] mt-0.5">
                  {activeEvent.venue || 'Local a definir'} · {activeEvent.city || '—'} ·{' '}
                  {activeEvent.packageName || 'Sem pacote'} · {activeEvent.guestCount || 0} convidados
                </p>
                {activeEvent.conflictNote && (
                  <p className="text-[11px] font-medium text-[#9A6012] mt-1">
                    Observação de agenda: {activeEvent.conflictNote}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectEventId(null)}
                className="p-1.5 text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-3 border-b border-[#D6CEC1] flex items-center gap-4 overflow-x-auto text-xs font-medium">
              {[
                { key: 'resumo', label: 'Resumo & Casal' },
                { key: 'checklist', label: `Checklist (${tasks.length})` },
                { key: 'cronograma', label: `Cronograma (${timeline.length})` },
                { key: 'financeiro', label: 'Financeiro & Docs' },
                { key: 'feedback', label: 'Feedback Pós-Evento' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDetailTab(t.key as typeof detailTab)}
                  className={`pb-3 border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    detailTab === t.key
                      ? 'border-[#30483B] text-[#30483B] font-semibold'
                      : 'border-transparent text-[#5C554C] hover:text-[#1F2A24]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailTab === 'resumo' && (
                <div className="space-y-5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-[#F5F3EE] rounded-lg space-y-1">
                      <p className="text-[#5C554C]">Status Operacional</p>
                      {canWrite ? (
                        <select
                          value={activeEvent.status}
                          onChange={(e) =>
                            void updateEventRecord(
                              activeEvent.id,
                              { status: e.target.value as EventStatus },
                              user.uid,
                              user.name,
                              authorizedUids
                            )
                          }
                          className="mt-1 w-full px-3 py-1.5 bg-white border border-[#D6CEC1] rounded-lg text-xs font-semibold text-[#30483B]"
                        >
                          {Object.entries(EVENT_STATUS_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-semibold text-sm text-[#30483B]">
                          {EVENT_STATUS_LABELS[activeEvent.status]}
                        </p>
                      )}
                    </div>

                    <div className="p-4 bg-[#F5F3EE] rounded-lg space-y-1">
                      <p className="text-[#5C554C]">Valor Contratado</p>
                      <p className="font-mono text-lg font-semibold text-[#1F2A24] tabular-nums">
                        {formatBRL(activeEvent.contractedValue)}
                      </p>
                      {activeEvent.quoteId && (
                        <p className="text-[11px] text-[#594634]">
                          Originado do orçamento vinculado
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="font-semibold text-[#594634]">Equipe Responsável</p>
                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map((m) => {
                        const assigned = activeEvent.responsibleIds.includes(m.userId || m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => {
                              const idKey = m.userId || m.id;
                              const nextIds = assigned
                                ? activeEvent.responsibleIds.filter((i) => i !== idKey)
                                : [...activeEvent.responsibleIds, idKey].slice(0, 10);
                              const nextNames = teamMembers
                                .filter((tm) => nextIds.includes(tm.userId || tm.id))
                                .map((tm) => tm.name);
                              void updateEventRecord(
                                activeEvent.id,
                                { responsibleIds: nextIds, responsibleNames: nextNames },
                                user.uid,
                                user.name,
                                authorizedUids
                              );
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                              assigned
                                ? 'bg-[#30483B] text-white border-[#30483B]'
                                : 'bg-white text-[#5C554C] border-[#D6CEC1]'
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-[#594634]">Observações Operacionais</p>
                    <p className="p-3.5 bg-[#F5F3EE] rounded-lg text-[#1F2A24] whitespace-pre-wrap">
                      {activeEvent.observations || 'Nenhuma observação registrada.'}
                    </p>
                  </div>
                </div>
              )}

              {detailTab === 'checklist' && (
                <div className="space-y-5">
                  {canWrite && (
                    <form
                      onSubmit={handleAddTask}
                      className="p-4 bg-[#F5F3EE] border border-[#D6CEC1] rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs"
                    >
                      <input
                        type="text"
                        required
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Nova tarefa do checklist..."
                        className="sm:col-span-5 px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg"
                      />
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="sm:col-span-3 px-2.5 py-2 bg-white border border-[#D6CEC1] rounded-lg font-mono"
                      />
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                        className="sm:col-span-2 px-2 py-2 bg-white border border-[#D6CEC1] rounded-lg"
                      >
                        {Object.entries(PRIORITY_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="sm:col-span-2 px-3 py-2 bg-[#30483B] text-white font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                      >
                        Adicionar
                      </button>
                      <div className="sm:col-span-12">
                        <select
                          value={taskAssigneeId}
                          onChange={(e) => setTaskAssigneeId(e.target.value)}
                          className="w-full sm:w-64 px-2.5 py-1.5 bg-white border border-[#D6CEC1] rounded-lg"
                        >
                          <option value="">Responsável: {user.name}</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </form>
                  )}

                  {tasks.length === 0 ? (
                    <p className="text-xs text-[#5C554C] py-6 text-center">
                      Nenhuma tarefa cadastrada neste evento.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E7E2D8]">
                      {tasks.map((t) => {
                        const done = t.status === 'CONCLUIDA';
                        return (
                          <div key={t.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                            <button
                              type="button"
                              disabled={!canWrite}
                              onClick={async () => {
                                await updateEventTask(activeEvent.id, t.id, {
                                  status: done ? 'PENDENTE' : 'CONCLUIDA',
                                  completedAt: done ? '' : todayStr,
                                });
                                onTasksChanged?.();
                              }}
                              className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer"
                            >
                              {done ? (
                                <CheckSquare className="w-4 h-4 text-[#1F6E43] shrink-0 mt-0.5" />
                              ) : (
                                <Square className="w-4 h-4 text-[#A99A83] shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0">
                                <p className={`font-medium ${done ? 'line-through text-[#5C554C]' : 'text-[#1F2A24]'}`}>
                                  {t.title}
                                </p>
                                <p className="text-[11px] text-[#5C554C]">
                                  {PRIORITY_LABELS[t.priority]} · Prazo {formatDateBR(t.dueDate)} ·{' '}
                                  {t.assigneeName || 'Equipe'}
                                </p>
                              </div>
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteEventTask(activeEvent.id, t.id);
                                  onTasksChanged?.();
                                }}
                                className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'cronograma' && (
                <div className="space-y-5">
                  {canWrite && (
                    <form
                      onSubmit={handleAddTimeline}
                      className="p-4 bg-[#F5F3EE] border border-[#D6CEC1] rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs"
                    >
                      <input
                        type="time"
                        required
                        value={tlTime}
                        onChange={(e) => setTlTime(e.target.value)}
                        className="sm:col-span-3 px-2.5 py-2 bg-white border border-[#D6CEC1] rounded-lg font-mono"
                      />
                      <input
                        type="text"
                        required
                        value={tlActivity}
                        onChange={(e) => setTlActivity(e.target.value)}
                        placeholder="Momento / Atividade do roteiro..."
                        className="sm:col-span-5 px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg"
                      />
                      <input
                        type="text"
                        value={tlResponsible}
                        onChange={(e) => setTlResponsible(e.target.value)}
                        placeholder="Responsável"
                        className="sm:col-span-2 px-2.5 py-2 bg-white border border-[#D6CEC1] rounded-lg"
                      />
                      <button
                        type="submit"
                        className="sm:col-span-2 px-3 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
                      >
                        Incluir
                      </button>
                    </form>
                  )}

                  {timeline.length === 0 ? (
                    <p className="text-xs text-[#5C554C] py-6 text-center">
                      Cronograma do dia do evento ainda não preenchido.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E7E2D8]">
                      {timeline.map((item) => (
                        <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-semibold text-[#30483B] w-14 shrink-0">
                              {item.timeSlot}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-[#1F2A24]">{item.activity}</p>
                              <p className="text-[11px] text-[#5C554C]">
                                {item.responsible || 'Equipe 4EVER'} · {item.status}
                              </p>
                            </div>
                          </div>
                          {canWrite && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={item.status}
                                onChange={(e) =>
                                  void updateTimelineItem(activeEvent.id, item.id, {
                                    status: e.target.value as EventTimelineItem['status'],
                                  })
                                }
                                className="px-2 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-[11px]"
                              >
                                <option value="PLANEJADO">Planejado</option>
                                <option value="EM_EXECUCAO">Em execução</option>
                                <option value="CONCLUIDO">Concluído</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void deleteTimelineItem(activeEvent.id, item.id)}
                                className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'financeiro' && (
                <div className="space-y-6 text-xs">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#594634]">Contratos & Parcelas Vinculadas</h4>
                    {eventContracts.length === 0 ? (
                      <p className="text-[#5C554C]">Nenhum contrato financeiro vinculado a este evento ainda.</p>
                    ) : (
                      <div className="divide-y divide-[#E7E2D8] border border-[#D6CEC1] rounded-lg px-4">
                        {eventInstallments.map((inst) => (
                          <div key={inst.id} className="py-2.5 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-[#1F2A24]">{inst.label}</p>
                              <p className="text-[#5C554C]">
                                Vencimento {formatDateBR(inst.dueDate)} · {inst.status}
                              </p>
                            </div>
                            <span className="font-mono tabular-nums font-semibold">
                              {formatBRL(inst.paidAmount)} / {formatBRL(inst.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#594634]">Despesas do Evento ({eventExpenses.length})</h4>
                    {eventExpenses.length === 0 ? (
                      <p className="text-[#5C554C]">Nenhuma despesa vinculada.</p>
                    ) : (
                      <div className="divide-y divide-[#E7E2D8] border border-[#D6CEC1] rounded-lg px-4">
                        {eventExpenses.map((ex) => (
                          <div key={ex.id} className="py-2.5 flex items-center justify-between">
                            <span>
                              {ex.name} ({ex.category})
                            </span>
                            <span className="font-mono tabular-nums">{formatBRL(ex.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#594634]">Documentos Vinculados ({eventDocuments.length})</h4>
                    {eventDocuments.length === 0 ? (
                      <p className="text-[#5C554C]">Nenhum documento anexado a este evento.</p>
                    ) : (
                      <div className="divide-y divide-[#E7E2D8] border border-[#D6CEC1] rounded-lg px-4">
                        {eventDocuments.map((d) => (
                          <div key={d.id} className="py-2.5 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-[#30483B]" />
                              {d.title}
                            </span>
                            <span className="text-[#5C554C]">{d.category}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'feedback' && (
                <div className="space-y-4 text-xs">
                  {feedbackSavedMsg && (
                    <div className="p-3 bg-[#ECF6F0] text-[#1F6E43] rounded-lg">{feedbackSavedMsg}</div>
                  )}
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Feedback Interno</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.internalFeedback}
                      onChange={(e) =>
                        setFeedbackForm((f) => ({ ...f, internalFeedback: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Observações Pós-Evento</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.postEventNotes}
                      onChange={(e) =>
                        setFeedbackForm((f) => ({ ...f, postEventNotes: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Problemas Identificados</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.issuesIdentified}
                      onChange={(e) =>
                        setFeedbackForm((f) => ({ ...f, issuesIdentified: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Sugestões de Melhoria</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.improvementSuggestions}
                      onChange={(e) =>
                        setFeedbackForm((f) => ({ ...f, improvementSuggestions: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Registro de Aprendizados</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.lessonsLearned}
                      onChange={(e) =>
                        setFeedbackForm((f) => ({ ...f, lessonsLearned: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                    />
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={handleSaveFeedback}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      Salvar Feedback Pós-Evento
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
