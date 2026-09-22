import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, request } from "undici";
import { imageError } from "../../errors.ts";
import type { LookupFunction } from "node:net";
import type { AddressGuardOutcome, ImageFetchPolicy, ImageTransport } from "../../types/images.ts";

const MAXIMUM_REDIRECTS = 2;
const HTTPS_PROTOCOL = "https:";

const IPV4_OCTET_COUNT = 4;
const BYTE_MAXIMUM = 255;

const parseIpv4 = (address: string): readonly number[] | null => {
  const parts = address.split(".");
  if (parts.length !== IPV4_OCTET_COUNT) {
    return null;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > BYTE_MAXIMUM)) {
    return null;
  }
  return octets;
};

const isBlockedIpv4 = (octets: readonly number[]): boolean => {
  const [first = 0, second = 0] = octets;
  if (first === 0 || first === 10 || first === 127) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 192 && second === 0) {
    return true;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }
  if (first === 198 && (second === 18 || second === 19)) {
    return true;
  }
  if (first >= 224) {
    return true;
  }
  return false;
};

const normaliseIpv6 = (address: string): string => address.toLowerCase().split("%")[0] ?? "";

const isBlockedIpv6 = (address: string): boolean => {
  const normalised = normaliseIpv6(address);
  if (normalised === "::" || normalised === "::1") {
    return true;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalised);
  if (mapped !== null) {
    const octets = parseIpv4(mapped[1] ?? "");
    return octets === null ? true : isBlockedIpv4(octets);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(normalised)) {
    return true;
  }
  if (/^fe[89ab][0-9a-f]:/.test(normalised)) {
    return true;
  }
  if (normalised.startsWith("ff")) {
    return true;
  }
  return false;
};

export const guardAddress = (address: string): AddressGuardOutcome => {
  const family = isIP(address);
  if (family === 0) {
    return { allowed: false, reason: "The resolved value is not an IP address." };
  }
  if (family === 4) {
    const octets = parseIpv4(address);
    if (octets === null || isBlockedIpv4(octets)) {
      return { allowed: false, reason: "The resolved address is not publicly routable." };
    }
    return { allowed: true, reason: null };
  }
  if (isBlockedIpv6(address)) {
    return { allowed: false, reason: "The resolved address is not publicly routable." };
  }
  return { allowed: true, reason: null };
};

export const hostMatchesAllowlist = (host: string, allowlist: readonly string[]): boolean => {
  const candidate = host.toLowerCase();
  return allowlist.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    if (allowed.length === 0) {
      return false;
    }
    return candidate === allowed || candidate.endsWith(`.${allowed}`);
  });
};

export const assertUrlIsFetchable = (url: URL, policy: ImageFetchPolicy): void => {
  if (url.protocol !== HTTPS_PROTOCOL) {
    throw imageError("Remote images must be served over https.", { url: url.href });
  }
  if (!hostMatchesAllowlist(url.hostname, policy.allowlist)) {
    throw imageError("The image host is not in the allowlist.", {
      url: url.href,
      host: url.hostname,
    });
  }
};

export const resolveAllowedAddress = async (hostname: string): Promise<string> => {
  let resolved: readonly { readonly address: string }[];
  try {
    resolved = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw imageError("The image host does not resolve.", { host: hostname });
  }
  if (resolved.length === 0) {
    throw imageError("The image host does not resolve.", { host: hostname });
  }
  for (const entry of resolved) {
    const outcome = guardAddress(entry.address);
    if (!outcome.allowed) {
      throw imageError(outcome.reason ?? "The image host resolves to a blocked address.", {
        host: hostname,
        address: entry.address,
      });
    }
  }
  const first = resolved[0];
  if (first === undefined) {
    throw imageError("The image host does not resolve.", { host: hostname });
  }
  return first.address;
};

const pinnedLookup = (address: string, family: number): LookupFunction => {
  const lookupFunction: LookupFunction = (_hostname, _options, callback) => {
    callback(null, address, family);
  };
  return lookupFunction;
};

export const readBounded = async (
  body: AsyncIterable<Uint8Array>,
  maximumBytes: number,
  url: string,
): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maximumBytes) {
      throw imageError("The image exceeds the configured byte limit.", { url, maximumBytes });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const isRedirect = (statusCode: number): boolean => statusCode >= 300 && statusCode < 400;

const isHeaderList = (value: string | readonly string[] | undefined): value is readonly string[] =>
  Array.isArray(value);

export const redirectTargetOf = (
  location: string | readonly string[] | undefined,
): string | null => {
  const target = isHeaderList(location) ? location[0] : location;
  return target !== undefined && target.length > 0 ? target : null;
};

const liveTransport: ImageTransport = {
  resolve: resolveAllowedAddress,
  request: async (url, options) => {
    const family = isIP(options.address);
    const agent = new Agent({ connect: { lookup: pinnedLookup(options.address, family) } });
    try {
      const response = await request(url, {
        method: "GET",
        dispatcher: agent,
        headersTimeout: options.timeoutMs,
        bodyTimeout: options.timeoutMs,
        headers: { accept: "image/*" },
      });
      return {
        statusCode: response.statusCode,
        location: redirectTargetOf(response.headers["location"]),
        body: response.body,
        discard: () => {
          response.body.destroy();
        },
      };
    } finally {
      await agent.close();
    }
  },
};

export const fetchRemoteImage = async (
  source: string,
  policy: ImageFetchPolicy,
  transport: ImageTransport = liveTransport,
): Promise<Uint8Array> => {
  let current: URL;
  try {
    current = new URL(source);
  } catch {
    throw imageError("The image source is not a valid URL.", { url: source });
  }

  for (let hop = 0; hop <= MAXIMUM_REDIRECTS; hop += 1) {
    assertUrlIsFetchable(current, policy);
    const address = await transport.resolve(current.hostname);
    const response = await transport.request(current, {
      address,
      timeoutMs: policy.timeoutMs,
    });

    if (isRedirect(response.statusCode)) {
      response.discard();
      if (response.location === null) {
        throw imageError("The image redirect carries no destination.", { url: current.href });
      }
      if (hop === MAXIMUM_REDIRECTS) {
        throw imageError("The image exceeds the redirect limit.", {
          url: source,
          maximumRedirects: MAXIMUM_REDIRECTS,
        });
      }
      current = new URL(response.location, current);
      continue;
    }

    if (response.statusCode >= 400) {
      response.discard();
      throw imageError("The image could not be fetched.", {
        url: current.href,
        status: response.statusCode,
      });
    }

    return await readBounded(response.body, policy.maximumBytes, current.href);
  }

  throw imageError("The image exceeds the redirect limit.", {
    url: source,
    maximumRedirects: MAXIMUM_REDIRECTS,
  });
};
