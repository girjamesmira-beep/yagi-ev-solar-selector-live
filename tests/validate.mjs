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
  "#grid-energy-label": "",
  "#grid-time": "",
  "#assumed-sun-hours": "",
  "#assumed-performance": "",
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
assert.equal(elements["#grid-energy-label"].textContent, "Unmet energy", "No-grid shortfall is not presented as available EEU energy");
assert.match(elements["#package-grid"].innerHTML, /Unmet energy/, "No-grid package shortfall is labelled accurately");
assert.doesNotMatch(elements["#package-grid"].innerHTML, /EEU fills|No stationary battery required/, "Off-grid packages do not promise unavailable grid or unconditional battery-free operation");

elements["#sun-hours"].value = "4";
elements["#performance-ratio"].value = "65";
elements["#selector-form"].listeners.input();
assert.equal(elements["#assumed-sun-hours"].textContent, "4.0 PSH/day", "Displayed solar assumptions follow the selected values");
assert.equal(elements["#assumed-performance"].textContent, "65%", "Displayed performance assumption follows the input");

elements["#ev-preset"].value = "atto3-60";
elements["#ev-preset"].listeners.change();
assert.match(decodeURIComponent(elements["#quote-link"].href), /vehicle=BYD ATTO 3/, "The selected vehicle is carried to the quotation form");

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
const quotationScript = new vm.Script(quotation.slice(scriptStart, scriptEnd), { filename: "quotation-inline.js" });
const quoteElements = Object.fromEntries([
  '#quote-form', '#form-target', '#submit-button', '#success', '#solution', '#duration',
  '#loads', '#budget', '#additional', '#ev-model', '#ev-model-field',
  '#solution-old', '#solution-new', '#loads-old', '#loads-new', '#duration-old', '#duration-new',
  '#budget-old', '#budget-new', '#ev-old', '#ev-new', '#additional-old', '#additional-new'
].map(id => [id, new Element()]));
const componentInputs = ['SOFAR hybrid inverter and battery system', 'Sunwoda battery energy storage', 'No preference — please recommend'].map(value => new Element(value));
const evInputs = ['own', 'plan', 'no'].map(value => new Element(value));
evInputs[0].checked = true;
quoteElements['#quote-form'].checkValidity = () => true;
const quoteDocument = {
  querySelector(selector) {
    if (selector === '#no-component-preference') return componentInputs[2];
    if (selector === 'input[name="ev-visible"]:checked') return evInputs.find(input => input.checked);
    assert.ok(selector in quoteElements, `Missing quotation test element: ${selector}`);
    return quoteElements[selector];
  },
  querySelectorAll(selector) {
    if (selector === 'input[name="preferred-component"]') return componentInputs;
    if (selector === 'input[name="ev-visible"]') return evInputs;
    throw new Error(`Unexpected quotation selector: ${selector}`);
  }
};
quotationScript.runInNewContext({document: quoteDocument, URLSearchParams, location: {search:'?solution=sunwoda&vehicle=BYD%20ATTO%203&package=Home%20Storage&message=Existing%20system'}, console});
assert.equal(quoteElements['#solution'].value, 'sunwoda', 'A solution card preselects its solution');
assert.equal(quoteElements['#ev-model'].value, 'BYD ATTO 3', 'EV handoff fills the model field');
assert.equal(componentInputs[1].checked, true, 'Sunwoda card carries the component preference');
assert.match(quoteElements['#additional'].value, /Selected package: Home Storage\n\nExisting system/, 'Package details and the existing summary are both preserved');
quoteElements['#duration'].value = '4-8';
quoteElements['#loads'].value = 'Lights and refrigerator';
quoteElements['#quote-form'].listeners.submit({preventDefault() { throw new Error('Valid quotation should submit'); }});
assert.equal(quoteElements['#solution-new'].value, 'Home Backup', 'New solution choices retain a compatible backend category');
assert.match(quoteElements['#additional-new'].value, /Sunwoda battery energy storage/, 'Component preference is included in the submitted message');
assert.match(quoteElements['#additional-new'].value, /Home Storage/, 'The selected package reaches the submitted message');
componentInputs[2].checked = true;
componentInputs[2].listeners.change();
assert.equal(componentInputs[1].checked, false, 'No preference clears named components');
componentInputs[0].checked = true;
componentInputs[0].listeners.change();
assert.equal(componentInputs[2].checked, false, 'A named component clears no preference');
evInputs[2].listeners.change();
assert.equal(quoteElements['#ev-model-field'].hidden, true, 'No EV hides the model question');
assert.equal(quoteElements['#ev-model'].disabled, true, 'A hidden EV model is excluded from submission');

console.log("All Yagi selector and quotation validation checks passed.");
