import axios from 'axios';

export const getLocalStops = async (req, res, next) => {
  console.log("getLocalStops called");
  // Support calling with (req, res, next) as middleware or with (req) as a function
  const x = req.query?.x || req.x;
  const y = req.query?.y || req.y;
  if (!x || !y) {
    if (res && res.status) {
      res.status(400).json({ error: 'Missing coordinates' });
    }
    if (next) next(new Error('Missing coordinates'));
    return null;
  }
  const url = `http://telematics.oasa.gr/api/?act=getClosestStops&p1=${x}&p2=${y}`;
  console.log("Fetching closest stops from:", url);
  try {
    const apiRes = await axios.post(url);
    console.log("Got closest stops!");
    if (req) req.closestStops = apiRes.data;
    // If used as middleware, call next()
    if (typeof next === 'function') {
      req.closestStops = apiRes.data;
      next();
    }
    return apiRes.data;
  } catch (err) {
    console.error("Error fetching closest stops:", err);
    if (res && res.status) {
      res.status(500).json({ error: 'Failed to fetch closest stops', details: err.message });
    }
    if (next) next(err);
    return null;
  }
}

export const getStopArrivals = async (req, res, next) => {
  console.log("getStopArrivals called");
  const stopcode = req.query?.stopcode || req.stopcode;
  if (!stopcode) {
    if (res && res.status) {
      res.status(400).json({ error: 'Missing stopcode' });
    }
    if (next) next(new Error('Missing stopcode'));
    return null;
  }
  const url = `http://telematics.oasa.gr/api/?act=getStopArrivals&p1=${stopcode}`;
  console.log("Fetching stop arrivals from:", url);
  try {
    const apiRes = await axios.post(url);
    console.log("Got stop arrivals!");
    if (req) req.stopArrivals = apiRes.data;
    if (typeof next === 'function') {
      req.stopArrivals = apiRes.data;
      next();
    }
    return apiRes.data;
  } catch (err) {
    console.error("Error fetching stop arrivals:", err);
    if (res && res.status) {
      res.status(500).json({ error: 'Failed to fetch stop arrivals', details: err.message });
    }
    if (next) next(err);
    return null;
  }
};

export const getRouteName = async (req, res, next) => {
  console.log("getRouteName called");
  const route = req.query?.route || req.route;
  if (!route) {
    if (res && res.status) {
      res.status(400).json({ error: 'Missing route' });
    }
    if (next) next(new Error('Missing route'));
    return null;
  }
  const url = `http://telematics.oasa.gr/api/?act=getRouteName&p1=${route}`;
  console.log("Fetching route names from:", url);
  try {
    const apiRes = await axios.post(url);
    console.log("Got route names!");
    if (req) req.routeName = apiRes.data;
    if (typeof next === 'function') {
      req.routeName = apiRes.data;
      next();
    }
    return apiRes.data;
  } catch (err) {
    console.error("Error fetching route names:", err);
    if (res && res.status) {
      res.status(500).json({ error: 'Failed to fetch route names', details: err.message });
    }
    if (next) next(err);
    return null;
  }
};

export const getStopRoutes = async (req, res, next) => {
  console.log("getStopRoutes called");
  const stopcode = req.query?.stopcode || req.stopcode;
  if (!stopcode) {
    if (res && res.status) {
      res.status(400).json({ error: 'Missing stopcode' });
    }
    if (next) next(new Error('Missing stopcode'));
    return null;
  }
  const url = `http://telematics.oasa.gr/api/?act=webRoutesForStop&p1=${stopcode}`;
  console.log("Fetching route info from:", url);
  try {
    const apiRes = await axios.post(url);
    console.log("Got Routes for stop!");
    if (req) req.stopRoutes = apiRes.data;
    if (typeof next === 'function') {
      req.stopRoutes = apiRes.data;
      next();
    }
    return apiRes.data;
  } catch (err) {
    console.error("Error fetching route info:", err);
    if (res && res.status) {
      res.status(500).json({ error: 'Failed to fetch route names', details: err.message });
    }
    if (next) next(err);
    return null;
  }
};

export const getLocalInfo = async (req, res, next) => {
  console.log("getLocalInfo called");
  const stops = await getLocalStops(req, res, next);
  console.log("Closest stops:");
  if (!stops || stops.length === 0) {
    return res.status(404).json({ error: 'No stops found for the given coordinates' });
  }

  for (const stop of stops) {
    const stopRoutes = await getStopRoutes({ query: { stopcode: stop.StopCode } }, res, next);
    const arrivals = await getStopArrivals({ query: { stopcode: stop.StopCode } }, res, next);
    if (arrivals && arrivals.length > 0) {
      stop.arrivals = arrivals;
      for (const arrival of stop.arrivals) {
        const matchingRoute = stopRoutes.find(route => route.RouteCode === arrival.route_code);
        arrival.LineID = matchingRoute.LineID || null;
        arrival.RouteDescr = matchingRoute.RouteDescr || null;
        arrival.RouteDescrEng = matchingRoute.RouteDescrEng || null;
        arrival.LineCode = matchingRoute.LineCode || null;
      }
    } else {
      stop.arrivals = [];
    }
  }
  return res.json(stops);
}
/**
 * Optimized and parallelized version of getLocalInfo.
 * Fetches stop routes and arrivals in parallel for each stop.
 */
//http://localhost:3000/localInfo?x=37.976910&y=23.648170
export const getLocalInfoParallel = async (req, res, next) => {
  console.log("getLocalInfoParallel called");
  const stops = await getLocalStops(req, res);
  console.log("Closest stops:");
  if (!stops || stops.length === 0) {
    return res.status(404).json({ error: 'No stops found for the given coordinates' });
  }

  // For each stop, fetch stopRoutes and arrivals in parallel
  await Promise.all(stops.map(async (stop) => {
    const [stopRoutes, arrivals] = await Promise.all([
      getStopRoutes({ query: { stopcode: stop.StopCode } }, res),
      getStopArrivals({ query: { stopcode: stop.StopCode } }, res)
    ]);
    if (arrivals && arrivals.length > 0) {
      stop.arrivals = arrivals;
      for (const arrival of stop.arrivals) {
        const matchingRoute = stopRoutes.find(route => route.RouteCode === arrival.route_code);
        arrival.LineID = matchingRoute?.LineID || null;
        arrival.RouteDescr = matchingRoute?.RouteDescr || null;
        arrival.RouteDescrEng = matchingRoute?.RouteDescrEng || null;
        arrival.LineCode = matchingRoute?.LineCode || null;
      }
    } else {
      stop.arrivals = [];
    }
  }));

  return res.json(stops);
};