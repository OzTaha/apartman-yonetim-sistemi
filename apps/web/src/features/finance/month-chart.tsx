import { formatKurus, MONTH_NAMES_TR, type FinanceMonthDto } from '@apartman/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const INCOME = '#059669';
const EXPENSE = '#dc2626';

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

export function MonthChart({ months }: { months: FinanceMonthDto[] }) {
  const data = months.map((m) => ({
    name: MONTH_NAMES_TR[Number(m.period.slice(5, 7)) - 1]!.slice(0, 3),
    label: `${MONTH_NAMES_TR[Number(m.period.slice(5, 7)) - 1]} ${m.period.slice(0, 4)}`,
    Gelir: m.incomeKurus,
    Gider: m.expenseKurus,
  }));

  return (
    <div className="h-64 w-full" role="img" aria-label="Aylara göre gelir ve gider grafiği">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={(v: number) => compact.format(v / 100)}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            formatter={(value) => formatKurus(Number(value))}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Gelir" fill={INCOME} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Gider" fill={EXPENSE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
