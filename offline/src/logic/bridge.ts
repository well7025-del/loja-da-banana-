/**
 * Ponte com o aplicativo Android.
 *
 * Dentro do APK existe um objeto nativo que sabe gravar arquivos e abrir o
 * menu de compartilhamento (para salvar no Google Drive). No navegador comum
 * — usado no desenvolvimento e nos testes — cai no download/upload normal,
 * então o mesmo código funciona nos dois lugares.
 */

type NativeBackup = {
  /** Abre o seletor do Android para escolher onde gravar. Resposta assíncrona. */
  salvarBackup: (nomeArquivo: string, conteudo: string) => void;
  /** Abre o menu de compartilhamento (Drive, WhatsApp, e-mail...). */
  compartilharBackup: (nomeArquivo: string, conteudo: string) => string;
  /** Abre o seletor para escolher um arquivo de backup. Resposta assíncrona. */
  escolherArquivo: () => void;
  versaoApp?: () => string;
  /** Compartilha qualquer arquivo (PDF do comprovante, catálogo...). */
  compartilharArquivo?: (
    nomeArquivo: string, base64: string, tipoMime: string, texto: string,
  ) => string;
  /** Abre uma conversa do WhatsApp já com o texto escrito. */
  abrirWhatsapp?: (telefone: string, texto: string) => string;
};

declare global {
  interface Window {
    AndroidBackup?: NativeBackup;
    /** Chamado pelo app nativo quando o usuário escolhe um arquivo. */
    __lojaDaBananaArquivoEscolhido?: (conteudo: string | null, erro?: string) => void;
    /** Chamado pelo app nativo ao terminar de gravar o backup. */
    __lojaDaBananaBackupSalvo?: (ok: boolean, mensagem: string) => void;
  }
}

export const isNativeApp = () =>
  typeof window !== "undefined" && typeof window.AndroidBackup !== "undefined";

export type SaveOutcome = { ok: boolean; message: string };

/** Grava o arquivo de backup onde o usuário escolher. */
export async function saveBackupFile(fileName: string, content: string): Promise<SaveOutcome> {
  if (isNativeApp()) {
    return new Promise((resolve) => {
      window.__lojaDaBananaBackupSalvo = (ok, mensagem) => {
        window.__lojaDaBananaBackupSalvo = undefined;
        resolve({ ok, message: mensagem });
      };
      window.AndroidBackup!.salvarBackup(fileName, content);
    });
  }
  downloadInBrowser(fileName, content);
  return { ok: true, message: `Backup baixado como ${fileName}.` };
}

/** Abre o menu do Android para você escolher o Google Drive. */
export async function shareBackupFile(fileName: string, content: string): Promise<SaveOutcome> {
  if (isNativeApp()) {
    const result = window.AndroidBackup!.compartilharBackup(fileName, content);
    return interpret(result, "Escolha o Google Drive na lista para guardar o backup.");
  }

  // Navegador: tenta o compartilhamento nativo; se não houver, baixa o arquivo.
  const file = new File([content], fileName, { type: "application/json" });
  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: "Backup da Loja da Banana" });
      return { ok: true, message: "Backup compartilhado." };
    } catch {
      return { ok: false, message: "Compartilhamento cancelado." };
    }
  }
  downloadInBrowser(fileName, content);
  return { ok: true, message: `Backup baixado como ${fileName}.` };
}

/** Pede um arquivo de backup ao usuário e devolve o conteúdo em texto. */
export function pickBackupFile(): Promise<string> {
  if (isNativeApp()) {
    return new Promise((resolve, reject) => {
      window.__lojaDaBananaArquivoEscolhido = (content, erro) => {
        window.__lojaDaBananaArquivoEscolhido = undefined;
        if (erro) reject(new Error(erro));
        else if (content === null) reject(new Error("Nenhum arquivo escolhido."));
        else resolve(content);
      };
      window.AndroidBackup!.escolherArquivo();
    });
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("Nenhum arquivo escolhido.")); return; }
      file.text().then(resolve).catch(() => reject(new Error("Não foi possível ler o arquivo.")));
    };
    input.oncancel = () => reject(new Error("Nenhum arquivo escolhido."));
    input.click();
  });
}

function downloadInBrowser(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** O lado nativo devolve "OK" ou "ERRO: motivo". */
function interpret(result: string, successMessage: string): SaveOutcome {
  if (result === "OK") return { ok: true, message: successMessage };
  return { ok: false, message: result.replace(/^ERRO:\s*/, "") || "Falha desconhecida." };
}


// ---------------------------------------------------------------------------
// Compartilhamento de documentos (comprovante, catálogo, relatórios)
// ---------------------------------------------------------------------------

export type ShareFileInput = {
  fileName: string;
  /** Conteúdo do arquivo em base64, sem o prefixo "data:". */
  base64: string;
  mime: string;
  /** Texto que acompanha o arquivo — é por aqui que o Pix copia e cola vai. */
  text?: string;
  title?: string;
};

/**
 * Entrega o arquivo ao menu de compartilhamento do Android.
 *
 * É o caminho que leva ao WhatsApp: o sistema mostra a lista de aplicativos e
 * a pessoa escolhe a conversa. Mandar direto para o WhatsApp exigiria fixar o
 * pacote do app, e quebraria para quem usa o WhatsApp Business.
 */
export async function shareFile(input: ShareFileInput): Promise<SaveOutcome> {
  const native = window.AndroidBackup;
  if (native?.compartilharArquivo) {
    const result = native.compartilharArquivo(
      input.fileName, input.base64, input.mime, input.text ?? "",
    );
    return interpret(result, "Escolha o WhatsApp na lista para enviar.");
  }

  const bytes = base64ToBytes(input.base64);
  const file = new File([bytes as BlobPart], input.fileName, { type: input.mime });

  const canShare = typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  if (canShare) {
    try {
      await navigator.share({ files: [file], text: input.text, title: input.title });
      return { ok: true, message: "Documento compartilhado." };
    } catch {
      return { ok: false, message: "Compartilhamento cancelado." };
    }
  }

  downloadBytes(input.fileName, bytes, input.mime);
  return { ok: true, message: `${input.fileName} baixado.` };
}

/**
 * Abre a conversa do WhatsApp com o texto pronto.
 * Sem telefone, cai na tela de escolher o contato.
 */
export async function openWhatsapp(text: string, phone?: string | null): Promise<SaveOutcome> {
  const digits = (phone ?? "").replace(/\D/g, "");
  const target = digits ? (digits.startsWith("55") ? digits : `55${digits}`) : "";

  const native = window.AndroidBackup;
  if (native?.abrirWhatsapp) {
    return interpret(native.abrirWhatsapp(target, text), "WhatsApp aberto.");
  }

  const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
  return { ok: true, message: "WhatsApp aberto." };
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadBytes(fileName: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
