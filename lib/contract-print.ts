// Data of a printed contract (print page + Word file): the contract, its room and tenant, the dorm's rates, payment
// details and landlord from the settings page. Callers check access first (lib/contract-files canViewContract).

import { getDb } from '@/lib/db';
import { formDeposit, isPaper } from '@/lib/contract-files';
import { getContractParty, getPaymentInfo, getRates, ratesForRoom } from '@/lib/billing';
import { getInspection, type InspectionView } from '@/lib/inspections';
import { contractAddress, type ContractTextInput } from '@/lib/settings-fields';
import { splitName } from '@/lib/contract-party';

/** Booking states before the contract data is confirmed (step 3, commit 28): the print page is a draft. */
const BEFORE_CONFIRM = ['BookingRequested', 'BookingApproved', 'PendingOwnerSignature', 'PendingContract'];

export async function contractPrintData(contractId: number): Promise<{ id: number; input: ContractTextInput; inspection: InspectionView | null; draft: boolean } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT c.id, c.status, c.deposit_amount, c.start_date, c.end_date, c.created_at, c.parent_phone, c.occupants,
           c.data_confirmed_at, c.contract_file_url,
           c.tenant_title, c.tenant_first_name, c.tenant_last_name, c.addr_house_no, c.addr_moo, c.addr_soi, c.addr_road,
           c.addr_subdistrict, c.addr_district, c.addr_province, c.addr_postcode,
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
  // commit 28-8: the contract's own separate fields (migration 022); older contracts: the single-field name (its title
  // taken off so it is not printed twice) and the address split by lib/address-parser
  const saved = Boolean(c.tenant_first_name);
  const name = saved
    ? { title: c.tenant_title || '', rest: `${c.tenant_first_name} ${c.tenant_last_name || ''}`.trim() }
    : (() => { const s = splitName(c.tenant_name); return { title: s.title, rest: `${s.firstName} ${s.lastName}`.trim() }; })();
  const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && String(p).trim()).join(' ');
  const address = c.addr_house_no
    ? {
      houseNo: c.addr_house_no, village: c.addr_moo || '', road: join(c.addr_soi && `ซอย ${c.addr_soi}`, c.addr_road),
      subdistrict: c.addr_subdistrict || '', district: c.addr_district || '', province: join(c.addr_province, c.addr_postcode),
    }
    : contractAddress(c.address);
  const input: ContractTextInput = {
    createdAt: c.created_at,
    roomNumber: c.room_number,
    floor: c.floor ?? null,
    tenantName: name.rest || null,
    tenantTitle: name.title || null,
    tenantPhone: c.tenant_phone,
    parentPhone: c.parent_phone,
    occupants: Number(c.occupants) || null,
    address,
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
