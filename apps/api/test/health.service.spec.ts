import { Test } from "@nestjs/testing";
import { HealthService } from "../src/health/health.service";
import { ENV } from "../src/config/env.module";

const mockQuery = jest.fn();
const mockPoolEnd = jest.fn();
const mockPing = jest.fn();
const mockDisconnect = jest.fn();
const mockConnect = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: mockPoolEnd,
  })),
}));

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    status: "ready",
    ping: mockPing,
    disconnect: mockDisconnect,
    connect: mockConnect,
  }));
});

describe("HealthService", () => {
  const testEnv = {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "postgres://user:pass@localhost:5432/questlearn",
    REDIS_URL: "redis://localhost:6379",
    CSRF_SECRET: "test-csrf-secret-value",
  };

  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: ENV, useValue: testEnv }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it("reports database as connected when the query succeeds", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const status = await service.checkDatabase();
    expect(status).toBe("connected");
    expect(mockQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("reports database as disconnected when the query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    const status = await service.checkDatabase();
    expect(status).toBe("disconnected");
  });

  it("reports redis as connected when PING returns PONG", async () => {
    mockPing.mockResolvedValueOnce("PONG");
    const status = await service.checkRedis();
    expect(status).toBe("connected");
  });

  it("reports redis as disconnected when PING throws", async () => {
    mockPing.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const status = await service.checkRedis();
    expect(status).toBe("disconnected");
  });

  it("assembles a full report reflecting real dependency status", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockPing.mockResolvedValueOnce("PONG");

    const report = await service.getReport();

    expect(report).toMatchObject({
      web: "running",
      api: "connected",
      database: "connected",
      redis: "connected",
      environment: "test",
    });
    expect(typeof report.timestamp).toBe("string");
  });
});
