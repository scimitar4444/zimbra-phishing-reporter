#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const classicPath = path.join(root, "classic", "org_zimbracommunity_phishing_reporter_classic.js");
const modernPath = path.join(root, "modern", "index.js");

function loadClassic(config, XMLHttpRequestImpl) {
  const source = fs.readFileSync(classicPath, "utf8") +
    "\nthis.ClassicHandler = org_zimbracommunity_phishing_reporter_classic_HandlerObject;";
  function ZmZimletBase() {}
  const alerts = [];
  const sandbox = {
    ZmZimletBase,
    ZmItem: { MSG: "MSG", CONV: "CONV" },
    ZmMailMsg: function ZmMailMsg() {},
    XMLHttpRequest: XMLHttpRequestImpl || function () {},
    AjxCallback: function AjxCallback(scope, fn) {
      this.run = function () { return fn.apply(scope, arguments); };
    },
    AjxListener: function () {},
    window: {
      alert: message => alerts.push(String(message)),
      setTimeout,
      clearTimeout
    },
    console,
    Error,
    encodeURIComponent,
    isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: classicPath });
  const handler = new sandbox.ClassicHandler();
  handler.getConfig = name => Object.prototype.hasOwnProperty.call(config || {}, name) ? config[name] : "";
  return { handler, alerts, sandbox };
}

function classicTests() {
  const config = {
    simulationDetectionEnabled: "true",
    simulationDisclaimerHeader: "X-Disclaimer",
    simulationDisclaimerRules: "provider|simulate phishing;provider|phishing simulation",
    simulationDkimDomains: "training.example.net",
    simulationSourceIndicators: "192.0.2.10,training-mta.example.net",
    classificationTimeoutMs: "1000"
  };
  const { handler } = loadClassic(config);

  const splitResult = {
    "authentication-results": [
      "mx.example.org; dkim=pass header.d=legitimate.example.org",
      "mx.example.org; dkim=fail header.d=training.example.net"
    ],
    "dkim-signature": ["v=1; d=unrelated.example.org; s=test"],
    received: ["from legitimate.example.org (192.0.2.30)"]
  };
  assert.strictEqual(handler._matchesDkim(splitResult, true), false,
    "dkim=pass and the configured domain must belong to the same result clause");
  assert.strictEqual(handler._isSimulation(splitResult), false,
    "mixed Authentication-Results entries must not be combined into a false simulation match");

  const verified = {
    "authentication-results": ["mx.example.org; dkim=pass header.d=training.example.net"],
    "dkim-signature": ["v=1; d=training.example.net; s=test"],
    received: ["from other.example.org"]
  };
  assert.strictEqual(handler._getSimulationMatchReason(verified), "dkim-pass");

  const disclaimer = {
    "x-disclaimer": ["This message was created by Provider to simulate phishing attacks."],
    "authentication-results": ["mx.example.org; dkim=fail header.d=training.example.net"],
    "dkim-signature": ["v=1; d=other.example.org"],
    received: ["from other.example.org"]
  };
  assert.strictEqual(handler._getSimulationMatchReason(disclaimer), "disclaimer");

  const rawAndSource = {
    "authentication-results": ["mx.example.org; dkim=fail header.d=training.example.net"],
    "dkim-signature": ["v=1; a=rsa-sha256;d=training.example.net;s=test"],
    received: ["from training-mta.example.net (192.0.2.10)"]
  };
  assert.strictEqual(handler._getSimulationMatchReason(rawAndSource), "dkim-signature+source");

  assert.strictEqual(handler._needsRawClassificationHeaders({
    "x-disclaimer": ["not a match"],
    "authentication-results": ["mx; dkim=fail header.d=other.example"],
    "dkim-signature": ["v=1; d=other.example"],
    received: ["from other.example"]
  }), false, "raw RFC822 fallback is unnecessary when all configured header families are present");
  assert.strictEqual(handler._needsRawClassificationHeaders({
    "authentication-results": ["mx; dkim=fail header.d=other.example"],
    "dkim-signature": ["v=1; d=other.example"],
    received: ["from other.example"]
  }), true, "missing configured disclaimer header should enable the raw fallback");

  const dkimOnlyHarness = loadClassic({
    simulationDetectionEnabled: "true",
    simulationDisclaimerRules: "",
    simulationDkimDomains: "training.example.net",
    simulationSourceIndicators: ""
  });
  assert.strictEqual(dkimOnlyHarness.handler._needsRawClassificationHeaders({
    "authentication-results": ["mx; dkim=fail header.d=other.example"]
  }), false, "a DKIM signature is not required when no source indicators are configured");

  const msg1 = { isZmMailMsg: true, id: "101", subject: "one" };
  const msg2 = { isZmMailMsg: true, id: "102", subject: "two" };
  const multiConversation = { id: "-10", getMsgList: () => [msg1, msg2] };
  const positiveConversation = { id: "999", type: "CONV", getMsgList: () => [msg1, msg2] };
  const singleConversation = { id: "-11", getMsgList: () => [msg1] };
  assert.strictEqual(handler._getMessage({ getMsg: () => multiConversation }), null,
    "a conversation ID must never be used as a message ID when several messages are present");
  assert.strictEqual(handler._getMessage({ getMsg: () => positiveConversation }), null,
    "a positive conversation ID must not be mistaken for a message ID");
  assert.strictEqual(handler._getMessage({ getMsg: () => singleConversation }), msg1,
    "a conversation containing exactly one real message may be resolved safely");
  assert.strictEqual(handler._getMessage({ getMsg: () => msg2 }), msg2);

  assert.strictEqual(handler._isValidRecipient("security@example.org"), true);
  assert.strictEqual(handler._isValidRecipient("security@example.org\r\nBcc: attacker@example.org"), false);
  assert.strictEqual(handler._isValidRecipient("one@example.org,two@example.org"), false);

  let successCount = 0;
  let errorCount = 0;
  function DoubleEventXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = "";
  }
  DoubleEventXHR.prototype.open = function () {};
  DoubleEventXHR.prototype.send = function () {
    this.status = 200;
    this.readyState = 4;
    this.responseText = "X-Disclaimer: Provider simulate phishing\r\n\r\nBody";
    this.onreadystatechange();
    if (this.onerror) this.onerror(new Error("late duplicate event"));
  };
  const onceHarness = loadClassic(config, DoubleEventXHR);
  onceHarness.handler._loadRawClassificationHeaders("101", {
    run: () => { successCount += 1; }
  }, {
    run: () => { errorCount += 1; }
  });
  assert.strictEqual(successCount, 1, "raw-header callback must run exactly once");
  assert.strictEqual(errorCount, 0, "a late XHR error must not trigger a second completion path");
}

