import {describe, expect, it} from "vitest";
import {NextRequest} from "next/server";
import {proxy} from "../../src/proxy";

const host = "https://feasta-web.vercel.app";
const provider = "IqJ2lbW28Mhp0giZxUUOSw9V7V13";

function check(path: string, method = "GET") {
  return proxy(
    new NextRequest(`${host}${path}`, {method}),
  );
}

describe("public provider Reviews proxy access", () => {
  it("allows guest GET requests to the public Reviews API", () => {
    const response = check(
      `/customer/providers/${provider}/reviews`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows the same public route with a trailing slash", () => {
    const response = check(
      `/customer/providers/${provider}/reviews/`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not grant guest POST access to public Reviews", () => {
    const response = check(
      `/customer/providers/${provider}/reviews`,
      "POST",
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("does not grant access to adjacent customer routes", () => {
    const response = check(
      `/customer/providers/${provider}/reviews/private`,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("does not grant access to arbitrary customer booking routes", () => {
    const response = check("/customer/bookings");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});