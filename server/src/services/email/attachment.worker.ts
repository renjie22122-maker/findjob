// Executed in a disposable child process: no shell, browser, URL fetching or office execution.
process.once('message', async ({ content, extension }: { content: Uint8Array; extension: string }) => {
  const buffer = Buffer.from(content);
  try {
    let text = '';
    if (extension === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try { const result = await parser.getText({ first: 20 }); if (result.total > 20) throw new Error('PDF 页数超限'); text = result.text; }
      finally { await parser.destroy(); }
    } else if (extension === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (extension === 'xlsx' || extension === 'xls') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 200, cellFormula: false });
      if (workbook.SheetNames.length > 5 || workbook.SheetNames.some((name) => {
        const range = workbook.Sheets[name]['!fullref'] ?? workbook.Sheets[name]['!ref'];
        return range && XLSX.utils.decode_range(range).e.r >= 199;
      })) throw new Error('电子表格达到解析范围上限');
      text = workbook.SheetNames.slice(0, 5).map((name) => `${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n');
    } else {
      text = new TextDecoder('utf-8').decode(buffer);
    }
    process.send?.({ text: text.slice(0, 16000) });
  } catch {
    process.send?.({ error: '附件解析失败或受密码保护，请人工查看' });
  }

  finally { process.disconnect(); }
});
