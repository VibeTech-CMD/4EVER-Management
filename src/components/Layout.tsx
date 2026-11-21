import React, { useState } from 'react';
import {
  Calculator,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { ModuleKey, UserProfile } from '../lib/types';
import { canAccessModule, ROLE_LABELS } from '../services/rbac';
import { FourEverFullLogo, Monogram4E } from './BrandMarks';

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'simulator', label: 'Simulador de Orçamentos', icon: Calculator },
  { key: 'finance', label: 'Financeiro', icon: Wallet },
  { key: 'events', label: 'Eventos', icon: CalendarDays },
  { key: 'team', label: 'Equipe', icon: Users },
  { key: 'documents', label: 'Documentos', icon: FolderOpen },
  { key: 'settings', label: 'Configuração Geral', icon: Settings },
];

interface LayoutProps {
  activeModule: ModuleKey;
  onSelectModule: (mod: ModuleKey) => void;
  user: UserProfile;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeModule,
  onSelectModule,
  user,
  onLogout,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => canAccessModule(user, item.key));
  const currentNav = NAV_ITEMS.find((item) => item.key === activeModule);

  const handleNavigate = (key: ModuleKey) => {
    onSelectModule(key);
    setMobileOpen(false);
  };

  const renderSidebarBody = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-[#30483B] text-[#F5F3EE]">
      {/* Brand Header */}
      <div className="h-20 px-5 flex items-center justify-between border-b border-[#F5F3EE]/12 shrink-0">
        {collapsed && !isMobile ? (
          <div className="w-full flex justify-center">
            <Monogram4E variant="on-dark" size={36} />
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <FourEverFullLogo variant="light-on-dark" className="h-10 w-auto max-w-[165px]" />
          </div>
        )}

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-[#F5F3EE]/80 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:inline-flex p-1.5 rounded-md text-[#A99A83] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto" aria-label="Navegação Principal">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavigate(item.key)}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#F5F3EE] text-[#30483B]'
                  : 'text-[#F5F3EE]/85 hover:bg-white/10 hover:text-white'
              } ${collapsed && !isMobile ? 'justify-center px-2' : ''}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#30483B]' : 'text-[#A99A83]'}`} />
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-[#F5F3EE]/12 space-y-3 shrink-0">
        {(!collapsed || isMobile) && (
          <div className="px-1">
            <p className="text-sm font-semibold text-[#F5F3EE] truncate">{user.name}</p>
            <p className="text-xs text-[#A99A83] truncate">
              {ROLE_LABELS[user.role]} · {user.email}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#F5F3EE]/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ${
            collapsed && !isMobile ? 'justify-center' : ''
          }`}
          title="Sair do sistema"
        >
          <LogOut className="w-4 h-4 text-[#A99A83] shrink-0" />
          {(!collapsed || isMobile) && <span>Sair</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F5F3EE] text-[#1F2A24]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-[#24372D] transition-all duration-200 no-print ${
          collapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarBody(false)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-[#1F2A24]/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 shadow-xl">
            {renderSidebarBody(true)}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b border-[#D6CEC1] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#30483B] hover:bg-[#F5F3EE] cursor-pointer"
              aria-label="Abrir navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <Monogram4E variant="green" size={32} />
              <div className="min-w-0">
                <p className="text-[11px] font-sans font-bold tracking-tight text-[#594634] lining-nums truncate">
                  4EVER Management
                </p>
                <h1 className="font-sans text-base sm:text-lg font-semibold text-[#1F2A24] truncate leading-tight">
                  {currentNav?.label || 'Painel Operacional'}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-[#1F2A24]">{user.name}</p>
              <p className="text-[11px] text-[#5C554C]">{ROLE_LABELS[user.role]}</p>
            </div>
            {activeModule !== 'simulator' && canAccessModule(user, 'simulator') && (
              <button
                type="button"
                onClick={() => onSelectModule('simulator')}
                className="px-4 py-2 bg-[#30483B] text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-[#24372D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Novo Orçamento
              </button>
            )}
          </div>
        </header>

        {/* Viewport Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
