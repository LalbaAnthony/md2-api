import { XMLParser } from "fast-xml-parser";
import yauzl from "yauzl";

export interface DocxArchive {
  readonly entries: ReadonlyMap<string, string>;
}

export const readDocxArchive = async (body: Buffer): Promise<DocxArchive> =>
  new Promise<DocxArchive>((resolve, reject) => {
    yauzl.fromBuffer(body, { lazyEntries: true }, (openError, zipFile) => {
      if (openError !== null) {
        reject(openError);
        return;
      }
      const entries = new Map<string, string>();
      zipFile.readEntry();
      zipFile.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError !== null) {
            reject(streamError);
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zipFile.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zipFile.on("end", () => {
        resolve({ entries });
      });
      zipFile.on("error", reject);
    });
  });

export const entryOf = (archive: DocxArchive, name: string): string => {
  const content = archive.entries.get(name);
  if (content === undefined) {
    throw new Error(`The archive has no entry named ${name}.`);
  }
  return content;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
});

export const isWellFormedXml = (xml: string): boolean => {
  try {
    parser.parse(xml);
    return true;
  } catch {
    return false;
  }
};

const VOLATILE_ATTRIBUTES = /\s(?:w14:paraId|w14:textId|w:rsidR|w:rsidRDefault|w:rsidP)="[^"]*"/g;

export const normaliseDocumentXml = (xml: string): string =>
  xml
    .replaceAll(VOLATILE_ATTRIBUTES, "")
    .replaceAll(/\r\n/g, "\n")
    .replaceAll(/>\s+</g, ">\n<")
    .trim();

const decodeXmlEntities = (value: string): string =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

export const textOfDocument = (documentXml: string): string =>
  [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1] ?? ""))
    .join("");

export const styleIdsOf = (documentXml: string): readonly string[] =>
  [...documentXml.matchAll(/<w:pStyle w:val="([^"]+)"\s*\/>/g)].map((match) => match[1] ?? "");
