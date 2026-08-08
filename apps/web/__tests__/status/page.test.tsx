import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import StatusPage from "../../src/app/status/page";
import * as health from "../../src/lib/health";

describe("StatusPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a loading state before the health check resolves", () => {
    jest.spyOn(health, "fetchHealth").mockReturnValue(new Promise(() => {}));
    render(<StatusPage />);
    expect(screen.getByTestId("status-loading")).toBeInTheDocument();
  });

  it("renders the connected checkpoint line once the API responds", async () => {
    jest.spyOn(health, "fetchHealth").mockResolvedValue({
      web: "running",
      api: "connected",
      database: "connected",
      redis: "connected",
      environment: "development",
      timestamp: new Date().toISOString(),
    });

    render(<StatusPage />);

    await waitFor(() =>
      expect(screen.getByTestId("status-line")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("status-line")).toHaveTextContent(
      "QuestLearn — Web: Running / API: Connected / Database: Connected / Redis: Connected / Environment: Development",
    );
  });

  it("renders a degraded state without crashing when the API is unreachable", async () => {
    jest.spyOn(health, "fetchHealth").mockRejectedValue(new Error("network"));

    render(<StatusPage />);

    await waitFor(() =>
      expect(screen.getByTestId("status-line")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("status-line")).toHaveTextContent(
      "API: Disconnected",
    );
  });
});
