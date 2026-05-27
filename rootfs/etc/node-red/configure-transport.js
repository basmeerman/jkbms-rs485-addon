"use strict";

// Patch the runtime Node-RED flows.json based on the add-on options:
//
//   - If jkbms_path is set, replace the placeholder /dev/JKBMS-Fake in the
//     serial-port config node with the real device path. This stops the
//     spurious "/dev/JKBMS-Fake: No such file or directory" error that
//     Node-RED emits before the runtime reconfigure message arrives.
//
//   - If jkbms_path is empty (TCP-gateway-only deployment), disable the
//     four serial-related nodes so Node-RED never tries to open a device
//     at all.
//
// Idempotent: runs on every container start (after init-nodered copies the
// template flows.json into the userDir).

const fs = require("fs");

const FLOWS_FILE   = process.env.FLOWS_FILE   || "/config/smartphoton_jkbms/flows.json";
const OPTIONS_FILE = process.env.OPTIONS_FILE || "/data/options.json";

const SERIAL_CONFIG_ID = "6e1abcbcc6ebb714";
const SERIAL_NODE_IDS = new Set([
  "6e1abcbcc6ebb714",  // serial-port config
  "40a4e9273c442f86",  // serial in (broadcast tab)
  "2ff9101cca82bbfe",  // serial request (master tab)
  "e3f0242032f1a4c3",  // serial control (runtime reconfigure)
]);

const options   = JSON.parse(fs.readFileSync(OPTIONS_FILE, "utf8"));
const jkbmsPath = (options.jkbms_path || "").trim();
const flows     = JSON.parse(fs.readFileSync(FLOWS_FILE, "utf8"));

let mutated = false;

for (const node of flows) {
  if (node.id === SERIAL_CONFIG_ID && jkbmsPath && node.serialport !== jkbmsPath) {
    node.serialport = jkbmsPath;
    mutated = true;
    console.log(`✅ Set serial-port to ${jkbmsPath}`);
  }
  if (SERIAL_NODE_IDS.has(node.id)) {
    const shouldDisable = !jkbmsPath;
    const isDisabled = node.d === true;
    if (shouldDisable && !isDisabled) {
      node.d = true;
      mutated = true;
      console.log(`🔇 Disabled ${node.type} (${node.id}) — jkbms_path empty, gateway-only`);
    } else if (!shouldDisable && isDisabled) {
      delete node.d;
      mutated = true;
      console.log(`🔊 Re-enabled ${node.type} (${node.id})`);
    }
  }
}

if (mutated) {
  fs.writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2));
}
