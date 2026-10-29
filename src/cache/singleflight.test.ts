import { describe, expect, it } from "vitest";

import { Singleflight } from "./singleflight.js";

describe("Singleflight (FR-CACHE-003)", () => {
  it("runs the loader once for concurrent callers of the same key", async () => {
    const sf = new Singleflight();
    let loads = 0;
    const load = (): Promise<string> => {
      loads += 1;
      return new Promise((resolve) => {
        setImmediate(() => {
          resolve("snap");
        });
      });
    };

    const results = await Promise.all([
      sf.do("flags:p:dev", load),
      sf.do("flags:p:dev", load),
      sf.do("flags:p:dev", load),
    ]);

    expect(loads).toBe(1);
    expect(results).toEqual(["snap", "snap", "snap"]);
    expect(sf.size).toBe(0);
  });

  it("does not share loaders across different keys", async () => {
    const sf = new Singleflight();
    let loads = 0;
    const load = (value: string): Promise<string> => {
      loads += 1;
      return Promise.resolve(value);
    };

    const [a, b] = await Promise.all([sf.do("a", () => load("A")), sf.do("b", () => load("B"))]);

    expect(loads).toBe(2);
    expect(a).toBe("A");
    expect(b).toBe("B");
  });
});
