import { describe, it, expect } from "vitest";
import { defaultDermatologyForm, defaultCosmetologyForm } from "../../lib/defaultFormConfig";

describe("defaultDermatologyForm", () => {
  it("has 6 sections", () => {
    expect(defaultDermatologyForm).toHaveLength(6);
  });

  it("sections are ordered sequentially from 1 to 6", () => {
    const orders = defaultDermatologyForm.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("all sections are enabled by default", () => {
    expect(defaultDermatologyForm.every((s) => s.enabled)).toBe(true);
  });

  it("has unique section names", () => {
    const names = defaultDermatologyForm.map((s) => s.sectionName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("patientInfo section has complaint as required", () => {
    const patientInfo = defaultDermatologyForm.find((s) => s.sectionName === "patientInfo");
    const complaint = patientInfo?.fields.find((f) => f.fieldName === "complaint");
    expect(complaint?.required).toBe(true);
    expect(complaint?.type).toBe("textarea");
  });

  it("treatmentPlan section includes prescription field with type 'prescription'", () => {
    const treatmentPlan = defaultDermatologyForm.find((s) => s.sectionName === "treatmentPlan");
    const rx = treatmentPlan?.fields.find((f) => f.fieldName === "prescription");
    expect(rx?.type).toBe("prescription");
  });

  it("every field has a fieldName, label, and type", () => {
    for (const section of defaultDermatologyForm) {
      for (const field of section.fields) {
        expect(field.fieldName).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.type).toBeTruthy();
      }
    }
  });

  it("field orders are sequential within each section", () => {
    for (const section of defaultDermatologyForm) {
      const orders = section.fields.map((f) => f.order);
      const expected = Array.from({ length: orders.length }, (_, i) => i + 1);
      expect(orders).toEqual(expected);
    }
  });
});

describe("defaultCosmetologyForm", () => {
  it("has 5 sections", () => {
    expect(defaultCosmetologyForm).toHaveLength(5);
  });

  it("sections are ordered sequentially from 1 to 5", () => {
    const orders = defaultCosmetologyForm.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });

  it("all sections are enabled by default", () => {
    expect(defaultCosmetologyForm.every((s) => s.enabled)).toBe(true);
  });

  it("has unique section names", () => {
    const names = defaultCosmetologyForm.map((s) => s.sectionName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("patientInfo section has skinType as select with Fitzpatrick types", () => {
    const patientInfo = defaultCosmetologyForm.find((s) => s.sectionName === "patientInfo");
    const skinType = patientInfo?.fields.find((f) => f.fieldName === "skinType");
    expect(skinType?.type).toBe("select");
    expect(skinType?.options).toHaveLength(6);
    expect(skinType?.options).toContain("Type I");
    expect(skinType?.options).toContain("Type VI");
  });

  it("aftercare section includes prescription field", () => {
    const aftercare = defaultCosmetologyForm.find((s) => s.sectionName === "aftercare");
    const rx = aftercare?.fields.find((f) => f.fieldName === "prescription");
    expect(rx?.type).toBe("prescription");
  });

  it("consent section has consentConfirmed checkbox", () => {
    const consent = defaultCosmetologyForm.find((s) => s.sectionName === "consent");
    const confirmed = consent?.fields.find((f) => f.fieldName === "consentConfirmed");
    expect(confirmed?.type).toBe("checkbox");
  });

  it("every field has a fieldName, label, and type", () => {
    for (const section of defaultCosmetologyForm) {
      for (const field of section.fields) {
        expect(field.fieldName).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.type).toBeTruthy();
      }
    }
  });
});
