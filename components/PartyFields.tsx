'use client';

// The tenant's name and address in the fields of the dorm's contract form (commits 28-8 / 28-8b): คำนำหน้า + ชื่อ +
// นามสกุล, then บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์. One component for step 3 and the forms that start a
// contract (online booking, walk-in, pre-system tenant) so they ask the same thing; the rules are lib/contract-party
// checkParty (also checked on the server).

import { NAME_PART_MAX, TITLES, type PartyValue } from '@/lib/contract-party';

export default function PartyFields({
  value,
  onChange,
  disabled,
  inputClass,
  labelClass,
  hintClass,
}: {
  value: PartyValue;
  onChange: (next: PartyValue) => void;
  disabled?: boolean;
  /** classes of every input / select (the page's own look) */
  inputClass: string;
  labelClass?: string;
  hintClass?: string;
}) {
  const set = (k: keyof PartyValue, v: string) => onChange({ ...value, [k]: v });
  const star = <span className="text-rose-500 font-bold"> *</span>;

  const renderField = (
    key: keyof PartyValue,
    label: string,
    required: boolean,
    spanClass: string,
    placeholder?: string,
    maxLength: number = 100,
    numeric = false
  ) => (
    <div key={key} className={`space-y-1.5 ${spanClass}`}>
      <label className="block text-xs font-bold text-muted-foreground">
        <span>{label}</span>
        {required ? star : null}
      </label>
      <input
        className={inputClass}
        name={key}
        maxLength={maxLength}
        inputMode={numeric ? 'numeric' : undefined}
        placeholder={placeholder}
        value={value[key] || ''}
        disabled={disabled}
        onChange={(e) =>
          set(key, numeric ? e.target.value.replace(/\D/g, '').slice(0, maxLength) : e.target.value)
        }
      />
    </div>
  );

  return (
    <div className="space-y-4" data-party-fields>
      {/* 1. Name Section */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
        <div className="sm:col-span-3 space-y-1.5">
          <label className="block text-xs font-bold text-muted-foreground h-5 flex items-center">
            <span>คำนำหน้า</span>
            {star}
          </label>
          <select
            className={inputClass}
            name="title"
            value={value.title}
            disabled={disabled}
            onChange={(e) => set('title', e.target.value)}
          >
            <option value="">เลือก</option>
            {TITLES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-5 space-y-1.5">
          <label className="block text-xs font-bold text-muted-foreground h-5 flex items-center">
            <span>ชื่อ (ตามบัตรประชาชน)</span>
            {star}
          </label>
          <input
            className={inputClass}
            name="firstName"
            placeholder="ชื่อจริง"
            maxLength={NAME_PART_MAX}
            value={value.firstName}
            disabled={disabled}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </div>

        <div className="sm:col-span-4 space-y-1.5">
          <label className="block text-xs font-bold text-muted-foreground h-5 flex items-center">
            <span>นามสกุล</span>
            {star}
          </label>
          <input
            className={inputClass}
            name="lastName"
            placeholder="นามสกุล"
            maxLength={NAME_PART_MAX}
            value={value.lastName}
            disabled={disabled}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </div>
      </div>

      {/* 2. Address Section in structured Card */}
      <div className="bg-secondary/40 border border-border/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <span>📍</span>
            <span>ที่อยู่ตามบัตรประชาชน</span>
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
            ช่องที่มี <span className="text-rose-500 font-black">*</span> ต้องกรอก
          </span>
        </div>

        {/* Address Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-3">
          {/* Row 1: บ้านเลขที่, หมู่, ซอย, ถนน */}
          {renderField('houseNo', 'บ้านเลขที่', true, 'col-span-1 sm:col-span-3', 'เช่น 99/9')}
          {renderField('moo', 'หมู่ที่', false, 'col-span-1 sm:col-span-3', 'เช่น 1')}
          {renderField('soi', 'ซอย', false, 'col-span-1 sm:col-span-3', 'เช่น -')}
          {renderField('road', 'ถนน', false, 'col-span-1 sm:col-span-3', 'เช่น พหลโยธิน')}

          {/* Row 2: ตำบล, อำเภอ (Spacious 6 cols each) */}
          {renderField('subdistrict', 'ตำบล / แขวง', true, 'col-span-2 sm:col-span-6', 'ระบุตำบล/แขวง')}
          {renderField('district', 'อำเภอ / เขต', true, 'col-span-2 sm:col-span-6', 'ระบุอำเภอ/เขต')}

          {/* Row 3: จังหวัด, รหัสไปรษณีย์ */}
          {renderField('province', 'จังหวัด', true, 'col-span-2 sm:col-span-7', 'ระบุจังหวัด')}
          {renderField('postcode', 'รหัสไปรษณีย์', false, 'col-span-2 sm:col-span-5', '5 หลัก', 5, true)}
        </div>
      </div>
    </div>
  );
}
