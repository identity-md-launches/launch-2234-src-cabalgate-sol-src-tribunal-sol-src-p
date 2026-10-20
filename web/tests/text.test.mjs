import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const context = {
  TextEncoder,
  TextDecoder,
  Intl,
  Uint8Array,
  ArrayBuffer,
  Buffer,
  module: { exports: {} },
};
vm.runInNewContext(
  fs.readFileSync(new URL("../public/text-check.js", import.meta.url), "utf8"),
  context,
);
const T = context.module.exports;
test("UTF-8 byte limits follow the contract, including multibyte languages", () => {
  assert.equal(T.byteLength("判"), 3);
  assert.equal(T.checkText("判".repeat(93)).ok, true);
  assert.equal(T.checkText("判".repeat(94)).ok, false);
  assert.equal(T.checkText("x".repeat(280)).ok, true);
  assert.equal(T.checkText("x".repeat(281)).ok, false);
  assert.equal(T.checkText("").ok, false);
});
test("refuses invisible controls, default ignorables and reserved markers", () => {
  for (const c of [
    "\n",
    "\t",
    "\u200b",
    "\u202e",
    "\ufe0f",
    "\u00ad",
    "\u034f",
    "\u115f",
  ])
    assert.equal(T.checkText("case" + c).ok, false, c);
  for (const text of ["[PLEA]", "[/plea", "[OBJECTION]", "[please"])
    assert.equal(T.checkText(text).ok, false, text);
  assert.equal(T.checkText("<img src=x onerror=alert(1)>").ok, true);
});
test("letter command interpretation and appeal counter match contract boundaries", () => {
  assert.equal(T.checkLetter("SELL anything").kind, "sell");
  assert.equal(T.checkLetter("SELL anything").ok, true);
  assert.equal(T.checkLetter("sell anything").kind, "plea");
  assert.equal(T.checkLetter("APPEAL honest case").bytes, 11);
  assert.equal(T.checkLetter("APPEAL").ok, false);
  assert.equal(T.checkLetter("NAME").kind, "clear-name");
  assert.equal(T.checkLetter("NAME CAPITAL").ok, false);
});
test("name rules, clear and reserved names", () => {
  assert.equal(T.checkName("").ok, true);
  assert.equal(T.checkName("case_file9").ok, true);
  for (const text of [
    "ab",
    "a".repeat(21),
    "UPPER",
    "a name",
    "cabal",
    "admin",
    "imd",
    "plea",
    "owner",
  ])
    assert.equal(T.checkName(text).ok, false, text);
});
