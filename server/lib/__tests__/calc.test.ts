import { describe, it, expect } from "vitest";
import {
  roundMoney, roundHours, roundPercent, roundRate,
  parseMoney, parseHours, parseRate, parsePercent,
  addGst, removeGst, gstComponent, gstTriplet, gstTripletFromIncl,
  isGstConsistent, GST_RATE,
} from "../calc.js";

describe("rounding", () => {
  it("roundMoney: 2dp half-up", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1.00);
    expect(roundMoney(100.1234)).toBe(100.12);
  });
  it("roundHours: 2dp", () => {
    expect(roundHours(7.333)).toBe(7.33);
    expect(roundHours(7.999)).toBe(8.00);
  });
  it("roundPercent: 1dp", () => {
    expect(roundPercent(12.15)).toBe(12.2);
    expect(roundPercent(0)).toBe(0);
  });
  it("roundRate: 4dp", () => {
    expect(roundRate(154.3212)).toBe(154.3212);
    expect(roundRate(154.32125)).toBe(154.3213);
  });
});

describe("safe parsing", () => {
  it("parseMoney handles nullish, empty, NaN", () => {
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
    expect(parseMoney("1234.567")).toBe(1234.57);
    expect(parseMoney(42)).toBe(42);
  });
  it("parseHours rounds to 2dp", () => {
    expect(parseHours("160")).toBe(160);
    expect(parseHours("8.333")).toBe(8.33);
  });
  it("parseRate rounds to 4dp", () => {
    expect(parseRate("154.3200")).toBe(154.32);
    expect(parseRate("0")).toBe(0);
  });
  it("parsePercent returns raw value", () => {
    expect(parsePercent("11.5")).toBe(11.5);
    expect(parsePercent(null)).toBe(0);
  });
});

describe("GST helpers", () => {
  it("addGst: 1000 to 1100", () => {
    expect(addGst(1000)).toBe(1100);
  });
  it("removeGst: 1100 to 1000", () => {
    expect(removeGst(1100)).toBe(1000);
  });
  it("gstComponent: extracts GST from incl amount", () => {
    expect(gstComponent(1100)).toBe(100);
  });
  it("gstTriplet from ex-GST", () => {
    const t = gstTriplet(1000);
    expect(t.exGst).toBe(1000);
    expect(t.gst).toBe(100);
    expect(t.inclGst).toBe(1100);
  });
  it("gstTripletFromIncl round-trips", () => {
    const t = gstTripletFromIncl(1100);
    expect(t.inclGst).toBe(1100);
    expect(t.gst).toBe(100);
    expect(t.exGst).toBe(1000);
  });
  it("gstTripletFromIncl: RCTI $5280 incl", () => {
    const t = gstTripletFromIncl(5280);
    expect(t.exGst).toBe(4800);
    expect(t.gst).toBe(480);
    expect(t.inclGst).toBe(5280);
  });
  it("isGstConsistent", () => {
    expect(isGstConsistent(1000, 100, 1100)).toBe(true);
    expect(isGstConsistent(1000, 100, 1105)).toBe(false);
    expect(isGstConsistent(1000, 100, 1101.5)).toBe(true);
  });
  it("GST_RATE is 0.10", () => {
    expect(GST_RATE).toBe(0.10);
  });
});
