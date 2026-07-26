"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer } from "./chart-container";
import { cn } from "@/lib/utils";

type RevenueRange = "7D" | "1M" | "3M" | "1Y";

type RevenuePoint = {
  label: string;
  revenue: number;
};

type PlatformRevenueChartProps = {
  data: Record<RevenueRange, RevenuePoint[]>;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
};

const ranges: RevenueRange[] = ["7D", "1M", "3M", "1Y"];

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function formatYAxis(value: number) {
  if (value === 0) {
    return "₱0K";
  }

  return `₱${Math.round(value / 1000)}K`;
}

function PlatformRevenueChart({
  data,
  loading = false,
  error,
  onRetry,
  className,
}: PlatformRevenueChartProps) {
  const [selectedRange, setSelectedRange] =
    useState<RevenueRange>("1M");

  const chartData = useMemo(
    () => data[selectedRange] ?? [],
    [data, selectedRange],
);

  const totalRevenue = useMemo(
    () =>
      chartData.reduce(
        (total, point) => total + point.revenue,
        0,
      ),
    [chartData],
  );

  const maximumRevenue = useMemo(() => {
    const largestValue = Math.max(
      ...chartData.map((point) => point.revenue),
      0,
    );

    const roundedValue =
      Math.ceil(largestValue / 25000) * 25000;

    if (largestValue === 0) {
    return 100000;
    }

    return Math.max(roundedValue, 25000);
  }, [chartData]);

  return (
    <ChartContainer
      title="Platform Revenue"
      fallbackSummary={`Total recorded platform revenue is ${pesoFormatter.format(
        totalRevenue,
      )}.`}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !error && chartData.length === 0}
      className={cn(
        "rounded-[20px] p-6 sm:p-7",
        className,
      )}
      contentClassName="min-h-0"
      rangeControls={
        <div
          className="flex items-center gap-1"
          aria-label="Revenue chart range"
        >
          {ranges.map((range) => {
            const selected = range === selectedRange;

            return (
              <button
                key={range}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedRange(range)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6500]",
                  selected
                    ? "bg-[#FF6500] text-white"
                    : "text-[#9297A8] hover:bg-muted hover:text-foreground",
                )}
              >
                {range}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="h-[250px] min-w-[620px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 10,
              right: 4,
              bottom: 0,
              left: 0,
            }}
          >
            <CartesianGrid
              stroke="#E9ECF2"
              strokeDasharray="3 4"
            />

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{
                fill: "#9297A8",
                fontSize: 12,
              }}
            />

            <YAxis
              domain={[0, maximumRevenue]}
              ticks={[
                0,
                maximumRevenue * 0.25,
                maximumRevenue * 0.5,
                maximumRevenue * 0.75,
                maximumRevenue,
              ]}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatYAxis}
              width={52}
              tick={{
                fill: "#9297A8",
                fontSize: 12,
              }}
            />

            <Tooltip
              cursor={{
                stroke: "#D7DAE2",
                strokeWidth: 1,
              }}
              formatter={(value) => [
                pesoFormatter.format(Number(value)),
                "Revenue",
              ]}
              contentStyle={{
                padding: "12px",
                border: "1px solid #ECEEF2",
                borderRadius: "14px",
                backgroundColor: "#FFFFFF",
                boxShadow:
                  "0 10px 25px rgba(15, 23, 42, 0.08)",
              }}
              labelStyle={{
                marginBottom: "6px",
                color: "#6B7280",
              }}
            />

            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#111827"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 5,
                fill: "#111827",
                stroke: "#FFFFFF",
                strokeWidth: 2,
              }}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

export {
  PlatformRevenueChart,
  type PlatformRevenueChartProps,
  type RevenuePoint,
  type RevenueRange,
};