function createModernHarness(config, options = {}) {
  const source = fs.readFileSync(modernPath, "utf8");
  let registeredComponent = null;
  const calls = [];
  const alerts = [];
  const notifications = [];
  let fallbackRefreshCount = 0;

  const context = {
    shims: {
      preact: {
        createElement(component, props, ...children) {
          return { component, props: props || {}, children };
        }
      },
      "@zimbra-client/components": { ActionMenuItem: function ActionMenuItem() {} },
      "@zimbra-client/graphql": {}
    },
    zimletConfig: config || {},
    getAccount: options.getAccount || (() => ({ zimlets: [] })),
    plugins: {
      register(slot, component) {
        assert.strictEqual(slot, "slot::action-menu-mail-more");
        registeredComponent = component;
      }
    },
    zimbraBatchClient: {
      jsonRequest(request) {
        calls.push(request);
        if (typeof options.jsonRequest === "function") {
          return Promise.resolve().then(() => options.jsonRequest(request));
        }
        return Promise.resolve({});
      }
    },
    store: {
      dispatch(action) {
        notifications.push(action.message);
      }
    },
    zimletRedux: {
      actions: {
        notifications: {
          notify(value) { return value; }
        }
      }
    },
    getApolloClient: options.getApolloClient || (() => null)
  };

  const sandbox = {
    zimlet(factory) {
      const plugin = factory(context);
      plugin.init();
    },
    window: {
      alert(message) { alerts.push(String(message)); },
      fetch: options.fetch || (() => Promise.reject(new Error("fetch not expected"))),
      setTimeout,
      clearTimeout,
      AbortController: global.AbortController,
      console
    },
    Promise,
    Error,
    encodeURIComponent,
    isFinite,
    console,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: modernPath });
  assert(registeredComponent, "Modern menu component was not registered");

  return {
    click(props) {
      const element = registeredComponent(props);
      assert(element && element.props && typeof element.props.onClick === "function");
      element.props.onClick();
    },
    calls,
    alerts,
    notifications,
    get fallbackRefreshCount() { return fallbackRefreshCount; },
    incrementFallbackRefresh() { fallbackRefreshCount += 1; }
  };
}

