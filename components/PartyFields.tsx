'use client';

// The tenant's name and address in the fields of the dorm's contract form (commits 28-8 / 28-8b): คำนำหน้า + ชื่อ +
// นามสกุล, then บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์. One component for step 3 and the forms that start a
// contract (online booking, walk-in, pre-system tenant) so they ask the same thing; the rules are lib/contract-party
// checkParty (also checked on the server).

import { ADDRESS_FIELDS, NAME_PART_MAX, TITLES, type PartyValue } from '@/lib/contract-party';

export default function PartyFields({ value, onChange, disabled, inputClass, labelClass, hintClass }: {
  value: PartyValue;
  onChange: (next: PartyValue) => void;
  disabled?: boolean;
  /** classes of every input / select (the page's own look) */
  inputClass: string;
  labelClass: string;
  hintClass?: string;
}) {
  const set = (k: keyof PartyValue, v: string) => onChange({ ...value, [k]: v });
  const star = <span className="text-rose-500"> *</span>;
  return (
    <div className="space-y-3" data-party-fields>
      <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_1fr] gap-3">
        <label className="block space-y-1">
          <span className={labelClass}>คำนำหน้า{star}</span>
          <select className={inputClass} name="title" value={value.title} disabled={disabled} onChange={(e) => set('title', e.target.value)}>
            <option value="">เลือก</option>
            {TITLES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>ชื่อ (ตามบัตรประชาชน){star}</span>
          <input className={inputClass} name="firstName" maxLength={NAME_PART_MAX} value={value.firstName} disabled={disabled} onChange={(e) => set('firstName', e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>นามสกุล{star}</span>
          <input className={inputClass} name="lastName" maxLength={NAME_PART_MAX} value={value.lastName} disabled={disabled} onChange={(e) => set('lastName', e.target.value)} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className={`${labelClass} mb-1`}>ที่อยู่ตามบัตรประชาชน (ช่องที่มี * ต้องกรอก)</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ADDRESS_FIELDS.map((fld) => (
            <label key={fld.key} className="block space-y-1">
              <span className={hintClass || labelClass}>{fld.label}{fld.required ? star : ''}</span>
              <input
                className={inputClass}
                name={fld.key}
                maxLength={fld.key === 'postcode' ? 5 : 100}
                inputMode={fld.key === 'postcode' ? 'numeric' : undefined}
                placeholder={fld.key === 'postcode' ? '5 หลัก' : undefined}
                value={value[fld.key]}
                disabled={disabled}
                onChange={(e) => set(fld.key, fld.key === 'postcode' ? e.target.value.replace(/\D/g, '').slice(0, 5) : e.target.value)}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
