/* Zimbra Phishing Reporter - Classic UI - Version 2.2.1 */

function org_zimbracommunity_phishing_reporter_classic_HandlerObject() {
    this._busy = false;
    this._pendingMessageId = null;
    this._pendingAlreadyInTarget = false;
    this._pendingShouldMove = true;
    this._pendingTargetFolderId = "4";
    this._pendingSuccessMessage = "";
    this._pendingRouteType = "";
    this._pendingPhase = "";
    this._pendingTimer = null;
    this._pendingToken = 0;
    this._batchState = null;
    this._reportedMessageIds = {};
}

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype = new ZmZimletBase();
org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype.constructor = org_zimbracommunity_phishing_reporter_classic_HandlerObject;

org_zimbracommunity_phishing_reporter_classic_HandlerObject.OPERATION = "ZIMBRA_PHISHING_REPORT";
org_zimbracommunity_phishing_reporter_classic_HandlerObject.DEFAULT_TARGET_FOLDER_ID = "4";
org_zimbracommunity_phishing_reporter_classic_HandlerObject.ICON = "ZimbraPhishingReporter";

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype.initializeToolbar = function(app, toolbar, controller, viewId) {
    if (!toolbar || !toolbar.createOp || typeof ZmId === "undefined") {
        return;
    }

    var viewType = viewId;
    try {
        if (appCtxt && appCtxt.getViewTypeFromId) {
            viewType = appCtxt.getViewTypeFromId(viewId);
        }
    } catch (ignoreViewType) {}

    if (!this._isSupportedMailView(viewType)) {
        return;
    }

    var operation = org_zimbracommunity_phishing_reporter_classic_HandlerObject.OPERATION;
    var existing = toolbar.getOp ? toolbar.getOp(operation) : (toolbar.getButton ? toolbar.getButton(operation) : null);
    if (existing) {
        return;
    }

    var button = toolbar.createOp(operation, {
        text: this._getConfig("buttonLabel", "Report phishing"),
        tooltip: this._getConfig("buttonTooltip", "Report suspicious email"),
        index: this._findButtonIndex(toolbar),
        image: org_zimbracommunity_phishing_reporter_classic_HandlerObject.ICON,
        showImageInToolbar: true,
        showTextInToolbar: true,
        enabled: true
    });

    try {
        if (button && button.setImage) {
            button.setImage(org_zimbracommunity_phishing_reporter_classic_HandlerObject.ICON);
        }
    } catch (ignoreSetImage) {}

    if (button && button.addSelectionListener) {
        button.addSelectionListener(new AjxListener(this, this._reportListener, controller));
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isSupportedMailView = function(viewType) {
    var supported = [ZmId.VIEW_CONVLIST, ZmId.VIEW_TRAD, ZmId.VIEW_MSG, ZmId.VIEW_CONV];
    for (var i = 0; i < supported.length; i++) {
        if (supported[i] && viewType === supported[i]) {
            return true;
        }
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._findButtonIndex = function(toolbar) {
    if (!toolbar.opList || typeof ZmOperation === "undefined") {
        return 0;
    }
    var preferred = [ZmOperation.SPAM, ZmOperation.DELETE, ZmOperation.DELETE_MENU, ZmOperation.MORE];
    for (var p = 0; p < preferred.length; p++) {
        if (!preferred[p]) {
            continue;
        }
        for (var i = 0; i < toolbar.opList.length; i++) {
            if (toolbar.opList[i] === preferred[p]) {
                return i + 1;
            }
        }
    }
    return toolbar.opList.length;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._reportListener = function(controller) {
    if (this._busy) {
        this._setStatus(this._getConfig("busyMessage", "The previous report is still being processed."));
        return;
    }

    var selection = this._getMessages(controller);
    var messages = selection.messages;
    var maximum = this._getIntegerConfig("maxBatchMessages", 10, 1, 25);
    if (!messages.length || selection.invalid) {
        this._showError(this._getConfig(
            "unsupportedSelectionMessage",
            this._getConfig(
                "selectOneMessageMessage",
                "Select individual email messages. Conversations containing multiple emails cannot be reported as a batch."
            )
        ));
        return;
    }
    if (messages.length > maximum) {
        this._showError(this._formatTemplate(this._getConfig(
            "batchLimitMessage",
            "You can report at most {maximum} emails at once."
        ), { maximum: maximum }));
        return;
    }
    if (messages.length > 1 && typeof window.confirm === "function" &&
            !window.confirm(this._formatTemplate(this._getConfig(
                "batchConfirmationMessage",
                "Report {count} selected emails? Each email is sent as a separate report."
            ), { count: messages.length }))) {
        return;
    }

    this._pruneReportedMessageIds();
    var skipped = 0;
    var self = this;
    messages = messages.filter(function(message) {
        var messageId = String(message.id || message.nId || "");
        if (!messageId || self._reportedMessageIds[messageId]) {
            skipped += 1;
            return false;
        }
        return true;
    });
    if (!messages.length) {
        this._setStatus(this._getConfig(
            "alreadyReportedMessage",
            "The selected email was reported recently. Please wait before trying again."
        ));
        return;
    }

    this._busy = true;
    this._batchState = {
        messages: messages,
        index: 0,
        results: [],
        skipped: skipped,
        batchMode: messages.length + skipped > 1
    };
    this._startNextBatchMessage();
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._startNextBatchMessage = function() {
    var state = this._batchState;
    if (!state || state.index >= state.messages.length) {
        this._finishBatch();
        return;
    }
    var message = state.messages[state.index];
    var messageId = String(message.id || message.nId || "");
    this._reportedMessageIds[messageId] = new Date().getTime();
    if (state.batchMode) {
        this._setStatus(this._formatTemplate(this._getConfig(
            "batchProgressMessage",
            "Reporting email {current} of {total}..."
        ), { current: state.index + 1, total: state.messages.length }));
    }

    if (!this._getBooleanConfig("simulationDetectionEnabled", false)) {
        this._sendReport(message, false);
        return;
    }

    try {
        this._loadClassificationHeaders(messageId, new AjxCallback(this, function(headerMap) {
            var matchReason = this._getSimulationMatchReason(headerMap);
            this._debug("Classification completed", matchReason || "internal route");
            this._sendReport(message, !!matchReason);
        }), new AjxCallback(this, function(error) {
            this._logError("PR-CLASSIFY-01", error);
            // Classification failures must never block the internal reporting route.
            this._sendReport(message, false);
            return true;
        }));
    } catch (classificationError) {
        this._logError("PR-CLASSIFY-02", classificationError);
        this._sendReport(message, false);
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isConversationItem = function(item) {
    if (!item || typeof item !== "object") {
        return false;
    }
    try {
        if (typeof item.isZmConv === "function" && item.isZmConv()) {
            return true;
        }
        if (item.isZmConv === true || item.isConversation === true) {
            return true;
        }
        if (typeof ZmItem !== "undefined" && typeof ZmItem.CONV !== "undefined" && item.type === ZmItem.CONV) {
            return true;
        }
    } catch (ignoreConversationDetection) {}

    var type = String(item.type || item.itemType || item.__typename || "").toLowerCase();
    return type === "conv" || type === "conversation" || type === "zmconv" ||
        type.indexOf("conversation") !== -1 ||
        typeof item.getMsgList === "function" || typeof item.getFirstHotMsg === "function";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isMailMessage = function(item) {
    if (!item || typeof item !== "object" || this._isConversationItem(item)) {
        return false;
    }
    try {
        if (typeof item.isZmMailMsg === "function") {
            return !!item.isZmMailMsg();
        }
        if (item.isZmMailMsg === true) {
            return true;
        }
        if (typeof ZmMailMsg !== "undefined" && item instanceof ZmMailMsg) {
            return true;
        }
        if (typeof ZmItem !== "undefined" && typeof ZmItem.MSG !== "undefined" && item.type === ZmItem.MSG) {
            return true;
        }
    } catch (ignoreTypeDetection) {}

    var fallbackId = String(item.id || item.nId || "");
    return !!fallbackId && fallbackId.charAt(0) !== "-";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._singleMessageFromConversation = function(item) {
    if (!item || typeof item !== "object") {
        return null;
    }
    try {
        if (typeof item.getMsgList === "function") {
            var messages = item.getMsgList();
            if (messages && messages.length === 1 && this._isMailMessage(messages[0])) {
                return messages[0];
            }
            return null;
        }
    } catch (ignoreConversationList) {}
    return null;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getMessages = function(controller) {
    var controllerItem = null;
    var selection = null;
    var messages = [];
    var invalid = 0;
    var seen = {};
    try {
        if (controller && controller.getMsg) {
            controllerItem = controller.getMsg();
        }
    } catch (ignoreGetMsg) {}

    try {
        selection = controller && controller.getSelection ? controller.getSelection() : null;
        if ((!selection || !selection.length) && controller && controller.getListView) {
            var listView = controller.getListView();
            selection = listView && listView.getSelection ? listView.getSelection() : null;
        }
    } catch (ignoreSelection) {}

    if (selection && selection.length > 1) {
        for (var i = 0; i < selection.length; i++) {
            var selectedMessage = this._isMailMessage(selection[i]) ? selection[i] : null;
            var selectedId = selectedMessage && String(selectedMessage.id || selectedMessage.nId || "");
            if (!selectedMessage || !selectedId) {
                invalid += 1;
            } else if (!seen[selectedId]) {
                seen[selectedId] = true;
                messages.push(selectedMessage);
            }
        }
        return { messages: messages, invalid: invalid };
    }

    var message = this._isMailMessage(controllerItem) ? controllerItem :
        this._singleMessageFromConversation(controllerItem);
    if (!message && selection && selection.length === 1) {
        message = this._isMailMessage(selection[0]) ? selection[0] :
            this._singleMessageFromConversation(selection[0]);
    }
    return message ? { messages: [message], invalid: 0 } : { messages: [], invalid: 1 };
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getMessage = function(controller) {
    var result = this._getMessages(controller);
    return result.invalid || result.messages.length !== 1 ? null : result.messages[0];
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._loadClassificationHeaders = function(messageId, successCallback, errorCallback) {
    var self = this;
    var finished = false;
    var timeoutId = null;

    function clearTimer() {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    function succeed(headerMap) {
        if (finished) {
            return;
        }
        finished = true;
        clearTimer();
        successCallback.run(headerMap || {});
    }

    function fail(error) {
        if (finished) {
            return;
        }
        finished = true;
        clearTimer();
        if (errorCallback) {
            errorCallback.run(error);
        }
    }

    timeoutId = window.setTimeout(function() {
        fail(new Error("Classification request timed out."));
    }, this._getIntegerConfig("classificationTimeoutMs", 12000, 1000, 60000));

    var headers = [];
    var names = this._getHeaderNames();
    for (var i = 0; i < names.length; i++) {
        headers.push({ n: names[i] });
    }

    var request = {
        GetMsgRequest: {
            _jsns: "urn:zimbraMail",
            m: {
                id: String(messageId),
                read: 0,
                max: 1,
                header: headers
            }
        }
    };

    try {
        appCtxt.getAppController().sendRequest({
            jsonObj: request,
            asyncMode: true,
            noBusyOverlay: true,
            callback: new AjxCallback(this, function(response) {
                var headerMap = this._extractHeaderMap(response);
                if (this._isSimulation(headerMap) || !this._needsRawClassificationHeaders(headerMap)) {
                    succeed(headerMap);
                    return;
                }

                // Some Zimbra versions omit free headers in GetMsg. Only use the
                // authenticated RFC822 fallback when a configured classifier lacks
                // one of the header families it needs.
                this._loadRawClassificationHeaders(messageId, {
                    run: succeed
                }, {
                    run: function(rawError) {
                        if (self._hasClassificationHeaders(headerMap)) {
                            succeed(headerMap);
                        } else {
                            fail(rawError);
                        }
                        return true;
                    }
                });
            }),
            errorCallback: new AjxCallback(this, function(soapError) {
                this._loadRawClassificationHeaders(messageId, {
                    run: succeed
                }, {
                    run: function(rawError) {
                        fail(rawError || soapError);
                        return true;
                    }
                });
                return true;
            })
        });
    } catch (requestError) {
        fail(requestError);
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._hasHeader = function(headerMap, name) {
    var values = headerMap && headerMap[String(name || "").toLowerCase()];
    return !!(values && values.join("").replace(/\s/g, "").length);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._hasClassificationHeaders = function(headerMap) {
    var names = this._getHeaderNames();
    for (var i = 0; i < names.length; i++) {
        if (this._hasHeader(headerMap, names[i])) {
            return true;
        }
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._needsRawClassificationHeaders = function(headerMap) {
    var disclaimerRules = this._splitList(this._getConfig("simulationDisclaimerRules", ""), ";");
    var disclaimerHeader = this._getConfig("simulationDisclaimerHeader", "X-Disclaimer");
    if (disclaimerRules.length && !this._hasHeader(headerMap, disclaimerHeader)) {
        return true;
    }

    var domains = this._splitList(this._getConfig("simulationDkimDomains", ""), ",");
    var sources = this._splitList(this._getConfig("simulationSourceIndicators", ""), ",");
    if (domains.length && !this._hasHeader(headerMap, "Authentication-Results")) {
        return true;
    }
    if (domains.length && sources.length &&
            (!this._hasHeader(headerMap, "DKIM-Signature") || !this._hasHeader(headerMap, "Received"))) {
        return true;
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._loadRawClassificationHeaders = function(messageId, successCallback, errorCallback) {
    var self = this;
    var encodedId = encodeURIComponent(String(messageId));
    var urls = [
        "/home/~/?id=" + encodedId + "&auth=co",
        "/service/home/~/?id=" + encodedId + "&auth=co"
    ];
    var completed = false;
    var timeoutMs = this._getIntegerConfig("classificationTimeoutMs", 12000, 1000, 60000);
    var deadline = new Date().getTime() + timeoutMs;

    function completeSuccess(headerMap) {
        if (completed) {
            return;
        }
        completed = true;
        successCallback.run(headerMap);
    }

    function completeError(error) {
        if (completed) {
            return;
        }
        completed = true;
        if (errorCallback) {
            errorCallback.run(error);
        }
    }

    function tryUrl(index) {
        if (completed) {
            return;
        }
        if (index >= urls.length) {
            completeError(new Error("No usable classification headers were returned."));
            return;
        }

        var xhr = new XMLHttpRequest();
        var attemptCompleted = false;

        function finishAttempt(success, headerMap, error) {
            if (attemptCompleted || completed) {
                return;
            }
            attemptCompleted = true;
            xhr.onreadystatechange = null;
            xhr.onerror = null;
            xhr.ontimeout = null;
            xhr.onabort = null;

            if (success) {
                completeSuccess(headerMap);
            } else if (index + 1 < urls.length) {
                tryUrl(index + 1);
            } else {
                completeError(error || new Error("Classification header request failed."));
            }
        }

        try {
            var remainingMs = deadline - new Date().getTime();
            if (remainingMs <= 0) {
                finishAttempt(false, null, new Error("Classification header request timed out."));
                return;
            }
            xhr.open("GET", urls[index], true);
            xhr.withCredentials = true;
            xhr.timeout = remainingMs;
            xhr.onreadystatechange = function() {
                if (xhr.readyState !== 4) {
                    return;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    var headerMap = self._extractRawHeaderMap(xhr.responseText || "");
                    if (self._hasClassificationHeaders(headerMap)) {
                        finishAttempt(true, headerMap, null);
                        return;
                    }
                }
                finishAttempt(false, null, new Error("HTTP " + xhr.status));
            };
            xhr.onerror = function() {
                finishAttempt(false, null, new Error("Network error while reading classification headers."));
            };
            xhr.ontimeout = function() {
                finishAttempt(false, null, new Error("Classification header request timed out."));
            };
            xhr.onabort = function() {
                finishAttempt(false, null, new Error("Classification header request was aborted."));
            };
            xhr.send(null);
        } catch (requestError) {
            finishAttempt(false, null, requestError);
        }
    }

    tryUrl(0);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._extractRawHeaderMap = function(rawMessage) {
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
        map[key].push(currentValue.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""));
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/^[ \t]/.test(line) && currentName) {
            currentValue += " " + line.replace(/^[ \t]+/, "");
            continue;
        }

        commit();
        currentName = null;
        currentValue = "";

        var match = /^([^:\s]+):\s*(.*)$/.exec(line);
        if (match) {
            currentName = match[1];
            currentValue = match[2] || "";
        }
    }

    commit();
    return map;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._extractHeaderMap = function(response) {
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
        if (typeof node.getResponse === "function") {
            try { walk(node.getResponse(), depth + 1); } catch (ignoreGetResponse) {}
            return;
        }
        if (Object.prototype.toString.call(node) === "[object Array]") {
            for (var a = 0; a < node.length; a++) {
                walk(node[a], depth + 1);
            }
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

        for (var key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                walk(node[key], depth + 1);
            }
        }
    }

    walk(response, 0);
    return map;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getConfig = function(name, fallback) {
    var value = "";
    try {
        value = this.getConfig(name);
    } catch (ignoreConfig) {}
    if (value === null || typeof value === "undefined" || String(value) === "") {
        return typeof fallback === "undefined" ? "" : fallback;
    }
    return String(value);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getBooleanConfig = function(name, fallback) {
    var value = this._getConfig(name, fallback ? "true" : "false").toLowerCase();
    return value === "true" || value === "1" || value === "yes" || value === "on";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getIntegerConfig = function(name, fallback, minimum, maximum) {
    var value = parseInt(this._getConfig(name, String(fallback)), 10);
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
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._formatTemplate = function(value, fields) {
    var result = String(value || "");
    for (var name in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) {
            result = result.split("{" + name + "}").join(String(fields[name]));
        }
    }
    return result;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._pruneReportedMessageIds = function() {
    var cutoff = new Date().getTime() -
        this._getIntegerConfig("reportedMessageCooldownMs", 120000, 100, 3600000);
    for (var messageId in this._reportedMessageIds) {
        if (Object.prototype.hasOwnProperty.call(this._reportedMessageIds, messageId) &&
                (typeof this._reportedMessageIds[messageId] !== "number" ||
                 this._reportedMessageIds[messageId] <= cutoff)) {
            delete this._reportedMessageIds[messageId];
        }
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._splitList = function(value, separator) {
    var result = [];
    var parts = String(value || "").split(separator || ",");
    for (var i = 0; i < parts.length; i++) {
        var item = parts[i].replace(/^\s+|\s+$/g, "");
        if (item) {
            result.push(item);
        }
    }
    return result;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._escapeRegExp = function(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getHeaderNames = function() {
    var names = [
        this._getConfig("simulationDisclaimerHeader", "X-Disclaimer"),
        "Authentication-Results",
        "DKIM-Signature",
        "Received"
    ];
    var seen = {};
    var unique = [];
    for (var i = 0; i < names.length; i++) {
        var name = String(names[i] || "").replace(/^\s+|\s+$/g, "");
        var key = name.toLowerCase();
        if (name && !seen[key]) {
            seen[key] = true;
            unique.push(name);
        }
    }
    return unique;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._joinedHeader = function(headerMap, name) {
    return ((headerMap && headerMap[String(name || "").toLowerCase()]) || [])
        .join("\n").toLowerCase();
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._matchesDisclaimerRules = function(headerMap) {
    var headerName = this._getConfig("simulationDisclaimerHeader", "X-Disclaimer");
    var content = this._joinedHeader(headerMap, headerName);
    var rules = this._splitList(this._getConfig("simulationDisclaimerRules", ""), ";");
    if (!content || !rules.length) {
        return false;
    }
    for (var i = 0; i < rules.length; i++) {
        var markers = this._splitList(rules[i], "|");
        if (!markers.length) {
            continue;
        }
        var allMatch = true;
        for (var m = 0; m < markers.length; m++) {
            if (content.indexOf(markers[m].toLowerCase()) === -1) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) {
            return true;
        }
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._domainPattern = function(domain, parameterName) {
    return new RegExp(
        "(?:^|[\\s;])" + parameterName + "\\s*=\\s*" + this._escapeRegExp(domain.toLowerCase()) +
        "(?:$|[\\s;,()])",
        "i"
    );
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._matchesDkim = function(headerMap, requirePass) {
    var domains = this._splitList(this._getConfig("simulationDkimDomains", ""), ",");
    if (!domains.length) {
        return false;
    }

    if (requirePass) {
        var authResults = (headerMap && headerMap["authentication-results"]) || [];
        for (var a = 0; a < authResults.length; a++) {
            var clauses = String(authResults[a] || "").toLowerCase().split(";");
            for (var c = 0; c < clauses.length; c++) {
                var clause = clauses[c];
                if (!/dkim\s*=\s*pass\b/.test(clause)) {
                    continue;
                }
                for (var d = 0; d < domains.length; d++) {
                    if (this._domainPattern(domains[d], "header\\.d").test(clause)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    var signatures = (headerMap && headerMap["dkim-signature"]) || [];
    for (var s = 0; s < signatures.length; s++) {
        var signature = String(signatures[s] || "").toLowerCase();
        for (var i = 0; i < domains.length; i++) {
            if (this._domainPattern(domains[i], "d").test(signature)) {
                return true;
            }
        }
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._matchesSourceIndicator = function(headerMap) {
    var indicators = this._splitList(this._getConfig("simulationSourceIndicators", ""), ",");
    if (!indicators.length) {
        return false;
    }
    var received = this._joinedHeader(headerMap, "Received");
    for (var i = 0; i < indicators.length; i++) {
        if (received.indexOf(indicators[i].toLowerCase()) !== -1) {
            return true;
        }
    }
    return false;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getSimulationMatchReason = function(headerMap) {
    if (!this._getBooleanConfig("simulationDetectionEnabled", false)) {
        return "";
    }
    if (this._matchesDisclaimerRules(headerMap)) {
        return "disclaimer";
    }
    if (this._matchesDkim(headerMap, true)) {
        return "dkim-pass";
    }
    if (this._matchesDkim(headerMap, false) && this._matchesSourceIndicator(headerMap)) {
        return "dkim-signature+source";
    }
    return "";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isSimulation = function(headerMap) {
    return !!this._getSimulationMatchReason(headerMap);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._normalizeRecipient = function(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isValidRecipient = function(value) {
    return /^[^\s@<>;,]+@[^\s@<>;,]+$/.test(this._normalizeRecipient(value));
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getRoute = function(isSimulation) {
    var recipient;
    if (isSimulation) {
        recipient = this._normalizeRecipient(this._getConfig("simulationReportAddress", ""));
        if (!recipient) {
            return {
                error: this._getConfig(
                    "configurationErrorSimulationAddress",
                    "Simulation detection matched, but no simulation report address is configured."
                )
            };
        }
        if (!this._isValidRecipient(recipient)) {
            return {
                error: this._getConfig("configurationErrorInvalidAddress", "The configured report address is invalid.")
            };
        }
        return {
            recipient: recipient,
            subjectPrefix: this._getConfig("simulationSubjectPrefix", "Phishing simulation reported: "),
            successMessage: this._getConfig(
                "simulationSuccessMessage",
                "Good catch! This email was part of a phishing simulation and was reported correctly."
            )
        };
    }

    recipient = this._normalizeRecipient(this._getConfig("internalReportAddress", ""));
    if (!recipient) {
        return {
            error: this._getConfig(
                "configurationErrorInternalAddress",
                "No internal report address is configured."
            )
        };
    }
    if (!this._isValidRecipient(recipient)) {
        return {
            error: this._getConfig("configurationErrorInvalidAddress", "The configured report address is invalid.")
        };
    }
    return {
        recipient: recipient,
        subjectPrefix: this._getConfig("internalSubjectPrefix", "Suspicious email reported: "),
        successMessage: this._getConfig(
            "internalSuccessMessage",
            "The suspicious email was forwarded for review."
        )
    };
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._sendReport = function(message, isSimulation) {
    var messageId = message.id || message.nId;
    var originalSubject = message.subject || message._subject ||
        this._getConfig("noSubjectText", "(no subject)");
    var route = this._getRoute(isSimulation);
    if (!route.recipient) {
        delete this._reportedMessageIds[String(messageId)];
        this._completeBatchMessage({
            reported: false,
            failed: true,
            notMoved: false,
            message: route.error
        });
        return;
    }

    this._pendingMessageId = String(messageId);
    this._pendingTargetFolderId = this._getConfig(
        "targetFolderId",
        org_zimbracommunity_phishing_reporter_classic_HandlerObject.DEFAULT_TARGET_FOLDER_ID
    );
    this._pendingShouldMove = this._getBooleanConfig("moveReportedMessage", true);
    this._pendingAlreadyInTarget = String(message.folderId || message.l || "") ===
        this._pendingTargetFolderId;
    this._pendingSuccessMessage = route.successMessage;
    this._pendingRouteType = isSimulation ? "simulation" : "internal";
    var requestToken = ++this._pendingToken;
    this._pendingPhase = "send";
    this._startPendingTimer(
        "send",
        this._getIntegerConfig("sendTimeoutMs", 20000, 100, 120000),
        requestToken
    );

    var request = {
        SendMsgRequest: {
            _jsns: "urn:zimbraMail",
            noSave: 1,
            m: {
                e: [{ t: "t", a: route.recipient }],
                su: route.subjectPrefix + originalSubject,
                attach: { m: [{ id: this._pendingMessageId }] }
            }
        }
    };

    try {
        appCtxt.getAppController().sendRequest({
            jsonObj: request,
            asyncMode: true,
            noBusyOverlay: false,
            callback: new AjxCallback(this, function() { this._onReportAccepted(requestToken); }),
            errorCallback: new AjxCallback(this, function(error) { this._onReportError(error, requestToken); })
        });
    } catch (sendError) {
        this._onReportError(sendError, requestToken);
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onReportAccepted = function(requestToken) {
    if (this._pendingPhase !== "send" || requestToken !== this._pendingToken) {
        return;
    }
    this._clearPendingTimer();
    if (this._pendingMessageId) {
        this._reportedMessageIds[this._pendingMessageId] = new Date().getTime();
    }
    if (!this._pendingShouldMove || this._pendingAlreadyInTarget) {
        this._completeBatchMessage({
            reported: true,
            failed: false,
            notMoved: false,
            moved: false,
            routeType: this._pendingRouteType,
            message: this._pendingSuccessMessage
        });
        return;
    }
    this._moveToTarget(this._pendingMessageId);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._moveToTarget = function(messageId) {
    var requestToken = ++this._pendingToken;
    this._pendingPhase = "move";
    this._startPendingTimer(
        "move",
        this._getIntegerConfig("moveTimeoutMs", 15000, 100, 120000),
        requestToken
    );
    var request = {
        MsgActionRequest: {
            _jsns: "urn:zimbraMail",
            action: {
                id: String(messageId),
                op: "move",
                l: this._pendingTargetFolderId
            }
        }
    };

    try {
        appCtxt.getAppController().sendRequest({
            jsonObj: request,
            asyncMode: true,
            noBusyOverlay: false,
            callback: new AjxCallback(this, function() { this._onMoveSuccess(requestToken); }),
            errorCallback: new AjxCallback(this, function(error) { this._onMoveError(error, requestToken); })
        });
    } catch (moveError) {
        this._onMoveError(moveError, requestToken);
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onMoveSuccess = function(requestToken) {
    if (this._pendingPhase !== "move" || requestToken !== this._pendingToken) {
        return;
    }
    this._clearPendingTimer();
    this._completeBatchMessage({
        reported: true,
        failed: false,
        notMoved: false,
        moved: true,
        routeType: this._pendingRouteType,
        message: this._pendingSuccessMessage
    });
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._formatErrorMessage = function(name, fallback, reference) {
    var label = this._getConfig("errorReferenceLabel", "Reference");
    return this._getConfig(name, fallback) + "\n\n" + label + ": " + reference;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onMoveError = function(error, requestToken) {
    if (this._pendingPhase !== "move" || requestToken !== this._pendingToken) {
        return true;
    }
    this._clearPendingTimer();
    this._logError("PR-MOVE-01", error);
    this._completeBatchMessage({
        reported: true,
        failed: false,
        notMoved: true,
        routeType: this._pendingRouteType,
        message: this._formatErrorMessage(
            "moveErrorMessage",
            "The email was reported but could not be moved.",
            "PR-MOVE-01"
        )
    });
    return true;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onReportError = function(error, requestToken) {
    if (this._pendingPhase !== "send" || requestToken !== this._pendingToken) {
        return true;
    }
    this._clearPendingTimer();
    this._logError("PR-SEND-01", error);
    delete this._reportedMessageIds[this._pendingMessageId];
    this._completeBatchMessage({
        reported: false,
        failed: true,
        notMoved: false,
        message: this._formatErrorMessage(
            "sendErrorMessage",
            "The email could not be reported and was not moved.",
            "PR-SEND-01"
        )
    });
    return true;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._startPendingTimer = function(phase, timeoutMs, requestToken) {
    this._clearPendingTimer();
    this._pendingPhase = phase;
    var timeoutCallback = new AjxCallback(this, function() {
        this._onPendingTimeout(phase, requestToken);
    });
    this._pendingTimer = window.setTimeout(function() { timeoutCallback.run(); }, timeoutMs);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._clearPendingTimer = function() {
    if (this._pendingTimer !== null) {
        window.clearTimeout(this._pendingTimer);
        this._pendingTimer = null;
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onPendingTimeout = function(phase, requestToken) {
    if (this._pendingPhase !== phase || requestToken !== this._pendingToken) {
        return;
    }
    this._clearPendingTimer();
    if (phase === "move") {
        this._logError("PR-MOVE-TIMEOUT", new Error("Move request timed out"));
        this._completeBatchMessage({
            reported: true,
            failed: false,
            notMoved: true,
            routeType: this._pendingRouteType,
            message: this._formatErrorMessage(
                "moveTimeoutMessage",
                "The report was sent, but moving the email took too long. You can move it manually.",
                "PR-MOVE-TIMEOUT"
            )
        });
        return;
    }
    this._reportedMessageIds[this._pendingMessageId] = new Date().getTime();
    this._logError("PR-SEND-TIMEOUT", new Error("Send request timed out"));
    this._completeBatchMessage({
        reported: false,
        failed: true,
        notMoved: false,
        message: this._formatErrorMessage(
            "sendTimeoutMessage",
            "The server response took too long. The report may still have been sent. Please wait before trying again.",
            "PR-SEND-TIMEOUT"
        )
    });
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._completeBatchMessage = function(result) {
    var state = this._batchState;
    this._clearPending();
    if (!state) {
        this._busy = false;
        if (result.reported && !result.notMoved) {
            this._setStatus(result.message);
        } else {
            this._showError(result.message);
        }
        return;
    }
    state.results.push(result);
    state.index += 1;
    var nextCallback = new AjxCallback(this, this._startNextBatchMessage);
    window.setTimeout(function() { nextCallback.run(); }, 0);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._finishBatch = function() {
    var state = this._batchState;
    if (!state) {
        this._busy = false;
        return;
    }
    this._batchState = null;
    this._busy = false;
    if (!state.batchMode && state.results.length === 1) {
        if (state.results[0].reported && !state.results[0].notMoved) {
            this._setStatus(state.results[0].message);
        } else {
            this._showError(state.results[0].message);
        }
        return;
    }
    var totals = { reported: 0, failed: 0, notMoved: 0, simulation: 0, internal: 0 };
    for (var i = 0; i < state.results.length; i++) {
        if (state.results[i].reported) { totals.reported += 1; }
        if (state.results[i].failed) { totals.failed += 1; }
        if (state.results[i].notMoved) { totals.notMoved += 1; }
        if (state.results[i].reported && state.results[i].routeType === "simulation") {
            totals.simulation += 1;
        }
        if (state.results[i].reported && state.results[i].routeType === "internal") {
            totals.internal += 1;
        }
    }
    this._setStatus(this._formatTemplate(this._getConfig(
        "batchSummaryMessage",
        "Batch complete: {reported} reported ({simulation} simulations, {internal} internal reviews), {failed} failed, {notMoved} not moved, {skipped} skipped."
    ), {
        reported: totals.reported,
        simulation: totals.simulation,
        internal: totals.internal,
        failed: totals.failed,
        notMoved: totals.notMoved,
        skipped: state.skipped
    }));
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._debug = function(message, detail) {
    if (!this._getBooleanConfig("debugLogging", false)) {
        return;
    }
    try {
        if (typeof console !== "undefined" && console.log) {
            console.log("[Zimbra Phishing Reporter] " + message, detail || "");
        }
    } catch (ignoreDebug) {}
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._logError = function(reference, error) {
    if (!this._getBooleanConfig("debugLogging", false)) {
        return;
    }
    try {
        if (typeof console !== "undefined" && console.error) {
            console.error("[Zimbra Phishing Reporter] " + reference, error || "");
        }
    } catch (ignoreErrorLog) {}
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._clearPending = function() {
    this._clearPendingTimer();
    this._pendingMessageId = null;
    this._pendingAlreadyInTarget = false;
    this._pendingShouldMove = true;
    this._pendingTargetFolderId = org_zimbracommunity_phishing_reporter_classic_HandlerObject.DEFAULT_TARGET_FOLDER_ID;
    this._pendingSuccessMessage = "";
    this._pendingRouteType = "";
    this._pendingPhase = "";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._setStatus = function(message) {
    try {
        appCtxt.getAppController().setStatusMsg(message, ZmStatusView.LEVEL_INFO);
    } catch (ignoreStatus) {
        window.alert(message);
    }
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._showError = function(message) {
    window.alert(message);
};
