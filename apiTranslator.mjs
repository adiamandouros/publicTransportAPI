import axios from 'axios';
import https from 'https';

const OASA_TIMEOUT_MS = 6000;
const STOP_ROUTES_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLOSEST_STOPS_TTL_MS = 60 * 1000;    // 1 minute
const MAX_CACHE_ENTRIES = 500;

// Reuse TCP+TLS connections across OASA calls. With 20+ parallel fan-out
// requests to the same host, this eliminates per-call handshake overhead
// and is a kindness to OASA's connection limits.
const oasaAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

// stopcode → { data, expiresAt }
const stopRoutesCache = new Map();
// "lat,lng" rounded to 3 decimals → { data, expiresAt }
const closestStopsCache = new Map();

// Bounded cache setter — drops the oldest entry when capacity is reached.
// Map preserves insertion order, so first key is effectively FIFO.
function cacheSet(cache, key, data, ttl) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// axios's `timeout` option is socket-inactivity only — a slowly trickling
// response evades it. AbortSignal.timeout enforces a true total-duration cap.
const oasaRequestOptions = () => ({
    timeout: OASA_TIMEOUT_MS,
    signal: AbortSignal.timeout(OASA_TIMEOUT_MS),
    httpsAgent: oasaAgent,
});

// Single-retry policy. We deliberately don't retry timeouts — they already
// consumed the full budget and a second attempt usually also times out.
// Network errors and 5xx responses fail fast and are worth retrying.
function shouldRetry(err) {
    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
    if (err.code === 'ECONNABORTED') return false;
    if (!err.response) return true;
    return err.response.status >= 500;
}

async function oasaPost(url) {
    try {
        return await axios.post(url, null, oasaRequestOptions());
    } catch (err) {
        if (!shouldRetry(err)) throw err;
        console.warn(`OASA retry after ${err.message}: ${url}`);
        // Small jittered backoff so a parallel fan-out's retries don't
        // hit OASA in lockstep.
        await new Promise(r => setTimeout(r, 150 + Math.random() * 100));
        return axios.post(url, null, oasaRequestOptions());
    }
}

// ── Pure OASA fetchers ──────────────────────────────────────────────────────
// Return data on success, throw on failure. Never touch res — that's the
// caller's job. Separating fetch from response avoids the double-send bugs
// that the old `res`-threading pattern produced under Promise.all.

async function fetchClosestStops(x, y) {
    // Round to ~100m precision so nearby users share cache entries.
    const key = `${Number(x).toFixed(3)},${Number(y).toFixed(3)}`;
    const cached = closestStopsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = `https://telematics.oasa.gr/api/?act=getClosestStops&p1=${x}&p2=${y}`;
    const res = await oasaPost(url);
    cacheSet(closestStopsCache, key, res.data, CLOSEST_STOPS_TTL_MS);
    return res.data;
}

async function fetchStopArrivals(stopcode) {
    const url = `https://telematics.oasa.gr/api/?act=getStopArrivals&p1=${stopcode}`;
    const res = await oasaPost(url);
    return res.data;
}

async function fetchRouteName(route) {
    const url = `https://telematics.oasa.gr/api/?act=getRouteName&p1=${route}`;
    const res = await oasaPost(url);
    return res.data;
}

// stop→routes is essentially static — cache aggressively to cut OASA load.
async function fetchStopRoutes(stopcode) {
    const cached = stopRoutesCache.get(stopcode);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = `https://telematics.oasa.gr/api/?act=webRoutesForStop&p1=${stopcode}`;
    const res = await oasaPost(url);
    cacheSet(stopRoutesCache, stopcode, res.data, STOP_ROUTES_TTL_MS);
    return res.data;
}

// ── Express middleware ──────────────────────────────────────────────────────

export const getLocalStops = async (req, res, next) => {
    console.log("getLocalStops called");
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ error: 'Missing coordinates' });
    try {
        req.closestStops = await fetchClosestStops(x, y);
        next();
    } catch (err) {
        console.error("Error fetching closest stops:", err.message);
        next(err);
    }
};

export const getStopArrivals = async (req, res, next) => {
    console.log("getStopArrivals called");
    const { stopcode } = req.query;
    if (!stopcode) return res.status(400).json({ error: 'Missing stopcode' });
    try {
        req.stopArrivals = await fetchStopArrivals(stopcode);
        next();
    } catch (err) {
        console.error("Error fetching stop arrivals:", err.message);
        next(err);
    }
};

export const getRouteName = async (req, res, next) => {
    console.log("getRouteName called");
    const { route } = req.query;
    if (!route) return res.status(400).json({ error: 'Missing route' });
    try {
        req.routeName = await fetchRouteName(route);
        next();
    } catch (err) {
        console.error("Error fetching route name:", err.message);
        next(err);
    }
};

