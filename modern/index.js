/* Zimbra Phishing Reporter - Modern UI - Version 2.2.0 */
(function () {
    "use strict";

    zimlet(function (context) {
        var shims = context.shims || {};
        var preact = shims.preact || shims["preact"];
        var components = shims["@zimbra-client/components"] || {};
        var createElement = preact && preact.createElement;
        var ActionMenuItem = components.ActionMenuItem;
        var graphql = shims["@zimbra-client/graphql"] || {};
        var withActionMutation = graphql.withActionMutation;
        var ZIMLET_NAME = "org_zimbracommunity_phishing_reporter_modern";
        var DEFAULT_TARGET_FOLDER_ID = "4";
        var busy = false;
        var busySince = 0;
        var busyUntil = 0;
        var reportedMessageIds = {};

        function notify(message) {
            try {
                context.store.dispatch(context.zimletRedux.actions.notifications.notify({ message: message }));
            } catch (ignoreNotification) {
                window.alert(message);
            }
        }

        function showDialog(message) {
            window.alert(message);
        }

        function readConfig(name, fallback) {
            var found;

            function valueFromProperty(node) {
                if (!node || typeof node !== "object") {
                    return undefined;
                }
                var propertyName = node.name || (node._attrs && node._attrs.name);
                if (propertyName !== name) {
                    return undefined;
                }
                if (typeof node._content !== "undefined") { return node._content; }
                if (typeof node.content !== "undefined") { return node.content; }
                if (typeof node.value !== "undefined") { return node.value; }
                if (node._attrs && typeof node._attrs.value !== "undefined") { return node._attrs.value; }
                return "";
            }

            function walk(node, depth) {
                if (typeof found !== "undefined" || !node || depth > 12) {
                    return;
                }
                if (Array.isArray(node)) {
                    node.forEach(function (item) { walk(item, depth + 1); });
                    return;
                }
                if (typeof node !== "object") {
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(node, name) &&
                        typeof node[name] !== "object") {
                    found = node[name];
                    return;
                }
                if (node._attrs && Object.prototype.hasOwnProperty.call(node._attrs, name)) {
                    found = node._attrs[name];
                    return;
                }
                var propertyValue = valueFromProperty(node);
                if (typeof propertyValue !== "undefined") {
                    found = propertyValue;
                    return;
                }
                Object.keys(node).forEach(function (key) {
                    walk(node[key], depth + 1);
                });
            }

            function findNamedZimlet(node, depth) {
                if (!node || depth > 10) {
                    return null;
                }
                if (Array.isArray(node)) {
                    for (var i = 0; i < node.length; i++) {
                        var arrayMatch = findNamedZimlet(node[i], depth + 1);
                        if (arrayMatch) {
                            return arrayMatch;
                        }
                    }
                    return null;
                }
                if (typeof node !== "object") {
                    return null;
                }

                function containsRequestedProperty(candidate, propertyDepth) {
                    if (!candidate || propertyDepth > 12) {
                        return false;
                    }
                    if (Array.isArray(candidate)) {
                        return candidate.some(function (item) {
                            return containsRequestedProperty(item, propertyDepth + 1);
                        });
                    }
                    if (typeof candidate !== "object") {
                        return false;
                    }
                    if (Object.prototype.hasOwnProperty.call(candidate, name)) {
                        return true;
                    }
                    if (candidate._attrs &&
                            (Object.prototype.hasOwnProperty.call(candidate._attrs, name) ||
                             String(candidate._attrs.name || "") === name)) {
                        return true;
                    }
                    if (String(candidate.name || "") === name) {
                        return true;
                    }
                    return Object.keys(candidate).some(function (key) {
                        return containsRequestedProperty(candidate[key], propertyDepth + 1);
                    });
                }

                if (Object.prototype.hasOwnProperty.call(node, ZIMLET_NAME) &&
                        node[ZIMLET_NAME] && typeof node[ZIMLET_NAME] === "object" &&
                        containsRequestedProperty(node[ZIMLET_NAME], 0)) {
                    return node[ZIMLET_NAME];
                }
                var nodeName = node.name || node.zimlet || (node._attrs && node._attrs.name);
                if (String(nodeName || "") === ZIMLET_NAME &&
                        containsRequestedProperty(node, 0)) {
                    return node;
                }
                var keys = Object.keys(node);
                for (var k = 0; k < keys.length; k++) {
                    var objectMatch = findNamedZimlet(node[keys[k]], depth + 1);
                    if (objectMatch) {
                        return objectMatch;
                    }
                }
                return null;
            }

            var accountZimletConfig = null;
            try {
                var accountZimlets = context.getAccount && context.getAccount().zimlets;
                accountZimletConfig = findNamedZimlet(accountZimlets, 0);
            } catch (ignoreAccountConfig) {}

            function scopeCandidate(candidate) {
                if (!candidate || typeof candidate !== "object") {
                    return candidate;
                }
                var named = findNamedZimlet(candidate, 0);
                if (named) {
                    return named;
                }
                if (Array.isArray(candidate) || candidate.zimlets ||
                        (candidate.zimlet && typeof candidate.zimlet === "object")) {
                    return null;
                }
                return candidate;
            }

            [
                context.zimletConfig,
                context.config,
                context.zimlet && context.zimlet.zimletConfig,
                accountZimletConfig
            ].forEach(function (candidate) {
                walk(scopeCandidate(candidate), 0);
            });

            if (found === null || typeof found === "undefined" || String(found) === "") {
                return typeof fallback === "undefined" ? "" : fallback;
            }
            return String(found);
        }

        function readBooleanConfig(name, fallback) {
            var value = String(readConfig(name, fallback ? "true" : "false") || "").toLowerCase();
            return value === "true" || value === "1" || value === "yes" || value === "on";
        }

        function readIntegerConfig(name, fallback, minimum, maximum) {
            var value = parseInt(readConfig(name, String(fallback)), 10);
            if (!isFinite(value)) {
                value = fallback;
            }
            if (typeof minimum === "number" && value < minimum) {
                value = minimum;
            }
            if (typeof maximum === "number" && value > maximum) {
                value = maximum;
            }
            return value;
        }

        function nowMs() {
            return new Date().getTime();
        }

        function withOperationTimeout(promise, timeoutMs, phase) {
            return new Promise(function (resolve, reject) {
                var settled = false;
                var timer = window.setTimeout(function () {
                    var timeoutError;
                    if (settled) {
                        return;
                    }
                    settled = true;
                    timeoutError = new Error("Reporter operation timed out: " + phase);
                    timeoutError.reporterTimeoutPhase = phase;
                    reject(timeoutError);
                }, timeoutMs);

                Promise.resolve(promise).then(function (value) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    window.clearTimeout(timer);
                    resolve(value);
                }, function (error) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    window.clearTimeout(timer);
                    reject(error);
                });
            });
        }

        function reportCooldownMs() {
            return readIntegerConfig("reportedMessageCooldownMs", 120000, 100, 3600000);
        }

        function pruneReportedMessageIds(timestamp) {
            var cutoff = timestamp - reportCooldownMs();
            Object.keys(reportedMessageIds).forEach(function (messageId) {
                if (typeof reportedMessageIds[messageId] !== "number" ||
                        reportedMessageIds[messageId] <= cutoff) {
                    delete reportedMessageIds[messageId];
                }
            });
        }

        function setBusy(value, maximumDurationMs) {
            busy = !!value;
            busySince = busy ? nowMs() : 0;
            busyUntil = busy ? busySince + (maximumDurationMs ||
                readIntegerConfig("operationTimeoutMs", 70000, 1000, 300000) + 5000) : 0;
        }

        function isBusy() {
            if (!busy) {
                return false;
            }
            if (!busySince || !busyUntil || nowMs() > busyUntil) {
                setBusy(false);
                return false;
            }
            return true;
        }

        function splitList(value, separator) {
            return String(value || "").split(separator || ",").map(function (item) {
                return item.trim();
            }).filter(Boolean);
        }

        function escapeRegExp(value) {
            return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }

        function getHeaderNames() {
            var names = [
                readConfig("simulationDisclaimerHeader", "X-Disclaimer"),
                "Authentication-Results",
                "DKIM-Signature",
                "Received"
            ];
            var seen = {};
            return names.map(function (name) { return String(name || "").trim(); })
                .filter(function (name) {
                    var key = name.toLowerCase();
                    if (!name || seen[key]) {
                        return false;
                    }
                    seen[key] = true;
                    return true;
                });
        }

        function headerValues(headerMap, name) {
            return (headerMap && headerMap[String(name || "").toLowerCase()]) || [];
        }

        function hasHeader(headerMap, name) {
            var values = headerValues(headerMap, name);
            return values && values.join("").replace(/\s/g, "").length > 0;
        }

        function joinedHeader(headerMap, name) {
            return headerValues(headerMap, name).join("\n").toLowerCase();
        }

        function matchesDisclaimerRules(headerMap) {
            var content = joinedHeader(
                headerMap,
                readConfig("simulationDisclaimerHeader", "X-Disclaimer")
            );
            var rules = splitList(readConfig("simulationDisclaimerRules", ""), ";");
            if (!content || !rules.length) {
                return false;
            }
            return rules.some(function (rule) {
                var markers = splitList(rule, "|");
                return markers.length > 0 && markers.every(function (marker) {
                    return content.indexOf(marker.toLowerCase()) !== -1;
                });
            });
        }

        function domainPattern(domain, parameterName) {
            return new RegExp(
                "(?:^|[\\s;])" + parameterName + "\\s*=\\s*" + escapeRegExp(domain.toLowerCase()) +
                "(?:$|[\\s;,()])",
                "i"
            );
        }

        function matchesDkim(headerMap, requirePass) {
            var domains = splitList(readConfig("simulationDkimDomains", ""), ",");
            if (!domains.length) {
                return false;
            }

            if (requirePass) {
                return headerValues(headerMap, "Authentication-Results").some(function (result) {
                    return String(result || "").toLowerCase().split(";").some(function (clause) {
                        if (!/dkim\s*=\s*pass\b/.test(clause)) {
                            return false;
                        }
                        return domains.some(function (domain) {
                            return domainPattern(domain, "header\\.d").test(clause);
                        });
                    });
                });
            }

            return headerValues(headerMap, "DKIM-Signature").some(function (signature) {
                var content = String(signature || "").toLowerCase();
                return domains.some(function (domain) {
                    return domainPattern(domain, "d").test(content);
                });
            });
        }

        function matchesSourceIndicator(headerMap) {
            var indicators = splitList(readConfig("simulationSourceIndicators", ""), ",");
            if (!indicators.length) {
                return false;
            }
            var received = joinedHeader(headerMap, "Received");
            return indicators.some(function (indicator) {
                return received.indexOf(indicator.toLowerCase()) !== -1;
            });
        }

        function getSimulationMatchReason(headerMap) {
            if (!readBooleanConfig("simulationDetectionEnabled", false)) {
                return "";
            }
            if (matchesDisclaimerRules(headerMap)) {
                return "disclaimer";
            }
            if (matchesDkim(headerMap, true)) {
                return "dkim-pass";
            }
            if (matchesDkim(headerMap, false) && matchesSourceIndicator(headerMap)) {
                return "dkim-signature+source";
            }
            return "";
        }

        function isSimulation(headerMap) {
            return !!getSimulationMatchReason(headerMap);
        }

        function hasClassificationHeaders(headerMap) {
            return getHeaderNames().some(function (name) {
                return hasHeader(headerMap, name);
            });
        }

        function needsRawClassificationHeaders(headerMap) {
            var disclaimerRules = splitList(readConfig("simulationDisclaimerRules", ""), ";");
            if (disclaimerRules.length &&
                    !hasHeader(headerMap, readConfig("simulationDisclaimerHeader", "X-Disclaimer"))) {
                return true;
            }

            var domains = splitList(readConfig("simulationDkimDomains", ""), ",");
            var sources = splitList(readConfig("simulationSourceIndicators", ""), ",");
            if (domains.length && !hasHeader(headerMap, "Authentication-Results")) {
                return true;
            }
            if (domains.length && sources.length &&
                    (!hasHeader(headerMap, "DKIM-Signature") || !hasHeader(headerMap, "Received"))) {
                return true;
            }
            return false;
        }

        function normalizeRecipient(value) {
            return String(value || "").trim();
        }

        function isValidRecipient(value) {
            return /^[^\s@<>;,]+@[^\s@<>;,]+$/.test(normalizeRecipient(value));
        }

        function getRoute(simulation) {
            var recipient;
            if (simulation) {
                recipient = normalizeRecipient(readConfig("simulationReportAddress", ""));
                if (!recipient) {
                    return {
                        error: readConfig(
                            "configurationErrorSimulationAddress",
                            "Simulation detection matched, but no simulation report address is configured."
                        )
                    };
                }
                if (!isValidRecipient(recipient)) {
                    return {
                        error: readConfig("configurationErrorInvalidAddress", "The configured report address is invalid.")
                    };
                }
                return {
                    recipient: recipient,
                    subjectPrefix: readConfig("simulationSubjectPrefix", "Phishing simulation reported: "),
                    successMessage: readConfig(
                        "simulationSuccessMessage",
                        "Good catch! This email was part of a phishing simulation and was reported correctly."
                    )
                };
            }

            recipient = normalizeRecipient(readConfig("internalReportAddress", ""));
            if (!recipient) {
                return {
                    error: readConfig(
                        "configurationErrorInternalAddress",
                        "No internal report address is configured."
                    )
                };
            }
            if (!isValidRecipient(recipient)) {
                return {
                    error: readConfig("configurationErrorInvalidAddress", "The configured report address is invalid.")
                };
            }
            return {
                recipient: recipient,
                subjectPrefix: readConfig("internalSubjectPrefix", "Suspicious email reported: "),
                successMessage: readConfig(
                    "internalSuccessMessage",
                    "The suspicious email was forwarded for review."
                )
            };
        }

        function candidateMessage(value) {
            if (!value || typeof value !== "object" || !(value.id || value.nId)) {
                return null;
            }
            var type = String(value.type || value.itemType || value.__typename || "").toLowerCase();
            var id = String(value.id || value.nId || "");
            var conversation = value.isConversation === true || value.isZmConv === true;
            try {
                conversation = conversation ||
                    (typeof value.isConversation === "function" && value.isConversation()) ||
                    (typeof value.isZmConv === "function" && value.isZmConv());
            } catch (ignoreConversationDetection) {}
            if (conversation || type === "conv" || type === "conversation" || type === "zmconv" ||
                    type.indexOf("conversation") !== -1 || id.charAt(0) === "-") {
                return null;
            }
            return value;
        }

        function resolveSingleMessage(emailData) {
            if (!emailData || typeof emailData !== "object") {
                return null;
            }

            var explicitCandidates = [
                emailData.message,
                emailData.selectedMessage,
                emailData.activeMessage,
                emailData.currentMessage
            ];
            for (var i = 0; i < explicitCandidates.length; i++) {
                var explicitMessage = candidateMessage(explicitCandidates[i]);
                if (explicitMessage) {
                    return explicitMessage;
                }
            }

            if (Array.isArray(emailData.messages)) {
                return emailData.messages.length === 1 ? candidateMessage(emailData.messages[0]) : null;
            }
            if (Array.isArray(emailData.messagesMetaData)) {
                return emailData.messagesMetaData.length === 1 ?
                    candidateMessage(emailData.messagesMetaData[0]) : null;
            }

            return candidateMessage(emailData);
        }

        function resolveMessages(props) {
            var emailData = props && props.emailData;
            var selected = props && props.selectedMails;
            var seen = {};
            var messages = [];
            var invalid = 0;

            // The installed Zimbra Modern client passes the complete list selection
            // as selectedMails. emailData remains the active/single mail.
            if (Array.isArray(selected) && selected.length > 1) {
                selected.forEach(function (item) {
                    var message = candidateMessage(item);
                    var id = message && String(message.id || message.nId || "");
                    if (!message || !id) {
                        invalid += 1;
                        return;
                    }
                    if (!seen[id]) {
                        seen[id] = true;
                        messages.push(message);
                    }
                });
                return { messages: messages, invalid: invalid };
            }

            var single = resolveSingleMessage(emailData) ||
                (Array.isArray(selected) && selected.length === 1 ? candidateMessage(selected[0]) : null);
            if (!single) {
                return { messages: [], invalid: 1 };
            }
            return { messages: [single], invalid: 0 };
        }

        function phishingIcon() {
            if (!createElement) {
                return null;
            }
            return createElement(
                "svg",
                {
                    width: 20,
                    height: 20,
                    viewBox: "0 0 24 24",
                    fill: "none",
                    xmlns: "http://www.w3.org/2000/svg",
                    "aria-hidden": "true",
                    style: "display:block;color:#c62828"
                },
                createElement("path", {
                    d: "M12 2.5L20 5.8V11.3C20 16.4 16.8 20.1 12 21.7C7.2 20.1 4 16.4 4 11.3V5.8L12 2.5Z",
                    stroke: "currentColor",
                    "stroke-width": "2",
                    "stroke-linejoin": "round"
                }),
                createElement("path", {
                    d: "M12 7.2V13.1",
                    stroke: "currentColor",
                    "stroke-width": "2.2",
                    "stroke-linecap": "round"
                }),
                createElement("circle", {
                    cx: "12",
                    cy: "16.6",
                    r: "1.15",
                    fill: "currentColor"
                })
            );
        }

        function extractHeaderMap(response) {
            var map = {};

            function addHeader(entry) {
                if (!entry || typeof entry !== "object") {
                    return;
                }
                var name = entry.n || entry.name || (entry._attrs && (entry._attrs.n || entry._attrs.name));
                if (!name) {
                    return;
                }
                var value = entry._content;
                if (typeof value === "undefined") { value = entry.content; }
                if (typeof value === "undefined") { value = entry.value; }
                if (typeof value === "undefined") { value = entry._value; }
                if (value && typeof value === "object" && typeof value._content !== "undefined") {
                    value = value._content;
                }
                var key = String(name).toLowerCase();
                if (!map[key]) {
                    map[key] = [];
                }
                map[key].push(String(value || ""));
            }

            function walk(node, depth) {
                if (!node || depth > 12) {
                    return;
                }
                if (Array.isArray(node)) {
                    node.forEach(function (item) { walk(item, depth + 1); });
                    return;
                }
                if (typeof node !== "object") {
                    return;
                }
                if ((node.n || node.name || (node._attrs && node._attrs.n)) &&
                        (typeof node._content !== "undefined" || typeof node.content !== "undefined" ||
                         typeof node.value !== "undefined" || typeof node._value !== "undefined")) {
                    addHeader(node);
                }
                Object.keys(node).forEach(function (key) {
                    walk(node[key], depth + 1);
                });
            }

            walk(response, 0);
            return map;
        }

        function extractRawHeaderMap(rawMessage) {
            var map = {};
            var text = String(rawMessage || "");
            var separator = text.search(/\r?\n\r?\n/);
            var headerBlock = separator >= 0 ? text.substring(0, separator) : text;
            var lines = headerBlock.replace(/\r\n/g, "\n").split("\n");
            var currentName = null;
            var currentValue = "";

            function commit() {
                if (!currentName) {
                    return;
                }
                var key = currentName.toLowerCase();
                if (!map[key]) {
                    map[key] = [];
                }
                map[key].push(currentValue.replace(/\s+/g, " ").trim());
            }

            lines.forEach(function (line) {
                if (/^[ \t]/.test(line) && currentName) {
                    currentValue += " " + line.replace(/^[ \t]+/, "");
                    return;
                }

                commit();
                currentName = null;
                currentValue = "";

                var match = /^([^:\s]+):\s*(.*)$/.exec(line);
                if (match) {
                    currentName = match[1];
                    currentValue = match[2] || "";
                }
            });

            commit();
            return map;
        }

        function fetchTextWithTimeout(url, timeoutMs) {
            var controller = null;
            try {
                if (typeof window.AbortController === "function") {
                    controller = new window.AbortController();
                }
            } catch (ignoreAbortController) {}

            var fetchPromise = window.fetch(url, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error("HTTP " + response.status);
                }
                return response.text();
            });

            var timer;
            var timeoutPromise = new Promise(function (resolve, reject) {
                timer = window.setTimeout(function () {
                    try {
                        if (controller) {
                            controller.abort();
                        }
                    } catch (ignoreAbort) {}
                    reject(new Error("Classification header request timed out."));
                }, timeoutMs);
            });

            return Promise.race([fetchPromise, timeoutPromise]).then(function (text) {
                window.clearTimeout(timer);
                return text;
            }, function (error) {
                window.clearTimeout(timer);
                throw error;
            });
        }

        function requestRawHeaders(url, timeoutMs) {
            return fetchTextWithTimeout(url, timeoutMs).then(function (rawMessage) {
                var headerMap = extractRawHeaderMap(rawMessage);
                if (!hasClassificationHeaders(headerMap)) {
                    throw new Error("No usable classification headers were returned.");
                }
                return headerMap;
            });
        }

        function loadRawClassificationHeaders(messageId) {
            var encodedId = encodeURIComponent(String(messageId));
            var totalTimeoutMs = readIntegerConfig("classificationTimeoutMs", 12000, 1000, 60000);
            var deadline = new Date().getTime() + totalTimeoutMs;

            function requestWithinDeadline(url) {
                var remainingMs = deadline - new Date().getTime();
                if (remainingMs <= 0) {
                    return Promise.reject(new Error("Classification header request timed out."));
                }
                return requestRawHeaders(url, remainingMs);
            }

            return requestWithinDeadline("/home/~/?id=" + encodedId + "&auth=co")
                .catch(function () {
                    return requestWithinDeadline("/service/home/~/?id=" + encodedId + "&auth=co");
                });
        }

        function withClassificationTimeout(promise) {
            var timeoutMs = readIntegerConfig("classificationTimeoutMs", 12000, 1000, 60000);
            var timer;
            var timeoutPromise = new Promise(function (resolve, reject) {
                timer = window.setTimeout(function () {
                    reject(new Error("Classification request timed out."));
                }, timeoutMs);
            });
            return Promise.race([promise, timeoutPromise]).then(function (value) {
                window.clearTimeout(timer);
                return value;
            }, function (error) {
                window.clearTimeout(timer);
                throw error;
            });
        }

        function loadClassificationHeaders(messageId) {
            var operation = Promise.resolve().then(function () {
                return context.zimbraBatchClient.jsonRequest({
                    name: "GetMsg",
                    namespace: "urn:zimbraMail",
                    body: {
                        m: {
                            id: String(messageId),
                            read: 0,
                            max: 1,
                            header: getHeaderNames().map(function (name) { return { n: name }; })
                        }
                    },
                    singleRequest: true
                });
            }).then(extractHeaderMap)
                .then(function (headerMap) {
                    if (isSimulation(headerMap) || !needsRawClassificationHeaders(headerMap)) {
                        return headerMap;
                    }
                    return loadRawClassificationHeaders(messageId)
                        .catch(function () { return headerMap; });
                })
                .catch(function () {
                    return loadRawClassificationHeaders(messageId);
                });
            return withClassificationTimeout(operation);
        }

        function sendReport(messageId, originalSubject, route) {
            var request = Promise.resolve().then(function () {
                return context.zimbraBatchClient.jsonRequest({
                    name: "SendMsg",
                    namespace: "urn:zimbraMail",
                    body: {
                        noSave: 1,
                        m: {
                            e: [{ t: "t", a: route.recipient }],
                            su: route.subjectPrefix + originalSubject,
                            attach: { m: [{ id: String(messageId) }] }
                        }
                    },
                    singleRequest: true
                });
            });
            return withOperationTimeout(
                request,
                readIntegerConfig("sendTimeoutMs", 20000, 100, 120000),
                "send"
            );
        }

        function uniqueIds(values) {
            var seen = {};
            return values.filter(function (value) {
                var key = String(value || "");
                if (!key || seen[key]) {
                    return false;
                }
                seen[key] = true;
                return true;
            }).map(String);
        }

        function moveToTarget(props, messageId, listItemId, targetFolderId) {
            var request = Promise.resolve().then(function () {
                if (props && typeof props.action === "function") {
                    return props.action({
                        ids: [String(messageId)],
                        op: "move",
                        folderId: targetFolderId,
                        removeFromList: true,
                        idsToRemove: uniqueIds([listItemId, messageId]),
                        type: "MsgAction",
                        view: "MsgAction"
                    });
                }

                return context.zimbraBatchClient.jsonRequest({
                    name: "MsgAction",
                    namespace: "urn:zimbraMail",
                    body: {
                        action: {
                            id: String(messageId),
                            op: "move",
                            l: targetFolderId
                        }
                    },
                    singleRequest: true
                });
            });
            return withOperationTimeout(
                request,
                readIntegerConfig("moveTimeoutMs", 15000, 100, 120000),
                "move"
            );
        }

        function refreshMessageList() {
            var client;
            try {
                client = typeof context.getApolloClient === "function" ? context.getApolloClient() : null;
            } catch (ignoreClientError) {
                client = null;
            }

            if (!client) {
                return Promise.resolve();
            }

            var refresh = Promise.resolve().then(function () {
                if (typeof client.refetchQueries === "function") {
                    return client.refetchQueries({ include: "active" });
                }
                throw new Error("refetchQueries is unavailable");
            }).catch(function () {
                if (typeof client.reFetchObservableQueries === "function") {
                    return client.reFetchObservableQueries(true);
                }
                return null;
            }).catch(function () {
                return null;
            });
            return withOperationTimeout(
                refresh,
                readIntegerConfig("refreshTimeoutMs", 10000, 100, 60000),
                "refresh"
            ).catch(function (refreshError) {
                logError("PR-REFRESH-01", refreshError);
                return null;
            });
        }

        function formatErrorMessage(name, fallback, reference) {
            return readConfig(name, fallback) + "\n\n" +
                readConfig("errorReferenceLabel", "Reference") + ": " + reference;
        }

        function debug(message, detail) {
            if (!readBooleanConfig("debugLogging", false)) {
                return;
            }
            try {
                if (window.console && window.console.log) {
                    window.console.log("[Zimbra Phishing Reporter] " + message, detail || "");
                }
            } catch (ignoreDebug) {}
        }

        function logError(reference, error) {
            if (!readBooleanConfig("debugLogging", false)) {
                return;
            }
            try {
                if (window.console && window.console.error) {
                    window.console.error("[Zimbra Phishing Reporter] " + reference, error || "");
                }
            } catch (ignoreErrorLog) {}
        }

        function formatTemplate(value, fields) {
            var result = String(value || "");
            Object.keys(fields || {}).forEach(function (name) {
                result = result.split("{" + name + "}").join(String(fields[name]));
            });
            return result;
        }

        function resultError(name, fallback, reference, reported, notMoved) {
            return {
                reported: !!reported,
                failed: !reported,
                notMoved: !!notMoved,
                message: formatErrorMessage(name, fallback, reference)
            };
        }

        function processMessage(props, message) {
            var messageId = String(message.id || message.nId || "");
            var originalSubject = message.subject || message._subject ||
                readConfig("noSubjectText", "(no subject)");
            var targetFolderId = readConfig("targetFolderId", DEFAULT_TARGET_FOLDER_ID);
            var shouldMove = readBooleanConfig("moveReportedMessage", true);
            var alreadyInTarget = String(message.folderId || message.l || "") === targetFolderId;
            var classification;

            reportedMessageIds[messageId] = nowMs();
            classification = readBooleanConfig("simulationDetectionEnabled", false) ?
                loadClassificationHeaders(messageId)
                    .then(function (headerMap) {
                        var matchReason = getSimulationMatchReason(headerMap);
                        debug("Classification completed", matchReason || "internal route");
                        return !!matchReason;
                    })
                    .catch(function (classificationError) {
                        logError("PR-CLASSIFY-01", classificationError);
                        return false;
                    }) :
                Promise.resolve(false);

            var operation = classification.then(function (simulationMessage) {
                var route = getRoute(simulationMessage);
                if (!route.recipient) {
                    delete reportedMessageIds[messageId];
                    return {
                        reported: false,
                        failed: true,
                        notMoved: false,
                        message: route.error
                    };
                }

                return sendReport(messageId, originalSubject, route).then(function () {
                    reportedMessageIds[messageId] = nowMs();
                    if (!shouldMove || alreadyInTarget) {
                        return {
                            reported: true,
                            failed: false,
                            notMoved: false,
                            moved: false,
                            message: route.successMessage
                        };
                    }
                    return moveToTarget(props, messageId, messageId, targetFolderId)
                        .then(function () {
                            return {
                                reported: true,
                                failed: false,
                                notMoved: false,
                                moved: true,
                                message: route.successMessage
                            };
                        })
                        .catch(function (moveError) {
                            if (moveError && moveError.reporterTimeoutPhase === "move") {
                                logError("PR-MOVE-TIMEOUT", moveError);
                                return resultError(
                                    "moveTimeoutMessage",
                                    "The report was sent, but moving the email took too long. You can move it manually.",
                                    "PR-MOVE-TIMEOUT",
                                    true,
                                    true
                                );
                            }
                            logError("PR-MOVE-01", moveError);
                            return resultError(
                                "moveErrorMessage",
                                "The email was reported but could not be moved.",
                                "PR-MOVE-01",
                                true,
                                true
                            );
                        });
                }).catch(function (sendError) {
                    if (sendError && sendError.reporterTimeoutPhase === "send") {
                        reportedMessageIds[messageId] = nowMs();
                        logError("PR-SEND-TIMEOUT", sendError);
                        return resultError(
                            "sendTimeoutMessage",
                            "The server response took too long. The report may still have been sent. Please wait before trying again.",
                            "PR-SEND-TIMEOUT",
                            false,
                            false
                        );
                    }
                    delete reportedMessageIds[messageId];
                    logError("PR-SEND-01", sendError);
                    return resultError(
                        "sendErrorMessage",
                        "The email could not be reported and was not moved.",
                        "PR-SEND-01",
                        false,
                        false
                    );
                });
            });

            return withOperationTimeout(
                operation,
                readIntegerConfig("operationTimeoutMs", 70000, 1000, 300000),
                "overall"
            ).catch(function (unexpectedError) {
                reportedMessageIds[messageId] = nowMs();
                if (unexpectedError && unexpectedError.reporterTimeoutPhase === "overall") {
                    logError("PR-TIMEOUT-01", unexpectedError);
                    return resultError(
                        "operationTimeoutMessage",
                        "Reporting took too long. The operation was released; the report may still have been sent. Please wait before trying again.",
                        "PR-TIMEOUT-01",
                        false,
                        false
                    );
                }
                delete reportedMessageIds[messageId];
                logError("PR-UNEXPECTED-01", unexpectedError);
                return resultError(
                    "sendErrorMessage",
                    "The email could not be reported and was not moved.",
                    "PR-UNEXPECTED-01",
                    false,
                    false
                );
            });
        }

        function showBatchSummary(results, skipped) {
            var totals = results.reduce(function (summary, item) {
                if (item.reported) { summary.reported += 1; }
                if (item.failed) { summary.failed += 1; }
                if (item.notMoved) { summary.notMoved += 1; }
                return summary;
            }, { reported: 0, failed: 0, notMoved: 0 });
            notify(formatTemplate(readConfig(
                "batchSummaryMessage",
                "Batch complete: {reported} reported, {failed} failed, {notMoved} not moved, {skipped} skipped."
            ), {
                reported: totals.reported,
                failed: totals.failed,
                notMoved: totals.notMoved,
                skipped: skipped
            }));
        }

        function reportMessage(props) {
            if (isBusy()) {
                notify(readConfig("busyMessage", "The previous report is still being processed."));
                return;
            }

            var selection = resolveMessages(props);
            var messages = selection.messages;
            var maximum = readIntegerConfig("maxBatchMessages", 10, 1, 25);
            if (!messages.length || selection.invalid) {
                showDialog(readConfig(
                    "unsupportedSelectionMessage",
                    readConfig(
                        "selectOneMessageMessage",
                        "Select individual email messages. Conversations containing multiple emails cannot be reported as a batch."
                    )
                ));
                return;
            }
            if (messages.length > maximum) {
                showDialog(formatTemplate(readConfig(
                    "batchLimitMessage",
                    "You can report at most {maximum} emails at once."
                ), { maximum: maximum }));
                return;
            }
            if (messages.length > 1 && typeof window.confirm === "function" &&
                    !window.confirm(formatTemplate(readConfig(
                        "batchConfirmationMessage",
                        "Report {count} selected emails? Each email is sent as a separate report."
                    ), { count: messages.length }))) {
                return;
            }

            pruneReportedMessageIds(nowMs());
            var skipped = 0;
            messages = messages.filter(function (message) {
                var id = String(message.id || message.nId || "");
                if (!id || reportedMessageIds[id]) {
                    skipped += 1;
                    return false;
                }
                return true;
            });
            if (!messages.length) {
                notify(readConfig("alreadyReportedMessage", "The selected email was reported recently. Please wait before trying again."));
                return;
            }

            var batchMode = messages.length + skipped > 1;
            var results = [];
            var chain = Promise.resolve();
            setBusy(true, messages.length *
                readIntegerConfig("operationTimeoutMs", 70000, 1000, 300000) + 5000);
            messages.forEach(function (message, index) {
                chain = chain.then(function () {
                    if (batchMode) {
                        notify(formatTemplate(readConfig(
                            "batchProgressMessage",
                            "Reporting email {current} of {total}..."
                        ), { current: index + 1, total: messages.length }));
                    }
                    return processMessage(props, message);
                }).then(function (result) {
                    results.push(result);
                });
            });

            chain.then(function () {
                if (results.some(function (result) { return result.moved; })) {
                    return refreshMessageList();
                }
                return null;
            }).then(function () {
                setBusy(false);
                if (batchMode) {
                    showBatchSummary(results, skipped);
                    return;
                }
                if (results[0] && results[0].reported && !results[0].notMoved) {
                    notify(results[0].message);
                } else if (results[0]) {
                    showDialog(results[0].message);
                }
            }, function (unexpectedError) {
                setBusy(false);
                logError("PR-BATCH-01", unexpectedError);
                if (batchMode) {
                    showBatchSummary(results.concat([{ failed: true }]), skipped);
                } else {
                    showDialog(formatErrorMessage(
                        "sendErrorMessage",
                        "The email could not be reported and was not moved.",
                        "PR-BATCH-01"
                    ));
                }
            });
        }

        function PhishingReportMenuItem(props) {
            if (!createElement || !ActionMenuItem) {
                return null;
            }
            return createElement(
                ActionMenuItem,
                {
                    icon: phishingIcon(),
                    onClick: function () { reportMessage(props); }
                },
                readConfig("buttonLabel", "Report phishing")
            );
        }

        var RegisteredMenuItem = PhishingReportMenuItem;
        if (typeof withActionMutation === "function") {
            try {
                RegisteredMenuItem = withActionMutation()(PhishingReportMenuItem);
            } catch (ignoreActionWrapperError) {
                RegisteredMenuItem = PhishingReportMenuItem;
            }
        }

        return {
            init: function () {
                // Zimbra Modern exposes the stable extension point in the "More"
                // action menu. A direct toolbar button is intentionally not used.
                context.plugins.register("slot::action-menu-mail-more", RegisteredMenuItem);
            }
        };
    });
}());
