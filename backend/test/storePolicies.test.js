const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeStorePolicies,
  formatStorePolicies,
} = require("../utils/storePolicies");

test("only configured store policy keys are included and values are bounded", () => {
  const policies = normalizeStorePolicies([
    { setting_key: "return_policy", setting_value: " Retur sesuai ketentuan " },
    { setting_key: "unknown_secret", setting_value: "do not expose" },
    { setting_key: "warranty_policy", setting_value: "x".repeat(3001) },
  ]);
  assert.equal(policies.return_policy, "Retur sesuai ketentuan");
  assert.equal(policies.unknown_secret, undefined);
  assert.equal(policies.warranty_policy.length, 3000);
});

test("prompts defer to admin when no policy is configured", () => {
  assert.match(formatStorePolicies({}), /jangan mengarang ketentuannya/i);
});
