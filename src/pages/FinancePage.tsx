import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  Plus,
  Receipt as ReceiptIcon,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ContractRecord,
  EventRecord,
  ExpenseRecord,
  ExpenseType,
  InstallmentRecord,
  PaymentEntry,
  PendingPaymentEntry,
  ReceiptRecord,
  SystemConfig,
  TeamMemberRecord,
  UserProfile,
} from '../lib/types';
import {
  confirmPendingPayment,
  createContractWithInstallments,
  createExpense,
  createReceiptRecord,
  deleteExpense,
  recordInstallmentPayment,
  rejectPendingPayment,
  submitPendingPayment,
  updateExpenseStatus,
  uploadDocumentRecord,
} from '../services/firestoreService';
import {
  downloadPdfBytes,
  generatePaymentReceiptPdf,
  pdfBytesToBlobUrl,
} from '../services/pdfService';
import { canDelete, canWriteOperationally } from '../services/rbac';
import { formatBRL, formatDateBR } from '../services/validation';
import { MonthlyFinancialChart } from '../components/Charts';

interface FinancePageProps {
  user: UserProfile;
  authorizedUids: string[];
  config: SystemConfig;
  events: EventRecord[];
  contracts: ContractRecord[];
  installments: InstallmentRecord[];
  expenses: ExpenseRecord[];
  teamMembers: TeamMemberRecord[];
  receipts: ReceiptRecord[];
}

