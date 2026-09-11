"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
} from "./chart-container";
import {cn} from "@/lib/utils";

type PaymentVolumeRange =
  | "7D"
  | "1M"
  | "3M"
  | "1Y";

type PaymentVolumePoint = {
  label: string;
  volumeInCentavos: number;
};

type ConfirmedPaymentVolumeChartProps = {
  data: Record<
    PaymentVolumeRange,
    PaymentVolumePoint[]
  >;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
};

const ranges: PaymentVolumeRange[] = [
  "7D",
  "1M",
  "3M",
  "1Y",
];

const pesoFormatter =
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });

function formatCentavos(
  valueInCentavos: number,
): string {
  return pesoFormatter.format(
    valueInCentavos / 100,
  );
}

function formatYAxis(
  valueInCentavos: number,
): string {
  const pesos = valueInCentavos / 100;

  if (pesos === 0) {
    return "₱0";
  }

  if (pesos >= 1_000_000) {
    return `₱${(
      pesos / 1_000_000
    ).toFixed(1)}M`;
  }

  if (pesos >= 1_000) {
    return `₱${Math.round(
      pesos / 1_000,
    )}K`;
  }

  return `₱${Math.round(pesos)}`;
}

function ConfirmedPaymentVolumeChart({
  data,
  loading = false,
  error,
  onRetry,
  className,
}: ConfirmedPaymentVolumeChartProps) {
  const [selectedRange, setSelectedRange] =
    useState<PaymentVolumeRange>("1M");

  const chartData = useMemo(
    () => data[selectedRange] ?? [],
    [data, selectedRange],
  );

  const totalVolumeInCentavos =
    useMemo(
      () =>
        chartData.reduce(
          (total, point) =>
            total +
            point.volumeInCentavos,
          0,
        ),
      [chartData],
    );

  const maximumVolumeInCentavos =
    useMemo(() => {
      const largestValue = Math.max(
        ...chartData.map(
          (point) =>
            point.volumeInCentavos,
        ),
        0,
      );

      if (largestValue === 0) {
        return 10_000_000;
      }

      const intervalInCentavos =
        2_500_000;

      return Math.max(
        Math.ceil(
          largestValue /
            intervalInCentavos,
        ) * intervalInCentavos,
        intervalInCentavos,
      );
    }, [chartData]);

  return (
    <ChartContainer
      title="Confirmed Payment Volume"
      fallbackSummary={
        `Total confirmed payment volume for this range is ${
          formatCentavos(
            totalVolumeInCentavos,
          )
        }. This is provider-associated payment volume, not FEASTA-owned revenue.`
      }
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={
        !loading &&
        !error &&
        chartData.length === 0
      }
      className={cn(
        "rounded-[20px] p-6 sm:p-7",
        className,
      )}
      contentClassName="min-h-0"
      rangeControls={
        <div
          className="flex items-center gap-1"
          aria-label="Payment volume chart range"
        >
          {ranges.map((range) => {
            const selected =
              range === selectedRange;

            return (
              <button
                key={range}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setSelectedRange(range)
                }
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
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
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
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
              domain={[
                0,
                maximumVolumeInCentavos,
              ]}
              ticks={[
                0,
                maximumVolumeInCentavos *
                  0.25,
                maximumVolumeInCentavos *
                  0.5,
                maximumVolumeInCentavos *
                  0.75,
                maximumVolumeInCentavos,
              ]}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatYAxis}
              width={62}
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
                formatCentavos(
                  Number(value),
                ),
                "Confirmed payment volume",
              ]}
              contentStyle={{
                padding: "12px",
                border:
                  "1px solid #ECEEF2",
                borderRadius: "14px",
                backgroundColor:
                  "#FFFFFF",
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
              dataKey="volumeInCentavos"
              name="Confirmed payment volume"
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
  ConfirmedPaymentVolumeChart,
  type ConfirmedPaymentVolumeChartProps,
  type PaymentVolumePoint,
  type PaymentVolumeRange,
};
