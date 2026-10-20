'use client';

import { Fragment } from 'react';
import type { ContractText, FormSegment } from '@/lib/settings-fields';

// The contract as a printable A4 document, from lib/settings-fields buildContractText. Printed from the browser (the
// /contract-print page → Save as PDF) — the only contract file since commit 28-6 (no Word, no PDF made on the server).
// Print rules (A4, margins, the TH Sarabun New font served by the site, page breaks) are in CONTRACT_PRINT_CSS, added
// once by the page that prints. Layout as the dorm's form (docs/review/contract-final.docx): left aligned (no justify —
// it spreads Thai words apart), every blank a dotted line of fixed length that never breaks across lines, no page break
// inside a clause, and the last clause stays on the page of the signatures.
// commit 28-11, closer to the form: the parties' details on fixed fields (a value sits on a dotted line of the blank's
// length, so a filled-in contract has the same lines as the blank form), title underlined with space below, the dorm's
// address on the right, the party lines not indented, only the first paragraph of a clause indented, notes in 16pt.

export const CONTRACT_PRINT_CSS = `
@font-face { font-family: 'THSarabunNew'; src: url('/fonts/THSarabunNew.ttf') format('truetype'); font-weight: 400; }
@font-face { font-family: 'THSarabunNew'; src: url('/fonts/THSarabunNew-Bold.ttf') format('truetype'); font-weight: 700; }
/* sizes as contract-final.docx: 16pt, Word line spacing 1.15 (≈ 1.35 of the font size here) */
.contract-doc { font-family: 'THSarabunNew', 'TH Sarabun New', 'Sarabun', sans-serif; color: #0f172a; font-size: 16pt; line-height: 1.35; }
.contract-sign p { white-space: nowrap; }
.contract-body { text-align: left; }
.contract-body p { text-indent: 2.5em; }
.contract-body .contract-clause p + p, .contract-body.contract-parties p { text-indent: 0; }
/* a value printed on a fixed field: at least the blank's length, on the same dotted line */
.contract-field { display: inline-block; text-indent: 0; text-align: center; border-bottom: 1.5px dotted #0f172a; padding: 0 0.3em; line-height: 1.1; }
.contract-label-field { white-space: nowrap; }
.contract-blank { display: inline-block; border-bottom: 1.5px dotted #0f172a; height: 0.95em; vertical-align: baseline; }
.contract-clause { break-inside: avoid; page-break-inside: avoid; }
/* the inspection record attached to the contract, in the contract's font */
.contract-insp, .contract-insp * { font-family: 'THSarabunNew', 'TH Sarabun New', 'Sarabun', sans-serif; }
.contract-insp .text-\\[15px\\] { font-size: 16pt; line-height: 1.35; }
.contract-insp .text-sm { font-size: 15pt; }
.contract-insp .text-xs { font-size: 13pt; }
.contract-insp .text-xl { font-size: 20pt; }
.contract-sheet { background: #fff; width: 210mm; max-width: 100%; margin: 0 auto; padding: 17.6mm 21.2mm; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
.contract-page-break { break-before: page; page-break-before: always; }
@media print {
  /* No page margin: the browser then has no room for its own header / footer (date, title, URL). The margin is the
     sheet's padding instead, repeated on every printed page of the sheet (box-decoration-break: clone). */
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  /* margins as contract-final.docx: 17.6 mm top / bottom, 21.2 mm left / right */
  .contract-sheet { width: auto; padding: 17.6mm 21.2mm; box-shadow: none; margin: 0;
    -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .contract-doc p, .contract-doc li { orphans: 3; widows: 3; }
  .contract-sign-block { break-inside: avoid; page-break-inside: avoid; }
  .contract-insp tr { break-inside: avoid; page-break-inside: avoid; }
}
@media screen and (max-width: 640px) {
  .contract-sheet { padding: 8mm 6mm; }
  .contract-doc { font-size: 15pt; }
  /* a phone screen is narrower than a field: let it wrap and shrink (the A4 print is not affected) */
  .contract-label-field { white-space: normal; }
  .contract-blank { max-width: 100%; }
}
`;

