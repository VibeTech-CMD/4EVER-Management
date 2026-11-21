import React from 'react';
import { formatBRL } from '../services/validation';

interface MonthlySeriesItem {
  label: string;
  revenue: number;
  expense: number;
}

export const MonthlyFinancialChart: React.FC<{
  data: MonthlySeriesItem[];
  emptyMessage?: string;
}> = ({ data, emptyMessage = 'Ainda não existem lançamentos financeiros suficientes para exibir a evolução mensal.' }) => {
  const hasAnyValue = data.some((d) => d.revenue > 0 || d.expense > 0);
  if (!hasAnyValue) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-center px-6 bg-[#F5F3EE]/60 border border-dashed border-[#D6CEC1] rounded-lg">
        <p className="text-sm font-medium text-[#594634]">{emptyMessage}</p>
        <p className="text-xs text-[#5C554C] mt-1">
          Os valores aparecerão automaticamente à medida que receitas e despesas forem registradas.
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.expense]), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-5 text-xs text-[#5C554C]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#30483B] inline-block" />
          Receita recebida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#A99A83] inline-block" />
          Despesas
        </span>
      </div>
      <div className="grid grid-cols-6 gap-3 items-end h-48 pt-4 border-b border-[#D6CEC1]">
        {data.map((item) => {
          const revH = Math.round((item.revenue / maxVal) * 140);
          const expH = Math.round((item.expense / maxVal) * 140);
          return (
            <div key={item.label} className="flex flex-col items-center gap-2 h-full justify-end group">
              <div className="flex items-end gap-1.5 h-36">
                <div
                  className="w-4 sm:w-5 bg-[#30483B] rounded-t transition-opacity group-hover:opacity-90"
                  style={{ height: `${Math.max(item.revenue > 0 ? 4 : 0, revH)}px` }}
                  title={`Receita ${item.label}: ${formatBRL(item.revenue)}`}
                />
                <div
                  className="w-4 sm:w-5 bg-[#A99A83] rounded-t transition-opacity group-hover:opacity-90"
                  style={{ height: `${Math.max(item.expense > 0 ? 4 : 0, expH)}px` }}
                  title={`Despesas ${item.label}: ${formatBRL(item.expense)}`}
                />
              </div>
              <span className="text-[11px] font-medium text-[#5C554C] pb-1 tabular-nums">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface BreakdownItem {
  label: string;
  count: number;
  color: string;
}

export const StatusBreakdownChart: React.FC<{
  items: BreakdownItem[];
  emptyMessage?: string;
}> = ({ items, emptyMessage = 'Nenhum registro cadastrado para análise de distribuição.' }) => {
  const total = items.reduce((acc, i) => acc + i.count, 0);
  if (total === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-center px-6 bg-[#F5F3EE]/60 border border-dashed border-[#D6CEC1] rounded-lg">
        <p className="text-sm font-medium text-[#594634]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const pct = Math.round((item.count / total) * 100);
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#1F2A24]">{item.label}</span>
              <span className="font-mono tabular-nums text-[#5C554C]">
                {item.count} ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full bg-[#F5F3EE] rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