function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function modernTests() {
  const baseConfig = {
    internalReportAddress: "security@example.org",
    simulationReportAddress: "simulation@example.org",
    moveReportedMessage: "false",
    simulationDetectionEnabled: "false",
    selectOneMessageMessage: "OPEN_ONE"
  };

  const multi = createModernHarness(baseConfig);
  multi.click({ emailData: { id: "-20", messages: [{ id: "201" }, { id: "202" }] } });
  assert.deepStrictEqual(multi.alerts, ["OPEN_ONE"]);
  assert.strictEqual(multi.calls.length, 0,
    "Modern must not report the first arbitrary message from a multi-message conversation");

  const positiveConversation = createModernHarness(baseConfig);
  positiveConversation.click({ emailData: { id: "220", __typename: "Conversation" } });
  assert.deepStrictEqual(positiveConversation.alerts, ["OPEN_ONE"]);
  assert.strictEqual(positiveConversation.calls.length, 0,
    "Modern must reject a positive conversation ID without an explicit active message");

  const single = createModernHarness(baseConfig);
  single.click({ emailData: { id: "-21", messages: [{ id: "203", subject: "Test" }] } });
  await delay();
  const firstSendCalls = single.calls.filter(call => call.name === "SendMsg");
  assert.strictEqual(firstSendCalls.length, 1);
  assert.strictEqual(firstSendCalls[0].body.m.attach.m[0].id, "203");
  single.click({ emailData: { messages: [{ id: "203", subject: "Test" }] } });
  await delay();
  assert.strictEqual(single.calls.filter(call => call.name === "SendMsg").length, 1,
    "a stale Modern message entry must not cause a duplicate report in the same session");
  assert(single.notifications.some(message => /reported recently/i.test(message)));

  const dkimConfig = {
    ...baseConfig,
    simulationDetectionEnabled: "true",
    simulationDisclaimerRules: "",
    simulationDkimDomains: "training.example.net",
    simulationSourceIndicators: ""
  };
  const mixedDkim = createModernHarness(dkimConfig, {
    jsonRequest(request) {
      if (request.name === "GetMsg") {
        return {
          header: [
            { n: "Authentication-Results", _content: "mx; dkim=pass header.d=legitimate.example.org" },
            { n: "Authentication-Results", _content: "mx; dkim=fail header.d=training.example.net" },
            { n: "DKIM-Signature", _content: "v=1; d=other.example.org" }
          ]
        };
      }
      return {};
    }
  });
  mixedDkim.click({ emailData: { messages: [{ id: "204", subject: "Mixed" }] } });
  await delay();
  const mixedSend = mixedDkim.calls.find(call => call.name === "SendMsg");
  assert.strictEqual(mixedSend.body.m.e[0].a, "security@example.org",
    "separate pass/fail DKIM results must stay on the internal route");

  const validDkim = createModernHarness(dkimConfig, {
    jsonRequest(request) {
      if (request.name === "GetMsg") {
        return {
          header: [
            { n: "Authentication-Results", _content: "mx; dkim=pass header.d=training.example.net" },
            { n: "DKIM-Signature", _content: "v=1; d=training.example.net" }
          ]
        };
      }
      return {};
    }
  });
  validDkim.click({ emailData: { messages: [{ id: "205", subject: "Valid" }] } });
  await delay();
  const validSend = validDkim.calls.find(call => call.name === "SendMsg");
  assert.strictEqual(validSend.body.m.e[0].a, "simulation@example.org");

  const errors = createModernHarness(baseConfig, {
    jsonRequest(request) {
      if (request.name === "SendMsg") {
        throw new Error("internal.mailhost.example secret detail");
      }
      return {};
    }
  });
  errors.click({ emailData: { messages: [{ id: "206", subject: "Failure" }] } });
  await delay();
  assert(errors.alerts.some(message => message.includes("PR-SEND-01")));
  assert(errors.alerts.every(message => !message.includes("internal.mailhost.example")),
    "technical server details must not be exposed in the user dialog");

  const collision = createModernHarness({
    moveReportedMessage: "false",
    configurationErrorInternalAddress: "NO_CONFIG"
  }, {
    getAccount: () => ({
      zimlets: [
        { name: "unrelated_zimlet", internalReportAddress: "wrong@example.org" }
      ]
    })
  });
  collision.click({ emailData: { messages: [{ id: "207", subject: "Config" }] } });
  await delay();
  assert(collision.alerts.includes("NO_CONFIG"),
    "Modern configuration lookup must not consume similarly named properties from another Zimlet");
  assert.strictEqual(collision.calls.filter(call => call.name === "SendMsg").length, 0);

  const keyedConfig = createModernHarness({ moveReportedMessage: "false" }, {
    getAccount: () => ({
      zimlets: {
        org_zimbracommunity_phishing_reporter_modern: {
          internalReportAddress: "keyed@example.org"
        },
        unrelated_zimlet: {
          internalReportAddress: "wrong@example.org"
        }
      }
    })
  });
  keyedConfig.click({ emailData: { messages: [{ id: "209", subject: "Keyed config" }] } });
  await delay();
  const keyedSend = keyedConfig.calls.find(call => call.name === "SendMsg");
  assert.strictEqual(keyedSend.body.m.e[0].a, "keyed@example.org",
    "Modern must read an account configuration keyed by its exact Zimlet name");

  const soapOrderedConfig = createModernHarness({ moveReportedMessage: "false" }, {
    getAccount: () => ({
      zimlets: [
        {
          name: "org_zimbracommunity_phishing_reporter_modern",
          description: "Zimlet descriptor without runtime configuration",
          include: ["index.js"]
        },
        {
          zimletConfig: [{
            name: "org_zimbracommunity_phishing_reporter_modern",
            global: [{
              property: [
                { name: "internalReportAddress", _content: "soap-config@example.org" },
                { name: "moveReportedMessage", _content: "false" }
              ]
            }]
          }]
        }
      ]
    })
  });
  soapOrderedConfig.click({
    emailData: { messages: [{ id: "210", subject: "SOAP ordered config" }] }
  });
  await delay();
  const soapOrderedSend = soapOrderedConfig.calls.find(call => call.name === "SendMsg");
  assert(soapOrderedSend,
    "Modern must continue past the descriptor and find the later SOAP configuration object");
  assert.strictEqual(soapOrderedSend.body.m.e[0].a, "soap-config@example.org",
    "Modern must read runtime properties from the later same-name SOAP object");

  let refetchAttempts = 0;
  let fallbackAttempts = 0;
  const refresh = createModernHarness({
    ...baseConfig,
    moveReportedMessage: "true"
  }, {
    getApolloClient: () => ({
      refetchQueries() {
        refetchAttempts += 1;
        return Promise.reject(new Error("unsupported signature"));
      },
      reFetchObservableQueries() {
        fallbackAttempts += 1;
        return Promise.resolve();
      }
    })
  });
  refresh.click({
    emailData: { id: "list-208", messages: [{ id: "208", subject: "Refresh", folderId: "2" }] },
    action: () => Promise.resolve()
  });
  await delay(10);
  assert.strictEqual(refetchAttempts, 1);
  assert.strictEqual(fallbackAttempts, 1,
    "Modern list refresh must try the second Apollo API when the first one rejects");
}

(async () => {
  classicTests();
  await modernTests();
  console.log("Detection and runtime tests passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
