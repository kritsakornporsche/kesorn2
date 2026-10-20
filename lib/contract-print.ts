// Data of a printed contract (print page + Word file): the contract, its room and tenant, the dorm's rates, payment
// details and landlord from the settings page. Callers check access first (lib/contract-files canViewContract).

import { getDb } from '@/lib/db';
import { formDeposit, isPaper } from '@/lib/contract-files';
import { getContractParty, getPaymentInfo, getRates, ratesForRoom } from '@/lib/billing';
import { getInspection, type InspectionView } from '@/lib/inspections';
import { contractAddress, type ContractTextInput } from '@/lib/settings-fields';

/** Booking states before the contract data is confirmed (step 3, commit 28): the print page is a draft. */
const BEFORE_CONFIRM = ['BookingRequested', 'BookingApproved', 'PendingOwnerSignature', 'PendingContract'];

export async function contractPrintData(contractId: number): Promise<{ id: number; input: ContractTextInput; inspection: InspectionView | null; draft: boolean } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT c.id, c.status, c.deposit_amount, c.start_date, c.end_date, c.created_at, c.parent_phone, c.occupants,
           c.data_confirmed_at, c.contract_file_url,
           COALESCE(NULLIF(c.tenant_address, ''), t.address) AS address,
           r.room_number, r.floor, r.price, r.deposit_amount AS room_deposit_amount,
           t.name AS tenant_name, t.phone AS tenant_phone
    FROM contracts c
    LEFT JOIN rooms r ON r.id = c.room_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE c.id = ${contractId} LIMIT 1
  `;
  const c = rows[0];
  if (!c) return null;
  const rent = Number(c.price || 0) || null;
  const input: ContractTextInput = {
    createdAt: c.created_at,
    roomNumber: c.room_number,
    floor: c.floor ?? null,
    tenantName: c.tenant_name,
    tenantPhone: c.tenant_phone,
    parentPhone: c.parent_phone,
    occupants: Number(c.occupants) || null,
    address: contractAddress(c.address),
    startDate: c.start_date,
    endDate: c.end_date,
    deposit: formDeposit(c),
    firstRent: rent,
    monthlyRent: rent,
    rates: ratesForRoom(await getRates(sql), c.room_number),
    payment: await getPaymentInfo(sql),
    party: await getContractParty(sql),
  };
  // Draft: not confirmed yet (an older contract that already has its signed paper is not a draft)
  const draft = BEFORE_CONFIRM.includes(String(c.status)) && !c.data_confirmed_at && !isPaper(c.contract_file_url);
  return { id: Number(c.id), input, inspection: await getInspection(Number(c.id), 'move_in'), draft };
}
