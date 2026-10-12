import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';
import { parseMailContent } from '../dist/services/email/mime.js';

// Synthetic fixtures only. No real attachments, remote images or external links.
const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve('mammoth'))('jszip');
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>面试时间：2026年10月15日 14:00</w:t></w:r></w:p></w:body></w:document>');
const docx = await zip.generateAsync({ type: 'nodebuffer' });
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['活动', '时间'], ['笔试', '2026-10-16 19:00']]));
const xlsx = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
const stream = 'BT /F1 12 Tf 50 700 Td (Interview: 2026-10-17 14:00) Tj ET';
objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
let pdf = '%PDF-1.4\n'; const offsets = [0];
for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
for (const [name, content, expected] of [['interview.docx', docx, '2026年10月15日'], ['test.xlsx', xlsx, '2026-10-16'], ['interview.pdf', Buffer.from(pdf), '2026-10-17']]) {
  const raw = `MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=fixture\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nSee attachment\r\n--fixture\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${content.toString('base64')}\r\n--fixture--`;
  const result = await parseMailContent(Buffer.from(raw));
  assert.equal(result.attachments[0].status, 'parsed', JSON.stringify(result.attachments));
  assert.ok(result.attachmentText.includes(expected), name);
  console.log(`${name}: worker extraction passed`);
}
