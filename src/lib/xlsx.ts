/**
 * A small .xlsx reader, written here rather than pulled in as a dependency.
 *
 * An .xlsx file is a zip of XML parts, so this unzips it with the browser's own
 * DecompressionStream and walks the XML with a scanner. That's all it takes to
 * read a statement your broker exported: values, shared strings and the number
 * formats needed to tell a date from a five-digit number.
 *
 * Nothing leaves the device — the file is read in the tab and never uploaded.
 */

export interface XlsxSheet {
  name: string;
  /** Dense grid of cell text, row 0 first. Empty cells are ''. */
  rows: string[][];
}

const textDecoder = new TextDecoder();

/* --------------------------------------------------------------------- zip */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

function readCentralDirectory(view: DataView): ZipEntry[] {
  // The end-of-central-directory record lives in the last 64KB or so.
  let eocd = -1;
  const from = Math.max(0, view.byteLength - 65_557);
  for (let i = view.byteLength - 22; i >= from; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That doesn’t look like an Excel file — no zip directory in it.');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (at === 0xffffffff) throw new Error('That workbook uses zip64, which this reader can’t open.');

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const name = textDecoder.decode(
      new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength),
    );
    entries.push({
      name,
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      uncompressedSize: view.getUint32(at + 24, true),
      localHeaderOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser can’t unzip files. Try Chrome, Edge or Safari 16.4 and up.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every part of the zip, by name, as text. */
async function unzip(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buffer);
  const out = new Map<string, string>();

  for (const entry of readCentralDirectory(view)) {
    if (entry.name.endsWith('/')) continue;
    const local = entry.localHeaderOffset;
    const nameLength = view.getUint16(local + 26, true);
    const extraLength = view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength;
    const raw = new Uint8Array(buffer, start, entry.compressedSize);

    if (entry.method === 0) out.set(entry.name, textDecoder.decode(raw));
    else if (entry.method === 8) out.set(entry.name, textDecoder.decode(await inflate(raw)));
    // Anything else (old implode, bzip2) isn't something Excel writes.
  }
  return out;
}

/* --------------------------------------------------------------------- xml */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Every `<tag …>…</tag>` (and self-closed `<tag …/>`) at any depth, in order. */
function* elements(xml: string, tag: string): Generator<{ attrs: string; inner: string }> {
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(/)?>`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = match[1] ?? '';
    if (match[2]) {
      yield { attrs, inner: '' };
      continue;
    }
    const close = xml.indexOf(`</${tag}>`, re.lastIndex);
    if (close < 0) return;
    yield { attrs, inner: xml.slice(re.lastIndex, close) };
    re.lastIndex = close + tag.length + 3;
  }
}

const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? unescapeXml(m[1]) : null;
};

/** The text of every `<t>` inside a fragment, joined — that's one shared string. */
function textOf(xml: string): string {
  let out = '';
  for (const t of elements(xml, 't')) out += unescapeXml(t.inner);
  return out;
}

/* ------------------------------------------------------------------- dates */

/** Built-in number formats that mean "this is a date". */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

const SHEETS_EPOCH = Date.UTC(1899, 11, 30);

function serialToISO(serial: number): string {
  const d = new Date(SHEETS_EPOCH + Math.round(serial * 86_400_000));
  const iso = d.toISOString();
  // Whole days are dates; anything with a time keeps it.
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
}

/* ----------------------------------------------------------------- reading */

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
};

/**
 * Reads a workbook into plain grids of text — one per sheet, in the order the
 * file lists them.
 */
export async function readXlsx(file: Blob): Promise<XlsxSheet[]> {
  const parts = await unzip(await file.arrayBuffer());

  const workbook = parts.get('xl/workbook.xml');
  if (!workbook) throw new Error('That file isn’t an Excel workbook.');

  // Shared strings: most text in a sheet is a pointer into this table.
  const shared: string[] = [];
  const sharedXml = parts.get('xl/sharedStrings.xml');
  if (sharedXml) for (const si of elements(sharedXml, 'si')) shared.push(textOf(si.inner));

  // Which cell styles are dates.
  const dateStyles = new Set<number>();
  const stylesXml = parts.get('xl/styles.xml');
  if (stylesXml) {
    const custom = new Map<number, string>();
    for (const nf of elements(stylesXml, 'numFmt')) {
      const id = Number(attr(nf.attrs, 'numFmtId'));
      const code = attr(nf.attrs, 'formatCode') ?? '';
      if (Number.isFinite(id)) custom.set(id, code);
    }
    const cellXfs = [...elements(stylesXml, 'cellXfs')][0];
    if (cellXfs) {
      let index = 0;
      for (const xf of elements(cellXfs.inner, 'xf')) {
        const id = Number(attr(xf.attrs, 'numFmtId') ?? 0);
        const code = custom.get(id);
        const looksLikeDate = code ? /[dmy]{2,}|\bh:mm\b/i.test(code.replace(/\[[^\]]*\]/g, '')) : false;
        if (DATE_FORMATS.has(id) || looksLikeDate) dateStyles.add(index);
        index += 1;
      }
    }
  }

  // Sheet name -> part path, via the workbook's relationships.
  const relXml = parts.get('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const rel of elements(relXml, 'Relationship')) {
    const id = attr(rel.attrs, 'Id');
    const target = attr(rel.attrs, 'Target');
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const sheets: XlsxSheet[] = [];
  for (const sheet of elements(workbook, 'sheet')) {
    const name = attr(sheet.attrs, 'name') ?? `Sheet ${sheets.length + 1}`;
    const relId = attr(sheet.attrs, 'r:id') ?? attr(sheet.attrs, 'relationshipId');
    const target = relId ? targets.get(relId) : null;
    const xml = target ? parts.get(`xl/${target}`) : null;
    if (!xml) continue;

    const rows: string[][] = [];
    for (const row of elements(xml, 'row')) {
      const index = Number(attr(row.attrs, 'r') ?? rows.length + 1) - 1;
      const cells: string[] = [];

      for (const c of elements(row.inner, 'c')) {
        const ref = attr(c.attrs, 'r') ?? '';
        const at = ref ? colIndex(ref) : cells.length;
        const type = attr(c.attrs, 't');
        const style = Number(attr(c.attrs, 's') ?? -1);

        let value = '';
        if (type === 'inlineStr') {
          value = textOf(c.inner);
        } else {
          const v = [...elements(c.inner, 'v')][0];
          const raw = v ? unescapeXml(v.inner) : '';
          if (!raw) value = '';
          else if (type === 's') value = shared[Number(raw)] ?? '';
          else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') value = raw;
          else {
            const n = Number(raw);
            value =
              dateStyles.has(style) && Number.isFinite(n) && n > 0 ? serialToISO(n) : raw;
          }
        }

        while (cells.length < at) cells.push('');
        cells[at] = value;
      }

      while (rows.length < index) rows.push([]);
      rows[index] = cells;
    }

    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    sheets.push({
      name,
      rows: rows.map((r) => {
        const padded = [...r];
        while (padded.length < width) padded.push('');
        return padded;
      }),
    });
  }

  if (sheets.length === 0) throw new Error('That workbook has no readable sheets.');
  return sheets;
}

/* --------------------------------------------------------------------- csv */

/** Same shape from a .csv export, quotes and embedded newlines included. */
export function readCsv(text: string, name = 'CSV'): XlsxSheet[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') endCell();
    else if (ch === '\r') continue;
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell || row.length) endRow();

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return [
    {
      name,
      rows: rows.map((r) => {
        const padded = [...r];
        while (padded.length < width) padded.push('');
        return padded;
      }),
    },
  ];
}

/** Reads whichever of the two a picked file happens to be. */
export async function readSpreadsheetFile(file: File): Promise<XlsxSheet[]> {
  if (/\.csv$/i.test(file.name)) return readCsv(await file.text(), file.name.replace(/\.csv$/i, ''));
  if (/\.xls$/i.test(file.name)) {
    throw new Error(
      'That’s the old .xls format. Re-download the statement as .xlsx or .csv and try again.',
    );
  }
  return readXlsx(file);
}
