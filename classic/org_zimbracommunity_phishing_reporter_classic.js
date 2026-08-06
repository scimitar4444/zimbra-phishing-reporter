/* Zimbra Phishing Reporter - Classic UI - Version 2.0.1 */

function org_zimbracommunity_phishing_reporter_classic_HandlerObject() {
    this._busy = false;
    this._pendingMessageId = null;
    this._pendingAlreadyInTarget = false;
    this._pendingShouldMove = true;
    this._pendingTargetFolderId = "4";
    this._pendingSuccessMessage = "";
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

    var message = this._getMessage(controller);
    if (!message) {
        this._showError(this._getConfig("selectOneMessageMessage", "Open or select exactly one email."));
        return;
    }

    var messageId = message.id || message.nId;
    if (!messageId) {
        this._showError(this._getConfig("missingMessageIdMessage", "The message ID could not be determined."));
        return;
    }

    this._busy = true;
    if (!this._getBooleanConfig("simulationDetectionEnabled", false)) {
        this._sendReport(message, false);
        return;
    }

    this._loadClassificationHeaders(String(messageId), new AjxCallback(this, function(headerMap) {
        this._sendReport(message, this._isSimulation(headerMap));
    }), new AjxCallback(this, function() {
        // If classification is unavailable, use the normal internal reporting route.
        this._sendReport(message, false);
        return true;
    }));
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getMessage = function(controller) {
    var item = null;
    try {
        if (controller && controller.getMsg) {
            item = controller.getMsg();
        }
    } catch (ignoreGetMsg) {}

    if (!item) {
        try {
            var selection = controller && controller.getSelection ? controller.getSelection() : null;
            if ((!selection || !selection.length) && controller && controller.getListView) {
                var listView = controller.getListView();
                selection = listView && listView.getSelection ? listView.getSelection() : null;
            }
            if (selection && selection.length === 1) {
                item = selection[0];
            }
        } catch (ignoreSelection) {}
    }

    if (!item) {
        return null;
    }
    if (item.isZmMailMsg || item.id || item.nId) {
        return item;
    }
    try {
        if (item.getFirstHotMsg) {
            return item.getFirstHotMsg();
        }
        if (item.getMsgList) {
            var messages = item.getMsgList();
            if (messages && messages.length) {
                return messages[0];
            }
        }
    } catch (ignoreConversation) {}
    return null;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._loadClassificationHeaders = function(messageId, successCallback, errorCallback) {
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

    appCtxt.getAppController().sendRequest({
        jsonObj: request,
        asyncMode: true,
        noBusyOverlay: true,
        callback: new AjxCallback(this, function(response) {
            var headerMap = this._extractHeaderMap(response);
            if (this._hasClassificationHeaders(headerMap) && this._isSimulation(headerMap)) {
                successCallback.run(headerMap);
                return;
            }

            // Some Zimbra versions return only a subset of requested free headers.
            // Read the authenticated RFC822 source before treating the message as
            // an ordinary report, so a missing disclaimer does not cause a false negative.
            this._loadRawClassificationHeaders(messageId, successCallback, new AjxCallback(this, function() {
                if (this._hasClassificationHeaders(headerMap)) {
                    successCallback.run(headerMap);
                    return true;
                }
                if (errorCallback) {
                    errorCallback.run();
                }
                return true;
            }));
        }),
        errorCallback: new AjxCallback(this, function() {
            this._loadRawClassificationHeaders(messageId, successCallback, errorCallback);
            return true;
        })
    });
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._hasClassificationHeaders = function(headerMap) {
    var names = this._getHeaderNames();
    for (var i = 0; i < names.length; i++) {
        var values = headerMap && headerMap[String(names[i]).toLowerCase()];
        if (values && values.join("").replace(/\s/g, "").length) {
            return true;
        }
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

    function tryUrl(index) {
        if (index >= urls.length) {
            if (errorCallback) {
                errorCallback.run();
            }
            return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open("GET", urls[index], true);
        xhr.withCredentials = true;
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) {
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                var headerMap = self._extractRawHeaderMap(xhr.responseText || "");
                if (self._hasClassificationHeaders(headerMap)) {
                    successCallback.run(headerMap);
                    return;
                }
            }

            tryUrl(index + 1);
        };
        xhr.onerror = function() {
            tryUrl(index + 1);
        };
        xhr.send(null);
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

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._matchesDkim = function(headerMap, requirePass) {
    var domains = this._splitList(this._getConfig("simulationDkimDomains", ""), ",");
    if (!domains.length) {
        return false;
    }
    var authResults = this._joinedHeader(headerMap, "Authentication-Results");
    var dkimSignature = this._joinedHeader(headerMap, "DKIM-Signature");
    if (requirePass && !/dkim\s*=\s*pass\b/.test(authResults)) {
        return false;
    }
    var searchText = requirePass ? authResults : dkimSignature;
    for (var i = 0; i < domains.length; i++) {
        var domain = this._escapeRegExp(domains[i].toLowerCase());
        var pattern = new RegExp("(?:header\\.d|\\bd)\\s*=\\s*" + domain + "(?:\\s|;|$)", "i");
        if (pattern.test(searchText)) {
            return true;
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

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._isSimulation = function(headerMap) {
    if (!this._getBooleanConfig("simulationDetectionEnabled", false)) {
        return false;
    }
    var disclaimerMatch = this._matchesDisclaimerRules(headerMap);
    var verifiedDkimMatch = this._matchesDkim(headerMap, true);
    var rawDkimMatch = this._matchesDkim(headerMap, false);
    var sourceMatch = this._matchesSourceIndicator(headerMap);
    return disclaimerMatch || verifiedDkimMatch || (rawDkimMatch && sourceMatch);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getRoute = function(isSimulation) {
    if (isSimulation) {
        var simulationAddress = this._getConfig("simulationReportAddress", "");
        if (!simulationAddress) {
            return {
                error: this._getConfig(
                    "configurationErrorSimulationAddress",
                    "Simulation detection matched, but no simulation report address is configured."
                )
            };
        }
        return {
            recipient: simulationAddress,
            subjectPrefix: this._getConfig("simulationSubjectPrefix", "Phishing simulation reported: "),
            successMessage: this._getConfig(
                "simulationSuccessMessage",
                "Good catch! This email was part of a phishing simulation and was reported correctly."
            )
        };
    }

    var internalAddress = this._getConfig("internalReportAddress", "");
    if (!internalAddress) {
        return {
            error: this._getConfig(
                "configurationErrorInternalAddress",
                "No internal report address is configured."
            )
        };
    }
    return {
        recipient: internalAddress,
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
        this._resetPending();
        this._showError(route.error);
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
    var recipient = route.recipient;

    var request = {
        SendMsgRequest: {
            _jsns: "urn:zimbraMail",
            noSave: 1,
            m: {
                e: [{ t: "t", a: recipient }],
                su: route.subjectPrefix + originalSubject,
                attach: { m: [{ id: this._pendingMessageId }] }
            }
        }
    };

    appCtxt.getAppController().sendRequest({
        jsonObj: request,
        asyncMode: true,
        noBusyOverlay: false,
        callback: new AjxCallback(this, this._onReportAccepted),
        errorCallback: new AjxCallback(this, this._onReportError)
    });
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onReportAccepted = function() {
    if (!this._pendingShouldMove || this._pendingAlreadyInTarget) {
        this._finishFeedback();
        return;
    }
    this._moveToTarget(this._pendingMessageId);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._moveToTarget = function(messageId) {
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

    appCtxt.getAppController().sendRequest({
        jsonObj: request,
        asyncMode: true,
        noBusyOverlay: false,
        callback: new AjxCallback(this, this._onMoveSuccess),
        errorCallback: new AjxCallback(this, this._onMoveError)
    });
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onMoveSuccess = function() {
    this._finishFeedback();
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._finishFeedback = function() {
    var successMessage = this._pendingSuccessMessage ||
        this._getConfig("internalSuccessMessage", "The suspicious email was forwarded for review.");
    this._resetPending();
    this._setStatus(successMessage);
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onMoveError = function(error) {
    var detail = this._getErrorDetail(error);
    this._resetPending();
    this._showError(
        this._getConfig("moveErrorMessage", "The email was reported but could not be moved.") + detail
    );
    return true;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._onReportError = function(error) {
    var detail = this._getErrorDetail(error);
    this._resetPending();
    this._showError(this._getConfig("sendErrorMessage", "The email could not be reported and was not moved.") + detail);
    return true;
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._getErrorDetail = function(error) {
    try {
        if (error && error.getDetail) {
            return "\n\n" + error.getDetail();
        }
    } catch (ignoreDetail) {}
    return "";
};

org_zimbracommunity_phishing_reporter_classic_HandlerObject.prototype._resetPending = function() {
    this._busy = false;
    this._pendingMessageId = null;
    this._pendingAlreadyInTarget = false;
    this._pendingShouldMove = true;
    this._pendingTargetFolderId = org_zimbracommunity_phishing_reporter_classic_HandlerObject.DEFAULT_TARGET_FOLDER_ID;
    this._pendingSuccessMessage = "";
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
