#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "modern", "index.js"), "utf8");
let factory;
const alerts = [];
const notifications = [];
const registrations = {};
let sendCalls = 0;
let sendMode = "hang";

const sandbox = {
  Promise,
  Date,
  Error,
  Object,
  Array,
  String,
  RegExp,
  isFinite,
  parseInt,
  zimlet(callback) {
    factory = callback;
  },
  window: {
    setTimeout,
    clearTimeout,
    alert(message) {
      alerts.push(String(message));
    },
    console
  }
};

vm.runInNewContext(source, sandbox, { filename: "modern/index.js" });
assert.strictEqual(typeof factory, "function", "Modern Zimlet factory was not registered");

const config = {
  internalReportAddress: "phishing@example.test",
  simulationDetectionEnabled: "false",
  moveReportedMessage: "false",
  sendTimeoutMs: "30",
  moveTimeoutMs: "30",
  refreshTimeoutMs: "30",
  operationTimeoutMs: "1000",
  reportedMessageCooldownMs: "180",
  sendTimeoutMessage: "SEND_TIMEOUT",
  moveTimeoutMessage: "MOVE_TIMEOUT",
  alreadyReportedMessage: "RECENT_REPORT",
  internalSuccessMessage: "REPORT_OK",
  errorReferenceLabel: "REF"
};

const context = {
  shims: {
    preact: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children };
      }
    },
    "@zimbra-client/components": { ActionMenuItem: "ActionMenuItem" }
  },
  config,
  plugins: {
    register(slot, component) {
      registrations[slot] = component;
    }
  },
  store: {
    dispatch(value) {
      notifications.push(value.message);
    }
  },
  zimletRedux: {
    actions: {
      notifications: {
        notify(value) {
          return value;
        }
      }
    }
  },
  zimbraBatchClient: {
    jsonRequest(request) {
      if (request.name !== "SendMsg") {
        return Promise.resolve({});
      }
      sendCalls += 1;
      if (sendMode === "hang") {
        return new Promise(() => {});
      }
      return Promise.resolve({});
    }
  }
};

const plugin = factory(context);
plugin.init();
const MenuItem = registrations["slot::action-menu-mail-more"];
assert.strictEqual(typeof MenuItem, "function", "Modern action-menu item was not registered");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function click(messageId, action) {
  const vnode = MenuItem({
    emailData: { id: messageId, subject: "Synthetic test", folderId: "2" },
    action
  });
  vnode.props.onClick();
}

(async () => {
  click("101");
  await delay(130);
  assert.strictEqual(sendCalls, 1, "stalled SendMsg was not invoked exactly once");
  assert(alerts.some((message) => message.includes("SEND_TIMEOUT") && message.includes("PR-SEND-TIMEOUT")),
    "stalled SendMsg did not produce the safe timeout message");

  click("101");
  assert.strictEqual(sendCalls, 1, "cooldown did not block an immediate duplicate click");
  assert(notifications.includes("RECENT_REPORT"), "cooldown did not notify the user");

  await delay(190);
  sendMode = "success";
  click("101");
  await delay(20);
  assert.strictEqual(sendCalls, 2, "message did not become reportable after the cooldown");
  assert(notifications.includes("REPORT_OK"), "successful retry did not complete");

  config.moveReportedMessage = "true";
  click("102", () => new Promise(() => {}));
  await delay(130);
  assert(alerts.some((message) => message.includes("MOVE_TIMEOUT") && message.includes("PR-MOVE-TIMEOUT")),
    "stalled move did not produce the safe timeout message");

  click("103", () => Promise.resolve({}));
  await delay(20);
  assert.strictEqual(sendCalls, 4, "busy state was not released after the move timeout");

  console.log("Modern timeout and cooldown tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
