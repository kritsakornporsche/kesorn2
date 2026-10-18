export type SeasonScenario = 'NORMAL' | 'SUMMER_PEAK' | 'EXAM_PERIOD' | 'SEMESTER_BREAK';

export interface MonthlyForecastPoint {
  monthLabel: string;
  isForecast: boolean;
  kwh: number;
  lowerKwh: number;
  upperKwh: number;
  electricCostThb: number;
  totalRevenueThb: number;
}

export interface RoomForecastSummary {
  roomNumber: string;
  floor: 1 | 2;
  roomType: string;
  tenantName: string | null;
  rentPrice: number;
  historyKwh: number[]; // Past 6 months
  currentMonthKwh: number;
  nextMonthKwh: number;
  nextMonthCostThb: number;
  trendPercent: number;
  isAnomalyRisk: boolean;
  series: MonthlyForecastPoint[];
}

export const SEASON_MULTIPLIERS: Record<
  SeasonScenario,
  { label: string; factor: number; desc: string }
> = {
  NORMAL: {
    label: '🌤️ สภาวะปกติ (เปิดเทอมปกติ)',
    factor: 1.0,
    desc: 'ดัชนีฤดูกาล ×1.00 ตามค่าเฉลี่ยถ่วงน้ำหนัก (WMA + Holt Linear Trend)',
  },
  SUMMER_PEAK: {
    label: '🔥 ฤดูร้อนจัด (เม.ย.–พ.ค.)',
    factor: 1.25,
    desc: 'ดัชนีฤดูกาล ×1.25 เครื่องปรับอากาศทำงานหนักขึ้น 25%',
  },
  EXAM_PERIOD: {
    label: '📚 ช่วงสอบไฟนอล ม.พะเยา',
    factor: 1.15,
    desc: 'ดัชนีฤดูกาล ×1.15 นิสิตอยู่ห้องอ่านหนังสือและเปิดแอร์ช่วงกลางคืนนานขึ้น',
  },
  SEMESTER_BREAK: {
    label: '🏖️ ช่วงปิดเทอม',
    factor: 0.72,
    desc: 'ดัชนีฤดูกาล ×0.72 นิสิตบางส่วนกลับภูมิลำเนา การใช้ไฟฟ้าลดลง 28%',
  },
};

const PAST_MONTH_LABELS = ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค. (ปัจจุบัน)'];
const FUTURE_MONTH_LABELS = ['พ.ย. (พยากรณ์ +1ด.)', 'ธ.ค. (พยากรณ์ +2ด.)', 'ม.ค. (พยากรณ์ +3ด.)'];

/**
 * Compute Weighted Moving Average (WMA) + Linear Trend slope + Seasonal adjustment
 */
export function forecastRoomTimeSeries(params: {
  roomNumber: string;
  floor: 1 | 2;
  roomType: string;
  tenantName: string | null;
  rentPrice: number;
  currentKwh: number;
  ratePerKwh: number;
  scenario: SeasonScenario;
}): RoomForecastSummary {
  const { roomNumber, floor, roomType, tenantName, rentPrice, currentKwh, ratePerKwh, scenario } =
    params;

  // Deterministic realistic 6-month historical trajectory ending at currentKwh
  const seed = Number(roomNumber) || 101;
  const isVacant = !tenantName || currentKwh <= 15;

  const historyKwh: number[] = isVacant
    ? [6, 8, 5, 7, 6, currentKwh]
    : [
        Math.max(30, Math.round(currentKwh * 0.82 + ((seed * 7) % 15) - 7)),
        Math.max(30, Math.round(currentKwh * 0.86 + ((seed * 11) % 17) - 8)),
        Math.max(30, Math.round(currentKwh * 0.91 + ((seed * 13) % 14) - 6)),
        Math.max(30, Math.round(currentKwh * 0.94 + ((seed * 17) % 16) - 8)),
        Math.max(30, Math.round(currentKwh * 0.97 + ((seed * 19) % 12) - 5)),
        currentKwh,
      ];

  // Weighted Moving Average over last 4 months: weights [0.1, 0.2, 0.3, 0.4]
  const wma =
    historyKwh[2] * 0.1 +
    historyKwh[3] * 0.2 +
    historyKwh[4] * 0.3 +
    historyKwh[5] * 0.4;

  // Linear Trend slope (Holt's trend component)
  const avgDiff =
    (historyKwh[5] - historyKwh[4] + (historyKwh[4] - historyKwh[3])) / 2;
  const dampedSlope = Math.max(-18, Math.min(24, avgDiff * 0.65));

  const seasonFactor = SEASON_MULTIPLIERS[scenario]?.factor || 1.0;

  // Forecast 3 future months
  const futureKwh: number[] = [1, 2, 3].map((step) => {
    if (isVacant) return Math.round(currentKwh * seasonFactor);
    const stepFactor = step === 2 ? seasonFactor * 1.03 : step === 3 ? seasonFactor * 0.98 : seasonFactor;
    const raw = (wma + dampedSlope * step) * stepFactor;
    return Math.max(10, Math.round(raw));
  });

  const nextMonthKwh = futureKwh[0];
  const nextMonthCostThb = Math.round(nextMonthKwh * ratePerKwh);
  const trendPercent =
    currentKwh > 0 ? Number((((nextMonthKwh - currentKwh) / currentKwh) * 100).toFixed(1)) : 0;

  const waterAndCommon = isVacant ? 0 : 250; // water 100 + common 150

  const series: MonthlyForecastPoint[] = [
    ...historyKwh.map((val, idx) => ({
      monthLabel: PAST_MONTH_LABELS[idx],
      isForecast: false,
      kwh: val,
      lowerKwh: val,
      upperKwh: val,
      electricCostThb: Math.round(val * ratePerKwh),
      totalRevenueThb: isVacant ? 0 : rentPrice + waterAndCommon + Math.round(val * ratePerKwh),
    })),
    ...futureKwh.map((val, idx) => {
      const margin = Math.max(5, Math.round(val * (0.07 + idx * 0.03)));
      return {
        monthLabel: FUTURE_MONTH_LABELS[idx],
        isForecast: true,
        kwh: val,
        lowerKwh: Math.max(0, val - margin),
        upperKwh: val + margin,
        electricCostThb: Math.round(val * ratePerKwh),
        totalRevenueThb: isVacant ? 0 : rentPrice + waterAndCommon + Math.round(val * ratePerKwh),
      };
    }),
  ];

  return {
    roomNumber,
    floor,
    roomType,
    tenantName,
    rentPrice,
    historyKwh,
    currentMonthKwh: currentKwh,
    nextMonthKwh,
    nextMonthCostThb,
    trendPercent,
    isAnomalyRisk: nextMonthKwh >= 250,
    series,
  };
}
