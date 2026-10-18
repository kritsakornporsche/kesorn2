import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendWebPushToAllSubscriptions } from '@/lib/features/web-push-server';
import {
  createInitialSmartMeterFleet,
  computeInstantElectricalMetrics,
  executeAutoBillingCalculation,
  IOT_DEFAULT_API_KEY,
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

function buildFleetSummary(rooms: SmartMeterRoomNode[]) {
  const totalLoadWatt = rooms.reduce((sum, r) => sum + r.activePowerWatt, 0);
  const totalMonthlyKwh = Number(
    rooms.reduce((sum, r) => sum + Math.max(0, r.currentMeterKwh - r.previousMonthKwh), 0).toFixed(2)
  );
  const estimatedElectricRevenue = Number((totalMonthlyKwh * ELECTRIC_RATE_THB).toFixed(2));
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pollDeviceId = searchParams.get('deviceId');
  const pollRoom = searchParams.get('roomNumber');

  // Lightweight polling endpoint if an ESP32 polls via HTTP GET
  if (pollDeviceId || pollRoom) {
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

  return NextResponse.json({
    success: true,
    summary: buildFleetSummary(smartMeterFleet),
    rooms: smartMeterFleet,
    commandQueue: commandQueue.slice(0, 20),
    telemetryLogs: telemetryLogs.slice(0, 25),
    latestPipelineResult,
    iotApiKey: IOT_DEFAULT_API_KEY,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // -------------------------------------------------------------------------
    // 1. REAL ESP32 HARDWARE TELEMETRY INGESTION (OR SIMULATED ESP32 PACKET)
    // -------------------------------------------------------------------------
    if (action === 'esp32_telemetry') {
      const headerKey = req.headers.get('x-iot-api-key');
      const providedKey = headerKey || body.apiKey || IOT_DEFAULT_API_KEY;

      if (providedKey !== IOT_DEFAULT_API_KEY) {
        return NextResponse.json(
          { success: false, message: 'Invalid IoT API Key (x-iot-api-key ไม่ถูกต้อง)' },
          { status: 401 }
        );
      }

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

      const voltage = Number(body.voltage ?? room.voltage) || 228.5;
      const current = Number(body.current ?? room.current) || 0;
      const powerWatt = Math.round(Number(body.power ?? body.activePowerWatt ?? voltage * current * 0.95));
      const energyKwh = Number(
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

      const updatedRoom: SmartMeterRoomNode = {
        ...room,
        nodeMode: 'REAL_IOT_HYBRID',
        voltage,
        current: effectiveRelay === 'OFF' ? 0 : current,
        activePowerWatt: effectiveRelay === 'OFF' ? 0 : powerWatt,
        powerFactor: pf,
        frequencyHz,
        currentMeterKwh:
          deliveredCmd === 'RESET_KWH_COUNTER' ? room.previousMonthKwh : energyKwh,
        monthlyUnitsKwh:
          deliveredCmd === 'RESET_KWH_COUNTER'
            ? 0
            : Math.max(0, Number((energyKwh - room.previousMonthKwh).toFixed(2))),
        relayState: effectiveRelay,
        esp32Meta: {
          ...room.esp32Meta,
          ipAddress: ip,
          macAddress: mac,
          wifiRssi: rssi,
          isHardwareConnected: true,
          lastHardwarePacketAt: nowIso,
          lastUpdatedAt: nowIso,
          pendingCommand: null,
        },
      };

      smartMeterFleet[targetIdx] = updatedRoom;

      const logItem: Esp32TelemetryLog = {
        id: `TEL-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        timestamp: nowIso,
        roomNumber,
        deviceId: body.deviceId || room.deviceId,
        source: 'ESP32_HARDWARE',
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

      return NextResponse.json({
        success: true,
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
        // If room is connected to real ESP32 hardware within last 30s and this is a regular tick, preserve real hardware readings
        const isLiveHw =
          room.esp32Meta.isHardwareConnected &&
          room.esp32Meta.lastHardwarePacketAt &&
          Date.now() - new Date(room.esp32Meta.lastHardwarePacketAt).getTime() < 30000;

        if (isLiveHw && fastForwardHours === 0) {
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

      return NextResponse.json({
        success: true,
        rooms: smartMeterFleet,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    // -------------------------------------------------------------------------
    // 5. ONE-CLICK AUTO BILLING PIPELINE (20 ROOMS -> METERS -> BILLS + PUSH)
    // -------------------------------------------------------------------------
    if (action === 'run_auto_billing_pipeline') {
      const billingCycle = String(body.billingCycle || new Date().toISOString().slice(0, 7));
      const syncToDb = Boolean(body.syncToDb);
      const triggerPush = body.triggerPush !== false;

      const pipelineResult = executeAutoBillingCalculation(smartMeterFleet, billingCycle);
      let syncedCount = 0;

      if (syncToDb) {
        try {
          const sql = getDb();
          for (const bill of pipelineResult.bills) {
            const roomRows = await sql`
              SELECT id, dorm_id FROM rooms WHERE room_number = ${bill.roomNumber} LIMIT 1
            `;
            if (roomRows.length > 0) {
              const roomId = roomRows[0].id;
              const dormId = roomRows[0].dorm_id || 1;

              // 1. Insert Electricity Meter Snapshot into meter_readings
              await sql`
                INSERT INTO meter_readings (
                  room_id, type, previous_reading, current_reading, units_used, reading_date
                ) VALUES (
                  ${roomId},
                  'Electricity',
                  ${bill.previousKwh},
                  ${bill.currentKwh},
                  ${bill.electricUnits},
                  CURDATE()
                )
              `;
              syncedCount++;

              // 2. Check if active tenant exists for this room and upsert bill
              const tenantRows = await sql`
                SELECT id FROM tenants
                WHERE room_id = ${roomId} AND status IN ('Active', 'active')
                LIMIT 1
              `;
              if (tenantRows.length > 0) {
                const tenantId = tenantRows[0].id;
                const existingBill = await sql`
                  SELECT id FROM bills
                  WHERE tenant_id = ${tenantId} AND billing_cycle = ${billingCycle}
                  LIMIT 1
                `;
                if (existingBill.length === 0) {
                  await sql`
                    INSERT INTO bills (
                      tenant_id, title, amount, billing_cycle, due_date, status,
                      dorm_id, room_number, room_amount, water_units, electric_units,
                      water_amount, electric_amount
                    ) VALUES (
                      ${tenantId},
                      ${'ค่าเช่าและค่าไฟ IoT อัตโนมัติ รอบบิล ' + billingCycle},
                      ${bill.totalAmount},
                      ${billingCycle},
                      ${bill.dueDate},
                      'Unpaid',
                      ${dormId},
                      ${bill.roomNumber},
                      ${bill.roomRent},
                      ${bill.waterUnits},
                      ${bill.electricUnits},
                      ${bill.waterAmount},
                      ${bill.electricAmount}
                    )
                  `;
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn('[IoT Auto Billing DB Sync Warning]:', dbErr);
        }
      }

      pipelineResult.syncedToDbCount = syncedCount;
      latestPipelineResult = pipelineResult;

      let pushResult = null;
      if (triggerPush) {
        try {
          pushResult = await sendWebPushToAllSubscriptions({
            senderLabel: 'Researcher IoT Auto-Billing',
            title: `⚡ ออกบิลอัตโนมัติสำเร็จ ${pipelineResult.totalBillsGenerated} ห้อง (รอบ ${billingCycle})`,
            body: `รวมหน่วยไฟ ${pipelineResult.totalElectricUnitsKwh.toLocaleString()} kWh • ยอดรวมทั้งตึก ฿${pipelineResult.grandTotalRevenue.toLocaleString()}`,
            url: '/researcher/lab/iot-meter',
          });
        } catch {
          // ignore push error
        }
      }

      return NextResponse.json({
        success: true,
        pipelineResult,
        pushResult,
        summary: buildFleetSummary(smartMeterFleet),
      });
    }

    // -------------------------------------------------------------------------
    // 6. RESET FLEET TO DEFAULT
    // -------------------------------------------------------------------------
    if (action === 'reset_fleet') {
      smartMeterFleet = createInitialSmartMeterFleet();
      latestPipelineResult = null;
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
