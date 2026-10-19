'use client';

import type { ContractText } from '@/lib/settings-fields';

// The contract as a printable A4 document, from lib/settings-fields buildContractText (same words as the Word file).
// Print rules (A4, margins, Thai font, page breaks) are in CONTRACT_PRINT_CSS, added once by the page that prints.

export const CONTRACT_PRINT_CSS = `
@font-face { font-family: 'THSarabunNew'; src: url('/fonts/THSarabunNew.ttf') format('truetype'); font-weight: 400; }
@font-face { font-family: 'THSarabunNew'; src: url('/fonts/THSarabunNew-Bold.ttf') format('truetype'); font-weight: 700; }
.contract-doc { font-family: 'THSarabunNew', 'TH Sarabun New', 'Sarabun', sans-serif; color: #0f172a; font-size: 17pt; line-height: 1.45; }
.contract-sheet { background: #fff; width: 210mm; max-width: 100%; margin: 0 auto; padding: 18mm 18mm 20mm; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
.contract-page-break { break-before: page; page-break-before: always; }
@media print {
  /* No page margin: the browser then has no room for its own header / footer (date, title, URL). The margin is the
     sheet's padding instead, repeated on every printed page of the sheet (box-decoration-break: clone). */
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .contract-sheet { width: auto; padding: 15mm 16mm 15mm; box-shadow: none; margin: 0;
    -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .contract-doc p, .contract-doc li { orphans: 3; widows: 3; }
  .contract-sign-block { break-inside: avoid; page-break-inside: avoid; }
}
@media screen and (max-width: 640px) {
  .contract-sheet { padding: 8mm 6mm; }
  .contract-doc { font-size: 15pt; }
}
`;

export default function ContractDocument({ text }: { text: ContractText }) {
  return (
    <div className="contract-doc">
      <h1 className="text-center font-bold" style={{ fontSize: '21pt' }}>{text.title}</h1>
      <p className="text-center">{text.header}</p>
      <p className="text-right mt-3">{text.dateLine}</p>

      <div className="mt-3 text-justify">
        <p style={{ textIndent: '2.5em' }}>{text.parties[0]}</p>
        <p>{text.parties[1]}</p>
        <p>{text.roomLine}</p>
        <p>{text.parties[2]}</p>
      </div>

      <div className="mt-2 text-justify">
        {text.clauses.map((c) => (
          <div key={c.no}>
            {c.paragraphs.map((p, i) => (
              <p key={i} style={i === 0 ? undefined : { textIndent: '2.5em' }}>{p}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="contract-sign-block">
        <p className="mt-4">{text.closing}</p>
        <div className="mt-6 space-y-6">
          {text.signatures.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-6 text-center">
              {row.map((s, j) => (
                <div key={j}>
                  <p>ลงชื่อ ....................................... {s.role}</p>
                  <p>( {s.name} )</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6" style={{ fontSize: '15pt' }}>
        <p className="font-bold">{text.notesTitle}</p>
        {text.notes.map((n, i) => <p key={i}>• {n}</p>)}
      </div>
    </div>
  );
}
