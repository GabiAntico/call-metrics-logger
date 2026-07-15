const totalCallsElement = document.getElementById('totalCalls');
const technicalVisitsElement = document.getElementById('technicalVisits');
const installationVisitsElement = document.getElementById('installationVisits');
const rescheduledVisitsElement = document.getElementById('rescheduledVisits');
const managementCountElement = document.getElementById('managementCount');
const managementListElement = document.getElementById('managementList');
const saveManagementBtn = document.getElementById('saveManagementBtn');
const resetManagementBtn = document.getElementById('resetManagementBtn');
const finishCallBtn = document.getElementById('finishCallBtn');
const clearCallBtn = document.getElementById('clearCallBtn');
const undoLastCallBtn = document.getElementById('undoLastCallBtn');
const clearNotesBtn = document.getElementById('clearNotesBtn');
const callNotesElement = document.getElementById('callNotes');
const authPanel = document.getElementById('authPanel');
const appContent = document.getElementById('appContent');
const sessionBar = document.getElementById('sessionBar');
const sessionEmailElement = document.getElementById('sessionEmail');
const sessionMenuBtn = document.getElementById('sessionMenuBtn');
const sessionMenuPanel = document.getElementById('sessionMenuPanel');
const loginForm = document.getElementById('loginForm');
const loginEmailElement = document.getElementById('loginEmail');
const loginPasswordElement = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusMessage = document.getElementById('statusMessage');
const rtOptions = document.getElementById('rtOptions');
const rtNoOptions = document.getElementById('rtNoOptions');
const stOptions = document.getElementById('stOptions');
const onlineSolutionToggle = document.getElementById('onlineSolutionToggle');
const installationShipmentToggle = document.getElementById('installationShipmentToggle');

const fieldIds = ['customerName', 'clientNumber', 'customerDni'];
const supabaseRestUrl = 'https://wilzizghmkfaersiffmt.supabase.co/rest/v1/';
const supabaseAuthUrl = supabaseRestUrl.replace(/\/rest\/v1\/?$/, '/auth/v1');
const supabasePublishableKey = 'sb_publishable_Oc5Ki4oGgLYbFbLqyRfn0A_d1G-KLG-';
const authSessionKey = 'supabaseAuthSession';
const localRetentionDays = 10;
const authRefreshWindowSeconds = 5 * 60;
const authKeepAliveIntervalMs = 4 * 60 * 1000;

const currentCall = {
    managements: []
};

let authSession = null;
let authRefreshPromise = null;
let authKeepAliveTimer = null;
let authExpiredSessionRedirected = false;

function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function storageGet(key) {
    if (globalThis.chrome?.storage?.local) {
        return chrome.storage.local.get(key);
    }

    const value = localStorage.getItem(key);
    return value ? { [key]: JSON.parse(value) } : {};
}

async function storageSet(values) {
    if (globalThis.chrome?.storage?.local) {
        return chrome.storage.local.set(values);
    }

    Object.entries(values).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
    });
}

async function storageGetAll() {
    if (globalThis.chrome?.storage?.local) {
        return chrome.storage.local.get(null);
    }

    return Object.fromEntries(
        Object.keys(localStorage).map((key) => [key, JSON.parse(localStorage.getItem(key))])
    );
}

async function storageRemove(keys) {
    if (globalThis.chrome?.storage?.local) {
        return chrome.storage.local.remove(keys);
    }

    (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        localStorage.removeItem(key);
    });
}

function currentUserId() {
    return authSession?.user?.id ?? 'anonymous';
}

function metricsStorageKey(date = todayKey()) {
    return `metrics:${currentUserId()}:${date}`;
}

function callsStorageKey(date = todayKey()) {
    return `calls:${currentUserId()}:${date}`;
}

function draftNotesStorageKey() {
    return `advisorDraftNotes:${currentUserId()}`;
}

