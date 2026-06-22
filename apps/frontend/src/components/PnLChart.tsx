'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  date: string;
  pnl: number;
}

interface PnLChartProps {
  data: DataPoint[];
}

export function PnLChart({ data }: PnLChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          stroke="#6B7280"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          stroke="#6B7280"
          fontSize={12}
          tickLine={false}
          tickFormatter={(value: number) => `${value.toFixed(1)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#F3F4F6',
          }}
          labelStyle={{ color: '#9CA3AF' }}
          formatter={(value: number) => [`${value.toFixed(4)} SOL`, 'PnL']}
        />
        <Line
          type="monotone"
          dataKey="pnl"
          stroke="#9945FF"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#9945FF' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