export const FinancePage: React.FC<FinancePageProps> = ({
  user,
  authorizedUids,
  config,
  events,
  contracts,
  installments,
  expenses,
  teamMembers,
  receipts,
}) => {
  const canWrite = canWriteOperationally(user);
  const canRemove = canDelete(user);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<'overview' | 'contracts' | 'expenses' | 'receipts' | 'reports'>(
    'overview'
  );
  const [notice, setNotice] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(
    null
  );

  // Contract modal
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [ctrEventId, setCtrEventId] = useState('');
  const [ctrValue, setCtrValue] = useState(0);
  const [ctrDepositPct, setCtrDepositPct] = useState(config.paymentTerms.depositPercent);
  const [ctrInstallments, setCtrInstallments] = useState(3);
  const [ctrNotes, setCtrNotes] = useState(config.paymentTerms.notes);

  // Payment modal
  const [payingInst, setPayingInst] = useState<InstallmentRecord | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(todayStr);
  const [payMethod, setPayMethod] = useState('PIX');
  const [payNotes, setPayNotes] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payMode, setPayMode] = useState<'CONFIRM_NOW' | 'PENDING_REVIEW'>('CONFIRM_NOW');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Reject pending inline input
  const [rejectingPendingId, setRejectingPendingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expName, setExpName] = useState('');
  const [expType, setExpType] = useState<ExpenseType>('EVENTO');
  const [expCategory, setExpCategory] = useState(
    config.expenseCategories?.[0] || 'Deslocamento & Combustível'
  );
  const [expAmount, setExpAmount] = useState(0);
  const [expDate, setExpDate] = useState(todayStr);
  const [expEventId, setExpEventId] = useState('');
  const [expResponsibleId, setExpResponsibleId] = useState('');
  const [expStatus, setExpStatus] = useState<'PENDENTE' | 'PAGO'>('PAGO');
  const [expNotes, setExpNotes] = useState('');

  // Receipt PDF Preview Modal
  const [receiptModal, setReceiptModal] = useState<{
    bytes: Uint8Array;
    blobUrl: string;
    fileName: string;
    receiptNumber: string;
    installment: InstallmentRecord;
    payment: PaymentEntry;
    contractedValue: number;
    totalPaid: number;
    remainingBalance: number;
    coupleName: string;
    eventName: string;
    eventDate?: string;
    saved: boolean;
  } | null>(null);
  const [savingReceipt, setSavingReceipt] = useState(false);

  useEffect(() => {
    return () => {
      if (receiptModal?.blobUrl) {
        URL.revokeObjectURL(receiptModal.blobUrl);
      }
    };
  }, [receiptModal]);

  const pendingQueue = useMemo(() => {
    const items: Array<{ inst: InstallmentRecord; pending: PendingPaymentEntry }> = [];
    installments.forEach((inst) => {
      (inst.pendingPayments || []).forEach((p) => {
        if (p.status === 'AGUARDANDO_CONFIRMACAO') {
          items.push({ inst, pending: p });
        }
      });
    });
    return items;
  }, [installments]);

  const summary = useMemo(() => {
    const contracted = contracts
      .filter((c) => c.status !== 'CANCELADO')
      .reduce((acc, c) => acc + Number(c.contractedValue || 0), 0);
    const received = installments.reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);
    const receivable = installments.reduce(
      (acc, i) => acc + Math.max(0, Number(i.amount || 0) - Number(i.paidAmount || 0)),
      0
    );
    const overdue = installments
      .filter((i) => i.status !== 'PAGO' && i.dueDate < todayStr && i.amount > i.paidAmount)
      .reduce((acc, i) => acc + Math.max(0, i.amount - i.paidAmount), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const paidExpenses = expenses
      .filter((e) => e.status === 'PAGO')
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);

    return {
      contracted,
      received,
      receivable,
      overdue,
      totalExpenses,
      paidExpenses,
      realizedCashFlow: received - paidExpenses,
      estimatedResult: contracted - totalExpenses,
    };
  }, [contracts, installments, expenses, todayStr]);

  const monthlySeries = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(base.getFullYear(), base.getMonth() - 4 + idx, 1);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const revenue = installments
        .filter((i) => (i.paidAt || i.dueDate).startsWith(key) && i.paidAmount > 0)
        .reduce((acc, i) => acc + i.paidAmount, 0);
      const expense = expenses
        .filter((ex) => ex.date.startsWith(key))
        .reduce((acc, ex) => acc + ex.amount, 0);
      return { label: `${label}/${String(d.getFullYear()).slice(2)}`, revenue, expense };
    });
  }, [installments, expenses]);

  const costByEvent = useMemo(() => {
    return events.map((ev) => {
      const evExp = expenses
        .filter((e) => e.eventId === ev.id)
        .reduce((acc, e) => acc + e.amount, 0);
      const evPaid = installments
        .filter((i) => i.eventId === ev.id)
        .reduce((acc, i) => acc + i.paidAmount, 0);
      return {
        id: ev.id,
        coupleName: ev.coupleName,
        contracted: ev.contractedValue,
        received: evPaid,
        expenses: evExp,
        result: ev.contractedValue - evExp,
      };
    });
  }, [events, expenses, installments]);

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const ev = events.find((x) => x.id === ctrEventId);
    if (!ev) return;
    await createContractWithInstallments({
      eventId: ev.id,
      eventName: ev.coupleName,
      coupleName: ev.coupleName,
      quoteId: ev.quoteId,
      contractedValue: ctrValue || ev.contractedValue,
      depositPercent: ctrDepositPct,
      installmentsCount: ctrInstallments,
      eventDate: ev.date,
      balanceDueDaysBeforeEvent: config.paymentTerms.balanceDueDaysBeforeEvent,
      paymentTermsNotes: ctrNotes,
      authorizedUids,
      createdBy: user.uid,
    });
    setContractModalOpen(false);
    setNotice({ type: 'success', text: `Contrato e parcelas criados para ${ev.coupleName}.` });
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInst) return;
    setSubmittingPay(true);
    setNotice(null);

    try {
      let attachmentUrl = '';
      let attachmentName = '';
      let storageWarn = '';

      if (payFile) {
        const upRes = await uploadDocumentRecord({
          file: payFile,
          title: `Comprovante anexo — ${payingInst.eventName || payingInst.label}`,
          category: 'Comprovantes de Pagamento',
          eventId: payingInst.eventId,
          eventName: payingInst.eventName,
          coupleName: payingInst.eventName,
          contractId: payingInst.contractId,
          notes: `Anexo de pagamento (${payingInst.label}) via ${payMethod}`,
          uploadedBy: user.uid,
          uploadedByName: user.name,
          authorizedUids,
        });
        attachmentUrl = upRes.downloadUrl;
        attachmentName = payFile.name;
        if (upRes.storageWarning) storageWarn = upRes.storageWarning;
      }

      if (payMode === 'PENDING_REVIEW') {
        await submitPendingPayment({
          installment: payingInst,
          paymentAmount: payAmount,
          paymentDate: payDate,
          paymentMethod: payMethod,
          notes: payNotes,
          attachmentUrl,
          attachmentName,
          actorUid: user.uid,
          actorName: user.name,
        });
        setNotice({
          type: storageWarn ? 'warning' : 'success',
          text: storageWarn
            ? `Pagamento enviado para conferência manual (saldo NÃO abatido ainda). ${storageWarn}`
            : 'Comprovante anexado e enviado para conferência manual. O saldo só será abatido após confirmação explícita.',
        });
      } else {
        await recordInstallmentPayment({
          installment: payingInst,
          paymentAmount: payAmount,
          paymentDate: payDate,
          paymentMethod: payMethod,
          notes: payNotes,
          attachmentUrl,
          attachmentName,
          actorUid: user.uid,
          actorName: user.name,
        });
        setNotice({
          type: storageWarn ? 'warning' : 'success',
          text: `Recebimento confirmado manualmente para ${payingInst.label}. Você já pode emitir o Comprovante PDF oficial.`,
        });
      }

      setPayingInst(null);
      setPayFile(null);
      setPayNotes('');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleOpenReceiptPdf = async (inst: InstallmentRecord, payment?: PaymentEntry) => {
    const resolvedPayment: PaymentEntry = payment ||
      inst.paymentHistory?.[inst.paymentHistory.length - 1] || {
        paymentId: `pay_${inst.id}`,
        amount: inst.paidAmount,
        paidAt: inst.paidAt || todayStr,
        method: inst.paymentMethod || 'PIX',
        recordedBy: user.uid,
      };

    const contract = contracts.find((c) => c.id === inst.contractId);
    const ev = events.find((e) => e.id === inst.eventId);
    const contractInstallments = installments.filter((i) => i.contractId === inst.contractId);

    const contractedValue =
      contract?.contractedValue ??
      ev?.contractedValue ??
      contractInstallments.reduce((acc, i) => acc + i.amount, 0);
    const totalPaid = contractInstallments.reduce((acc, i) => acc + i.paidAmount, 0);
    const remainingBalance = Math.max(0, contractedValue - totalPaid);

    const coupleName = contract?.coupleName || ev?.coupleName || inst.eventName || 'Contratante';
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`;

    const pdf = await generatePaymentReceiptPdf({
      receiptNumber,
      coupleName,
      eventName: ev?.coupleName || inst.eventName || coupleName,
      eventDate: ev?.date,
      amount: resolvedPayment.amount,
      receivedAt: resolvedPayment.paidAt || todayStr,
      paymentMethod: resolvedPayment.method || 'PIX',
      installmentLabel: inst.label,
      contractedValue,
      totalPaid,
      remainingBalance,
      paymentId: resolvedPayment.paymentId || inst.id,
      notes: resolvedPayment.notes,
      emittedByName: user.name,
    });

    const blobUrl = pdfBytesToBlobUrl(pdf.bytes);
    setReceiptModal({
      bytes: pdf.bytes,
      blobUrl,
      fileName: pdf.fileName,
      receiptNumber,
      installment: inst,
      payment: resolvedPayment,
      contractedValue,
      totalPaid,
      remainingBalance,
      coupleName,
      eventName: ev?.coupleName || inst.eventName || coupleName,
      eventDate: ev?.date,
      saved: false,
    });
  };

  const handleSaveReceiptToCentral = async () => {
    if (!receiptModal) return;
    setSavingReceipt(true);
    try {
      const res = await createReceiptRecord({
        receiptNumber: receiptModal.receiptNumber,
        installmentId: receiptModal.installment.id,
        contractId: receiptModal.installment.contractId,
        eventId: receiptModal.installment.eventId,
        coupleName: receiptModal.coupleName,
        eventName: receiptModal.eventName,
        eventDate: receiptModal.eventDate,
        amount: receiptModal.payment.amount,
        receivedAt: receiptModal.payment.paidAt || todayStr,
        paymentMethod: receiptModal.payment.method || 'PIX',
        installmentLabel: receiptModal.installment.label,
        contractedValue: receiptModal.contractedValue,
        totalPaid: receiptModal.totalPaid,
        remainingBalance: receiptModal.remainingBalance,
        paymentId: receiptModal.payment.paymentId || receiptModal.installment.id,
        notes: receiptModal.payment.notes,
        fileName: receiptModal.fileName,
        pdfBytes: receiptModal.bytes,
        emittedBy: user.uid,
        emittedByName: user.name,
        authorizedUids,
      });
      setReceiptModal((prev) => (prev ? { ...prev, saved: true } : null));
      setNotice({
        type: res.storageWarning ? 'warning' : 'success',
        text: res.storageWarning
          ? `Comprovante ${receiptModal.receiptNumber} registrado no histórico e Central de Documentos. (${res.storageWarning})`
          : `Comprovante ${receiptModal.receiptNumber} salvo na Central de Documentos e no histórico financeiro.`,
      });
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim()) return;
    const ev = events.find((x) => x.id === expEventId);
    const resp = teamMembers.find((m) => m.id === expResponsibleId);
    await createExpense({
      name: expName.trim(),
      type: expType,
      category: expCategory,
      amount: expAmount,
      date: expDate,
      eventId: ev?.id || '',
      eventName: ev?.coupleName || '',
      responsibleId: resp?.userId || user.uid,
      responsibleName: resp?.name || user.name,
      status: expStatus,
      notes: expNotes,
      authorizedUids,
      createdBy: user.uid,
    });
    setExpenseModalOpen(false);
    setExpName('');
    setExpAmount(0);
    setExpNotes('');
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#5C554C]">Receita Contratada</p>
          <p className="font-mono text-2xl font-semibold text-[#1F2A24] tabular-nums">
            {formatBRL(summary.contracted)}
          </p>
          <p className="text-xs text-[#5C554C]">{contracts.length} contratos registrados</p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#5C554C]">Receita Efetivamente Recebida</p>
          <p className="font-mono text-2xl font-semibold text-[#30483B] tabular-nums">
            {formatBRL(summary.received)}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            A receber: {formatBRL(summary.receivable)}
          </p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#5C554C]">Valores Vencidos & Despesas</p>
          <p className="font-mono text-2xl font-semibold text-[#A6342F] tabular-nums">
            {formatBRL(summary.overdue)}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            Despesas totais: {formatBRL(summary.totalExpenses)}
          </p>
        </div>

        <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#5C554C]">Fluxo de Caixa Realizado</p>
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${
              summary.realizedCashFlow >= 0 ? 'text-[#1F6E43]' : 'text-[#A6342F]'
            }`}
          >
            {formatBRL(summary.realizedCashFlow)}
          </p>
          <p className="text-xs text-[#5C554C] tabular-nums">
            Resultado estimado: {formatBRL(summary.estimatedResult)}
          </p>
        </div>
      </section>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            notice.type === 'error'
              ? 'bg-[#FCEEEE] border-[#A6342F]/25 text-[#A6342F]'
              : notice.type === 'warning'
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

      {/* Tabs + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#D6CEC1] rounded-lg">
          {[
            { key: 'overview', label: 'Visão Geral & Fluxo' },
            {
              key: 'contracts',
              label: `Contratos & Parcelas (${installments.length})${
                pendingQueue.length > 0 ? ` · ${pendingQueue.length} pend.` : ''
              }`,
            },
            { key: 'expenses', label: `Despesas (${expenses.length})` },
            { key: 'receipts', label: `Comprovantes PDF (${receipts.length})` },
            { key: 'reports', label: 'Relatórios' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                tab === t.key ? 'bg-[#30483B] text-white' : 'text-[#5C554C] hover:text-[#1F2A24]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCtrEventId(events[0]?.id || '');
                setCtrValue(events[0]?.contractedValue || 0);
                setContractModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Contrato
            </button>
            <button
              type="button"
              onClick={() => setExpenseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#D6CEC1] text-xs font-medium text-[#1F2A24] rounded-lg hover:bg-[#F5F3EE] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#594634]" />
              Nova Despesa
            </button>
          </div>
        )}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
              Fluxo de Caixa Mensal (Recebimentos vs. Despesas)
            </h3>
            <p className="text-xs text-[#5C554C]">
              Condição comercial configurada: {config.paymentTerms.notes}
            </p>
          </div>
          <MonthlyFinancialChart data={monthlySeries} />
        </div>
      )}

      {/* CONTRACTS & INSTALLMENTS */}
      {tab === 'contracts' && (
        <div className="space-y-6">
          {/* Manual Confirmation Queue */}
          {pendingQueue.length > 0 && (
            <div className="bg-[#FDF6E9] border border-[#9A6012]/35 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#9A6012]" />
                  <div>
                    <h3 className="font-sans text-sm font-semibold text-[#1F2A24]">
                      Pagamentos Aguardando Confirmação Manual ({pendingQueue.length})
                    </h3>
                    <p className="text-xs text-[#5C554C]">
                      Anexos enviados não abatem o saldo automaticamente até que você confirme o recebimento.
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#E7E2D8] bg-white rounded-lg border border-[#D6CEC1] px-4">
                {pendingQueue.map(({ inst, pending }) => (
                  <div
                    key={pending.pendingId}
                    className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-[#1F2A24]">
                        {inst.eventName || 'Evento'} · {inst.label} —{' '}
                        <span className="font-mono text-[#30483B]">{formatBRL(pending.amount)}</span>
                      </p>
                      <p className="text-[#5C554C]">
                        Data inf.: {formatDateBR(pending.paymentDate)} · {pending.method} · Enviado por{' '}
                        {pending.submittedByName}
                        {pending.attachmentName ? ` · Anexo: ${pending.attachmentName}` : ''}
                      </p>
                      {pending.attachmentUrl && (
                        <a
                          href={pending.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#30483B] hover:underline"
                        >
                          <FileText className="w-3 h-3" />
                          Visualizar comprovante anexado
                        </a>
                      )}
                    </div>

                    {canWrite && (
                      <div className="flex flex-wrap items-center gap-2">
                        {rejectingPendingId === pending.pendingId ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Motivo da rejeição..."
                              className="px-2 py-1 border border-[#D6CEC1] rounded text-xs w-44"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await rejectPendingPayment({
                                  installment: inst,
                                  pendingId: pending.pendingId,
                                  reason: rejectReason,
                                  actorUid: user.uid,
                                  actorName: user.name,
                                });
                                setRejectingPendingId(null);
                                setRejectReason('');
                              }}
                              className="px-2.5 py-1 bg-[#A6342F] text-white rounded text-[11px] font-medium cursor-pointer"
                            >
                              Rejeitar
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingPendingId(null)}
                              className="px-2 py-1 border border-[#D6CEC1] rounded text-[11px] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await confirmPendingPayment({
                                  installment: inst,
                                  pendingId: pending.pendingId,
                                  actorUid: user.uid,
                                  actorName: user.name,
                                });
                                setNotice({
                                  type: 'success',
                                  text: `Pagamento de ${formatBRL(pending.amount)} confirmado e abatido em ${inst.label}.`,
                                });
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#1F6E43] text-white rounded text-[11px] font-medium hover:bg-[#175533] cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirmar e Abater
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingPendingId(pending.pendingId);
                                setRejectReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#A6342F]/40 text-[#A6342F] rounded text-[11px] font-medium hover:bg-[#FCEEEE] cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
              Controle de Parcelas & Recebimentos
            </h3>
            {installments.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#594634]">
                Nenhuma parcela registrada. Crie um contrato vinculado a um evento ou converta um orçamento aprovado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#D6CEC1] text-[#594634]">
                      <th className="py-3 px-3 font-semibold">Evento / Parcela</th>
                      <th className="py-3 px-3 font-semibold">Vencimento</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-3 font-semibold text-right">Valor</th>
                      <th className="py-3 px-3 font-semibold text-right">Pago</th>
                      <th className="py-3 px-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E2D8]">
                    {[...installments]
                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                      .map((inst) => {
                        const isOverdue =
                          inst.status !== 'PAGO' && inst.dueDate < todayStr && inst.amount > inst.paidAmount;
                        const hasPending = (inst.pendingPayments || []).some(
                          (p) => p.status === 'AGUARDANDO_CONFIRMACAO'
                        );
                        return (
                          <tr key={inst.id} className="hover:bg-[#F5F3EE]/50">
                            <td className="py-3 px-3">
                              <p className="font-semibold text-[#1F2A24]">
                                {inst.eventName || 'Evento'} · {inst.label}
                              </p>
                              {inst.paymentMethod && (
                                <p className="text-[11px] text-[#5C554C]">
                                  Último meio: {inst.paymentMethod}
                                  {inst.paidAt ? ` em ${formatDateBR(inst.paidAt)}` : ''}
                                </p>
                              )}
                              {hasPending && (
                                <p className="text-[11px] font-medium text-[#9A6012]">
                                  Comprovante enviado aguardando confirmação manual
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums">{formatDateBR(inst.dueDate)}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`font-medium ${
                                  inst.status === 'PAGO'
                                    ? 'text-[#1F6E43]'
                                    : isOverdue
                                    ? 'text-[#A6342F]'
                                    : 'text-[#9A6012]'
                                }`}
                              >
                                {isOverdue ? 'ATRASADO' : inst.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              {formatBRL(inst.amount)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-[#30483B]">
                              {formatBRL(inst.paidAmount)}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {inst.paidAmount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenReceiptPdf(inst)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F5F3EE] border border-[#D6CEC1] text-[#594634] rounded text-[11px] font-medium hover:bg-[#EBE6DC] cursor-pointer whitespace-nowrap"
                                  >
                                    <ReceiptIcon className="w-3 h-3" />
                                    Comprovante PDF
                                  </button>
                                )}
                                {canWrite && inst.status !== 'PAGO' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayingInst(inst);
                                      setPayAmount(Number((inst.amount - inst.paidAmount).toFixed(2)));
                                      setPayDate(todayStr);
                                      setPayFile(null);
                                      setPayMode('CONFIRM_NOW');
                                    }}
                                    className="px-2.5 py-1 bg-[#30483B] text-white rounded text-[11px] font-medium hover:bg-[#24372D] cursor-pointer whitespace-nowrap"
                                  >
                                    Registrar Pagamento
                                  </button>
                                )}
                                {inst.status === 'PAGO' && (
                                  <span className="inline-flex items-center gap-1 text-[#1F6E43] whitespace-nowrap">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Quitado
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXPENSES */}
      {tab === 'expenses' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <h3 className="font-sans text-base font-semibold text-[#1F2A24]">Despesas Cadastradas</h3>
          {expenses.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#594634]">Não existem despesas registradas.</p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(true)}
                  className="px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Registrar primeira despesa
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#D6CEC1] text-[#594634]">
                    <th className="py-3 px-3 font-semibold">Descrição</th>
                    <th className="py-3 px-3 font-semibold">Tipo & Categoria</th>
                    <th className="py-3 px-3 font-semibold">Evento / Data</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 px-3 font-semibold text-right">Valor</th>
                    <th className="py-3 px-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E2D8]">
                  {[...expenses]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((ex) => (
                      <tr key={ex.id}>
                        <td className="py-3 px-3 font-semibold text-[#1F2A24]">{ex.name}</td>
                        <td className="py-3 px-3 text-[#5C554C]">
                          {ex.type} · {ex.category}
                        </td>
                        <td className="py-3 px-3 text-[#5C554C]">
                          {formatDateBR(ex.date)} · {ex.eventName || 'Geral'}
                        </td>
                        <td className="py-3 px-3">
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() =>
                                void updateExpenseStatus(
                                  ex,
                                  ex.status === 'PAGO' ? 'PENDENTE' : 'PAGO'
                                )
                              }
                              className={`font-medium cursor-pointer ${
                                ex.status === 'PAGO' ? 'text-[#1F6E43]' : 'text-[#9A6012]'
                              }`}
                            >
                              {ex.status}
                            </button>
                          ) : (
                            ex.status
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatBRL(ex.amount)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => void deleteExpense(ex.id)}
                              className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RECEIPTS TAB */}
      {tab === 'receipts' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
              Histórico de Comprovantes PDF Emitidos ({receipts.length})
            </h3>
            <p className="text-xs text-[#5C554C]">
              Comprovantes oficiais gerados pela 4EVER após confirmação de recebimento
            </p>
          </div>
          {receipts.length === 0 ? (
            <p className="text-xs text-[#5C554C] py-8 text-center">
              Nenhum comprovante PDF emitido ainda. Confirme um pagamento na aba "Contratos & Parcelas" e clique em "Comprovante PDF".
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#D6CEC1] text-[#594634]">
                    <th className="py-3 px-3 font-semibold">Número</th>
                    <th className="py-3 px-3 font-semibold">Casal / Parcela</th>
                    <th className="py-3 px-3 font-semibold">Recebimento</th>
                    <th className="py-3 px-3 font-semibold text-right">Valor Recebido</th>
                    <th className="py-3 px-3 font-semibold text-right">Saldo Restante</th>
                    <th className="py-3 px-3 font-semibold text-right">Arquivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E2D8]">
                  {receipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-[#F5F3EE]/50">
                      <td className="py-3 px-3 font-mono font-semibold text-[#30483B]">
                        {rec.receiptNumber}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-[#1F2A24]">{rec.coupleName}</p>
                        <p className="text-[11px] text-[#5C554C]">
                          {rec.installmentLabel || 'Parcela'} · por {rec.emittedByName || 'Equipe'}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-[#5C554C] tabular-nums">
                        {formatDateBR(rec.receivedAt)} · {rec.paymentMethod}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#1F6E43]">
                        {formatBRL(rec.amount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#5C554C]">
                        {formatBRL(rec.remainingBalance ?? 0)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {rec.downloadUrl ? (
                          <a
                            href={rec.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-[11px] font-medium text-[#30483B] hover:bg-[#EBE6DC]"
                          >
                            <Download className="w-3 h-3" />
                            Abrir PDF
                          </a>
                        ) : (
                          <span className="text-[11px] text-[#5C554C]">Salvo na Central (Metadados)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* REPORTS */}
      {tab === 'reports' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
            Relatório de Resultado e Custos por Evento
          </h3>
          {costByEvent.length === 0 ? (
            <p className="text-xs text-[#5C554C] py-6 text-center">
              Nenhum evento cadastrado para composição de custos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#D6CEC1] text-[#594634]">
                    <th className="py-3 px-3 font-semibold">Evento / Casal</th>
                    <th className="py-3 px-3 font-semibold text-right">Contratado</th>
                    <th className="py-3 px-3 font-semibold text-right">Recebido</th>
                    <th className="py-3 px-3 font-semibold text-right">Despesas</th>
                    <th className="py-3 px-3 font-semibold text-right">Resultado Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E2D8]">
                  {costByEvent.map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 px-3 font-semibold text-[#1F2A24]">{row.coupleName}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatBRL(row.contracted)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#30483B]">
                        {formatBRL(row.received)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#A6342F]">
                        {formatBRL(row.expenses)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                        {formatBRL(row.result)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* NEW CONTRACT MODAL */}
      {contractModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateContract}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">Novo Contrato Financeiro</h3>
              <button type="button" onClick={() => setContractModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {events.length === 0 ? (
              <p className="text-[#A6342F]">
                Cadastre um evento primeiro antes de vincular um contrato financeiro.
              </p>
            ) : (
              <>
                <div>
                  <label className="block font-medium text-[#594634] mb-1">Evento *</label>
                  <select
                    required
                    value={ctrEventId}
                    onChange={(e) => {
                      setCtrEventId(e.target.value);
                      const ev = events.find((x) => x.id === e.target.value);
                      if (ev) setCtrValue(ev.contractedValue);
                    }}
                    className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                  >
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.coupleName} ({formatDateBR(ev.date)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Valor Total (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step="10"
                      value={ctrValue}
                      onChange={(e) => setCtrValue(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Entrada (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={ctrDepositPct}
                      onChange={(e) => setCtrDepositPct(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#594634] mb-1">Parcelas Saldo</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={ctrInstallments}
                      onChange={(e) => setCtrInstallments(Number(e.target.value || 1))}
                      className="w-full px-2.5 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-[#594634] mb-1">Condições Comerciais</label>
                  <textarea
                    rows={2}
                    value={ctrNotes}
                    onChange={(e) => setCtrNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setContractModalOpen(false)}
                    className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
                  >
                    Gerar Contrato e Parcelas
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* PAYMENT MODAL (EXPLICIT MANUAL CONFIRMATION vs PENDING PROOF REVIEW) */}
      {payingInst && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordPayment}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">
                Registrar Pagamento — {payingInst.label}
              </h3>
              <button type="button" onClick={() => setPayingInst(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[#5C554C]">
              Saldo restante:{' '}
              <strong className="font-mono">{formatBRL(payingInst.amount - payingInst.paidAmount)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Valor Pago (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={payingInst.amount - payingInst.paidAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Data</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Forma de Pagamento</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              >
                <option value="PIX">PIX</option>
                <option value="Transferência Bancária">Transferência Bancária</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">
                Anexar Comprovante (Opcional)
              </label>
              <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-[#A99A83] rounded-lg bg-[#F5F3EE] cursor-pointer hover:bg-[#EBE6DC]">
                <Upload className="w-4 h-4 text-[#30483B]" />
                <span className="truncate">
                  {payFile ? payFile.name : 'Selecionar imagem ou PDF do comprovante'}
                </span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setPayFile(file);
                    // Safeguard: attaching a file defaults to pending review unless user explicitly chooses Confirm Now
                    if (file) {
                      setPayMode('PENDING_REVIEW');
                    }
                  }}
                />
              </label>
            </div>

            <div className="p-3 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg space-y-2">
              <p className="font-semibold text-[#594634]">Regra de Baixa Financeira</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'CONFIRM_NOW'}
                  onChange={() => setPayMode('CONFIRM_NOW')}
                  className="mt-0.5 accent-[#30483B]"
                />
                <span>
                  <strong>Confirmar e abater agora</strong> (baixa explícita no saldo da parcela)
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'PENDING_REVIEW'}
                  onChange={() => setPayMode('PENDING_REVIEW')}
                  className="mt-0.5 accent-[#30483B]"
                />
                <span>
                  <strong>Enviar para conferência manual</strong> (salva anexo sem abater o saldo)
                </span>
              </label>
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">Observações</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingInst(null)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingPay}
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg hover:bg-[#24372D] disabled:opacity-60 cursor-pointer"
              >
                {submittingPay
                  ? 'Processando...'
                  : payMode === 'PENDING_REVIEW'
                  ? 'Enviar p/ Conferência'
                  : 'Confirmar Recebimento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RECEIPT PDF PREVIEW MODAL */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/70 flex items-center justify-center p-4">
          <div className="bg-white border border-[#D6CEC1] rounded-xl max-w-4xl w-full p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D6CEC1] pb-3">
              <div className="min-w-0">
                <h3 className="font-sans text-base font-semibold text-[#1F2A24] truncate">
                  {receiptModal.fileName}
                </h3>
                <p className="text-xs text-[#5C554C]">
                  Comprovante oficial · Valor {formatBRL(receiptModal.payment.amount)} · Saldo{' '}
                  {formatBRL(receiptModal.remainingBalance)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPdfBytes(receiptModal.bytes, receiptModal.fileName)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar PDF
                </button>
                <button
                  type="button"
                  disabled={savingReceipt || receiptModal.saved}
                  onClick={() => void handleSaveReceiptToCentral()}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                    receiptModal.saved
                      ? 'bg-[#ECF6F0] border-[#1F6E43]/30 text-[#1F6E43]'
                      : 'bg-[#F5F3EE] border-[#D6CEC1] text-[#30483B] hover:bg-[#EBE6DC]'
                  }`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  {receiptModal.saved
                    ? 'Salvo na Central'
                    : savingReceipt
                    ? 'Salvando...'
                    : 'Salvar na Central e Histórico'}
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptModal(null)}
                  className="p-1.5 text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={receiptModal.blobUrl}
              title={receiptModal.fileName}
              className="w-full h-[68vh] rounded-lg border border-[#D6CEC1] bg-[#F5F3EE]"
            />
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateExpense}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-sans text-base font-semibold text-[#1F2A24]">Cadastrar Despesa</h3>
              <button type="button" onClick={() => setExpenseModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Descrição *</label>
              <input
                required
                type="text"
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Tipo</label>
                <select
                  value={expType}
                  onChange={(e) => setExpType(e.target.value as ExpenseType)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="EVENTO">Por Evento</option>
                  <option value="FIXA">Fixa</option>
                  <option value="VARIAVEL">Variável</option>
                  <option value="GERAL">Geral</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Categoria</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  {(config.expenseCategories || ['Geral']).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Valor (R$) *</label>
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={expAmount}
                  onChange={(e) => setExpAmount(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Data *</label>
                <input
                  required
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Evento Vinculado</label>
                <select
                  value={expEventId}
                  onChange={(e) => setExpEventId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Sem vínculo específico</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.coupleName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Status</label>
                <select
                  value={expStatus}
                  onChange={(e) => setExpStatus(e.target.value as 'PENDENTE' | 'PAGO')}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="PAGO">Pago</option>
                  <option value="PENDENTE">Pendente</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Responsável</label>
              <select
                value={expResponsibleId}
                onChange={(e) => setExpResponsibleId(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              >
                <option value="">{user.name}</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Salvar Despesa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
