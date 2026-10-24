import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("pembatasan percobaan login", () => {
  it("membatasi percobaan masuk berulang dari alamat yang sama", async () => {
    const results = await Promise.all(
      Array.from({ length: 11 }, () => request(app).post("/api/auth/login").send({
        email: "tidak-ada@example.test",
        password: "password123",
      })),
    );

    expect(results.filter((result) => result.status === 429)).toHaveLength(1);
    expect(results.some((result) => result.status === 401)).toBe(true);
  });
});
