import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { getPaymentInfo, getRates } from '@/lib/billing';
import { cycleFor, issueMonthlyBill, recordReading } from '@/lib/meters';
import {
  createInitialSmartMeterFleet,
  computeInstantElectricalMetrics,
  executeAutoBillingCalculation,
  ELECTRIC_RATE_THB,
  type SmartMeterRoomNode,
  type Esp32CommandItem,
  type Esp32CommandType,
  type Esp32TelemetryLog,
  type AutoBillingPipelineResult,
} from '@/lib/features/iot-smart-meter';

// In-memory state for 20-Room Hybrid Smart Meter Fleet & ESP32 Command Queue
let smartMeterFleet: SmartMeterRoomNode[] = createInitialSmartMeterFleet();
let commandQueue: Esp32CommandItem[] = [
  {
    id: 'CMD-INIT-101',
    roomNumber: '101',
    deviceId: 'ESP32-PZEM-101',
    command: 'FORCE_READ_NOW',
    status: 'EXECUTED',
    createdAt: new Date(Date.now() - 180000).toISOString(),
    deliveredAt: new Date(Date.now() - 177000).toISOString(),
    note: 'ซิงก์ค่าเริ่มต้นจากโหนด ESP32 ห้อง 101 สำเร็จ',
  },
];

let telemetryLogs: Esp32TelemetryLog[] = [
  {
    id: 'TEL-SEED-101',
    timestamp: new Date(Date.now() - 15000).toISOString(),
    roomNumber: '101',
    deviceId: 'ESP32-PZEM-101',
    source: 'ESP32_HARDWARE',
    voltage: 228.6,
    current: 6.32,
    powerWatt: 1380,
    energyKwh: 1568.9,
    powerFactor: 0.95,
    frequencyHz: 50.0,
    relayState: 'ON',
    wifiRssi: -54,
    ipAddress: '192.168.1.101',
  },
];

let latestPipelineResult: AutoBillingPipelineResult | null = null;

// ── commit 29 security ──────────────────────────────────────────────────────────────────────────────────────────────
// - an ESP32 sends with the key in env IOT_DEVICE_KEY (header x-iot-api-key); no key in the code, never sent back
// - relay commands, setting a meter number and auto billing: owner / manager only; the lab view: + researcher
// - a bill is made only from a reading an ESP32 really sent this cycle (rates from the settings table, a Draft bill
//   through lib/meters like the meter page) — never from simulated numbers
/** Last energy reading each room's ESP32 really sent (authenticated device packets only) */
const realEnergyByRoom = new Map<string, { kwh: number; at: string }>();

function deviceKeyProblem(req: NextRequest, body?: any): NextResponse | null {
  const expected = process.env.IOT_DEVICE_KEY || '';
  if (!expected) {
    return NextResponse.json({ success: false, message: 'ยังไม่ได้ตั้งค่า IOT_DEVICE_KEY บนเซิร์ฟเวอร์' }, { status: 503 });
  }
  const given = String(req.headers.get('x-iot-api-key') || body?.apiKey || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, message: 'Invalid IoT API Key (x-iot-api-key ไม่ถูกต้อง)' }, { status: 401 });
  }
  return null;
}

const STAFF_ONLY = ['owner', 'manager'] as const;
const LAB_VIEW = ['owner', 'manager', 'researcher'] as const;
const STAFF_ACTIONS = new Set(['esp32_command', 'set_meter_reading', 'run_auto_billing_pipeline', 'execute_auto_billing']);
let room101HardwareBaseKwh = 367.50;
let room101LatestRawPzemKwh = 0.0;

function buildFleetSummary(rooms: SmartMeterRoomNode[], electricRate: number = ELECTRIC_RATE_THB) {
  const totalLoadWatt = rooms.reduce((sum, r) => sum + r.activePowerWatt, 0);
  const totalMonthlyKwh = Number(
    rooms.reduce((sum, r) => sum + Math.max(0, r.currentMeterKwh - r.previousMonthKwh), 0).toFixed(2)
  );
  const estimatedElectricRevenue = Number((totalMonthlyKwh * electricRate).toFixed(2));
  const hardwareConnectedCount = rooms.filter((r) => r.esp32Meta.isHardwareConnected).length;
  const activeRelaysCount = rooms.filter((r) => r.relayState === 'ON').length;
  const highLoadRooms = rooms.filter(
    (r) => r.activePowerWatt >= 3500 || r.monthlyUnitsKwh >= 250
  ).map((r) => r.roomNumber);

  return {
    totalRooms: rooms.length,
    occupiedRoomsCount: rooms.filter((r) => r.occupancyStatus === 'OCCUPIED').length,
    totalLoadWatt,
    totalLoadKw: Number((totalLoadWatt / 1000).toFixed(2)),
    totalMonthlyKwh,
    estimatedElectricRevenue,
    hardwareConnectedCount,
    activeRelaysCount,
    highLoadRooms,
  };
}

