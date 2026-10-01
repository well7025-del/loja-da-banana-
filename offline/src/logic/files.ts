/**
 * Escolha e leitura de arquivos.
 *
 * Dentro do APK quem abre o seletor é o próprio WebView (via
 * `onShowFileChooser` do lado Android), então o mesmo `<input type="file">`
 * funciona no celular e no navegador.
 */

export type PickedFile = { name: string; mime: string; size: number; file: File };

export function pickFile(accept: string, capture?: "environment" | "user"): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.capture = capture;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);

    const cleanup = () => { input.remove(); };

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) { reject(new Error("Nenhum arquivo escolhido.")); return; }
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        file,
      });
    };
    input.oncancel = () => { cleanup(); reject(new Error("Nenhum arquivo escolhido.")); };
    input.click();
  });
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    // Extratos de banco costumam vir em Latin-1; o UTF-8 inválido vira "�".
    reader.readAsText(file, "utf-8");
  });
}

/** Segunda tentativa quando o texto veio com caracteres quebrados. */
export function readAsLatin1(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file, "windows-1252");
  });
}

/** Lê o arquivo escolhendo a codificação que não produzir caracteres inválidos. */
export async function readTextSmart(file: File): Promise<string> {
  const utf8 = await readAsText(file);
  if (!utf8.includes("�")) return utf8;
  try {
    return await readAsLatin1(file);
  } catch {
    return utf8;
  }
}

export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Reduz a foto antes de guardar.
 *
 * Sem isso uma foto de celular (3 a 5 MB) entraria inteira no backup, que é
 * um único JSON enviado ao Drive. 900 px de lado resolve para a tela e para
 * o catálogo impresso.
 */
export async function shrinkImage(
  file: File,
  maxSide = 900,
  quality = 0.72,
): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);

  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Fundo branco: JPEG não tem transparência e PNG transparente ficaria preto.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("O arquivo escolhido não é uma imagem válida."));
    image.src = src;
  });
}

/** Tamanho aproximado, em bytes, de um conteúdo em base64. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
