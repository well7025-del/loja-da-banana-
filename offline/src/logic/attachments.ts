import { db, newId, nowIso } from "@/data/db";
import type { Attachment } from "@/data/types";
import { MAX_ATTACHMENT_BYTES } from "@/lib/defaults";
import { BusinessError } from "./codes";
import { base64Bytes, humanSize, pickFile, readAsBase64, shrinkImage } from "./files";

/** Tipos aceitos como documento de autorização. */
export const DOCUMENT_ACCEPT = "image/*,application/pdf";

export type AttachmentRef = { entity: string; entityId: string };

/**
 * Guarda o arquivo no banco local.
 *
 * Imagens passam por redução antes: o anexo viaja dentro do backup em JSON,
 * e uma foto de celular inteira tornaria o arquivo grande demais para o Drive.
 */
export async function attachFile(
  ref: AttachmentRef,
  file: File,
  note?: string | null,
): Promise<Attachment> {
  let data: string;
  let mime = file.type || "application/octet-stream";

  if (mime.startsWith("image/")) {
    const dataUrl = await shrinkImage(file, 1400, 0.72);
    data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    mime = "image/jpeg";
  } else {
    data = await readAsBase64(file);
  }

  const size = base64Bytes(data);
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new BusinessError(
      `O arquivo tem ${humanSize(size)} e o limite é ${humanSize(MAX_ATTACHMENT_BYTES)}. ` +
      "Anexos entram no backup, por isso o limite. Tente uma foto em vez do PDF, " +
      "ou reduza o arquivo antes.",
    );
  }

  const attachment: Attachment = {
    id: newId(),
    entity: ref.entity,
    entityId: ref.entityId,
    name: file.name || "documento",
    mime,
    size,
    data,
    note: note ?? null,
    createdAt: nowIso(),
  };
  await db.attachments.add(attachment);
  return attachment;
}

/** Abre o seletor e já guarda o arquivo escolhido. */
export async function pickAndAttach(
  ref: AttachmentRef,
  accept = DOCUMENT_ACCEPT,
  note?: string | null,
): Promise<Attachment> {
  const picked = await pickFile(accept);
  return attachFile(ref, picked.file, note);
}

/** Move um anexo criado antes de a entidade existir (ex.: na tela de cadastro). */
export async function reassignAttachment(id: string, ref: AttachmentRef) {
  await db.attachments.update(id, { entity: ref.entity, entityId: ref.entityId });
}

export async function listAttachments(ref: AttachmentRef): Promise<Attachment[]> {
  return db.attachments.where("[entity+entityId]").equals([ref.entity, ref.entityId]).toArray();
}

export async function removeAttachment(id: string) {
  await db.attachments.delete(id);
}

export function attachmentUrl(attachment: Attachment): string {
  return `data:${attachment.mime};base64,${attachment.data}`;
}

/** Espaço total ocupado — mostrado na tela de backup. */
export async function attachmentsFootprint(): Promise<{ count: number; bytes: number }> {
  const rows = await db.attachments.toArray();
  return {
    count: rows.length,
    bytes: rows.reduce((total, row) => total + (row.size || 0), 0),
  };
}
