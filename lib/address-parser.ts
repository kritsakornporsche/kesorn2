export interface ThaiAddressParts {
  houseNo: string;
  village: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode?: string;
}

/**
 * Smart helper to parse Thai address from OCR
 * Pure client/server utility without Node.js database dependencies.
 */
export function parseThaiAddress(addressStr: string): ThaiAddressParts {
  let houseNo = '';
  let village = '';
  let road = '';
  let subdistrict = '';
  let district = '';
  let province = '';
  let postalCode = '';

  const clean = (addressStr || '').trim();
  if (!clean) {
    return { houseNo: '', village: '', road: '', subdistrict: '', district: '', province: '' };
  }

  // 1. Postal Code (5 digits at end)
  const zipMatch = clean.match(/\b(\d{5})\b/);
  if (zipMatch) postalCode = zipMatch[1];

  // 2. Subdistrict (ต. / ตำบล / แขวง)
  const subMatch = clean.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/);
  if (subMatch) subdistrict = subMatch[1];

  // 3. District (อ. / อำเภอ / เขต)
  const distMatch = clean.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/);
  if (distMatch) district = distMatch[1];

  // 4. Province (จ. / จังหวัด)
  const provMatch = clean.match(/(?:จังหวัด|จ\.)\s*([^\s,\d]+)/);
  if (provMatch) province = provMatch[1];

  // 5. Road (ถ. / ถนน)
  const roadMatch = clean.match(/(?:ถนน|ถ\.)\s*([^\s,]+)/);
  if (roadMatch) road = roadMatch[1];

  // 6. Village (หมู่บ้าน / หมู่ที่ / หมู่ / ม.)
  const villMatch = clean.match(/(?:หมู่บ้าน[^\s,]+|หมู่ที่\s*\d+|หมู่\s*\d+|ม\.\s*\d+)/);
  if (villMatch) village = villMatch[0].replace(/หมู่ที่|หมู่|ม\./, '').trim();

  // 7. House number (first tokens before village or subdistrict)
  const tokens = clean.split(/\s+/);
  if (tokens.length > 0) {
    houseNo = tokens[0].replace(/^(?:บ้านเลขที่|เลขที่)/, '');
  }

  return {
    houseNo: houseNo || clean,
    village: village || '-',
    road: road || '-',
    subdistrict: subdistrict || '',
    district: district || '',
    province: province || '',
    postalCode: postalCode || '',
  };
}
