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
