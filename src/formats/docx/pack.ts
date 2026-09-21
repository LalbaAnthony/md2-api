import { Packer } from "docx";
import type { Document } from "docx";

export const packDocument = async (document: Document): Promise<Uint8Array> => {
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
};
