/**
 * Gerador de PDF mínimo, escrito à mão.
 *
 * O aplicativo roda sem internet e tudo vai embutido no APK, então trazer uma
 * biblioteca de PDF (centenas de KB) para imprimir um comprovante não se
 * justifica. Aqui há só o necessário: páginas A4, Helvetica normal e negrito,
 * texto alinhado, linhas e retângulos.
 *
 * O arquivo é montado como uma sequência de bytes 0–255 guardada em string —
 * assim a posição de cada objeto na tabela xref é o próprio índice do caractere.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

/** Larguras oficiais da Helvetica (caracteres 32 a 126), em milésimos de ponto. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Caracteres acima de 0x7E caem na letra-base para medir a largura. */
const ACCENT_BASE: Record<string, string> = {
  "á": "a", "à": "a", "ã": "a", "â": "a", "ä": "a",
  "é": "e", "ê": "e", "è": "e", "ë": "e",
  "í": "i", "î": "i", "ì": "i", "ï": "i",
  "ó": "o", "ô": "o", "õ": "o", "ò": "o", "ö": "o",
  "ú": "u", "û": "u", "ù": "u", "ü": "u",
  "ç": "c", "ñ": "n",
  "Á": "A", "À": "A", "Ã": "A", "Â": "A",
  "É": "E", "Ê": "E", "Í": "I", "Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ç": "C",
};

/** Pontuação tipográfica que o WinAnsi guarda fora do Latin-1. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f,
};

function winAnsiByte(char: string): number {
  const code = char.charCodeAt(0);
  if (code <= 0xff) return code;
  return WIN_ANSI_EXTRA[char] ?? 0x3f; // "?" quando não houver equivalente
}

/** Largura do texto em pontos, para alinhar à direita e quebrar linha. */
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const char of text) {
    const base = ACCENT_BASE[char] ?? char;
    const code = base.charCodeAt(0);
    total += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (total * size) / 1000;
}

/** Texto pronto para ir dentro de ( ) num PDF. */
function escapeText(text: string): string {
  let out = "";
  for (const char of text) {
    const byte = winAnsiByte(char);
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += "\\" + String.fromCharCode(byte);
    else if (byte < 32 || byte > 126) out += "\\" + byte.toString(8).padStart(3, "0");
    else out += String.fromCharCode(byte);
  }
  return out;
}

export type TextOptions = {
  size?: number;
  bold?: boolean;
  align?: "left" | "right" | "center";
  /** Cinza de 0 (preto) a 1 (branco). */
  gray?: number;
  /** Quebra o texto nesta largura; devolve quantas linhas foram usadas. */
  maxWidth?: number;
  indent?: number;
};

export class Pdf {
  private pages: string[] = [];
  private current = "";
  /** Posição vertical, contada a partir do topo. */
  private cursor = MARGIN;
  readonly title: string;

  constructor(title = "Documento") {
    this.title = title;
    this.newPage();
  }

  get width() { return PAGE_WIDTH - MARGIN * 2; }
  get left() { return MARGIN; }
  get right() { return PAGE_WIDTH - MARGIN; }
  get y() { return this.cursor; }

  private newPage() {
    if (this.current) this.pages.push(this.current);
    this.current = "";
    this.cursor = MARGIN;
  }

  /** Garante espaço para a próxima linha; abre página nova se não couber. */
  ensure(height: number) {
    if (this.cursor + height > PAGE_HEIGHT - MARGIN) this.newPage();
  }

  /** Converte "do topo para baixo" na coordenada do PDF, que é de baixo para cima. */
  private pdfY(offsetFromTop: number) {
    return PAGE_HEIGHT - offsetFromTop;
  }

  spacer(height = 8) {
    this.cursor += height;
  }

  rule(gray = 0.82) {
    this.ensure(6);
    this.cursor += 4;
    this.current +=
      `q ${gray} G 0.7 w ${this.left} ${this.pdfY(this.cursor)} m ` +
      `${this.right} ${this.pdfY(this.cursor)} l S Q\n`;
    this.cursor += 6;
  }

  rect(x: number, width: number, height: number, gray = 0.95) {
    this.ensure(height);
    this.current +=
      `q ${gray} g ${x} ${this.pdfY(this.cursor + height)} ${width} ${height} re f Q\n`;
  }

