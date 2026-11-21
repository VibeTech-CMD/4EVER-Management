import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Monogram4E } from './BrandMarks';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Erro inesperado ao carregar módulo.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendlyDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyDetail = `${parsed.error} (${parsed.operationType || 'operação'} em ${parsed.path || 'banco'})`;
        }
      } catch {
        // Use raw message
      }

      return (
        <div className="min-h-screen bg-[#F5F3EE] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#D6CEC1] rounded-xl p-8 space-y-5">
            <div className="flex items-center justify-between">
              <Monogram4E size={40} />
              <AlertTriangle className="w-6 h-6 text-[#A6342F]" />
            </div>
            <div className="space-y-2">
              <h2 className="font-serif text-2xl text-[#1F2A24] font-semibold">
                Ocorreu uma falha de operação
              </h2>
              <p className="text-sm text-[#5C554C] leading-relaxed">
                O sistema interceptou um erro de permissão ou consistência para proteger os dados da 4EVER.
              </p>
              <div className="p-3 bg-[#F5F3EE] border border-[#D6CEC1] rounded-lg text-xs font-mono text-[#594634] break-words">
                {friendlyDetail}
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#30483B] text-white text-sm font-medium rounded-lg hover:bg-[#24372D] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
