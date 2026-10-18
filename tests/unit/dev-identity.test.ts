import { describe, it, expect } from "vitest";
import { developmentIdentity } from "../../src/server/dev-identity";
describe("M0 A-FOUND-1 development identity", () => {
  it("requires explicit opt in and loopback", () => {
    expect(developmentIdentity({}, "localhost")).toBeNull();
    expect(
      developmentIdentity(
        { SPLITCART_DEV_AUTH: "1", NODE_ENV: "development" },
        "127.0.0.1",
      ),
    ).toBe("splitcart-local");
    expect(() =>
      developmentIdentity({ SPLITCART_DEV_AUTH: "1" }, "example.com"),
    ).toThrow("loopback");
  });
  it("refuses production", () =>
    expect(() =>
      developmentIdentity(
        { SPLITCART_DEV_AUTH: "1", NODE_ENV: "production" },
        "localhost",
      ),
    ).toThrow("production"));
});
