import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rupiah } from "@/api";

type SalesChartProps = {
  data: { day: string; transactions: number; revenue: number }[];
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});
const compactRupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatDay(day: string) {
  return dateFormatter.format(new Date(`${day}T12:00:00+07:00`));
}

export function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="relative h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            yAxisId="revenue"
            tickFormatter={(value: number) => compactRupiahFormatter.format(value)}
            tickLine={false}
            axisLine={false}
            width={60}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            yAxisId="transactions"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(label) => formatDay(String(label))}
            formatter={(value, name) => [
              name === "Pendapatan" ? rupiah(Number(value)) : Number(value).toLocaleString("id-ID"),
              name,
            ]}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar yAxisId="revenue" dataKey="revenue" name="Pendapatan" fill="#4f46e5" radius={[5, 5, 0, 0]} maxBarSize={36} />
          <Line yAxisId="transactions" dataKey="transactions" name="Transaksi" type="monotone" stroke="#10b981" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {data.every((day) => day.transactions === 0) && (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">
          Belum ada penjualan dalam periode ini.
        </p>
      )}
    </div>
  );
}
