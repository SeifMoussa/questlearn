import { averageScore, completionRate, correctRate, hintViewRate, toCsv } from "../../src/reports/report-formula";

describe("report formula (unit)", () => {
  describe("completionRate", () => {
    it("3 of 4 assigned submitted = 0.75", () => {
      expect(completionRate(4, 3)).toBeCloseTo(0.75);
    });

    it("nothing assigned returns null, not 0", () => {
      expect(completionRate(0, 0)).toBeNull();
    });

    it("everyone submitted = 1.0", () => {
      expect(completionRate(5, 5)).toBeCloseTo(1.0);
    });
  });

  describe("averageScore", () => {
    it("mean of several scores", () => {
      // (1.0 + 0.5 + 0.75) / 3 = 0.75
      expect(averageScore([1.0, 0.5, 0.75])).toBeCloseTo(0.75);
    });

    it("empty list returns null, not 0", () => {
      expect(averageScore([])).toBeNull();
    });

    it("single score returns itself", () => {
      expect(averageScore([0.6])).toBeCloseTo(0.6);
    });
  });

  describe("correctRate", () => {
    it("3 of 5 correct = 0.6", () => {
      expect(correctRate(3, 5)).toBeCloseTo(0.6);
    });

    it("zero total returns null, not 0", () => {
      expect(correctRate(0, 0)).toBeNull();
    });
  });

  describe("hintViewRate", () => {
    it("1 of 4 hint-viewed = 0.25", () => {
      expect(hintViewRate(1, 4)).toBeCloseTo(0.25);
    });

    it("zero total returns null, not 0", () => {
      expect(hintViewRate(0, 0)).toBeNull();
    });
  });

  describe("toCsv", () => {
    interface Row {
      name: string;
      score: number;
    }
    const columns = [
      { header: "Name", value: (r: Row) => r.name },
      { header: "Score", value: (r: Row) => r.score },
    ];

    it("encodes a header row and one line per row, CRLF-terminated", () => {
      const csv = toCsv<Row>([{ name: "Avery", score: 0.8 }], columns);
      expect(csv).toBe("Name,Score\r\nAvery,0.8\r\n");
    });

    it("empty rows still produces just the header line", () => {
      const csv = toCsv<Row>([], columns);
      expect(csv).toBe("Name,Score\r\n");
    });

    it("quotes and doubles internal quotes for a value containing a comma", () => {
      const csv = toCsv<Row>([{ name: "Rivera, Sam", score: 1 }], columns);
      expect(csv).toBe('Name,Score\r\n"Rivera, Sam",1\r\n');
    });

    it("quotes a value containing a double quote, doubling it", () => {
      const csv = toCsv<Row>([{ name: 'The "Best" Class', score: 1 }], columns);
      expect(csv).toBe('Name,Score\r\n"The ""Best"" Class",1\r\n');
    });

    it("quotes a value containing a newline", () => {
      const csv = toCsv<Row>([{ name: "Line1\nLine2", score: 1 }], columns);
      expect(csv).toBe('Name,Score\r\n"Line1\nLine2",1\r\n');
    });

    it("leaves a plain value unquoted", () => {
      const csv = toCsv<Row>([{ name: "Avery Kim", score: 0.5 }], columns);
      expect(csv).toBe("Name,Score\r\nAvery Kim,0.5\r\n");
    });
  });
});