function normalizeDailyMetrics(metrics = {}) {
    return {
        totalCalls: metrics.totalCalls ?? 0,
        technicalVisits: metrics.technicalVisits ?? 0,
        installationVisits: metrics.installationVisits ?? 0,
        rescheduledVisits: metrics.rescheduledVisits ?? 0
    };
}

function dateKeyToLocalDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);

    if (!year || !month || !day) {
        return null;
    }

    return new Date(year, month - 1, day);
}

function isLocalRecordKeyOlderThanRetention(key) {
    const pattern = new RegExp(`^(calls|metrics):${currentUserId()}:(\\d{4}-\\d{2}-\\d{2})$`);
    const match = key.match(pattern);

    if (!match) {
        return false;
    }

    const recordDate = dateKeyToLocalDate(match[2]);

    if (!recordDate) {
        return false;
    }

    const cutoffDate = dateKeyToLocalDate(todayKey());
    cutoffDate.setDate(cutoffDate.getDate() - localRetentionDays);

    return recordDate < cutoffDate;
}

async function cleanupOldLocalRecords() {
    if (!authSession?.user?.id) {
        return;
    }

    const storedValues = await storageGetAll();
    const keysToRemove = Object.keys(storedValues).filter(isLocalRecordKeyOlderThanRetention);

    if (keysToRemove.length > 0) {
        await storageRemove(keysToRemove);
    }
}

async function getTodayMetrics() {
    const key = metricsStorageKey();
    const result = await storageGet(key);
    const storedMetrics = result[key];
    const metrics = normalizeDailyMetrics(storedMetrics);

    if (storedMetrics?.installationVisits === undefined || storedMetrics?.rescheduledVisits === undefined) {
        const todayCalls = await getTodayCalls();

        return todayCalls.reduce((accumulator, callRecord) => {
            const totals = getCallVisitTotals(callRecord);

            return {
                ...accumulator,
                installationVisits: accumulator.installationVisits + totals.installationVisits,
                rescheduledVisits: accumulator.rescheduledVisits + totals.rescheduledVisits
            };
        }, metrics);
    }

    return metrics;
}

async function saveTodayMetrics(metrics) {
    await storageSet({
        [metricsStorageKey()]: normalizeDailyMetrics(metrics)
    });
}

async function getTodayCalls() {
    const key = callsStorageKey();
    const result = await storageGet(key);

    return result[key] ?? [];
}

async function saveTodayCalls(calls) {
    await storageSet({
        [callsStorageKey()]: calls
    });
}

async function saveCompletedCall(callRecord) {
    const todayCalls = await getTodayCalls();

    await saveTodayCalls([...todayCalls, callRecord]);
}

async function loadDraftNotes() {
    const key = draftNotesStorageKey();
    const result = await storageGet(key);
    callNotesElement.value = result[key] ?? '';
}

async function saveDraftNotes() {
    if (!authSession?.user?.id) {
        return;
    }

    await storageSet({
        [draftNotesStorageKey()]: callNotesElement.value
    });
}