  /** Escreve uma linha de texto e avança o cursor. */
  text(content: string, options: TextOptions = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const leading = size * 1.45;
    const indent = options.indent ?? 0;
    const lines = options.maxWidth
      ? wrap(content, options.maxWidth, size, bold)
      : [content];

    for (const line of lines) {
      this.ensure(leading);
      const w = textWidth(line, size, bold);
      let x = this.left + indent;
      if (options.align === "right") x = this.right - w;
      else if (options.align === "center") x = (PAGE_WIDTH - w) / 2;

      const gray = options.gray ?? 0;
      this.current +=
        `BT ${gray} g /${bold ? "FB" : "FR"} ${size} Tf ` +
        `${x.toFixed(2)} ${(this.pdfY(this.cursor + size)).toFixed(2)} Td ` +
        `(${escapeText(line)}) Tj ET\n`;
      this.cursor += leading;
    }
  }

  /** Rótulo à esquerda e valor à direita, na mesma linha. */
  row(label: string, value: string, options: TextOptions = {}) {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const leading = size * 1.45;
    this.ensure(leading);

    const gray = options.gray ?? 0;
    const yy = (this.pdfY(this.cursor + size)).toFixed(2);
    this.current +=
      `BT ${gray} g /${bold ? "FB" : "FR"} ${size} Tf ` +
      `${this.left} ${yy} Td (${escapeText(label)}) Tj ET\n` +
      `BT ${gray} g /${bold ? "FB" : "FR"} ${size} Tf ` +
      `${(this.right - textWidth(value, size, bold)).toFixed(2)} ${yy} Td ` +
      `(${escapeText(value)}) Tj ET\n`;
    this.cursor += leading;
  }

  /** Linha de tabela com colunas em posições fixas. */
  columns(
    cells: { text: string; x: number; align?: "left" | "right"; width?: number }[],
    options: TextOptions = {},
  ) {
    const size = options.size ?? 9;
    const bold = options.bold ?? false;
    const leading = size * 1.5;
    this.ensure(leading);
    const gray = options.gray ?? 0;
    const yy = (this.pdfY(this.cursor + size)).toFixed(2);

    for (const cell of cells) {
      const content = cell.width ? clip(cell.text, cell.width, size, bold) : cell.text;
      const x = cell.align === "right"
        ? cell.x - textWidth(content, size, bold)
        : cell.x;
      this.current +=
        `BT ${gray} g /${bold ? "FB" : "FR"} ${size} Tf ` +
        `${x.toFixed(2)} ${yy} Td (${escapeText(content)}) Tj ET\n`;
    }
    this.cursor += leading;
  }

  /** Bytes do arquivo final. */
  toBytes(): Uint8Array {
    const pages = [...this.pages, this.current].filter((p) => p.length > 0);
    if (!pages.length) pages.push("");

    const objects: string[] = [];
    const add = (body: string) => { objects.push(body); return objects.length; };

    // 1 catálogo, 2 páginas, 3/4 fontes — depois um par (página, conteúdo) por folha.
    const catalogNo = add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesNo = add("");                       // preenchido no fim
    const fontRegular = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    const fontBold = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );

    const pageNumbers: number[] = [];
    for (const content of pages) {
      const streamNo = add(
        `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      );
      const pageNo = add(
        `<< /Type /Page /Parent ${pagesNo} 0 R ` +
        `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /FR ${fontRegular} 0 R /FB ${fontBold} 0 R >> >> ` +
        `/Contents ${streamNo} 0 R >>`,
      );
      pageNumbers.push(pageNo);
    }

    objects[pagesNo - 1] =
      `<< /Type /Pages /Count ${pageNumbers.length} ` +
      `/Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] >>`;

    const infoNo = add(
      `<< /Title (${escapeText(this.title)}) /Producer (Loja da Banana) >>`,
    );

    let file = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(file.length);
      file += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = file.length;
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      file += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    file +=
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R ` +
      `/Info ${infoNo} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

    const bytes = new Uint8Array(file.length);
    for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xff;
    return bytes;
  }

  toBase64(): string {
    return bytesToBase64(this.toBytes());
  }
}

/** Quebra o texto para caber na largura dada. */
export function wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Corta com reticências o que não couber na coluna. */
export function clip(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}...`, size, bold) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
