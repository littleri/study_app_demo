import { describe, expect, it } from "vitest";
import { isCompleteDiagnosis, toggleDiagnosisValue, type SetDiagnosis } from "./model";

const diagnosis: SetDiagnosis = {
  urgency: "steady",
  timePattern: "block",
  goals: ["systematic"],
  contentFoci: ["principles"],
  aids: ["chat"],
  reviews: ["periodic"]
};

describe("learning set diagnosis", () => {
  it("requires an answer in all six categories", () => {
    expect(isCompleteDiagnosis(diagnosis)).toBe(true);
    expect(isCompleteDiagnosis({ ...diagnosis, aids: [] })).toBe(false);
    expect(isCompleteDiagnosis({ ...diagnosis, urgency: undefined })).toBe(false);
  });

  it("keeps multi-selection order and makes free review exclusive", () => {
    expect(toggleDiagnosisValue(["periodic", "mistakes"], "free")).toEqual(["free"]);
    expect(toggleDiagnosisValue(["free"], "notes")).toEqual(["notes"]);
    expect(toggleDiagnosisValue(["periodic", "mistakes"], "periodic")).toEqual(["mistakes"]);
  });
});
