import { describe, expect, it } from "vitest";
import {
  assertUrlIsFetchable,
  fetchRemoteImage,
  guardAddress,
  hostMatchesAllowlist,
  isRedirect,
  readBounded,
  redirectTargetOf,
  resolveAllowedAddress,
} from "../../src/pipeline/normalize/image-fetch.ts";
import { isAppError } from "../../src/errors.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { ImageTransport } from "../../src/types/images.ts";

const expectImageError = async (call: () => Promise<unknown>, fragment: string): Promise<void> => {
  try {
    await call();
    expect.unreachable(`Expected an image error mentioning ${fragment}.`);
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    if (isAppError(thrown)) {
      expect(thrown.code).toBe("IMAGE_ERROR");
      expect(`${thrown.message} ${JSON.stringify(thrown.details)}`).toContain(fragment);
    }
  }
};

describe("blocking private and special addresses", () => {
  const blocked: readonly string[] = [
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.0.1",
    "192.168.255.254",
    "169.254.169.254",
    "169.254.0.1",
    "0.0.0.0",
    "100.64.0.1",
    "192.0.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
  ];

  it.each(blocked)("blocks %s", (address) => {
    expect(guardAddress(address).allowed).toBe(false);
  });

  const blockedIpv6: readonly string[] = [
    "::1",
    "::",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
  ];

  it.each(blockedIpv6)("blocks the IPv6 address %s", (address) => {
    expect(guardAddress(address).allowed).toBe(false);
  });

  it("gives a reason for every refusal", () => {
    const outcome = guardAddress("169.254.169.254");
    expect(outcome.reason).toBeTruthy();
  });

  it("rejects a value that is not an address at all", () => {
    expect(guardAddress("example.com").allowed).toBe(false);
    expect(guardAddress("").allowed).toBe(false);
    expect(guardAddress("999.1.1.1").allowed).toBe(false);
  });
});

