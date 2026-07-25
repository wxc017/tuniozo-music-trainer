import { describe, it, expect } from "vitest";
import { customSolfege } from "./customSolfege";

const at = (edo: number, step: number) => customSolfege((step * 1200) / edo);

describe("customSolfege — region-centered neutral-consonant solfège", () => {
  it("names the 12edo diatonic/chromatic degrees", () => {
    expect(at(12, 0)).toBe("Da");   // unison
    expect(at(12, 2)).toBe("Ra");   // major 2nd
    expect(at(12, 4)).toBe("Ma");   // major 3rd
    expect(at(12, 5)).toBe("Fa");   // perfect 4th
    expect(at(12, 7)).toBe("Sa");   // perfect 5th
    expect(at(12, 9)).toBe("La");   // major 6th
  });

  it("puts the 24edo neutrals on their own -a centers", () => {
    expect(at(24, 3)).toBe("Va");   // neutral 2nd  (150¢)
    expect(at(24, 7)).toBe("Ja");   // neutral 3rd  (350¢)
    expect(at(24, 17)).toBe("Ga");  // neutral 6th  (850¢)
    expect(at(24, 21)).toBe("Wa");  // neutral 7th  (1050¢)
  });

  it("gives every syllable one of the five vowels", () => {
    for (const edo of [12, 19, 22, 24, 31, 41, 53]) {
      for (let s = 0; s < edo; s++) {
        expect(at(edo, s)).toMatch(/[eoaui]$/);
      }
    }
  });
});
