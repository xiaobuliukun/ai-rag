import {
  getAutoBrightnessPercent,
  getEffectiveBrightnessPercent,
} from './reader-preferences';

describe('reader preferences', () => {
  it('suggests softer brightness outside daytime', () => {
    expect(getAutoBrightnessPercent(new Date('2026-06-26T23:00:00'))).toBe(88);
    expect(getAutoBrightnessPercent(new Date('2026-06-26T07:00:00'))).toBe(94);
    expect(getAutoBrightnessPercent(new Date('2026-06-26T20:00:00'))).toBe(92);
    expect(getAutoBrightnessPercent(new Date('2026-06-26T12:00:00'))).toBe(100);
  });

  it('uses auto brightness as an upper bound', () => {
    expect(
      getEffectiveBrightnessPercent(
        108,
        true,
        new Date('2026-06-26T23:00:00'),
      ),
    ).toBe(88);
    expect(
      getEffectiveBrightnessPercent(
        84,
        true,
        new Date('2026-06-26T23:00:00'),
      ),
    ).toBe(84);
    expect(
      getEffectiveBrightnessPercent(
        108,
        false,
        new Date('2026-06-26T23:00:00'),
      ),
    ).toBe(108);
  });
});