async function supabaseAuthRequest(path, options = {}) {
    const headers = {
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json'
    };

    if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(`${supabaseAuthUrl}/${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            payload.msg ??
            payload.message ??
            payload.error_description ??
            payload.error ??
            'No se pudo completar la autenticación.'
        );

        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

function createAuthExpiredError() {
    const error = new Error('Tu sesión venció. Iniciá sesión nuevamente.');
    error.isAuthExpired = true;
    return error;
}

function isAuthExpiredError(error) {
    const payload = error?.payload ?? {};
    const authText = [
        error?.message,
        payload.msg,
        payload.message,
        payload.error_description,
        payload.error,
        payload.code
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return (
        error?.isAuthExpired === true ||
        error?.status === 401 ||
        authText.includes('refresh token') ||
        authText.includes('invalid refresh') ||
        authText.includes('invalid_grant') ||
        authText.includes('jwt expired') ||
        authText.includes('invalid jwt') ||
        authText.includes('token has expired') ||
        authText.includes('session not found')
    );
}

function normalizeSession(session) {
    return {
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? authSession?.refresh_token,
        expires_at:
            session.expires_at ??
            Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
        user: session.user ?? authSession?.user
    };
}

async function saveAuthSession(session) {
    authSession = normalizeSession(session);

    await storageSet({
        [authSessionKey]: authSession
    });

    return authSession;
}

function sessionNeedsRefresh(session) {
    const now = Math.floor(Date.now() / 1000);

    return !session?.expires_at || session.expires_at - now < authRefreshWindowSeconds;
}

async function refreshAuthSession() {
    if (!authSession?.refresh_token) {
        throw new Error('No hay sesión guardada.');
    }

    if (authRefreshPromise) {
        return authRefreshPromise;
    }

    const refreshToken = authSession.refresh_token;

    authRefreshPromise = supabaseAuthRequest('token?grant_type=refresh_token', {
        method: 'POST',
        body: {
            refresh_token: refreshToken
        }
    })
        .then((session) => {
            if (authSession?.refresh_token !== refreshToken) {
                return authSession;
            }

            return saveAuthSession(session);
        })
        .finally(() => {
            authRefreshPromise = null;
        });

    return authRefreshPromise;
}

async function ensureAuthSession() {
    if (!authSession?.access_token || !authSession?.user?.id) {
        throw new Error('Iniciá sesión para guardar registros.');
    }

    if (sessionNeedsRefresh(authSession)) {
        try {
            await refreshAuthSession();
        } catch (error) {
            if (isAuthExpiredError(error)) {
                await expireAuthSession();
                throw createAuthExpiredError();
            }

            throw new Error(
                'No se pudo renovar la sesión automáticamente. Revisá tu conexión e intentá de nuevo.'
            );
        }
    }

    return authSession;
}

async function refreshAuthSessionIfNeeded() {
    if (!authSession?.refresh_token || !sessionNeedsRefresh(authSession)) {
        return;
    }

    try {
        await refreshAuthSession();
    } catch (error) {
        if (isAuthExpiredError(error)) {
            await expireAuthSession();
            return;
        }

        // La siguiente acción del usuario reintenta y muestra el error real si el refresh token ya no sirve.
    }
}

function stopAuthKeepAlive() {
    if (authKeepAliveTimer) {
        clearInterval(authKeepAliveTimer);
        authKeepAliveTimer = null;
    }
}

function startAuthKeepAlive() {
    stopAuthKeepAlive();

    if (!authSession?.refresh_token) {
        return;
    }

    authKeepAliveTimer = setInterval(() => {
        refreshAuthSessionIfNeeded();
    }, authKeepAliveIntervalMs);
}

async function expireAuthSession() {
    authExpiredSessionRedirected = true;
    stopAuthKeepAlive();
    setSessionMenuOpen(false);
    authSession = null;
    await storageRemove(authSessionKey);
    clearCurrentCall();
    await renderAuthState({ silent: true });
    setStatus('Tu sesión venció. Iniciá sesión nuevamente.', 'error');
}

async function loadAuthSession() {
    const result = await storageGet(authSessionKey);
    authSession = result[authSessionKey] ?? null;

    if (!authSession?.access_token) {
        authSession = null;
        return;
    }

    if (!sessionNeedsRefresh(authSession)) {
        return;
    }

    try {
        await refreshAuthSession();
    } catch (error) {
        if (isAuthExpiredError(error)) {
            await expireAuthSession();
            return;
        }

        // Conserva la sesión guardada para que la próxima acción pueda reintentar la renovación.
    }
}

function setSessionMenuOpen(isOpen) {
    sessionMenuPanel.classList.toggle('is-hidden', !isOpen);
    sessionMenuBtn.setAttribute('aria-expanded', String(isOpen));
}

function toggleSessionMenu() {
    setSessionMenuOpen(sessionMenuPanel.classList.contains('is-hidden'));
}

function closeSessionMenuFromOutside(event) {
    if (!sessionBar.contains(event.target)) {
        setSessionMenuOpen(false);
    }
}

function closeSessionMenuWithEscape(event) {
    if (event.key === 'Escape') {
        setSessionMenuOpen(false);
    }
}

async function renderAuthState(options = {}) {
    const isAuthenticated = Boolean(authSession?.access_token && authSession?.user?.id);

    authPanel.classList.toggle('is-hidden', isAuthenticated);
    appContent.classList.toggle('is-hidden', !isAuthenticated);
    sessionBar.classList.toggle('is-hidden', !isAuthenticated);
    sessionEmailElement.textContent = authSession?.user?.email ?? '';

    if (!isAuthenticated) {
        stopAuthKeepAlive();
        setSessionMenuOpen(false);
        callNotesElement.value = '';
        totalCallsElement.textContent = '0';
        technicalVisitsElement.textContent = '0';
        installationVisitsElement.textContent = '0';
        rescheduledVisitsElement.textContent = '0';
        finishCallBtn.disabled = true;
        undoLastCallBtn.disabled = true;

        if (!options.silent) {
            setStatus('Iniciá sesión para cargar llamadas.');
        }

        return;
    }

    startAuthKeepAlive();
    await cleanupOldLocalRecords();
    await renderMetrics();
    await loadDraftNotes();
    await renderUndoState();
    updateSegmentedIndicators();

    if (!options.silent) {
        setStatus('Sesión iniciada.', 'success');
    }
}

async function supabaseRestRequest(path, options = {}) {
    const session = await ensureAuthSession();
    const headers = {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
    };

    if (options.prefer) {
        headers.Prefer = options.prefer;
    }

    const response = await fetch(`${supabaseRestUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const responseText = await response.text();
    let payload = null;

    if (responseText) {
        try {
            payload = JSON.parse(responseText);
        } catch {
            payload = { message: responseText };
        }
    }

    if (!response.ok) {
        const error = new Error(
            payload?.message ??
            payload?.details ??
            payload?.hint ??
            'No se pudo guardar el registro en Supabase.'
        );

        error.status = response.status;
        error.payload = payload;

        if (isAuthExpiredError(error)) {
            await expireAuthSession();
            throw createAuthExpiredError();
        }

        throw error;
    }

    return payload;
}

function selectedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function setSelectedValue(name, value) {
    const option = document.querySelector(`input[name="${name}"][value="${value}"]`);

    if (option) {
        option.checked = true;
    }
}

function setStatus(message, type = 'default') {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('is-success', type === 'success');
    statusMessage.classList.toggle('is-error', type === 'error');
}

async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.top = '-999px';
    document.body.append(helper);
    helper.select();

    const copied = document.execCommand('copy');
    helper.remove();

    if (!copied) {
        throw new Error('No se pudo copiar el texto.');
    }
}

async function copyFieldValue(targetId) {
    const field = document.getElementById(targetId);
    const value = field?.value ?? '';

    if (value.length === 0) {
        setStatus('No hay texto para copiar.', 'error');
        return;
    }

    try {
        await copyToClipboard(value);
        setStatus('Copiado al portapapeles.', 'success');
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

function getCustomerData() {
    return {
        name: document.getElementById('customerName').value.trim(),
        clientNumber: document.getElementById('clientNumber').value.trim(),
        dni: document.getElementById('customerDni').value.trim()
    };
}

function getManagementFromForm() {
    const type = selectedValue('managementType');

    if (type === 'ST') {
        const withInstallationShipment = installationShipmentToggle.checked;

        return {
            id: createId(),
            type,
            solutionOnline: null,
            result: withInstallationShipment ? 'installation_shipment' : 'no_installation_shipment',
            technicalVisits: withInstallationShipment ? 1 : 0,
            createdAt: new Date().toISOString()
        };
    }

    if (type !== 'RT') {
        return {
            id: createId(),
            type,
            solutionOnline: null,
            result: null,
            technicalVisits: type === 'RVT' ? 1 : 0,
            createdAt: new Date().toISOString()
        };
    }

    const solutionOnline = onlineSolutionToggle.checked;
    const result = solutionOnline ? 'online' : selectedValue('rtNoResult');

    return {
        id: createId(),
        type,
        solutionOnline,
        result,
        technicalVisits: result === 'visit' ? 1 : 0,
        createdAt: new Date().toISOString()
    };
}

function countTechnicalVisitTypes(managements) {
    const counts = managements.reduce(
        (accumulator, management) => {
            if (management.type === 'RT' && management.result === 'visit') {
                accumulator.regularVisitCount += 1;
            }

            if (management.type === 'ST' && management.result === 'installation_shipment') {
                accumulator.installationVisitCount += 1;
            }

            if (management.type === 'RVT') {
                accumulator.rescheduledVisitCount += 1;
            }

            return accumulator;
        },
        {
            regularVisitCount: 0,
            installationVisitCount: 0,
            rescheduledVisitCount: 0
        }
    );

    return {
        ...counts,
        technicalVisitCount:
            counts.regularVisitCount + counts.installationVisitCount + counts.rescheduledVisitCount
    };
}

function getCallVisitTotals(callRecord) {
    if (Array.isArray(callRecord.managements)) {
        const counts = countTechnicalVisitTypes(callRecord.managements);

        return {
            technicalVisits: counts.technicalVisitCount,
            installationVisits: counts.installationVisitCount,
            rescheduledVisits: counts.rescheduledVisitCount
        };
    }

    return {
        technicalVisits: callRecord.totals?.technicalVisits ?? 0,
        installationVisits: callRecord.totals?.installationVisits ?? 0,
        rescheduledVisits: callRecord.totals?.rescheduledVisits ?? 0
    };
}

function managementTitle(management) {
    if (management.type !== 'RT') {
        if (management.type === 'ST') {
            return management.result === 'installation_shipment'
                ? 'ST - envío de instalación'
                : 'ST - sin envío de instalación';
        }

        if (management.type === 'RVT') {
            return 'Reagenda de VT';
        }

        return management.type;
    }

    if (management.solutionOnline) {
        return 'RT - solución online';
    }

    if (management.result === 'visit') {
        return 'RT - visita técnica';
    }

    if (management.result === 'observation') {
        return 'RT - observación';
    }

    return 'RT - ticket';
}

function managementDetail(management) {
    const labels = {
        RA: 'Reclamo administrativo',
        SU: 'Sugerencia',
        RVT: 'Reagenda de visita técnica. Suma una VT.'
    };

    if (management.type === 'ST') {
        return management.result === 'installation_shipment'
            ? 'Solicitud técnica con envío de instalación. Suma una VT.'
            : 'Solicitud técnica sin envío de instalación. No suma visita técnica.';
    }

    if (management.type !== 'RT') {
        return labels[management.type] ?? 'Gestión registrada';
    }

    if (management.solutionOnline) {
        return 'Solución online: sí. No suma visita técnica.';
    }

    if (management.result === 'visit') {
        return 'Solución online: no. Se envía visita técnica.';
    }

    if (management.result === 'observation') {
        return 'Solución online: no. Se agrega observación. No suma visita técnica.';
    }

    return 'Solución online: no. Se genera ticket.';
}

function renderManagementList() {
    managementListElement.innerHTML = '';

    if (currentCall.managements.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty-state';
        empty.textContent = 'Todavía no hay gestiones cargadas.';
        managementListElement.append(empty);
    } else {
        currentCall.managements.forEach((management) => {
            const item = document.createElement('li');
            item.className = 'management-item';

            const main = document.createElement('div');
            main.className = 'management-main';

            const title = document.createElement('div');
            title.className = 'management-title';
            title.textContent = managementTitle(management);

            if (management.technicalVisits > 0) {
                const pill = document.createElement('span');
                pill.className = 'visit-pill';
                pill.textContent = 'VT';
                title.append(pill);
            }

            const detail = document.createElement('p');
            detail.className = 'management-detail';
            detail.textContent = managementDetail(management);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-button';
            removeButton.textContent = 'X';
            removeButton.setAttribute('aria-label', `Quitar ${managementTitle(management)}`);
            removeButton.addEventListener('click', () => removeManagement(management.id));

            main.append(title, detail);
            item.append(main, removeButton);
            managementListElement.append(item);
        });
    }

    const count = currentCall.managements.length;
    managementCountElement.textContent = `${count} ${count === 1 ? 'cargada' : 'cargadas'}`;
    finishCallBtn.disabled = count === 0;
}

function renderDependentOptions() {
    const isRt = selectedValue('managementType') === 'RT';
    const isSt = selectedValue('managementType') === 'ST';
    const isOnlineSolution = onlineSolutionToggle.checked;

    rtOptions.classList.toggle('is-hidden', !isRt);
    rtNoOptions.classList.toggle('is-hidden', !isRt || isOnlineSolution);
    stOptions.classList.toggle('is-hidden', !isSt);
    updateSegmentedIndicators();
}

function updateSegmentedIndicator(group) {
    const checkedInput = group.querySelector('input:checked');
    const activeOption = checkedInput?.closest('.radio-chip');

    if (!activeOption || group.offsetParent === null) {
        group.style.setProperty('--segment-opacity', '0');
        return;
    }

    const groupRect = group.getBoundingClientRect();
    const activeRect = activeOption.getBoundingClientRect();

    group.style.setProperty('--segment-x', `${activeRect.left - groupRect.left}px`);
    group.style.setProperty('--segment-y', `${activeRect.top - groupRect.top}px`);
    group.style.setProperty('--segment-width', `${activeRect.width}px`);
    group.style.setProperty('--segment-height', `${activeRect.height}px`);
    group.style.setProperty('--segment-opacity', '1');
}

function updateSegmentedIndicators() {
    document.querySelectorAll('.segmented-options').forEach(updateSegmentedIndicator);
}

async function renderMetrics() {
    const metrics = await getTodayMetrics();

    totalCallsElement.textContent = metrics.totalCalls;
    technicalVisitsElement.textContent = metrics.technicalVisits;
    installationVisitsElement.textContent = metrics.installationVisits;
    rescheduledVisitsElement.textContent = metrics.rescheduledVisits;
}

function resetManagementForm() {
    setSelectedValue('managementType', 'RT');
    onlineSolutionToggle.checked = true;
    setSelectedValue('rtNoResult', 'ticket');
    installationShipmentToggle.checked = true;
    renderDependentOptions();
}

function removeManagement(id) {
    currentCall.managements = currentCall.managements.filter((management) => management.id !== id);
    renderManagementList();
    setStatus('Gestión quitada.');
}

function clearCurrentCall() {
    fieldIds.forEach((fieldId) => {
        const input = document.getElementById(fieldId);
        const button = document.querySelector(`[data-lock-target="${fieldId}"]`);

        input.value = '';
        input.disabled = false;
        button.textContent = 'Confirmar';
        button.classList.remove('is-locked');
    });

    currentCall.managements = [];
    resetManagementForm();
    renderManagementList();
}

function buildSupabaseCallRecord(callRecord) {
    const managements = callRecord.managements;
    const {
        technicalVisitCount,
        regularVisitCount,
        installationVisitCount,
        rescheduledVisitCount
    } = countTechnicalVisitTypes(managements);
    return {
        user_id: authSession.user.id,
        work_date: callRecord.date,
        is_technical_visit: technicalVisitCount > 0,
        is_rescheduled: rescheduledVisitCount > 0,
        is_installation: installationVisitCount > 0,
        technical_visit_count: technicalVisitCount,
        regular_visit_count: regularVisitCount,
        installation_visit_count: installationVisitCount,
        rescheduled_visit_count: rescheduledVisitCount,
        notes: null
    };
}

async function insertRemoteCallRecord(callRecord) {
    const payload = buildSupabaseCallRecord(callRecord);
    const insertedRows = await supabaseRestRequest('call_records', {
        method: 'POST',
        prefer: 'return=representation',
        body: payload
    });

    return insertedRows?.[0] ?? null;
}

async function deleteRemoteCallRecord(remoteRecordId) {
    if (!remoteRecordId) {
        return;
    }

    await supabaseRestRequest(`call_records?id=eq.${encodeURIComponent(remoteRecordId)}`, {
        method: 'DELETE'
    });
}

async function renderUndoState() {
    if (!authSession?.user?.id) {
        undoLastCallBtn.disabled = true;
        return;
    }

    const todayCalls = await getTodayCalls();
    undoLastCallBtn.disabled = todayCalls.length === 0;
}

async function finishCall() {
    if (!authSession?.user?.id) {
        setStatus('Iniciá sesión antes de terminar la llamada.', 'error');
        return;
    }

    if (currentCall.managements.length === 0) {
        setStatus('Cargá al menos una gestión antes de terminar la llamada.', 'error');
        return;
    }

    finishCallBtn.disabled = true;
    finishCallBtn.textContent = 'Guardando...';

    const visitCounts = countTechnicalVisitTypes(currentCall.managements);
    const visitCount = visitCounts.technicalVisitCount;
    const metrics = await getTodayMetrics();
    const callRecord = {
        id: createId(),
        date: todayKey(),
        endedAt: new Date().toISOString(),
        advisor: {
            id: authSession.user.id,
            email: authSession.user.email ?? null
        },
        customer: getCustomerData(),
        managements: currentCall.managements.map((management) => ({ ...management })),
        totals: {
            technicalVisits: visitCount,
            regularVisits: visitCounts.regularVisitCount,
            installationVisits: visitCounts.installationVisitCount,
            rescheduledVisits: visitCounts.rescheduledVisitCount
        },
        syncStatus: 'pending'
    };

    try {
        const remoteRecord = await insertRemoteCallRecord(callRecord);
        const syncedCallRecord = {
            ...callRecord,
            remoteRecordId: remoteRecord?.id ?? null,
            remoteRecord,
            syncStatus: 'synced'
        };

        await saveCompletedCall(syncedCallRecord);
        await saveTodayMetrics({
            totalCalls: metrics.totalCalls + 1,
            technicalVisits: metrics.technicalVisits + visitCount,
            installationVisits: metrics.installationVisits + visitCounts.installationVisitCount,
            rescheduledVisits: metrics.rescheduledVisits + visitCounts.rescheduledVisitCount
        });

        clearCurrentCall();
        await renderMetrics();
        await renderUndoState();
        setStatus(`Llamada guardada. Visitas técnicas sumadas: ${visitCount}.`, 'success');
    } catch (error) {
        renderManagementList();
        setStatus(
            error.isAuthExpired ? error.message : `No se pudo guardar en Supabase: ${error.message}`,
            'error'
        );
    } finally {
        finishCallBtn.textContent = 'Terminar llamada';
    }
}

async function undoLastCall() {
    if (!authSession?.user?.id) {
        setStatus('Iniciá sesión para deshacer registros.', 'error');
        return;
    }

    const todayCalls = await getTodayCalls();
    const lastCall = todayCalls[todayCalls.length - 1];

    if (!lastCall) {
        await renderUndoState();
        setStatus('No hay llamadas para deshacer.');
        return;
    }

    undoLastCallBtn.disabled = true;
    undoLastCallBtn.textContent = 'Deshaciendo...';

    try {
        await deleteRemoteCallRecord(lastCall.remoteRecordId);
        await saveTodayCalls(todayCalls.slice(0, -1));

        const metrics = await getTodayMetrics();
        const visitsToRemove = getCallVisitTotals(lastCall);

        await saveTodayMetrics({
            totalCalls: Math.max(0, metrics.totalCalls - 1),
            technicalVisits: Math.max(0, metrics.technicalVisits - visitsToRemove.technicalVisits),
            installationVisits: Math.max(0, metrics.installationVisits - visitsToRemove.installationVisits),
            rescheduledVisits: Math.max(0, metrics.rescheduledVisits - visitsToRemove.rescheduledVisits)
        });

        await renderMetrics();
        await renderUndoState();
        setStatus('Última llamada deshecha.', 'success');
    } catch (error) {
        await renderUndoState();
        setStatus(
            error.isAuthExpired ? error.message : `No se pudo deshacer la última llamada: ${error.message}`,
            'error'
        );
    } finally {
        undoLastCallBtn.textContent = 'Deshacer última llamada';
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = loginEmailElement.value.trim();
    const password = loginPasswordElement.value;

    if (!email || !password) {
        setStatus('Ingresá email y contraseña.', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    try {
        const session = await supabaseAuthRequest('token?grant_type=password', {
            method: 'POST',
            body: {
                email,
                password
            }
        });

        authExpiredSessionRedirected = false;
        await saveAuthSession(session);
        loginPasswordElement.value = '';
        clearCurrentCall();
        await renderAuthState();
    } catch (error) {
        setStatus(`No se pudo iniciar sesión: ${error.message}`, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Ingresar';
    }
}

async function handleLogout() {
    authExpiredSessionRedirected = false;
    stopAuthKeepAlive();
    setSessionMenuOpen(false);

    if (authSession?.access_token) {
        supabaseAuthRequest('logout', {
            method: 'POST',
            accessToken: authSession.access_token
        }).catch(() => {});
    }

    authSession = null;
    await storageRemove(authSessionKey);
    clearCurrentCall();
    await renderAuthState({ silent: true });
    setStatus('Sesión cerrada.', 'success');
}

document.querySelectorAll('.lock-button').forEach((button) => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.lockTarget);
        const shouldLock = !input.disabled;

        input.disabled = shouldLock;
        button.textContent = shouldLock ? 'Editar' : 'Confirmar';
        button.classList.toggle('is-locked', shouldLock);

        if (!shouldLock) {
            input.focus();
        }
    });
});

document.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', () => {
        copyFieldValue(button.dataset.copyTarget);
    });
});

