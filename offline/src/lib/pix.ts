/**
 * Pix copia e cola (BR Code).
 *
 * Monta o payload no padrão EMV®QRCPS do Banco Central, o mesmo texto que o
 * cliente cola no aplicativo do banco. Tudo é calculado aqui no aparelho:
 * nenhuma chamada de rede, nenhum dado sai do celular.
 *
 * Referência do formato: campos TLV (id + tamanho com 2 dígitos + valor),
 * terminando sempre no CRC16-CCITT do texto anterior.
 */

export type PixKeyType = "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP" | "AUTO";

export type PixInput = {
  key: string;
  holder: string;
  city: string;
  amount?: string | number | null;
  /** Identificador da cobrança — usamos o número da venda. */
  txid?: string | null;
  keyType?: PixKeyType;
};

/** Campo TLV: "00" + "02" + "01". */
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF). */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Tira acentos e deixa só o que o padrão aceita com segurança. */
function ascii(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, max);
}

const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function detectKeyType(key: string): Exclude<PixKeyType, "AUTO"> {
  const raw = key.trim();
  if (raw.includes("@")) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return "EVP";

  const digits = onlyDigits(raw);
  if (raw.startsWith("+") || digits.length === 12 || digits.length === 13) return "PHONE";
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "EVP";
}

/** Deixa a chave no formato que os bancos esperam ler. */
export function normalizeKey(key: string, type: PixKeyType = "AUTO"): string {
  const raw = key.trim();
  const resolved = type === "AUTO" ? detectKeyType(raw) : type;

  switch (resolved) {
    case "EMAIL":
      return raw.toLowerCase();
    case "CPF":
    case "CNPJ":
      return onlyDigits(raw);
    case "PHONE": {
      const digits = onlyDigits(raw);
      // O padrão pede o formato internacional: +55 + DDD + número.
      const national = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
      return `+55${national}`;
    }
    default:
      return raw.toLowerCase();
  }
}

/** Só letras e números: o identificador da cobrança não aceita o resto. */
export function normalizeTxid(txid?: string | null): string {
  const clean = (txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return clean || "***";
}

function formatAmount(amount?: string | number | null): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(2);
}

/**
 * Texto completo do Pix copia e cola.
 * Lança se faltar chave, beneficiário ou cidade — sem isso o banco recusa.
 */
export function pixPayload(input: PixInput): string {
  const key = normalizeKey(input.key, input.keyType ?? "AUTO");
  if (!key) throw new Error("Informe a chave Pix nas configurações.");

  const holder = ascii(input.holder || "", 25);
  if (!holder) throw new Error("Informe o nome do beneficiário do Pix nas configurações.");

  const city = ascii(input.city || "", 15);
  if (!city) throw new Error("Informe a cidade do beneficiário do Pix nas configurações.");

  const amount = formatAmount(input.amount);
  const merchant = tlv("00", "br.gov.bcb.pix") + tlv("01", key);

  let payload =
    tlv("00", "01") +
    // 12 = cobrança de uso único, que é o caso de um comprovante de venda.
    tlv("01", amount ? "12" : "11") +
    tlv("26", merchant) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amount ? tlv("54", amount) : "") +
    tlv("58", "BR") +
    tlv("59", holder) +
    tlv("60", city) +
    tlv("62", tlv("05", normalizeTxid(input.txid)));

  payload += "6304";
  return payload + crc16(payload);
}

/** Confere um texto recebido — usado nos testes e na tela de configurações. */
export function isValidPayload(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  if (!body.endsWith("6304")) return false;
  return crc16(body) === payload.slice(-4).toUpperCase();
}

/** Como a chave deve aparecer para o cliente copiar. */
export function prettyKey(key: string, type: PixKeyType = "AUTO"): string {
  const resolved = type === "AUTO" ? detectKeyType(key) : type;
  const digits = onlyDigits(key);
  if (resolved === "CPF" && digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (resolved === "CNPJ" && digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/` +
      `${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (resolved === "PHONE" && digits.length >= 10) {
    const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
    return `(${national.slice(0, 2)}) ${national.slice(2, -4)}-${national.slice(-4)}`;
  }
  return key.trim();
}

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  AUTO: "Detectar automaticamente",
  CPF: "CPF",
  CNPJ: "CNPJ",
  PHONE: "Telefone",
  EMAIL: "E-mail",
  EVP: "Chave aleatória",
};
