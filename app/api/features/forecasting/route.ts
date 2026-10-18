import { NextRequest, NextResponse } from 'next/server';
import {
  forecastRoomTimeSeries,
  SEASON_MULTIPLIERS,
  type SeasonScenario,
  type MonthlyForecastPoint,
} from '@/lib/features/utility-forecasting';
import { GET as getDigitalTwinRooms } from '@/app/api/features/digital-twin/route';
import { sendWebPushToAllSubscriptions } from '@/lib/features/web-push-server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scenario = (searchParams.get('scenario') as SeasonScenario) || 'NORMAL';
    const ratePerKwh = Math.max(1, parseFloat(searchParams.get('rate') || '7'));

    // Reuse the 20-room Digital Twin state so Module 3 and Module 5 stay in sync
    const twinRes = await getDigitalTwinRooms();
    const twinJson = await twinRes.json();
    const twinRooms = Array.isArray(twinJson.rooms) ? twinJson.rooms : [];

    const roomForecasts = twinRooms.map((r: any) =>
      forecastRoomTimeSeries({
        roomNumber: r.roomNumber,
        floor: r.floor,
        roomType: r.roomType,
        tenantName: r.tenantName,
        rentPrice: Number(r.rentPrice) || 3500,
        currentKwh: Number(r.electricKwh) || 85,
        ratePerKwh,
        scenario: SEASON_MULTIPLIERS[scenario] ? scenario : 'NORMAL',
      })
    );

    // Aggregate building-wide 9-month series (6 past + 3 forecast)
    const buildingSeries: MonthlyForecastPoint[] = [];
    if (roomForecasts.length > 0) {
      const pointCount = roomForecasts[0].series.length;
      for (let i = 0; i < pointCount; i++) {
        const label = roomForecasts[0].series[i].monthLabel;
        const isForecast = roomForecasts[0].series[i].isForecast;
        const kwh = roomForecasts.reduce((s: number, rf: any) => s + rf.series[i].kwh, 0);
        const lowerKwh = roomForecasts.reduce((s: number, rf: any) => s + rf.series[i].lowerKwh, 0);
        const upperKwh = roomForecasts.reduce((s: number, rf: any) => s + rf.series[i].upperKwh, 0);
        const electricCostThb = roomForecasts.reduce(
          (s: number, rf: any) => s + rf.series[i].electricCostThb,
          0
        );
        const totalRevenueThb = roomForecasts.reduce(
          (s: number, rf: any) => s + rf.series[i].totalRevenueThb,
          0
        );
        buildingSeries.push({
          monthLabel: label,
          isForecast,
          kwh,
          lowerKwh,
          upperKwh,
          electricCostThb,
          totalRevenueThb,
        });
      }
    }

    const currentTotalKwh = buildingSeries[5]?.kwh || 0;
    const nextMonthTotalKwh = buildingSeries[6]?.kwh || 0;
    const nextMonthTotalElectricThb = buildingSeries[6]?.electricCostThb || 0;
    const nextMonthTotalRevenueThb = buildingSeries[6]?.totalRevenueThb || 0;
    const anomalyRiskRooms = roomForecasts.filter((rf: any) => rf.isAnomalyRisk);

    return NextResponse.json({
      success: true,
      scenario,
      ratePerKwh,
      summary: {
        currentTotalKwh,
        nextMonthTotalKwh,
        nextMonthTotalElectricThb,
        nextMonthTotalRevenueThb,
        anomalyRiskCount: anomalyRiskRooms.length,
        anomalyRiskRooms: anomalyRiskRooms.map((r: any) => r.roomNumber),
      },
      buildingSeries,
      roomForecasts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถคำนวณพยากรณ์ค่าไฟล่วงหน้าได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, message, roomNumber } = body;

    const pushRes = await sendWebPushToAllSubscriptions({
      title: title || `📈 แจ้งเตือนพยากรณ์ค่าไฟล่วงหน้า ห้อง ${roomNumber || 'ALL'}`,
      body:
        message ||
        'ระบบพยากรณ์พบแนวโน้มการใช้ไฟฟ้าเดือนหน้าสูงกว่าเกณฑ์ แนะนำตรวจสอบแอร์และเครื่องใช้ไฟฟ้า',
      url: '/researcher/lab/forecasting',
    });

    return NextResponse.json({
      success: true,
      pushRes,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'ส่งแจ้งเตือนพยากรณ์ไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