/** Length of a blank on paper: about a third of an em per dot written in the contract text (the field's intended size), at most 30em */
const blankWidth = (dots: number) => `${Math.min(Math.max(dots * 0.3, 2), 30)}em`;

/** A form line from pieces: text (dots → blanks) and known values on fixed fields (commit 28-11) */
export function FormLine({ segs }: { segs: FormSegment[] }) {
  // never wider than the line (a phone screen); on A4 every field fits, so it is the blank's length there
  const field = (f: Exclude<FormSegment, string>) => <span className="contract-field" style={{ minWidth: `min(${blankWidth(f.dots)}, 100%)` }}>{f.value}</span>;
  return (
    <>
      {segs.map((s, i) => {
        const next = segs[i + 1];
        if (typeof s !== 'string') return typeof segs[i - 1] === 'string' ? null : <Fragment key={i}>{field(s)}</Fragment>;
        if (next === undefined || typeof next === 'string') return <Blanks key={i} text={s} />;
        // the field's label (the last word before it) stays on the field's line
        const cut = s.trimEnd().lastIndexOf(' ') + 1;
        return (
          <Fragment key={i}>
            <Blanks text={s.slice(0, cut)} />
            <span className="contract-label-field"><Blanks text={s.slice(cut)} />{field(next)}</span>
          </Fragment>
        );
      })}
    </>
  );
}

/** A line of the contract with every run of 3+ dots (a blank to fill in by hand) as a fixed-length dotted line. */
export function Blanks({ text }: { text: string }) {
  const parts = String(text).split(/(\.{3,})/);
  return (
    <>
      {parts.map((p, i) => (/^\.{3,}$/.test(p)
        ? <span key={i} className="contract-blank" style={{ width: blankWidth(p.length) }} aria-label="ช่องว่างสำหรับกรอก" />
        : <span key={i}>{p}</span>))}
    </>
  );
}

function Clause({ c }: { c: ContractText['clauses'][number] }) {
  return (
    <div className="contract-clause">
      {c.paragraphs.map((p, i) => <p key={i}><Blanks text={p} /></p>)}
    </div>
  );
}

export default function ContractDocument({ text }: { text: ContractText }) {
  const clauses = text.clauses.slice(0, -1);
  const last = text.clauses[text.clauses.length - 1];
  return (
    <div className="contract-doc">
      <h1 className="text-center font-bold underline" style={{ fontSize: '18pt', marginBottom: '12pt' }}>{text.title}</h1>
      <p className="text-right"><Blanks text={text.header} /></p>
      <p className="text-right mt-3"><Blanks text={text.dateLine} /></p>

      {/* parties[0], parties[1], the room line (commit 27), parties[2] — values on fixed fields (commit 28-11) */}
      <div className="mt-3 contract-body contract-parties contract-clause">
        {text.partyForm.map((segs, i) => <p key={i}><FormLine segs={segs} /></p>)}
      </div>

      <div className="mt-2 contract-body">
        {clauses.map((c) => <Clause key={c.no} c={c} />)}
      </div>

      {/* The last clause and the signatures stay on one page */}
      <div className="contract-sign-block">
        {last && <div className="contract-body"><Clause c={last} /></div>}
        <p className="mt-4"><Blanks text={text.closing} /></p>
        <div className="mt-4 space-y-4 contract-sign">
          {text.signatures.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-6 text-center">
              {row.map((s, j) => (
                <div key={j}>
                  <p>ลงชื่อ <span className="contract-blank" style={{ width: '9em' }} /> {s.role}</p>
                  {/* a name to write by hand is a blank of the same length on every row */}
                  <p>( {/^\.+$/.test(s.name) ? <span className="contract-blank" style={{ width: '9em' }} /> : s.name} )</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 contract-clause">
        <p className="font-bold">{text.notesTitle}</p>
        {text.notes.map((n, i) => <p key={i}>• <Blanks text={n} /></p>)}
      </div>
    </div>
  );
}