function evaluateFleetLiveness(rooms: SmartMeterRoomNode[]): SmartMeterRoomNode[] {
  const now = Date.now();
  return rooms.map((r) => {
    if (r.nodeMode !== 'REAL_IOT_HYBRID') {
      return {
        ...r,
        esp32Meta: {
          ...r.esp32Meta,
          isHardwareConnected: false,
          espStatus: 'OFFLINE' as const,
          pzemStatus: 'SIMULATED' as const,
        },
      };
    }

    const lastPkt = r.esp32Meta.lastHardwarePacketAt;
    // Increased timeout from 12s to 35s to prevent intermittent offline flip due to TLS/PZEM read latency
    const isOnline = Boolean(lastPkt && now - new Date(lastPkt).getTime() < 35000);
    const pzemSt = !isOnline
      ? ('DISCONNECTED' as const)
      : r.esp32Meta.pzemStatus === 'CONNECTED'
      ? ('CONNECTED' as const)
      : ('WAITING_AC' as const);

    return {
      ...r,
      esp32Meta: {
        ...r.esp32Meta,
        isHardwareConnected: isOnline,
        espStatus: isOnline ? ('ONLINE' as const) : ('OFFLINE' as const),
        pzemStatus: pzemSt,
      },
    };
  });
}


async function syncDbRoomsToFleet(fleet: SmartMeterRoomNode[]) {
  try {
    const sql = getDb();
    const dbRooms = await sql`SELECT room_number, floor, price FROM rooms`;
    for (const dbr of dbRooms) {
      const exists = fleet.some((r) => String(r.roomNumber).trim().toLowerCase() === String(dbr.room_number).trim().toLowerCase());
      if (!exists) {
        fleet.push({
          roomNumber: String(dbr.room_number),
          floor: (Number(dbr.floor) || 1) as 1 | 2,
          roomType: 'ห้องแอร์',
          occupancyStatus: 'AVAILABLE',
          tenantName: null,
          rentPrice: Number(dbr.price) || 3000,
          nodeMode: 'REAL_IOT_HYBRID',
          deviceId: `ESP32-PZEM-${dbr.room_number}`,
          loadProfile: 'STANDARD',
          voltage: 228.6,
          current: 0.85,
          activePowerWatt: 194,
          powerFactor: 0.96,
          frequencyHz: 50.0,
          previousMonthKwh: 120.0,
          currentMeterKwh: 125.40,
          monthlyUnitsKwh: 5.4,
          waterPreviousM3: 10,
          waterCurrentM3: 12,
          waterUnitsUsed: 2,
          relayState: 'ON',
          appliances: { acOn: false, waterHeaterOn: false, pcLoadOn: false, faultOverload: false },
          esp32Meta: {
            macAddress: '24:6F:28:AA:FE:01',
            ipAddress: '192.168.1.199',
            wifiRssi: -55,
            firmwareVersion: 'v2.7.0-PZEM004T',
            samplingIntervalMs: 3000,
            isHardwareConnected: true,
            lastHardwarePacketAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            pendingCommand: null,
            espStatus: 'ONLINE',
            pzemStatus: 'CONNECTED',
          },
        });
      }
    }
  } catch (dbe) {
    console.warn('Sync DB rooms to IoT fleet warn:', dbe);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pollDeviceId = searchParams.get('deviceId');
  const pollRoom = searchParams.get('roomNumber');

  // Lightweight polling endpoint if an ESP32 polls via HTTP GET (device key required)
  if (pollDeviceId || pollRoom) {
    const bad = deviceKeyProblem(req);
    if (bad) return bad;
    const queued = commandQueue.find(
      (c) =>
        c.status === 'QUEUED' &&
        (c.deviceId === pollDeviceId || c.roomNumber === pollRoom)
    );
    if (queued) {
      queued.status = 'EXECUTED';
      queued.deliveredAt = new Date().toISOString();
    }
    return NextResponse.json({
      success: true,
      command: queued ? queued.command : null,
      commandId: queued ? queued.id : null,
      serverTime: new Date().toISOString(),
    });
  }

  const guard = await requireRole([...LAB_VIEW]);
  if ('response' in guard) return guard.response;

  await syncDbRoomsToFleet(smartMeterFleet);
  smartMeterFleet = evaluateFleetLiveness(smartMeterFleet);
  const rates = await getRates(getDb());

  return NextResponse.json({
    success: true,
    summary: buildFleetSummary(smartMeterFleet, rates.electricityPerUnit),
    rooms: smartMeterFleet,
    commandQueue: commandQueue.slice(0, 20),
    telemetryLogs: telemetryLogs.slice(0, 25),
    latestPipelineResult,
    iotKeyConfigured: Boolean(process.env.IOT_DEVICE_KEY),
    realReadings: Object.fromEntries(realEnergyByRoom),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    let fromDevice = false;
    if (action === 'esp32_telemetry') {
      const bad = deviceKeyProblem(req, body);
      if (bad) return bad;
      fromDevice = true;
    } else if (action === 'simulate_esp32_packet') {
      // The lab's "simulate an ESP32 packet" button: signed-in lab users, not on production, never a real reading
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ success: false, message: 'ปิดการจำลองแพ็กเก็ต ESP32 บนเซิร์ฟเวอร์จริง' }, { status: 403 });
      }
      const g = await requireRole([...LAB_VIEW]);
      if ('response' in g) return g.response;
    } else {
      const g = await requireRole(STAFF_ACTIONS.has(action) ? [...STAFF_ONLY] : [...LAB_VIEW]);
      if ('response' in g) return g.response;
    }

    // -------------------------------------------------------------------------
    // 1. REAL ESP32 HARDWARE TELEMETRY INGESTION (OR SIMULATED ESP32 PACKET)
    // -------------------------------------------------------------------------
    if (action === 'esp32_telemetry' || action === 'simulate_esp32_packet') {

      const roomNumber = String(body.roomNumber || '101');
      const targetIdx = smartMeterFleet.findIndex((r) => r.roomNumber === roomNumber);
      if (targetIdx === -1) {
        return NextResponse.json(
          { success: false, message: `ไม่พบห้องหมายเลข ${roomNumber} ในระบบ` },
          { status: 404 }
        );
      }

      const room = smartMeterFleet[targetIdx];
      const nowIso = new Date().toISOString();

      const voltage =
        body.voltage !== undefined && !isNaN(Number(body.voltage))
          ? Number(body.voltage)
          : room.voltage;
      const current =
        body.current !== undefined && !isNaN(Number(body.current))
          ? Number(body.current)
          : 0;
      const powerWatt =
        body.power !== undefined && !isNaN(Number(body.power))
          ? Math.round(Number(body.power))
          : Math.round(voltage * current * 0.95);
      // Real Hardware PEA Meter Calibration (5(15)A Meter No. 5900359398)
      const hasEnergy = body.energyKwh !== undefined && body.energyKwh !== null && body.energyKwh !== '' && Number.isFinite(Number(body.energyKwh));
      const rawPzemKwh = hasEnergy ? Number(body.energyKwh) : 0;
      if (roomNumber === '101') {
        room101LatestRawPzemKwh = rawPzemKwh;
      }
      const energyKwh =
        roomNumber === '101'
          ? Number((room101HardwareBaseKwh + rawPzemKwh).toFixed(2))
          : Number(
              (body.energyKwh !== undefined ? Number(body.energyKwh) : room.currentMeterKwh + 0.02).toFixed(2)
            );
      const pf = Number(body.pf ?? body.powerFactor ?? 0.95);
      const frequencyHz = Number(body.frequency ?? 50.0);
      const relayState = body.relayState === 'OFF' ? 'OFF' : 'ON';
      const rssi = Number(body.rssi ?? -50);
      const ip = String(body.ip || room.esp32Meta.ipAddress || '192.168.1.101');
      const mac = String(body.mac || room.esp32Meta.macAddress);

      // Check if there is a pending command in the queue for this ESP32
      let deliveredCmd: Esp32CommandType | null = null;
      const pendingCmdItem = commandQueue.find(
        (c) =>
          c.status === 'QUEUED' &&
          (c.roomNumber === roomNumber || c.deviceId === (body.deviceId || room.deviceId))
      );

      if (pendingCmdItem) {
        pendingCmdItem.status = 'EXECUTED';
        pendingCmdItem.deliveredAt = nowIso;
        deliveredCmd = pendingCmdItem.command;
      }

      const effectiveRelay =
        deliveredCmd === 'RELAY_OFF'
          ? 'OFF'
          : deliveredCmd === 'RELAY_ON'
          ? 'ON'
          : relayState;

      const sensorStatusRaw = String(body.sensorStatus || body.pzemStatus || '');
      const isPzemHardwareOk =
        sensorStatusRaw === 'PZEM_HARDWARE' ||
        sensorStatusRaw === 'CONNECTED' ||
        (voltage > 40.0 && sensorStatusRaw !== 'WAITING_AC');
      const pzemStatusVal: 'CONNECTED' | 'WAITING_AC' = isPzemHardwareOk ? 'CONNECTED' : 'WAITING_AC';

      const prevKwh =
        roomNumber === '101' && (room.previousMonthKwh > 1000 || room.previousMonthKwh < 100)
          ? room101HardwareBaseKwh
          : room.previousMonthKwh;
      const currentKwhVal =
        deliveredCmd === 'RESET_KWH_COUNTER' ? prevKwh : energyKwh;
      const monthlyUnitsVal =
        deliveredCmd === 'RESET_KWH_COUNTER'
          ? 0
          : Math.max(0, Number((currentKwhVal - prevKwh).toFixed(2)));

      const updatedRoom: SmartMeterRoomNode = {
        ...room,
        nodeMode: 'REAL_IOT_HYBRID',
        voltage,
        current: effectiveRelay === 'OFF' ? 0 : current,
        activePowerWatt: effectiveRelay === 'OFF' ? 0 : powerWatt,
        powerFactor: pf,
        frequencyHz,
        previousMonthKwh: prevKwh,
        currentMeterKwh: currentKwhVal,
        monthlyUnitsKwh: monthlyUnitsVal,
        relayState: effectiveRelay,
        esp32Meta: {
          ...room.esp32Meta,
          ipAddress: ip,
          macAddress: mac,
          wifiRssi: rssi,
          isHardwareConnected: true,
          espStatus: 'ONLINE',
          pzemStatus: pzemStatusVal,
          rawSensorStatus: sensorStatusRaw,
          lastHardwarePacketAt: nowIso,
          lastUpdatedAt: nowIso,
          pendingCommand: null,
        },
      };

      smartMeterFleet[targetIdx] = updatedRoom;
      // Only a packet from an authenticated ESP32 with an energy value counts as a real reading (billing uses it)
      if (fromDevice && hasEnergy) realEnergyByRoom.set(roomNumber, { kwh: currentKwhVal, at: nowIso });

      const logItem: Esp32TelemetryLog = {
        id: `TEL-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        timestamp: nowIso,
        roomNumber,
        deviceId: body.deviceId || room.deviceId,
        source: fromDevice ? 'ESP32_HARDWARE' : 'SIMULATOR_ENGINE',
        voltage: updatedRoom.voltage,
        current: updatedRoom.current,
        powerWatt: updatedRoom.activePowerWatt,
        energyKwh: updatedRoom.currentMeterKwh,
        powerFactor: updatedRoom.powerFactor,
        frequencyHz: updatedRoom.frequencyHz,
        relayState: updatedRoom.relayState,
        wifiRssi: rssi,
        ipAddress: ip,
      };
      telemetryLogs.unshift(logItem);
      if (telemetryLogs.length > 40) telemetryLogs = telemetryLogs.slice(0, 40);

      // Return compact response for ESP32 ArduinoJson parser + full state for Web UI
      return NextResponse.json({
        success: true,
        command: deliveredCmd,
        roomNumber,
        relayState: updatedRoom.relayState,
        currentMeterKwh: updatedRoom.currentMeterKwh,
        monthlyUnitsKwh: updatedRoom.monthlyUnitsKwh,
        room: updatedRoom,
        summary: buildFleetSummary(smartMeterFleet),
        telemetryLogs: telemetryLogs.slice(0, 25),
        commandQueue: commandQueue.slice(0, 20),
      });
    }

    // -------------------------------------------------------------------------
    // 2. QUEUE COMMAND FOR ESP32 (RELAY ON/OFF, FORCE READ, RESET KWH, INTERVAL)
    // -------------------------------------------------------------------------
    if (action === 'esp32_command') {
      const roomNumber = String(body.roomNumber || '101');
      const command = body.command as Esp32CommandType;
      const idx = smartMeterFleet.findIndex((r) => r.roomNumber === roomNumber);

      if (idx === -1) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
      }

      const room = smartMeterFleet[idx];
      const nowIso = new Date().toISOString();

      const commandNotes: Record<Esp32CommandType, string> = {
        RELAY_ON: `สั่งเปิดเบรกเกอร์จ่ายกระแสไฟ (GPIO Relay HIGH) ห้อง ${roomNumber}`,
        RELAY_OFF: `สั่งตัดกระแสไฟระยะไกล (GPIO Relay LOW) ห้อง ${roomNumber}`,
        FORCE_READ_NOW: `สั่งบอร์ด ESP32 อ่านค่า PZEM-004T และส่งกลับทันที`,
        RESET_KWH_COUNTER: `สั่งรีเซ็ตหน่วยสะสมต้นงวด (pzem.resetEnergy) ห้อง ${roomNumber}`,
        SET_INTERVAL_2S: `ปรับความถี่การส่งข้อมูลของ ESP32 เป็นทุกๆ 2 วินาที`,
        SET_INTERVAL_5S: `ปรับความถี่การส่งข้อมูลของ ESP32 เป็นทุกๆ 5 วินาที`,
        REBOOT_ESP32: `สั่งรีบูตไมโครคอนโทรลเลอร์ ESP32 (ESP.restart) ห้อง ${roomNumber}`,
      };

      const cmdItem: Esp32CommandItem = {
        id: `CMD-${Date.now()}`,
        roomNumber,
        deviceId: room.deviceId,
        command,
        status: room.esp32Meta.isHardwareConnected ? 'QUEUED' : 'EXECUTED',
        createdAt: nowIso,
        deliveredAt: room.esp32Meta.isHardwareConnected ? undefined : nowIso,
        note: commandNotes[command] || `คำสั่ง ${command}`,
      };
      commandQueue.unshift(cmdItem);

      // Immediately reflect command on the room state for responsive simulation
      let nextRelay = room.relayState;
      let nextCurrentKwh = room.currentMeterKwh;
      let nextInterval = room.esp32Meta.samplingIntervalMs;

      if (command === 'RELAY_ON') nextRelay = 'ON';
      if (command === 'RELAY_OFF') nextRelay = 'OFF';
      if (command === 'RESET_KWH_COUNTER') nextCurrentKwh = room.previousMonthKwh;
      if (command === 'SET_INTERVAL_2S') nextInterval = 2000;
      if (command === 'SET_INTERVAL_5S') nextInterval = 5000;

      const elec = computeInstantElectricalMetrics(nextRelay, room.appliances, room.loadProfile);

      smartMeterFleet[idx] = {
        ...room,
        relayState: nextRelay,
        voltage: elec.voltage,
        current: elec.current,
        activePowerWatt: elec.activePowerWatt,
        powerFactor: elec.powerFactor,
        frequencyHz: elec.frequencyHz,
        currentMeterKwh: nextCurrentKwh,
        monthlyUnitsKwh: Math.max(0, Number((nextCurrentKwh - room.previousMonthKwh).toFixed(2))),
        esp32Meta: {
          ...room.esp32Meta,
          samplingIntervalMs: nextInterval,
          lastUpdatedAt: nowIso,
          pendingCommand: room.esp32Meta.isHardwareConnected ? command : null,
        },
      };

      smartMeterFleet = evaluateFleetLiveness(smartMeterFleet);

      return NextResponse.json({
        success: true,
        commandItem: cmdItem,
        room: smartMeterFleet[idx],
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
        commandQueue: commandQueue.slice(0, 20),
      });
    }

    // -------------------------------------------------------------------------
    // 3. TOGGLE APPLIANCE LOADS OR EDIT ROOM METER IN SIMULATOR
    // -------------------------------------------------------------------------
    if (action === 'toggle_room_load') {
      const roomNumber = String(body.roomNumber || '101');
      if (roomNumber === '101' && body.appliances) {
        return NextResponse.json(
          { success: false, message: 'ห้อง 101 เป็นโหนดฮาร์ดแวร์จริง ไม่อนุญาตให้ใช้ตัวควบคุมจำลองโหลด' },
          { status: 400 }
        );
      }
      const idx = smartMeterFleet.findIndex((r) => r.roomNumber === roomNumber);
      if (idx === -1) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
      }

      const room = smartMeterFleet[idx];
      const nextAppliances = {
        ...room.appliances,
        ...(body.appliances || {}),
      };
      const nextRelay = body.relayState ? body.relayState : room.relayState;
      const nextNodeMode = body.nodeMode ? body.nodeMode : room.nodeMode;

      const elec = computeInstantElectricalMetrics(nextRelay, nextAppliances, room.loadProfile);
      const customUsedKwh =
        body.addKwh !== undefined
          ? Number((room.currentMeterKwh + Number(body.addKwh)).toFixed(2))
          : room.currentMeterKwh;

      smartMeterFleet[idx] = {
        ...room,
        nodeMode: nextNodeMode,
        relayState: nextRelay,
        appliances: nextAppliances,
        voltage: elec.voltage,
        current: elec.current,
        activePowerWatt: elec.activePowerWatt,
        powerFactor: elec.powerFactor,
        frequencyHz: elec.frequencyHz,
        currentMeterKwh: customUsedKwh,
        monthlyUnitsKwh: Math.max(0, Number((customUsedKwh - room.previousMonthKwh).toFixed(2))),
        esp32Meta: {
          ...room.esp32Meta,
          lastUpdatedAt: new Date().toISOString(),
        },
      };

      smartMeterFleet = evaluateFleetLiveness(smartMeterFleet);

      return NextResponse.json({
        success: true,
        room: smartMeterFleet[idx],
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    // -------------------------------------------------------------------------
    // 3.5 SET / CALIBRATE ROOM METER READING (RESEARCHER EXPERIMENTATION)
    // -------------------------------------------------------------------------
    if (action === 'set_meter_reading') {
      const roomNumber = String(body.roomNumber || '101');
      const idx = smartMeterFleet.findIndex((r) => r.roomNumber === roomNumber);
      if (idx === -1) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
      }

      const room = smartMeterFleet[idx];
      const newCurrentKwh =
        body.currentMeterKwh !== undefined && !isNaN(Number(body.currentMeterKwh))
          ? Number(Number(body.currentMeterKwh).toFixed(2))
          : room.currentMeterKwh;

      const newPrevKwh =
        body.previousMonthKwh !== undefined && !isNaN(Number(body.previousMonthKwh))
          ? Number(Number(body.previousMonthKwh).toFixed(2))
          : room.previousMonthKwh;

      const newWaterCurrent =
        body.waterCurrentM3 !== undefined && !isNaN(Number(body.waterCurrentM3))
          ? Math.max(0, Number(body.waterCurrentM3))
          : room.waterCurrentM3;

      const newWaterPrev =
        body.waterPreviousM3 !== undefined && !isNaN(Number(body.waterPreviousM3))
          ? Math.max(0, Number(body.waterPreviousM3))
          : room.waterPreviousM3;

      const newMonthlyUnitsKwh = Math.max(0, Number((newCurrentKwh - newPrevKwh).toFixed(2)));
      const newWaterUnits = Math.max(0, newWaterCurrent - newWaterPrev);

      // If calibrating Room 101 (real hardware node), synchronize the baseline offset
      if (roomNumber === '101') {
        room101HardwareBaseKwh = Number((newCurrentKwh - room101LatestRawPzemKwh).toFixed(2));
      }
      // a number typed here is not a reading from the ESP32: wait for the next device packet before billing
      realEnergyByRoom.delete(roomNumber);

      smartMeterFleet[idx] = {
        ...room,
        currentMeterKwh: newCurrentKwh,
        previousMonthKwh: newPrevKwh,
        monthlyUnitsKwh: newMonthlyUnitsKwh,
        waterCurrentM3: newWaterCurrent,
        waterPreviousM3: newWaterPrev,
        waterUnitsUsed: newWaterUnits,
        esp32Meta: {
          ...room.esp32Meta,
          lastUpdatedAt: new Date().toISOString(),
        },
      };

      smartMeterFleet = evaluateFleetLiveness(smartMeterFleet);

      return NextResponse.json({
        success: true,
        message: `ปรับค่ามิเตอร์ห้อง ${roomNumber} เป็น ${newCurrentKwh.toFixed(2)} kWh สำเร็จ`,
        room: smartMeterFleet[idx],
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    // -------------------------------------------------------------------------
    // 4. SIMULATE LIVE TICK OR FAST-FORWARD TIME (1 DAY / 7 DAYS / 30 DAYS)
    // -------------------------------------------------------------------------
    if (action === 'simulate_tick') {
      const fastForwardHours = Number(body.fastForwardHours || 0);
      const nowIso = new Date().toISOString();

      smartMeterFleet = smartMeterFleet.map((room) => {
        // Room 101 / Real IoT Node is physical hardware: never overwrite with simulation
        if (room.roomNumber === '101' || room.nodeMode === 'REAL_IOT_HYBRID') {
          return room;
        }

        const elec = computeInstantElectricalMetrics(room.relayState, room.appliances, room.loadProfile);
        let deltaKwh = 0;
        let deltaWater = 0;

        if (room.relayState === 'ON') {
          if (fastForwardHours > 0) {
            // Realistic utilization factor (not running peak load 24h continuously)
            const dutyCycle =
              room.loadProfile === 'AC_HEAVY'
                ? 0.55
                : room.loadProfile === 'GAMER_PC'
                ? 0.45
                : room.loadProfile === 'STANDARD'
                ? 0.35
                : room.loadProfile === 'ECO_SAVER'
                ? 0.22
                : 0.05;
            deltaKwh = Number(((elec.activePowerWatt / 1000) * fastForwardHours * dutyCycle).toFixed(2));
            if (room.occupancyStatus === 'OCCUPIED' && fastForwardHours >= 24) {
              deltaWater = Math.max(1, Math.round((fastForwardHours / 24) * 0.25));
            }
          } else {
            // Live 3-second tick: increment meter slightly so user sees live counter rolling
            deltaKwh = Number(((elec.activePowerWatt / 1000) * 0.015).toFixed(2));
          }
        }

        const nextCurrentKwh = Number((room.currentMeterKwh + deltaKwh).toFixed(2));
        const nextWaterCurrent = room.waterCurrentM3 + deltaWater;

        return {
          ...room,
          voltage: elec.voltage,
          current: elec.current,
          activePowerWatt: elec.activePowerWatt,
          powerFactor: elec.powerFactor,
          frequencyHz: elec.frequencyHz,
          currentMeterKwh: nextCurrentKwh,
          monthlyUnitsKwh: Math.max(0, Number((nextCurrentKwh - room.previousMonthKwh).toFixed(2))),
          waterCurrentM3: nextWaterCurrent,
          waterUnitsUsed: nextWaterCurrent - room.waterPreviousM3,
          esp32Meta: {
            ...room.esp32Meta,
            lastUpdatedAt: nowIso,
          },
        };
      });

      smartMeterFleet = evaluateFleetLiveness(smartMeterFleet);

      return NextResponse.json({
        success: true,
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    // -------------------------------------------------------------------------
    // 5. ONE-CLICK AUTO BILLING PIPELINE (20 ROOMS -> METERS -> BILLS + PUSH)
    // -------------------------------------------------------------------------
    if (action === 'run_auto_billing_pipeline' || action === 'execute_auto_billing') {
      const g = await requireRole([...STAFF_ONLY]);
      if ('response' in g) return g.response;
      const actor = { id: g.user.id, role: g.user.role };
      const now = new Date();
      // A reading is recorded in the cycle of today (lib/meters), so bills are for that cycle
      const billingCycle = cycleFor(now);
      const syncToDb = Boolean(body.syncToDb);
      const triggerPush = body.triggerPush !== false;

      const sqlRates = getDb();
      const rates = await getRates(sqlRates);
      const pay = await getPaymentInfo(sqlRates);
      const pipelineResult = executeAutoBillingCalculation(smartMeterFleet, billingCycle, {
        electricityPerUnit: rates.electricityPerUnit,
        waterPerPerson: rates.waterPerPerson,
        commonFee: rates.commonFee,
        promptpayNumber: pay.promptpayNumber,
      });
      let syncedCount = 0;
      const dbSync: { issued: { roomNumber: string; billId: number; amount: number }[]; skipped: { roomNumber: string; reason: string }[] } = { issued: [], skipped: [] };

      if (syncToDb) {
        try {
          const sql = getDb();
          // every room the lab shows as occupied, and every room an ESP32 really reported
          const roomsToBill = Array.from(new Set([...pipelineResult.bills.map((b) => b.roomNumber), ...realEnergyByRoom.keys()]));
          for (const rawRoom of roomsToBill) {
            const real = realEnergyByRoom.get(rawRoom);
            if (!real || cycleFor(new Date(real.at)) !== billingCycle) {
              dbSync.skipped.push({ roomNumber: rawRoom, reason: 'ไม่มีค่าจริงจาก ESP32 ในรอบนี้ — ไม่ออกบิล' });
              continue;
            }
            const simpleNum = String(parseInt(rawRoom, 10));
            const moduloNum = String(parseInt(rawRoom, 10) % 100);

            const roomRows = await sql`
              SELECT id, dorm_id FROM rooms 
              WHERE room_number = ${rawRoom} 
                 OR room_number = ${simpleNum} 
                 OR room_number = ${moduloNum}
              ORDER BY (room_number = ${rawRoom}) DESC
              LIMIT 1
            `;
            if (roomRows.length === 0) {
              dbSync.skipped.push({ roomNumber: rawRoom, reason: 'ไม่พบห้องนี้ในระบบ' });
              continue;
            }
            {
              const roomId = Number(roomRows[0].id);
              // 1. The ESP32 reading as this cycle's meter reading (same checks as the meter page; over 200 units
              //    needs a person to confirm it on the meter page)
              const rec = await recordReading(roomId, { current: real.kwh, note: `ESP32 ${real.at}` }, actor, now);
              if (!rec.ok) {
                dbSync.skipped.push({ roomNumber: rawRoom, reason: rec.message });
                continue;
              }
              syncedCount++;
              // 2. A Draft monthly bill priced from the settings table (the owner checks and sends it)
              const roomNumber = String((await sql`SELECT room_number FROM rooms WHERE id = ${roomId} LIMIT 1`)[0]?.room_number || rawRoom);
              const issued = await issueMonthlyBill(roomNumber, billingCycle, actor, now, `ค่าเช่าและค่าไฟ (มิเตอร์ IoT) รอบบิล ${billingCycle}`);
              if (!issued.ok) dbSync.skipped.push({ roomNumber: rawRoom, reason: issued.message });
              else if (issued.issued) dbSync.issued.push({ roomNumber, billId: issued.billId as number, amount: issued.amount });
              else dbSync.skipped.push({ roomNumber: rawRoom, reason: issued.message });
            }
          }
        } catch (dbErr) {
          console.warn('[IoT Auto Billing DB Sync Warning]:', dbErr);
        }
      }

      pipelineResult.syncedToDbCount = syncedCount;
      latestPipelineResult = pipelineResult;

      let pushResult = null;
      if (triggerPush && dbSync.issued.length > 0) {
        try {
          // staff devices only: the bills are drafts until the owner sends them
          const webPush = await import('@/lib/features/web-push-server').catch(() => null);
          if (webPush && (webPush as any).sendWebPushToRole) {
            pushResult = await (webPush as any).sendWebPushToRole('owner', {
              senderLabel: 'Researcher IoT Auto-Billing',
              title: `⚡ บิลร่างจากมิเตอร์ IoT ${dbSync.issued.length} ห้อง (รอบ ${billingCycle})`,
              body: `ตรวจและส่งบิลได้ที่หน้าบิล • ข้าม ${dbSync.skipped.length} ห้อง (ไม่มีค่าจริงจาก ESP32 หรือมีบิลแล้ว)`,
              url: '/owner/billing',
            });
          }
        } catch {
          // ignore push error
        }
      }

      return NextResponse.json({
        success: true,
        pipelineResult,
        dbSync,
        message: syncToDb
          ? `ออกบิลร่าง ${dbSync.issued.length} ห้อง · ข้าม ${dbSync.skipped.length} ห้อง (รอบ ${billingCycle})`
          : 'คำนวณตัวอย่างบิลแล้ว (ยังไม่บันทึกลงระบบ)',
        pushResult,
        summary: buildFleetSummary(smartMeterFleet, rates.electricityPerUnit),
      });
    }

    // -------------------------------------------------------------------------
    // 6. RESET FLEET TO DEFAULT
    // -------------------------------------------------------------------------
    if (action === 'reset_fleet') {
      smartMeterFleet = createInitialSmartMeterFleet();
      latestPipelineResult = null;
      realEnergyByRoom.clear();
      return NextResponse.json({
        success: true,
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[API /api/features/iot-meter POST Error]:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
