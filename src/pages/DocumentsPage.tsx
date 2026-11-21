import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutTemplate,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ContractRecord,
  CoupleRecord,
  DocumentCategory,
  DocumentFolderRecord,
  DocumentRecord,
  EventRecord,
  PartnerRecord,
  QuoteRecord,
  SystemConfig,
  TeamMemberRecord,
  UserProfile,
} from '../lib/types';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../lib/defaults';
import {
  createOrUpdateDocumentFolder,
  deleteDocumentFolder,
  deleteDocumentRecord,
  updateDocumentRecordMeta,
  uploadDocumentRecord,
} from '../services/firestoreService';
import { canDelete, canWriteOperationally, isOpOrMaster } from '../services/rbac';

interface DocumentsPageProps {
  user: UserProfile;
  authorizedUids: string[];
  config: SystemConfig;
  documents: DocumentRecord[];
  folders: DocumentFolderRecord[];
  events: EventRecord[];
  couples: CoupleRecord[];
  contracts: ContractRecord[];
  partners: PartnerRecord[];
  teamMembers: TeamMemberRecord[];
  quotes: QuoteRecord[];
}

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  CONTRATOS: 'Contratos',
  PROPOSTAS: 'Propostas',
  DOCUMENTOS_CLIENTES: 'Documentos dos clientes',
  FORNECEDORES: 'Fornecedores',
  RELATORIOS: 'Relatórios',
  PLANILHAS: 'Planilhas',
  DOCUMENTOS_INTERNOS: 'Documentos internos',
  OUTROS: 'Outros',
};