describe("allowing public addresses", () => {
  const allowed: readonly string[] = [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "192.167.0.1",
    "192.169.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ];

  it.each(allowed)("allows %s", (address) => {
    expect(guardAddress(address).allowed).toBe(true);
  });
});

describe("the host allowlist", () => {
  const allowlist = ["cdn.example.com", "images.example.org"];

  it("matches an exact host", () => {
    expect(hostMatchesAllowlist("cdn.example.com", allowlist)).toBe(true);
  });

  it("matches a subdomain of an allowed host", () => {
    expect(hostMatchesAllowlist("eu.cdn.example.com", allowlist)).toBe(true);
  });

  it("is case insensitive", () => {
    expect(hostMatchesAllowlist("CDN.Example.COM", allowlist)).toBe(true);
  });

  it("refuses a host that merely ends with the same letters", () => {
    expect(hostMatchesAllowlist("evilcdn.example.com.attacker.net", allowlist)).toBe(false);
    expect(hostMatchesAllowlist("notcdn.example.com".replace("notcdn", "xcdn"), allowlist)).toBe(
      false,
    );
  });

  it("refuses an unrelated host", () => {
    expect(hostMatchesAllowlist("attacker.net", allowlist)).toBe(false);
  });

  it("refuses everything when the allowlist is empty", () => {
    expect(hostMatchesAllowlist("cdn.example.com", [])).toBe(false);
    expect(hostMatchesAllowlist("cdn.example.com", ["  "])).toBe(false);
  });
});

describe("the URL guard", () => {
  const policy = strictImagePolicy({ allowRemote: true, allowlist: ["cdn.example.com"] });

  it("accepts an allowed https URL", () => {
    expect(() => {
      assertUrlIsFetchable(new URL("https://cdn.example.com/a.png"), policy);
    }).not.toThrow();
  });

  it("refuses plain http", () => {
    expect(() => {
      assertUrlIsFetchable(new URL("http://cdn.example.com/a.png"), policy);
    }).toThrow();
  });

  it("refuses a file URL", () => {
    expect(() => {
      assertUrlIsFetchable(new URL("file:///etc/passwd"), policy);
    }).toThrow();
  });

  it("refuses a host outside the allowlist", () => {
    expect(() => {
      assertUrlIsFetchable(new URL("https://attacker.net/a.png"), policy);
    }).toThrow();
  });

  it("refuses a credential carrying URL to an allowed host", () => {
    expect(() => {
      assertUrlIsFetchable(new URL("https://user:pass@attacker.net/a.png"), policy);
    }).toThrow();
  });
});

describe("resolution guards", () => {
  it("refuses a host that resolves to loopback", async () => {
    await expectImageError(async () => resolveAllowedAddress("localhost"), "routable");
  });

  it("refuses a host that does not resolve", async () => {
    await expectImageError(
      async () => resolveAllowedAddress("this-host-does-not-exist.invalid"),
      "",
    );
  });
});

describe("the fetch entry point", () => {
  const policy = strictImagePolicy({ allowRemote: true, allowlist: ["localhost", "metadata"] });

  it("refuses a URL that is not parseable", async () => {
    await expectImageError(async () => fetchRemoteImage("not a url", policy), "valid URL");
  });

  it("refuses plain http before touching the network", async () => {
    await expectImageError(async () => fetchRemoteImage("http://localhost/a.png", policy), "https");
  });

  it("refuses the cloud metadata host before touching the network", async () => {
    await expectImageError(
      async () => fetchRemoteImage("https://169.254.169.254/latest/meta-data/", policy),
      "allowlist",
    );
  });

  it("refuses a loopback host even when the allowlist names it", async () => {
    await expectImageError(
      async () => fetchRemoteImage("https://localhost/a.png", policy),
      "routable",
    );
  });
});

describe("the bounded read", () => {
  const streamOf = (chunks: readonly Uint8Array[]): AsyncIterable<Uint8Array> => ({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  });

  it("returns the bytes when they fit", async () => {
    const bytes = await readBounded(
      streamOf([Uint8Array.from([1, 2]), Uint8Array.from([3])]),
      8,
      "u",
    );
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("accepts a payload exactly at the limit", async () => {
    const bytes = await readBounded(streamOf([Uint8Array.from([1, 2, 3])]), 3, "u");
    expect(bytes.byteLength).toBe(3);
  });

  it("stops as soon as the limit is passed", async () => {
    let delivered = 0;
    const counting: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < 100; index += 1) {
          delivered += 1;
          yield Uint8Array.from([1, 2, 3, 4]);
        }
      },
    };
    await expectImageError(async () => readBounded(counting, 8, "u"), "byte limit");
    expect(delivered).toBeLessThan(5);
  });
});

describe("redirect handling", () => {
  it("recognises the redirect status codes", () => {
    expect(isRedirect(301)).toBe(true);
    expect(isRedirect(302)).toBe(true);
    expect(isRedirect(307)).toBe(true);
    expect(isRedirect(308)).toBe(true);
    expect(isRedirect(200)).toBe(false);
    expect(isRedirect(404)).toBe(false);
    expect(isRedirect(500)).toBe(false);
  });

  it("reads the destination from the header", () => {
    expect(redirectTargetOf("https://cdn.example.com/b.png")).toBe("https://cdn.example.com/b.png");
    expect(redirectTargetOf(["https://cdn.example.com/b.png"])).toBe(
      "https://cdn.example.com/b.png",
    );
  });

  it("reports a missing or empty destination", () => {
    expect(redirectTargetOf(undefined)).toBeNull();
    expect(redirectTargetOf("")).toBeNull();
    expect(redirectTargetOf([])).toBeNull();
  });
});

