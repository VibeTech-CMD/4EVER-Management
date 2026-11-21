import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  Calendar,
  CalendarPlus,
  CheckSquare,
  CreditCard,
  DollarSign,
  Receipt,
  Users,
} from 'lucide-react';
import type {
  ContractRecord,
  EventRecord,
  EventTaskWithEvent,
  ExpenseRecord,
  InstallmentRecord,
  ModuleKey,
  QuoteRecord,
} from '../lib/types';
import { formatBRL, formatDateBR } from '../services/validation';
import { MonthlyFinancialChart, StatusBreakdownChart } from '../components/Charts';

interface DashboardPageProps {
  events: EventRecord[];
  quotes: QuoteRecord[];
  contracts: ContractRecord[];
  installments: InstallmentRecord[];
  expenses: ExpenseRecord[];
  tasks: EventTaskWithEvent[];
  onNavigate: (mod: ModuleKey) => void;
  onOpenEvent: (eventId: string) => void;
}

const EVENT_STATUS_PT: Record<string, string> = {
  LEAD: 'Lead',
  PRE_AGENDADO: 'Pré-agendado',
  CONTRATADO: 'Contratado',
  EM_PLANEJAMENTO: 'Em planejamento',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const PRIORITY_PT: Record<string, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  events,
  quotes,
  contracts,
  installments,
  expenses,
  tasks,
  onNavigate,
  onOpenEvent,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonth = todayStr.slice(0, 7);

  const metrics = useMemo(() => {
    const activeEvents = events.filter((e) => e.status !== 'CANCELADO');
    const futureEvents = activeEvents.filter((e) => e.date >= todayStr && e.status !== 'CONCLUIDO');
    const monthEvents = activeEvents.filter((e) => e.date.startsWith(currentMonth));
    const completedEvents = events.filter((e) => e.status === 'CONCLUIDO');

    const openQuotes = quotes.filter((q) =>
      ['EM_ELABORACAO', 'ENVIADO', 'EM_NEGOCIACAO'].includes(q.status)
    );
    const approvedQuotes = quotes.filter((q) => q.status === 'APROVADO');
    const rejectedQuotes = quotes.filter((q) => q.status === 'REJEITADO');
    const decidedTotal = approvedQuotes.length + rejectedQuotes.length;
    const conversionRate = decidedTotal > 0 ? Math.round((approvedQuotes.length / decidedTotal) * 100) : 0;

    const contractedRevenue = contracts
      .filter((c) => c.status !== 'CANCELADO')
      .reduce((acc, c) => acc + Number(c.contractedValue || 0), 0);

    const receivedRevenue = installments.reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);
    const receivableAmount = installments.reduce(
      (acc, i) => acc + Math.max(0, Number(i.amount || 0) - Number(i.paidAmount || 0)),
      0
    );
    const overdueInstallments = installments.filter(
      (i) => i.status !== 'PAGO' && i.dueDate < todayStr && Number(i.amount) > Number(i.paidAmount)
    );
    const totalExpenses = expenses.reduce((acc, ex) => acc + Number(ex.amount || 0), 0);
    const estimatedResult = contractedRevenue - totalExpenses;

    const openTasks = tasks.filter((t) => t.status !== 'CONCLUIDA');
    const overdueTasks = openTasks
      .filter((t) => t.dueDate && t.dueDate < todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const upcomingTasks = openTasks
      .filter((t) => !t.dueDate || t.dueDate >= todayStr)
      .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));

    return {
      futureEventsCount: futureEvents.length,
      monthEventsCount: monthEvents.length,
      completedEventsCount: completedEvents.length,
      openQuotesCount: openQuotes.length,
      approvedQuotesCount: approvedQuotes.length,
      rejectedQuotesCount: rejectedQuotes.length,
      conversionRate,
      contractedRevenue,
      receivedRevenue,
      receivableAmount,
      overdueCount: overdueInstallments.length,
      overdueAmount: overdueInstallments.reduce(
        (acc, i) => acc + Math.max(0, i.amount - i.paidAmount),
        0
      ),
      totalExpenses,
      estimatedResult,
      upcomingEvents: [...futureEvents].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
      pendingQuotesList: openQuotes.slice(0, 5),
      pendingInstallmentsList: installments
        .filter((i) => i.status !== 'PAGO')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5),
      overdueTasks,
      upcomingTasks,
    };
  }, [events, quotes, contracts, installments, expenses, tasks, todayStr, currentMonth]);

  const monthlySeries = useMemo(() => {
    const base = new Date();
    const months: { key: string; label: string; revenue: number; expense: number }[] = [];
    for (let offset = -4; offset <= 1; offset++) {
      const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const revenue = installments
        .filter((i) => (i.paidAt || i.dueDate).startsWith(key) && i.paidAmount > 0)
        .reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);
      const expense = expenses
        .filter((ex) => ex.date.startsWith(key))
        .reduce((acc, ex) => acc + Number(ex.amount || 0), 0);
      months.push({ key, label: `${label}/${String(d.getFullYear()).slice(2)}`, revenue, expense });
    }
    return months;
  }, [installments, expenses]);

  const quoteBreakdown = useMemo(
    () => [
      {
        label: 'Em aberto (Elaboração / Enviado / Negociação)',
        count: metrics.openQuotesCount,
        color: '#A99A83',
      },
      {
        label: 'Aprovados',
        count: metrics.approvedQuotesCount,
        color: '#30483B',
      },
      {
        label: 'Rejeitados',
        count: metrics.rejectedQuotesCount,
        color: '#A6342F',
      },
      {
        label: 'Expirados / Arquivados',
        count: quotes.filter((q) => ['EXPIRADO', 'ARQUIVADO'].includes(q.status)).length,
        color: '#594634',
      },
    ],
    [metrics, quotes]
  );

  const shortcuts: Array<{
    label: string;
    mod: ModuleKey;
    icon: React.ComponentType<{ className?: string }>;
    primary?: boolean;
  }> = [
    { label: 'Novo orçamento', mod: 'simulator', icon: Calculator, primary: true },
    { label: 'Novo evento', mod: 'events', icon: CalendarPlus },
    { label: 'Ver calendário', mod: 'events', icon: Calendar },
    { label: 'Registrar despesa', mod: 'finance', icon: Receipt },
    { label: 'Consultar financeiro', mod: 'finance', icon: CreditCard },
    { label: 'Acessar equipe', mod: 'team', icon: Users },
  ];

  return (
    <div className="space-y-8">
      {/* Quick Action Bar — Uniform Grid */}
      <section className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-sans text-base font-semibold text-[#1F2A24]">Atalhos Operacionais</h2>
            <p className="text-xs text-[#5C554C]">
              Acesso direto às centrais de operação da 4EVER
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {shortcuts.map((sc) => {
            const Icon = sc.icon;
            return (
              <button
                key={sc.label}
                type="button"
                onClick={() => onNavigate(sc.mod)}
                className={`min-h-[44px] w-full px-3 py-2.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sc.primary
                    ? 'bg-[#30483B] text-white hover:bg-[#24372D]'
                    : 'bg-[#F5F3EE] text-[#1F2A24] border border-[#D6CEC1] hover:bg-[#EBE6DC]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${sc.primary ? 'text-white' : 'text-[#30483B]'}`} />
                <span className="truncate">{sc.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Primary KPI Grid — Operational + Commercial + Financial */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-[#5C554C]">Eventos futuros · No mês · Concluídos</p>
          <p className="font-mono text-2xl font-semibold text-[#1F2A24] tabular-nums">
            {metrics.futureEventsCount}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            {metrics.monthEventsCount} no mês atual · {metrics.completedEventsCount} concluídos
          </p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-[#5C554C]">Orçamentos & Taxa de conversão</p>
          <p className="font-mono text-2xl font-semibold text-[#1F2A24] tabular-nums">
            {metrics.conversionRate}%
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            {metrics.openQuotesCount} em aberto · {metrics.approvedQuotesCount} aprovados ·{' '}
            {metrics.rejectedQuotesCount} rejeitados
          </p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-[#5C554C]">Receita contratada vs. Recebida</p>
          <p className="font-mono text-2xl font-semibold text-[#30483B] tabular-nums">
            {formatBRL(metrics.receivedRevenue)}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            Contratada: {formatBRL(metrics.contractedRevenue)} · A receber:{' '}
            {formatBRL(metrics.receivableAmount)}
          </p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-[#5C554C]">Despesas & Resultado estimado</p>
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${
              metrics.estimatedResult >= 0 ? 'text-[#1F6E43]' : 'text-[#A6342F]'
            }`}
          >
            {formatBRL(metrics.estimatedResult)}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            Despesas: {formatBRL(metrics.totalExpenses)}
            {metrics.overdueCount > 0 && (
              <span className="text-[#A6342F]"> · {metrics.overdueCount} parcelas vencidas</span>
            )}
          </p>
        </div>
      </section>

      {/* Main Split: Upcoming Events & Pending Summaries */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Próximos Eventos */}
        <div className="lg:col-span-7 bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-[#D6CEC1] pb-3">
            <div>
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">Próximos Eventos</h3>
              <p className="text-xs text-[#5C554C]">Casamentos agendados e em execução</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('events')}
              className="text-xs font-medium text-[#30483B] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Ver todos
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {metrics.upcomingEvents.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-[#594634]">Não existem eventos cadastrados.</p>
              <p className="text-xs text-[#5C554C] max-w-sm mx-auto">
                Cadastre um casamento manualmente ou aprove um orçamento no Simulador para convertê-lo automaticamente em evento.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('events')}
                className="px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
              >
                Cadastrar primeiro evento
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E7E2D8]">
              {metrics.upcomingEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onOpenEvent(ev.id)}
                  className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#F5F3EE]/60 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1F2A24] truncate">{ev.coupleName}</p>
                    <p className="text-xs text-[#5C554C] truncate mt-0.5">
                      {formatDateBR(ev.date)} · {ev.venue || 'Local a definir'} ·{' '}
                      {ev.packageName || 'Pacote não vinculado'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-[#30483B]">
                      {EVENT_STATUS_PT[ev.status] || ev.status}
                    </p>
                    <p className="text-[11px] text-[#5C554C] truncate max-w-[140px]">
                      {ev.responsibleNames?.join(', ') || 'Sem responsável'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resumos Operacionais & Financeiros */}
        <div className="lg:col-span-5 space-y-6">
          {/* Orçamentos Pendentes */}
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                Orçamentos Pendentes
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('simulator')}
                className="text-xs font-medium text-[#30483B] hover:underline cursor-pointer"
              >
                Abrir simulador
              </button>
            </div>
            {metrics.pendingQuotesList.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-sm text-[#594634]">Nenhum orçamento em negociação.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('simulator')}
                  className="px-3.5 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#EBE6DC] cursor-pointer"
                >
                  Crie seu primeiro orçamento
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#E7E2D8]">
                {metrics.pendingQuotesList.map((q) => (
                  <div key={q.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1F2A24] truncate">{q.coupleName}</p>
                      <p className="text-xs text-[#5C554C]">
                        {q.code} · {q.packageName || 'Pacote'} · v{q.currentVersionNumber}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#30483B] tabular-nums shrink-0">
                      {formatBRL(q.calculationSummary?.finalTotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagamentos Pendentes */}
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                Pagamentos Pendentes
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="text-xs font-medium text-[#30483B] hover:underline cursor-pointer"
              >
                Ir ao financeiro
              </button>
            </div>
            {metrics.pendingInstallmentsList.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-[#594634]">Não existem parcelas pendentes.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E7E2D8]">
                {metrics.pendingInstallmentsList.map((inst) => {
                  const isLate = inst.dueDate < todayStr;
                  return (
                    <div key={inst.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1F2A24] truncate">
                          {inst.eventName || 'Contrato'} · {inst.label}
                        </p>
                        <p className={`text-xs tabular-nums ${isLate ? 'text-[#A6342F]' : 'text-[#5C554C]'}`}>
                          Vencimento {formatDateBR(inst.dueDate)} {isLate ? '(Em atraso)' : ''}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#1F2A24] tabular-nums shrink-0">
                        {formatBRL(inst.amount - inst.paidAmount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tarefas Próximas & Tarefas Atrasadas */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#A6342F]" />
              <div>
                <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                  Tarefas Atrasadas ({metrics.overdueTasks.length})
                </h3>
                <p className="text-xs text-[#5C554C]">Pendências operacionais com prazo vencido</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('events')}
              className="text-xs font-medium text-[#30483B] hover:underline cursor-pointer"
            >
              Ver eventos
            </button>
          </div>

          {metrics.overdueTasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-[#5C554C]">Nenhuma tarefa em atraso nos eventos ativos.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E7E2D8]">
              {metrics.overdueTasks.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenEvent(t.eventId)}
                  className="w-full py-2.5 px-2 flex items-center justify-between gap-3 text-left hover:bg-[#FCEEEE]/50 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1F2A24] truncate">{t.title}</p>
                    <p className="text-[11px] text-[#5C554C] truncate">
                      {t.eventCoupleName} · {t.assigneeName || 'Equipe'} · {PRIORITY_PT[t.priority] || t.priority}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[#A6342F] tabular-nums shrink-0">
                    {formatDateBR(t.dueDate)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#30483B]" />
              <div>
                <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                  Tarefas Próximas ({metrics.upcomingTasks.length})
                </h3>
                <p className="text-xs text-[#5C554C]">Checklist aberto ordenado por prazo</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('events')}
              className="text-xs font-medium text-[#30483B] hover:underline cursor-pointer"
            >
              Ver eventos
            </button>
          </div>

          {metrics.upcomingTasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-[#5C554C]">Nenhuma tarefa pendente no momento.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E7E2D8]">
              {metrics.upcomingTasks.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenEvent(t.eventId)}
                  className="w-full py-2.5 px-2 flex items-center justify-between gap-3 text-left hover:bg-[#F5F3EE]/60 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1F2A24] truncate">{t.title}</p>
                    <p className="text-[11px] text-[#5C554C] truncate">
                      {t.eventCoupleName} · {t.assigneeName || 'Equipe'} · {PRIORITY_PT[t.priority] || t.priority}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-[#30483B] tabular-nums shrink-0">
                    {t.dueDate ? formatDateBR(t.dueDate) : 'Sem prazo'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Real-Data Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                Evolução Financeira (Recebimentos vs. Despesas)
              </h3>
              <p className="text-xs text-[#5C554C]">
                Baseado apenas em pagamentos efetivamente recebidos e despesas registradas
              </p>
            </div>
            <DollarSign className="w-4 h-4 text-[#A99A83]" />
          </div>
          <MonthlyFinancialChart data={monthlySeries} />
        </div>

        <div className="lg:col-span-5 bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
              Orçamentos por Status
            </h3>
            <p className="text-xs text-[#5C554C]">Distribuição real das propostas registradas</p>
          </div>
          <StatusBreakdownChart
            items={quoteBreakdown}
            emptyMessage="Crie seu primeiro orçamento no Simulador para acompanhar a conversão."
          />
        </div>
      </section>
    </div>
  );
};
