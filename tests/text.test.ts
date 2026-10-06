import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { binHash, cleanAbilityText, parseTraitText, resolvePlaceholders, sentenceMatching, slugify } from "../scripts/lib/text.ts";

describe("text helpers", () => {
  it("hashes names like Riot's bin files", () => {
    assert.equal(binHash("BonusDamagePercentBase"), "a9a813e7");
    assert.equal(binHash("HunterAD"), "641254b6");
  });

  it("slugifies champion names", () => {
    assert.equal(slugify("Kha'Zix"), "khazix");
    assert.equal(slugify("Master Yi"), "masteryi");
    assert.equal(slugify("Nunu & Willump"), "nunuwillump");
  });

  it("cleans ability markup", () => {
    const raw =
      "<Bright>Adaptor </Bright>%i:scaleAD%<Bright>:</Bright> Throw kunai, dealing @PhysicalDamageCalc1@ %i:scaleAD%%i:scaleAP% physical damage.\\n\\n<dim>Adaptor </dim>%i:scaleAP%<dim>: Cast again.</dim>";
    assert.equal(cleanAbilityText(raw), "Adaptor (AD): Throw kunai, dealing X physical damage.\n\nAdaptor (AP): Cast again.");
  });

  it("resolves placeholders by name or hash", () => {
    const vars = { Omnivamp: 0.1, "{a9a813e7}": 0.25 };
    assert.equal(resolvePlaceholders("@Omnivamp*100@% and @BonusDamagePercentBase*100@%", vars), "10% and 25%");
    assert.equal(resolvePlaceholders("@Missing@ gold", vars), "X gold");
  });

  it("splits trait text into breakpoints", () => {
    const { text, breakpoints } = parseTraitText(
      "Ravagers gain @Omnivamp*100@% Omnivamp.<br><row>(@MinUnits@) @Bonus*100@% Bonus Damage</row><br><row>(@MinUnits@) @Bonus*100@%  OR</row>",
      [
        { minUnits: 2, variables: { Omnivamp: 0.1, Bonus: 0.12 } },
        { minUnits: 4, variables: { Omnivamp: 0.1, Bonus: 0.25 } },
      ]
    );
    assert.equal(text, "Ravagers gain 10% Omnivamp.");
    assert.deepEqual(breakpoints, [
      { units: 2, text: "12% Bonus Damage" },
      { units: 4, text: "25%" },
    ]);
  });

  it("finds the sentence that matches a pattern", () => {
    const text = "Gain a Shield. Then bash the target, Stunning them for X seconds. Heal.";
    assert.equal(sentenceMatching(text, /stun/i), "Then bash the target, Stunning them for X seconds.");
    assert.equal(sentenceMatching(text, /burn/i), null);
  });
});
