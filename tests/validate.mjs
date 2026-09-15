import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

class ClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    next ? this.values.add(name) : this.values.delete(name);
    return next;
  }
  contains(name) { return this.values.has(name); }
}

class Element {
  constructor(value = "") {
    this.value = value;
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.readOnly = false;
    this.href = "";
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.className = "";
    this.classList = new ClassList();
    this.listeners = {};
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  toggleAttribute(name, force) {
    if (name === "readonly") this.readOnly = Boolean(force);
  }
  querySelectorAll() { return []; }
  closest() { return this; }
  appendChild() {}
  remove() {}
  select() {}
}

const values = {
  "#selector-form": "",
  "#ev-preset": "atto1-39",
  "#battery-capacity": "38.88",
  "#consumption": "13.3",
  "#daily-km": "50",
  "#daily-km-output": "",
  "#pv-size": "3.3",
  "#ev-ac-limit": "6.6",
  "#sun-hours": "5.5",
  "#performance-ratio": "78",
  "#grid-options": "",
  "#reset-button": "",
  "#form-error": "",
  "#result-status": "",
  "#daily-energy": "",
  "#solar-coverage": "",
  "#coverage-bar": "",
  ".progress-track": "",
  "#solar-yield": "",
  "#solar-range": "",
  "#solar-time": "",
  "#grid-energy": "",
  "#grid-time": "",
  "#full-charge-days": "",
  "#energy-note": "",
  "#package-grid": "",
  "#quote-link": "",
  "#copy-result": "",
  "#toast": ""
};

const elements = Object.fromEntries(
  Object.entries(values).map(([selector, value]) => [selector, new Element(value)])
);
const gridButtons = [0, 1.5, 3.3, 7].map(value => {
  const button = new Element();
  button.dataset.grid = String(value);
  return button;
});
elements["#grid-options"].querySelectorAll = () => gridButtons;
elements["#selector-form"].reset = () => {};

const document = {
  querySelector(selector) {
    assert.ok(selector in elements, `Missing test element for selector: ${selector}`);
    return elements[selector];
  },
  createElement() { return new Element(); },
  body: new Element(),
  execCommand() { return true; }
};

const context = {
  document,
  navigator: { clipboard: { writeText: async () => {} } },
  window: {},
  console,
  Object,
  Number,
  Math,
  Infinity,
  encodeURIComponent,
  setTimeout,
  clearTimeout
};

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
new vm.Script(source, { filename: "app.js" }).runInNewContext(context);

assert.equal(elements["#daily-energy"].textContent, "7.4", "Default daily wall energy");
assert.equal(elements["#solar-yield"].textContent, "14.2 kWh", "Default PV yield");
assert.equal(elements["#solar-coverage"].textContent, "100%", "Default coverage");
assert.equal(elements["#result-status"].textContent, "Solar sized", "Default status");
assert.match(elements["#package-grid"].innerHTML, /Recommended/, "Balanced recommendation rendered");
assert.match(elements["#package-grid"].innerHTML, /3\.30/, "Balanced minimum PV rendered");
assert.ok(elements["#quote-link"].href.startsWith("quotation.html?solution=ev&message="), "Quotation action rendered");

elements["#ev-preset"].value = "custom";
elements["#ev-preset"].listeners.change();
assert.equal(elements["#battery-capacity"].readOnly, false, "Custom battery is editable");
assert.equal(elements["#consumption"].readOnly, false, "Custom consumption is editable");
assert.equal(elements["#ev-ac-limit"].readOnly, false, "Custom AC limit is editable");

elements["#battery-capacity"].value = "2";
elements["#selector-form"].listeners.input();
assert.equal(elements["#form-error"].hidden, false, "Invalid capacity shows an error");

elements["#battery-capacity"].value = "40";
elements["#consumption"].value = "15";
elements["#ev-ac-limit"].value = "7";
elements["#pv-size"].value = "0";
elements["#daily-km"].value = "50";
elements["#grid-options"].listeners.click({ target: gridButtons[0] });
assert.equal(elements["#result-status"].textContent, "No charging source", "No-source warning");
assert.ok(elements["#result-status"].classList.contains("danger"), "No-source danger style");

elements["#daily-km"].value = "0";
elements["#selector-form"].listeners.input();
assert.equal(elements["#result-status"].textContent, "No daily driving", "Zero-distance state");

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const selectors = [...source.matchAll(/querySelector\("#([^"]+)"\)/g)].map(match => match[1]);
for (const id of selectors) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `#${id} exists in HTML`);
}

const quotation = fs.readFileSync(new URL("../quotation.html", import.meta.url), "utf8");
assert.ok(quotation.includes("https://docs.google.com/forms/d/e/1FAIpQLScP64ibl_RW72o1QOQr9q_LKEXH3UpVWrXDtYoL1vCDFNB9_w/formResponse"), "Google Form submission endpoint");
assert.ok(quotation.includes("SOFAR hybrid inverter and battery system"), "SOFAR preference is available");
assert.ok(quotation.includes("Sunwoda battery energy storage"), "Sunwoda preference is available");
assert.ok(quotation.includes("Preferred technology / components:"), "Component preferences are included in the submitted message");
const requiredEntries = [
  "2134175683", "1897243161", "1076194012", "1102093466",
  "1453989242", "1423461646", "7995339", "638495039",
  "650185134", "1730307398", "925040860", "855594346",
  "1070138648", "1782217784", "13798507", "1351191803", "1377578864"
];
for (const entry of requiredEntries) {
  assert.ok(quotation.includes(`name="entry.${entry}"`), `Google field entry.${entry} is mapped`);
}
const scriptStart = quotation.lastIndexOf("<script>") + "<script>".length;
const scriptEnd = quotation.indexOf("</script>", scriptStart);
assert.ok(scriptStart > 7 && scriptEnd > scriptStart, "Quotation interaction script exists");
new vm.Script(quotation.slice(scriptStart, scriptEnd), { filename: "quotation-inline.js" });

console.log("All Yagi selector and quotation validation checks passed.");
