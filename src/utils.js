import { DEBUG_MODE } from './config.js';

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = headers.map(h => csvEscape(r[h])).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

function parseCSV(text) {
  // Simple CSV parser: handles quoted fields and commas inside quotes
  const rows = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  function parseLine(line) {
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; continue; }
      cur += ch;
    }
    res.push(cur);
    return res.map(s => s.trim());
  }
  const header = parseLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = vals[j] ?? '';
    rows.push(obj);
  }
  return rows;
}

/**
 * Genera un nombre de archivo con fecha/hora actual para descargas.
 * @param {string} prefix
 * @param {string} ext
 * @returns {string}
 */
function makeFilename(prefix, ext = 'csv') {
  const d = new Date();
  const ts = d.toISOString().slice(0, 10);
  return `${prefix}_${ts}.${ext}`;
}

/**
 * Descarga un Blob como archivo en el navegador.
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Genera un archivo SpreadsheetML (.xls) que Excel abre nativamente.
 * No requiere dependencias externas.
 * @param {Object[]} rows  Array de objetos planos
 * @param {string}   sheetName  Nombre de la hoja
 * @returns {Blob}
 */
function toXLS(sheetsOrRows, sheetName = 'Hoja1') {
  const isMulti = Array.isArray(sheetsOrRows) && sheetsOrRows.length && typeof sheetsOrRows[0] === 'object' && (sheetsOrRows[0].data || sheetsOrRows[0].name);
  const makeSheet = (name, rows, headerRows) => {
    if (!rows || !rows.length) rows = [{}];
    const headers = Object.keys(rows[0]);

    function esc(v) {
      if (v == null) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function cell(v) {
      const isNum = v !== '' && !isNaN(v) && typeof v !== 'boolean';
      return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
    }

    const headerRow = '<Row>' + headers.map(h => cell(String(h).toUpperCase())).join('') + '</Row>';
    const dataRows = rows.map(r => '<Row>' + headers.map(h => cell(r[h] ?? '')).join('') + '</Row>').join('\n');

    // optional headerRows: array of strings to render above table (merged across all columns)
    const headerRowsXml = (headerRows || []).map(hr => `<Row><Cell ss:MergeAcross="${Math.max(0, headers.length-1)}"><Data ss:Type="String">${esc(hr)}</Data></Cell></Row>`).join('\n');

    // Autofilter range: first data header is after headerRows + 1
    const headerRowIndex = (headerRows || []).length + 1;
    const autoFilterRange = `R${headerRowIndex}C1:R${headerRowIndex}C${headers.length}`;

    return `<Worksheet ss:Name="${esc(name)}">\n      <Table>\n        ${headerRowsXml}\n        ${headerRow.replace('<Row>', '<Row ss:StyleID="header">')}\n        ${dataRows}\n      </Table>\n      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n        <AutoFilter x:Range="${autoFilterRange}"/>\n      </WorksheetOptions>\n    </Worksheet>`;
  };

  let sheetsXml = '';
  if (isMulti) {
    for (const s of sheetsOrRows) {
      const name = s.name || s.sheetName || 'Hoja1';
      const rows = s.data || [];
      const headerRows = s.headerRows || [];
      sheetsXml += makeSheet(name, rows, headerRows);
    }
  } else {
    sheetsXml = makeSheet(sheetName, sheetsOrRows, []);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n  <Styles>\n    <Style ss:ID="header">\n      <Font ss:Bold="1"/>\n      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>\n    </Style>\n  </Styles>\n  ${sheetsXml}\n</Workbook>`;

  return new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
}

export { debugLog, fmtDate, toCSV, parseCSV, makeFilename, downloadBlob, toXLS };
