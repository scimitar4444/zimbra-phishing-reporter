/* Zimbra Phishing Reporter - Modern UI - Version 2.0.0 */
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
        var DEFAULT_TARGET_FOLDER_ID = "4";
        var busy = false;

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

            var accountZimlets = null;
            try {
                accountZimlets = context.getAccount && context.getAccount().zimlets;
            } catch (ignoreAccountConfig) {}

            [
                context.zimletConfig,
                context.config,
                context.zimlet && context.zimlet.zimletConfig,
                accountZimlets
            ].forEach(function (candidate) {
                walk(candidate, 0);
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

        function joinedHeader(headerMap, name) {
            return ((headerMap && headerMap[String(name || "").toLowerCase()]) || [])
                .join("\n").toLowerCase();
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

        function matchesDkim(headerMap, requirePass) {
            var domains = splitList(readConfig("simulationDkimDomains", ""), ",");
            if (!domains.length) {
                return false;
            }
            var authResults = joinedHeader(headerMap, "Authentication-Results");
            var dkimSignature = joinedHeader(headerMap, "DKIM-Signature");
            if (requirePass && !/dkim\s*=\s*pass\b/.test(authResults)) {
                return false;
            }
            var searchText = requirePass ? authResults : dkimSignature;
            return domains.some(function (domain) {
                var pattern = new RegExp(
                    "(?:header\\.d|\\bd)\\s*=\\s*" + escapeRegExp(domain.toLowerCase()) + "(?:\\s|;|$)",
                    "i"
                );
                return pattern.test(searchText);
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

        function isSimulation(headerMap) {
            if (!readBooleanConfig("simulationDetectionEnabled", false)) {
                return false;
            }
            return matchesDisclaimerRules(headerMap) ||
                matchesDkim(headerMap, true) ||
                (matchesDkim(headerMap, false) && matchesSourceIndicator(headerMap));
        }

        function getRoute(isSimulation) {
            if (isSimulation) {
                var simulationAddress = readConfig("simulationReportAddress", "");
                if (!simulationAddress) {
                    return {
                        error: readConfig(
                            "configurationErrorSimulationAddress",
                            "Simulation detection matched, but no simulation report address is configured."
                        )
                    };
                }
                return {
                    recipient: simulationAddress,
                    subjectPrefix: readConfig("simulationSubjectPrefix", "Phishing simulation reported: "),
                    successMessage: readConfig(
                        "simulationSuccessMessage",
                        "Good catch! This email was part of a phishing simulation and was reported correctly."
                    )
                };
            }

            var internalAddress = readConfig("internalReportAddress", "");
            if (!internalAddress) {
                return {
                    error: readConfig(
                        "configurationErrorInternalAddress",
                        "No internal report address is configured."
                    )
                };
            }
            return {
                recipient: internalAddress,
                subjectPrefix: readConfig("internalSubjectPrefix", "Suspicious email reported: "),
                successMessage: readConfig(
                    "internalSuccessMessage",
                    "The suspicious email was forwarded for review."
                )
            };
        }

        function resolveMessage(emailData) {
            if (!emailData) {
                return null;
            }
            if (emailData.messages && emailData.messages.length) {
                return emailData.messages[0];
            }
            if (emailData.messagesMetaData && emailData.messagesMetaData.length) {
                return emailData.messagesMetaData[0];
            }
            return emailData;
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

        function hasClassificationHeaders(headerMap) {
            return getHeaderNames().some(function (name) {
                var values = headerMap && headerMap[String(name).toLowerCase()];
                return values && values.join("").replace(/\s/g, "").length > 0;
            });
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

        function requestRawHeaders(url) {
            return window.fetch(url, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error("HTTP " + response.status);
                }
                return response.text();
            }).then(function (rawMessage) {
                var headerMap = extractRawHeaderMap(rawMessage);
                if (!hasClassificationHeaders(headerMap)) {
                    throw new Error("No usable classification headers were returned.");
                }
                return headerMap;
            });
        }

        function loadRawClassificationHeaders(messageId) {
            var encodedId = encodeURIComponent(String(messageId));
            return requestRawHeaders("/home/~/?id=" + encodedId + "&auth=co")
                .catch(function () {
                    return requestRawHeaders("/service/home/~/?id=" + encodedId + "&auth=co");
                });
        }

        function loadClassificationHeaders(messageId) {
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
            }).then(extractHeaderMap)
                .then(function (headerMap) {
                    if (hasClassificationHeaders(headerMap) && isSimulation(headerMap)) {
                        return headerMap;
                    }
                    return loadRawClassificationHeaders(messageId)
                        .catch(function () { return headerMap; });
                })
                .catch(function () {
                    return loadRawClassificationHeaders(messageId);
                });
        }

        function sendReport(messageId, originalSubject, route) {
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

            try {
                if (typeof client.refetchQueries === "function") {
                    return Promise.resolve(client.refetchQueries({ include: "active" }))
                        .catch(function () { return null; });
                }
                if (typeof client.reFetchObservableQueries === "function") {
                    return Promise.resolve(client.reFetchObservableQueries(true))
                        .catch(function () { return null; });
                }
            } catch (ignoreRefreshError) {
                return Promise.resolve();
            }

            return Promise.resolve();
        }

        function finishFeedback(route) {
            notify(route.successMessage);
        }

        function reportMessage(props) {
            if (busy) {
                notify(readConfig("busyMessage", "The previous report is still being processed."));
                return;
            }

            var message = resolveMessage(props && props.emailData);
            var messageId = message && (message.id || message.nId);
            if (!messageId) {
                showDialog(readConfig("selectOneMessageMessage", "Open or select exactly one email."));
                return;
            }

            var originalSubject = message.subject || (props.emailData && props.emailData.subject) ||
                readConfig("noSubjectText", "(no subject)");
            var targetFolderId = readConfig("targetFolderId", DEFAULT_TARGET_FOLDER_ID);
            var shouldMove = readBooleanConfig("moveReportedMessage", true);
            var alreadyInTarget = String(message.folderId || message.l || "") === targetFolderId;
            var listItemId = props && props.emailData && props.emailData.id;

            busy = true;
            var classification = readBooleanConfig("simulationDetectionEnabled", false) ?
                loadClassificationHeaders(messageId)
                    .then(isSimulation)
                    .catch(function () {
                        // If classification is unavailable, use the normal internal reporting route.
                        return false;
                    }) :
                Promise.resolve(false);

            classification
                .then(function (isSimulationMessage) {
                    var route = getRoute(isSimulationMessage);
                    if (!route.recipient) {
                        var configurationError = new Error(route.error);
                        configurationError.reporterConfigurationError = true;
                        throw configurationError;
                    }

                    return sendReport(messageId, originalSubject, route)
                        .then(function () {
                            if (!shouldMove || alreadyInTarget) {
                                finishFeedback(route);
                                return null;
                            }
                            return moveToTarget(props, messageId, listItemId, targetFolderId)
                                .then(function () { return refreshMessageList(); })
                                .then(function () { finishFeedback(route); })
                                .catch(function (moveError) {
                                    var moveDetail = moveError && moveError.message ? "\n\n" + moveError.message : "";
                                    showDialog(
                                        readConfig(
                                            "moveErrorMessage",
                                            "The email was reported but could not be moved."
                                        ) + moveDetail
                                    );
                                });
                        });
                })
                .catch(function (sendError) {
                    if (sendError && sendError.reporterConfigurationError) {
                        showDialog(sendError.message);
                        return;
                    }
                    var sendDetail = sendError && sendError.message ? "\n\n" + sendError.message : "";
                    showDialog(
                        readConfig("sendErrorMessage", "The email could not be reported and was not moved.") +
                        sendDetail
                    );
                })
                .then(function () {
                    busy = false;
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
                context.plugins.register("slot::action-menu-mail-more", RegisteredMenuItem);
            }
        };
    });
}());