export const getStopRoutes = async (req, res, next) => {
    console.log("getStopRoutes called");
    const { stopcode } = req.query;
    if (!stopcode) return res.status(400).json({ error: 'Missing stopcode' });
    try {
        req.stopRoutes = await fetchStopRoutes(stopcode);
        next();
    } catch (err) {
        console.error("Error fetching stop routes:", err.message);
        next(err);
    }
};

function hydrateArrivals(stopRoutes, arrivals) {
    if (!arrivals || arrivals.length === 0) return [];
    for (const arrival of arrivals) {
        const matchingRoute = stopRoutes.find(r => r.RouteCode === arrival.route_code);
        arrival.LineID = matchingRoute?.LineID || null;
        arrival.RouteDescr = matchingRoute?.RouteDescr || null;
        arrival.RouteDescrEng = matchingRoute?.RouteDescrEng || null;
        arrival.LineCode = matchingRoute?.LineCode || null;
    }
    return arrivals;
}

function hydrateStopArrivals(stop, stopRoutes, arrivals) {
    stop.arrivals = hydrateArrivals(stopRoutes, arrivals);
}

// Fan-out arrivals + routes for a list of stopcodes. Returns
// [{ StopCode, arrivals }] so the client can patch existing stop DOM.
export const getArrivalsForStops = async (req, res, next) => {
    console.log("getArrivalsForStops called");
    const codesParam = req.query?.codes;
    if (!codesParam) return res.status(400).json({ error: 'Missing codes' });

    const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) return res.status(400).json({ error: 'Empty codes' });

    const results = await Promise.all(codes.map(async (code) => {
        const [routesResult, arrivalsResult] = await Promise.allSettled([
            fetchStopRoutes(code),
            fetchStopArrivals(code),
        ]);

        if (routesResult.status === 'rejected') {
            console.warn(`stopRoutes failed for ${code}:`, routesResult.reason?.message);
        }
        if (arrivalsResult.status === 'rejected') {
            console.warn(`stopArrivals failed for ${code}:`, arrivalsResult.reason?.message);
        }

        const stopRoutes = routesResult.status === 'fulfilled' ? routesResult.value : [];
        const arrivals   = arrivalsResult.status === 'fulfilled' ? arrivalsResult.value : [];

        return { StopCode: Number(code), arrivals: hydrateArrivals(stopRoutes, arrivals) };
    }));

    req.arrivalsForStops = results;
    next();
};

// Parallel fan-out across stops. Uses allSettled so a single slow OASA call
// no longer hangs the whole response — that stop just comes back without
// arrivals/routes filled in.
export const getLocalInfoParallel = async (req, res, next) => {
    console.log("getLocalInfoParallel called");
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ error: 'Missing coordinates' });

    let stops;
    try {
        stops = await fetchClosestStops(x, y);
    } catch (err) {
        console.error("Error fetching closest stops:", err.message);
        return next(err);
    }

    if (!stops || stops.length === 0) {
        return res.status(404).json({ error: 'No stops found for the given coordinates' });
    }

    await Promise.all(stops.map(async (stop) => {
        const [routesResult, arrivalsResult] = await Promise.allSettled([
            fetchStopRoutes(stop.StopCode),
            fetchStopArrivals(stop.StopCode),
        ]);

        if (routesResult.status === 'rejected') {
            console.warn(`stopRoutes failed for ${stop.StopCode}:`, routesResult.reason?.message);
        }
        if (arrivalsResult.status === 'rejected') {
            console.warn(`stopArrivals failed for ${stop.StopCode}:`, arrivalsResult.reason?.message);
        }

        const stopRoutes = routesResult.status === 'fulfilled' ? routesResult.value : [];
        const arrivals   = arrivalsResult.status === 'fulfilled' ? arrivalsResult.value : [];

        hydrateStopArrivals(stop, stopRoutes, arrivals);
    }));

    req.stops = stops;
    next();
};

// Sequential variant — kept for parity with the original. Same allSettled
// hardening so one slow stop doesn't cascade.
export const getLocalInfo = async (req, res, next) => {
    console.log("getLocalInfo called");
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ error: 'Missing coordinates' });

    let stops;
    try {
        stops = await fetchClosestStops(x, y);
    } catch (err) {
        console.error("Error fetching closest stops:", err.message);
        return next(err);
    }

    if (!stops || stops.length === 0) {
        return res.status(404).json({ error: 'No stops found for the given coordinates' });
    }

    for (const stop of stops) {
        const [routesResult, arrivalsResult] = await Promise.allSettled([
            fetchStopRoutes(stop.StopCode),
            fetchStopArrivals(stop.StopCode),
        ]);
        const stopRoutes = routesResult.status === 'fulfilled' ? routesResult.value : [];
        const arrivals   = arrivalsResult.status === 'fulfilled' ? arrivalsResult.value : [];
        hydrateStopArrivals(stop, stopRoutes, arrivals);
    }

    req.stops = stops;
    next();
};