describe("the guarded redirect chain", () => {
  const policy = strictImagePolicy({
    allowRemote: true,
    allowlist: ["cdn.example.com", "images.example.org"],
  });

  const bodyOf = (bytes: readonly number[]): AsyncIterable<Uint8Array> => ({
    async *[Symbol.asyncIterator]() {
      yield Uint8Array.from(bytes);
    },
  });

  const transportOf = (
    responses: readonly { status: number; location?: string; bytes?: readonly number[] }[],
  ): { transport: ImageTransport; visited: string[]; resolved: string[] } => {
    const visited: string[] = [];
    const resolved: string[] = [];
    let index = 0;
    const transport: ImageTransport = {
      resolve: async (hostname) => {
        resolved.push(hostname);
        await Promise.resolve();
        return "93.184.216.34";
      },
      request: async (url) => {
        visited.push(url.href);
        const next = responses[index] ?? { status: 200, bytes: [1] };
        index += 1;
        await Promise.resolve();
        return {
          statusCode: next.status,
          location: next.location ?? null,
          body: bodyOf(next.bytes ?? [1, 2, 3]),
          discard: () => undefined,
        };
      },
    };
    return { transport, visited, resolved };
  };

  it("returns the bytes of a direct response", async () => {
    const { transport } = transportOf([{ status: 200, bytes: [9, 8, 7] }]);
    const bytes = await fetchRemoteImage("https://cdn.example.com/a.png", policy, transport);
    expect([...bytes]).toEqual([9, 8, 7]);
  });

  it("follows two redirects and validates every hop", async () => {
    const { transport, visited, resolved } = transportOf([
      { status: 302, location: "https://images.example.org/b.png" },
      { status: 301, location: "https://cdn.example.com/c.png" },
      { status: 200, bytes: [4] },
    ]);
    const bytes = await fetchRemoteImage("https://cdn.example.com/a.png", policy, transport);
    expect([...bytes]).toEqual([4]);
    expect(visited).toEqual([
      "https://cdn.example.com/a.png",
      "https://images.example.org/b.png",
      "https://cdn.example.com/c.png",
    ]);
    expect(resolved).toHaveLength(3);
  });

  it("refuses a third redirect", async () => {
    const { transport } = transportOf([
      { status: 302, location: "https://cdn.example.com/b.png" },
      { status: 302, location: "https://cdn.example.com/c.png" },
      { status: 302, location: "https://cdn.example.com/d.png" },
    ]);
    await expectImageError(
      async () => fetchRemoteImage("https://cdn.example.com/a.png", policy, transport),
      "redirect limit",
    );
  });

  it("refuses a redirect that leaves the allowlist", async () => {
    const { transport, visited } = transportOf([
      { status: 302, location: "https://attacker.net/b.png" },
    ]);
    await expectImageError(
      async () => fetchRemoteImage("https://cdn.example.com/a.png", policy, transport),
      "allowlist",
    );
    expect(visited).toHaveLength(1);
  });

  it("refuses a redirect that drops to plain http", async () => {
    const { transport } = transportOf([{ status: 302, location: "http://cdn.example.com/b.png" }]);
    await expectImageError(
      async () => fetchRemoteImage("https://cdn.example.com/a.png", policy, transport),
      "https",
    );
  });

  it("refuses a redirect without a destination", async () => {
    const { transport } = transportOf([{ status: 302 }]);
    await expectImageError(
      async () => fetchRemoteImage("https://cdn.example.com/a.png", policy, transport),
      "destination",
    );
  });

  it("refuses an error status", async () => {
    const { transport } = transportOf([{ status: 404 }]);
    await expectImageError(
      async () => fetchRemoteImage("https://cdn.example.com/a.png", policy, transport),
      "404",
    );
  });

  it("applies the byte limit to the response body", async () => {
    const { transport } = transportOf([{ status: 200, bytes: [1, 2, 3, 4, 5] }]);
    await expectImageError(
      async () =>
        fetchRemoteImage(
          "https://cdn.example.com/a.png",
          strictImagePolicy({ ...policy, maximumBytes: 2 }),
          transport,
        ),
      "byte limit",
    );
  });
});
