import axios from 'axios';

const OASA_TIMEOUT_MS = 4000;
const STOP_ROUTES_TTL_MS = 60 * 60 * 1000; // 1 hour

// stopcode → { data, expiresAt }
const stopRoutesCache = new Map();

// axios's `timeout` option is socket-inactivity only — a slowly trickling
// response evades it. AbortSignal.timeout enforces a true total-duration cap.
const oasaRequestOptions = () => ({
    timeout: OASA_TIMEOUT_MS,
    signal: AbortSignal.timeout(OASA_TIMEOUT_MS),
});

// ── Pure OASA fetchers ──────────────────────────────────────────────────────
// Return data on success, throw on failure. Never touch res — that's the
// caller's job. Separating fetch from response avoids the double-send bugs
// that the old `res`-threading pattern produced under Promise.all.

async function fetchClosestStops(x, y) {
    const url = `https://telematics.oasa.gr/api/?act=getClosestStops&p1=${x}&p2=${y}`;
    const res = await axios.post(url, null, oasaRequestOptions());
    return res.data;
}

async function fetchStopArrivals(stopcode) {
    const url = `https://telematics.oasa.gr/api/?act=getStopArrivals&p1=${stopcode}`;
    const res = await axios.post(url, null, oasaRequestOptions());
    return res.data;
}

async function fetchRouteName(route) {
    const url = `https://telematics.oasa.gr/api/?act=getRouteName&p1=${route}`;
    const res = await axios.post(url, null, oasaRequestOptions());
    return res.data;
}

// stop→routes is essentially static — cache aggressively to cut OASA load.
async function fetchStopRoutes(stopcode) {
    const cached = stopRoutesCache.get(stopcode);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = `https://telematics.oasa.gr/api/?act=webRoutesForStop&p1=${stopcode}`;
    const res = await axios.post(url, null, oasaRequestOptions());
    stopRoutesCache.set(stopcode, {
        data: res.data,
        expiresAt: Date.now() + STOP_ROUTES_TTL_MS,
    });
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

function hydrateStopArrivals(stop, stopRoutes, arrivals) {
    if (!arrivals || arrivals.length === 0) {
        stop.arrivals = [];
        return;
    }
    stop.arrivals = arrivals;
    for (const arrival of stop.arrivals) {
        const matchingRoute = stopRoutes.find(r => r.RouteCode === arrival.route_code);
        arrival.LineID = matchingRoute?.LineID || null;
        arrival.RouteDescr = matchingRoute?.RouteDescr || null;
        arrival.RouteDescrEng = matchingRoute?.RouteDescrEng || null;
        arrival.LineCode = matchingRoute?.LineCode || null;
    }
}

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
