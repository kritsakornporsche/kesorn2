// The tenant on a contract in separate fields (commit 28-8, migration 022): title, first name, last name and the
// address parts of the dorm's contract form. Client-safe (pages and server). Contracts made before 022 keep their
// single-field name / address: these helpers split them for display and for filling the step-3 form in, without ever
// writing them back by themselves.

import { parseThaiAddress } from '@/lib/address-parser';

export const TITLES = ['นาย', 'นาง', 'นางสาว'] as const;
export type Title = (typeof TITLES)[number];

export const NAME_PART_MAX = 100;

export interface AddressParts {
  houseNo: string;
  moo: string;
  soi: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
}
export const ADDRESS_FIELDS: { key: keyof AddressParts; label: string; required: boolean }[] = [
  { key: 'houseNo', label: 'บ้านเลขที่', required: true },
  { key: 'moo', label: 'หมู่ที่', required: false },
  { key: 'soi', label: 'ซอย', required: false },
  { key: 'road', label: 'ถนน', required: false },
  { key: 'subdistrict', label: 'ตำบล/แขวง', required: true },
  { key: 'district', label: 'อำเภอ/เขต', required: true },
  { key: 'province', label: 'จังหวัด', required: true },
  { key: 'postcode', label: 'รหัสไปรษณีย์', required: false },
];
export const EMPTY_ADDRESS: AddressParts = { houseNo: '', moo: '', soi: '', road: '', subdistrict: '', district: '', province: '', postcode: '' };

/** "นางสาวสมหญิง ใจดี" → title นางสาว, first สมหญิง, last ใจดี (no title → title ''). The longest title is tried first. */
export function splitName(full: string | null | undefined): { title: Title | ''; firstName: string; lastName: string } {
  let rest = String(full || '').trim().replace(/\s+/g, ' ');
  let title: Title | '' = '';
  for (const t of ['นางสาว', 'นาง', 'นาย'] as Title[]) {
    if (rest.startsWith(t)) { title = t; rest = rest.slice(t.length).trim(); break; }
  }
  const space = rest.indexOf(' ');
  return space < 0 ? { title, firstName: rest, lastName: '' } : { title, firstName: rest.slice(0, space), lastName: rest.slice(space + 1) };
}

/** "นางสาว" + "สมหญิง" + "ใจดี" → "นางสาวสมหญิง ใจดี" (Thai writes the title joined to the name) */
export function joinName(p: { title?: string | null; firstName?: string | null; lastName?: string | null }): string {
  return `${p.title || ''}${String(p.firstName || '').trim()} ${String(p.lastName || '').trim()}`.trim();
}

/** The address as one line (kept in contracts.tenant_address / tenants.address for every other page). */
export function joinAddress(a: Partial<AddressParts>): string {
  const t = (v: unknown) => String(v ?? '').trim();
  return [
    t(a.houseNo),
    t(a.moo) && `หมู่ ${t(a.moo)}`,
    t(a.soi) && `ซ.${t(a.soi)}`,
    t(a.road) && `ถ.${t(a.road)}`,
    t(a.subdistrict) && `ต.${t(a.subdistrict)}`,
    t(a.district) && `อ.${t(a.district)}`,
    t(a.province) && `จ.${t(a.province)}`,
    t(a.postcode),
  ].filter(Boolean).join(' ');
}

/** A single-field address split into the form's parts (best effort, for older contracts). */
export function addressFromText(text: string | null | undefined): AddressParts {
  const value = String(text || '').trim();
  if (!value) return { ...EMPTY_ADDRESS };
  const p = parseThaiAddress(value);
  const part = (s?: string) => (s && s.trim() !== '-' ? s.trim() : '');
  const split = part(p.village) || part(p.road) || part(p.subdistrict) || part(p.district) || part(p.province);
  if (!split) return { ...EMPTY_ADDRESS, houseNo: value };
  const soi = (value.match(/(?:ซอย|ซ\.)\s*([^\s,]+)/) || [])[1] || '';
  return {
    houseNo: part(p.houseNo), moo: part(p.village), soi, road: part(p.road),
    subdistrict: part(p.subdistrict), district: part(p.district), province: part(p.province), postcode: part(p.postalCode),
  };
}