function resolveCategoryLabel(cat: string): string {
  return LEGACY_CATEGORY_MAP[cat] || cat || 'Outros';
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({
  user,
  authorizedUids,
  config,
  documents,
  folders,
  events,
  couples,
  contracts,
  partners,
  teamMembers,
  quotes,
}) => {
  const canWrite = canWriteOperationally(user);
  const canRemove = isOpOrMaster(user) || canDelete(user);

  const categories = config.documentCategories?.length
    ? config.documentCategories
    : DEFAULT_DOCUMENT_CATEGORIES;

  const [subTab, setSubTab] = useState<'docs' | 'folders' | 'templates'>('docs');
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Upload / register document modal
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(categories[0] || 'Contratos');
  const [folderId, setFolderId] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [eventId, setEventId] = useState('');
  const [coupleId, setCoupleId] = useState('');
  const [contractId, setContractId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  // Folder create/rename modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolderRecord | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderParentId, setFolderParentId] = useState('');
  const [folderDesc, setFolderDesc] = useState('');

  // Inline delete confirms
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const [statusNotice, setStatusNotice] = useState<{ type: 'info' | 'warning'; text: string } | null>(
    null
  );

  const folderMap = useMemo(() => {
    const map = new Map<string, DocumentFolderRecord>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  const breadcrumbFolders = useMemo(() => {
    const trail: DocumentFolderRecord[] = [];
    let cursor = currentFolderId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const found = folderMap.get(cursor);
      if (!found) break;
      trail.unshift(found);
      cursor = found.parentId || '';
    }
    return trail;
  }, [currentFolderId, folderMap]);

  const childFolders = useMemo(
    () =>
      folders
        .filter((f) => (f.parentId || '') === currentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId]
  );

  const folderOptions = useMemo(() => {
    const buildLabel = (f: DocumentFolderRecord): string => {
      const parts: string[] = [f.name];
      let parent = f.parentId || '';
      const visited = new Set<string>([f.id]);
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        const pf = folderMap.get(parent);
        if (!pf) break;
        parts.unshift(pf.name);
        parent = pf.parentId || '';
      }
      return parts.join(' / ');
    };
    return folders
      .map((f) => ({ id: f.id, label: buildLabel(f) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folders, folderMap]);

  const filteredDocs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return documents.filter((d) => {
      const resolvedCat = resolveCategoryLabel(d.category);
      const matchesCat = categoryFilter === 'ALL' || resolvedCat === categoryFilter || d.category === categoryFilter;
      const matchesFolder = !currentFolderId || (d.folderId || '') === currentFolderId;
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        (d.eventName || '').toLowerCase().includes(q) ||
        (d.coupleName || '').toLowerCase().includes(q) ||
        (d.partnerName || '').toLowerCase().includes(q) ||
        (d.memberName || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q);
      return matchesCat && matchesFolder && matchesSearch;
    });
  }, [documents, categoryFilter, currentFolderId, searchTerm]);

  const templateDocuments = useMemo(
    () =>
      documents.filter(
        (d) => d.isTemplate || resolveCategoryLabel(d.category) === 'Modelos'
      ),
    [documents]
  );

  const openUploadModal = (defaults?: { templateMode?: boolean }) => {
    setTitle('');
    setCategory(defaults?.templateMode ? 'Modelos' : categories[0] || 'Contratos');
    setFolderId(currentFolderId);
    setIsTemplate(Boolean(defaults?.templateMode));
    setSelectedFile(null);
    setExternalUrl('');
    setEventId('');
    setCoupleId('');
    setContractId('');
    setPartnerId('');
    setMemberId('');
    setQuoteId('');
    setPaymentId('');
    setNotes('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setUploading(true);
    setStatusNotice(null);

    try {
      const ev = events.find((x) => x.id === eventId);
      const cp = couples.find((x) => x.id === coupleId);
      const prt = partners.find((x) => x.id === partnerId);
      const mbr = teamMembers.find((x) => x.id === memberId);

      const res = await uploadDocumentRecord({
        file: selectedFile,
        title: title.trim(),
        category,
        folderId,
        isTemplate,
        eventId: ev?.id || '',
        eventName: ev?.coupleName || '',
        coupleId: cp?.id || '',
        coupleName: cp?.coupleName || '',
        contractId,
        partnerId: prt?.id || '',
        partnerName: prt?.name || '',
        memberId: mbr?.id || '',
        memberName: mbr?.name || '',
        quoteId,
        paymentId: paymentId.trim(),
        notes,
        externalUrl,
        uploadedBy: user.uid,
        uploadedByName: user.name,
        authorizedUids,
      });

      if (res.storageWarning) {
        setStatusNotice({ type: 'warning', text: res.storageWarning });
      } else {
        setStatusNotice({ type: 'info', text: 'Documento registrado com sucesso.' });
      }
      setModalOpen(false);
    } finally {
      setUploading(false);
    }
  };

  const openFolderModal = (folder?: DocumentFolderRecord) => {
    setEditingFolder(folder || null);
    setFolderName(folder?.name || '');
    setFolderParentId(folder ? folder.parentId || '' : currentFolderId);
    setFolderDesc(folder?.description || '');
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    await createOrUpdateDocumentFolder({
      id: editingFolder?.id,
      name: folderName.trim(),
      parentId: editingFolder?.id && folderParentId === editingFolder.id ? '' : folderParentId,
      description: folderDesc.trim(),
      authorizedUids,
      actorUid: user.uid,
    });
    setFolderModalOpen(false);
    setStatusNotice({
      type: 'info',
      text: editingFolder ? 'Pasta atualizada.' : 'Pasta criada na Central de Documentos.',
    });
  };

  const handleDeleteFolder = async (folder: DocumentFolderRecord) => {
    const hasSubfolders = folders.some((f) => f.parentId === folder.id);
    const hasDocs = documents.some((d) => d.folderId === folder.id);
    if (hasSubfolders || hasDocs) {
      setStatusNotice({
        type: 'warning',
        text: 'Mova ou remova os arquivos e subpastas internos antes de excluir esta pasta.',
      });
      setConfirmDeleteFolderId(null);
      return;
    }
    await deleteDocumentFolder(folder.id);
    if (currentFolderId === folder.id) {
      setCurrentFolderId(folder.parentId || '');
    }
    setConfirmDeleteFolderId(null);
    setStatusNotice({ type: 'info', text: 'Pasta excluída.' });
  };

  return (
    <div className="space-y-6">
      {/* Header + Sub-nav */}
      <div className="bg-white border border-[#D6CEC1] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#1F2A24]">
              Central de Documentos ({documents.length})
            </h2>
            <p className="text-xs text-[#5C554C]">
              Pastas, subpastas, categorias configuráveis, vínculos operacionais e modelos oficiais
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={() => openFolderModal()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F5F3EE] border border-[#D6CEC1] text-xs font-medium text-[#30483B] rounded-lg hover:bg-[#EBE6DC] cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Nova Pasta
                </button>
                <button
                  type="button"
                  onClick={() => openUploadModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#30483B] text-white text-xs font-medium rounded-lg hover:bg-[#24372D] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Novo Documento
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E7E2D8]">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'docs', label: `Documentos (${documents.length})`, icon: FileText },
              { id: 'folders', label: `Pastas (${folders.length})`, icon: FolderOpen },
              { id: 'templates', label: 'Modelos', icon: LayoutTemplate },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id as typeof subTab)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                    subTab === t.id
                      ? 'bg-[#30483B] text-white'
                      : 'bg-[#F5F3EE] text-[#594634] hover:bg-[#EBE6DC]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {subTab !== 'templates' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A99A83] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar arquivo ou vínculo..."
                  className="pl-8 pr-3 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs"
              >
                <option value="ALL">Todas as categorias</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {statusNotice && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            statusNotice.type === 'warning'
              ? 'bg-[#FDF6E9] border-[#9A6012]/30 text-[#9A6012]'
              : 'bg-[#ECF6F0] border-[#1F6E43]/25 text-[#1F6E43]'
          }`}
        >
          <span>{statusNotice.text}</span>
          <button type="button" onClick={() => setStatusNotice(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Breadcrumb when inside folders or Pastas tab */}
      {subTab !== 'templates' && (folders.length > 0 || currentFolderId) && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentFolderId('')}
              className={`font-medium cursor-pointer hover:underline ${
                !currentFolderId ? 'text-[#30483B] font-semibold' : 'text-[#5C554C]'
              }`}
            >
              Raiz da Central
            </button>
            {breadcrumbFolders.map((bf) => (
              <React.Fragment key={bf.id}>
                <ChevronRight className="w-3.5 h-3.5 text-[#A99A83]" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(bf.id)}
                  className={`font-medium cursor-pointer hover:underline ${
                    bf.id === currentFolderId ? 'text-[#30483B] font-semibold' : 'text-[#5C554C]'
                  }`}
                >
                  {bf.name}
                </button>
              </React.Fragment>
            ))}
          </div>
          {currentFolderId && (
            <button
              type="button"
              onClick={() => setCurrentFolderId('')}
              className="text-[11px] font-medium text-[#594634] hover:underline cursor-pointer"
            >
              Mostrar todos da raiz
            </button>
          )}
        </div>
      )}

      {/* SUBTAB: PASTAS */}
      {subTab === 'folders' && (
        <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
              Estrutura de Pastas e Subpastas
            </h3>
            {canWrite && (
              <button
                type="button"
                onClick={() => openFolderModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#30483B] text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {currentFolderId ? 'Nova Subpasta Aqui' : 'Criar Pasta'}
              </button>
            )}
          </div>

          {childFolders.length === 0 ? (
            <p className="text-xs text-[#5C554C] py-8 text-center">
              Nenhuma subpasta neste nível. Crie pastas para organizar por casal, evento ou departamento.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {childFolders.map((f) => {
                const subCount = folders.filter((sf) => sf.parentId === f.id).length;
                const docCount = documents.filter((d) => d.folderId === f.id).length;
                return (
                  <div
                    key={f.id}
                    className="border border-[#D6CEC1] rounded-xl p-4 bg-[#F5F3EE]/50 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentFolderId(f.id);
                          setSubTab('docs');
                        }}
                        className="flex items-start gap-2.5 text-left cursor-pointer group"
                      >
                        <Folder className="w-5 h-5 text-[#30483B] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-sm text-[#1F2A24] group-hover:text-[#30483B] group-hover:underline">
                            {f.name}
                          </p>
                          {f.description && (
                            <p className="text-[11px] text-[#5C554C] mt-0.5">{f.description}</p>
                          )}
                        </div>
                      </button>
                    </div>
                    <div className="pt-2 border-t border-[#E7E2D8] flex items-center justify-between text-[11px] text-[#5C554C]">
                      <span className="tabular-nums">
                        {docCount} arquivo(s) · {subCount} subpasta(s)
                      </span>
                      <div className="flex items-center gap-2">
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openFolderModal(f)}
                            title="Renomear"
                            className="p-1 text-[#30483B] hover:bg-white rounded cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canRemove &&
                          (confirmDeleteFolderId === f.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDeleteFolder(f)}
                                className="px-2 py-0.5 bg-[#A6342F] text-white rounded cursor-pointer"
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFolderId(null)}
                                className="cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFolderId(f.id)}
                              title="Excluir pasta"
                              className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: DOCUMENTOS */}
      {subTab === 'docs' && (
        <div className="space-y-4">
          {/* Quick subfolders row when navigating folders */}
          {childFolders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {childFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCurrentFolderId(f.id)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-[#D6CEC1] rounded-lg text-xs font-medium text-[#1F2A24] hover:border-[#30483B] cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-[#30483B]" />
                  {f.name}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6">
            {filteredDocs.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm font-medium text-[#594634]">
                  Não existem documentos cadastrados nesta visualização.
                </p>
                <p className="text-xs text-[#5C554C] max-w-md mx-auto">
                  Envie arquivos via Firebase Storage ou registre metadados vinculados a pastas, eventos, casais, contratos, parceiros ou integrantes.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#D6CEC1] text-[#594634]">
                      <th className="py-3 px-3 font-semibold">Documento</th>
                      <th className="py-3 px-3 font-semibold">Categoria</th>
                      <th className="py-3 px-3 font-semibold">Pasta</th>
                      <th className="py-3 px-3 font-semibold">Vínculos</th>
                      <th className="py-3 px-3 font-semibold">Armazenamento</th>
                      <th className="py-3 px-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E2D8]">
                    {filteredDocs.map((d) => {
                      const folder = d.folderId ? folderMap.get(d.folderId) : undefined;
                      const links = [
                        d.eventName ? `Evento: ${d.eventName}` : '',
                        d.coupleName && d.coupleName !== d.eventName ? `Casal: ${d.coupleName}` : '',
                        d.partnerName ? `Parceiro: ${d.partnerName}` : '',
                        d.memberName ? `Equipe: ${d.memberName}` : '',
                        d.quoteId ? `Orç.: ${d.quoteId}` : '',
                        d.paymentId ? `Pag.: ${d.paymentId}` : '',
                      ].filter(Boolean);

                      return (
                        <tr key={d.id} className="hover:bg-[#F5F3EE]/50">
                          <td className="py-3 px-3">
                            <p className="font-semibold text-[#1F2A24] inline-flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-[#30483B] shrink-0" />
                              <span>{d.title}</span>
                              {d.isTemplate && (
                                <span className="text-[10px] font-mono text-[#594634]">[MODELO]</span>
                              )}
                            </p>
                            {d.fileName && <p className="text-[11px] text-[#5C554C]">{d.fileName}</p>}
                          </td>
                          <td className="py-3 px-3 text-[#5C554C]">
                            {resolveCategoryLabel(d.category)}
                          </td>
                          <td className="py-3 px-3">
                            {canWrite ? (
                              <select
                                value={d.folderId || ''}
                                onChange={(e) =>
                                  void updateDocumentRecordMeta(d.id, { folderId: e.target.value })
                                }
                                className="px-2 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-[11px] max-w-[150px]"
                              >
                                <option value="">Raiz</option>
                                {folderOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[#5C554C]">{folder?.name || 'Raiz'}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-[#5C554C]">
                            {links.length ? links.join(' · ') : 'Interno'}
                          </td>
                          <td className="py-3 px-3 text-[#5C554C]">
                            {d.storageMode === 'FIREBASE_STORAGE' ? 'Firebase Storage' : 'Metadados / Link'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-end gap-2">
                              {d.downloadUrl && (
                                <a
                                  href={d.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F5F3EE] border border-[#D6CEC1] rounded text-[11px] font-medium text-[#30483B] hover:bg-[#EBE6DC]"
                                >
                                  <Download className="w-3 h-3" />
                                  Abrir
                                </a>
                              )}
                              {canRemove &&
                                (confirmDeleteDocId === d.id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await deleteDocumentRecord(d.id, d.storagePath);
                                        setConfirmDeleteDocId(null);
                                        setStatusNotice({
                                          type: 'info',
                                          text: 'Documento removido.',
                                        });
                                      }}
                                      className="px-2 py-0.5 bg-[#A6342F] text-white rounded text-[11px] font-medium cursor-pointer"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteDocId(null)}
                                      className="text-[11px] text-[#5C554C] cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteDocId(d.id)}
                                    className="p-1 text-[#A6342F] hover:bg-[#FCEEEE] rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ))}
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

      {/* SUBTAB: MODELOS */}
      {subTab === 'templates' && (
        <div className="space-y-6">
          {/* Document Templates Section */}
          <div className="bg-white border border-[#D6CEC1] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                  Minutas e Modelos Internos ({templateDocuments.length})
                </h3>
                <p className="text-xs text-[#5C554C]">
                  Minutas contratuais, checklists-modelo, roteiros padrão e documentos de referência da equipe
                </p>
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => openUploadModal({ templateMode: true })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs font-medium text-[#30483B] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Adicionar Modelo
                </button>
              )}
            </div>

            {templateDocuments.length === 0 ? (
              <p className="text-xs text-[#5C554C] py-6 text-center">
                Nenhuma minuta ou modelo adicional registrado ainda. Marque &ldquo;Salvar como modelo&rdquo; ao enviar um documento.
              </p>
            ) : (
              <div className="divide-y divide-[#E7E2D8] text-xs">
                {templateDocuments.map((td) => (
                  <div key={td.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1F2A24]">{td.title}</p>
                      <p className="text-[#5C554C]">
                        {td.fileName || 'Referência externa'} · {td.notes || 'Sem observações'}
                      </p>
                    </div>
                    {td.downloadUrl && (
                      <a
                        href={td.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg font-medium text-[#30483B]"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Abrir Modelo
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload / Register Document Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">Registrar Documento</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#594634] mb-1">Título do Documento *</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Pasta</label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Raiz da Central</option>
                  {folderOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Evento</label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.coupleName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Casal</label>
                <select
                  value={coupleId}
                  onChange={(e) => setCoupleId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {couples.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.coupleName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Contrato</label>
                <select
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {contracts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.coupleName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Parceiro</label>
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Integrante</label>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#594634] mb-1">Vincular a Orçamento</label>
                <select
                  value={quoteId}
                  onChange={(e) => setQuoteId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
                >
                  <option value="">Nenhum</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.code} — {q.coupleName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block font-medium text-[#594634] mb-1">
                  ID / Referência de Pagamento (opcional)
                </label>
                <input
                  type="text"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  placeholder="Ex.: pay_... ou REC-2026-0001"
                  className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg font-mono"
                />
              </div>
              <label className="inline-flex items-center gap-2 pt-5 cursor-pointer font-medium text-[#1F2A24]">
                <input
                  type="checkbox"
                  checked={isTemplate}
                  onChange={(e) => setIsTemplate(e.target.checked)}
                  className="accent-[#30483B]"
                />
                <span>Salvar como modelo reutilizável (aba Modelos)</span>
              </label>
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">
                Arquivo (Firebase Storage)
              </label>
              <label className="flex items-center justify-center gap-2 p-4 border border-dashed border-[#A99A83] rounded-lg bg-[#F5F3EE] cursor-pointer hover:bg-[#EBE6DC]">
                <Upload className="w-4 h-4 text-[#30483B]" />
                <span>
                  {selectedFile ? selectedFile.name : 'Selecionar arquivo PDF, imagem, DOCX ou planilha'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">
                URL externa segura (opcional)
              </label>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#594634] mb-1">Observações</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                {uploading ? 'Enviando...' : 'Salvar Documento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Folder Create / Rename Modal */}
      {folderModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1F2A24]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFolder}
            className="bg-white border border-[#D6CEC1] rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D6CEC1] pb-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F2A24]">
                {editingFolder ? 'Editar Pasta' : 'Nova Pasta'}
              </h3>
              <button type="button" onClick={() => setFolderModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Nome da Pasta *</label>
              <input
                required
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Pasta Superior (Subpasta de)</label>
              <select
                value={folderParentId}
                onChange={(e) => setFolderParentId(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              >
                <option value="">Raiz da Central</option>
                {folderOptions
                  .filter((opt) => opt.id !== editingFolder?.id)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#594634] mb-1">Descrição</label>
              <input
                type="text"
                value={folderDesc}
                onChange={(e) => setFolderDesc(e.target.value)}
                className="w-full px-3 py-2 border border-[#D6CEC1] rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="px-4 py-2 border border-[#D6CEC1] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#30483B] text-white font-medium rounded-lg cursor-pointer"
              >
                Salvar Pasta
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