document.querySelectorAll('input[name="managementType"]').forEach((input) => {
    input.addEventListener('change', () => {
        renderDependentOptions();
        updateSegmentedIndicators();
    });
});

document.querySelectorAll('#rtNoOptions input').forEach((input) => {
    input.addEventListener('change', updateSegmentedIndicators);
});

onlineSolutionToggle.addEventListener('change', renderDependentOptions);
window.addEventListener('resize', updateSegmentedIndicators);

saveManagementBtn.addEventListener('click', () => {
    currentCall.managements.push(getManagementFromForm());
    resetManagementForm();
    renderManagementList();
    setStatus('Gestión cargada.', 'success');
});

resetManagementBtn.addEventListener('click', () => {
    resetManagementForm();
    setStatus('Formulario de gestión listo para cargar otra.');
});

finishCallBtn.addEventListener('click', finishCall);
undoLastCallBtn.addEventListener('click', undoLastCall);

clearCallBtn.addEventListener('click', () => {
    clearCurrentCall();
    setStatus('Llamada actual limpia.');
});

callNotesElement.addEventListener('input', saveDraftNotes);

clearNotesBtn.addEventListener('click', async () => {
    callNotesElement.value = '';
    await saveDraftNotes();
    setStatus('Notas borradas.');
});

loginForm.addEventListener('submit', handleLogin);
sessionMenuBtn.addEventListener('click', toggleSessionMenu);
logoutBtn.addEventListener('click', handleLogout);
document.addEventListener('click', closeSessionMenuFromOutside);
document.addEventListener('keydown', closeSessionMenuWithEscape);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        refreshAuthSessionIfNeeded();
    }
});
window.addEventListener('focus', refreshAuthSessionIfNeeded);

async function initialize() {
    renderDependentOptions();
    renderManagementList();
    await loadAuthSession();
    await renderAuthState({ silent: Boolean(authSession) || authExpiredSessionRedirected });
}

initialize();
