import axios from 'axios';

export const getLocalStops = async (req, res, next) => {
    console.log("getLocalStops called");
    //http://localhost:3000/localStops?x=37.976910&y=23.648170
    const url = `http://telematics.oasa.gr/api/?act=getClosestStops&p1=${req.query.x}&p2=${req.query.y}`;
    console.log("Fetching closest stops from:", url);
    try {
        const apiRes = await axios.post(url);
        console.log("Got closest stops!");
        req.closestStops = apiRes.data;
        return apiRes.data;
    } catch (err) {
        console.error("Error fetching closest stops:", err);
        res.status(500).json({ error: 'Failed to fetch closest stops', details: err.message });
        if (next) next(err);
        return null;
    }
}

export const getStopArrivals = async (req, res, next) => {
  console.log("getStopArrivals called");
  //http://telematics.oasa.gr/api/?act=getStopArrivals&p1=280054
  const url = `http://telematics.oasa.gr/api/?act=getStopArrivals&p1=${req.query.stopcode}`;
  console.log("Fetching stop arrivals from:", url);
  try {
      const apiRes = await axios.post(url);
      console.log("got stop arrivals", apiRes.data);
      req.stopArrivals = apiRes.data;
      return apiRes.data;
  } catch (err) {
      console.error("Error fetching stop arrivals:", err);
      res.status(500).json({ error: 'Failed to fetch stop arrivals', details: err.message });
      if (next) next(err);
      return null;
  }
}

export const getRouteName = async (req, res, next) => {
  console.log("getRouteName called");
  //http://telematics.oasa.gr/api/?act=getRouteName&p1=4918
  const url = `http://telematics.oasa.gr/api/?act=getRouteName&p1=${req.query.route}`;
  console.log("Fetching route names from:", url);
  try {
      const apiRes = await axios.post(url);
      console.log("got route names", apiRes.data);
      req.routeName = apiRes.data;
      return apiRes.data;
  } catch (err) {
      console.error("Error fetching route names:", err);
      res.status(500).json({ error: 'Failed to fetch route names', details: err.message });
      if (next) next(err);
      return null;
  }
}

export const getLocalInfo = async (req, res, next) => {
  console.log("getLocalInfo called");
  const stops = await getLocalStops(req, res, next);
  console.log("Closest stops:", stops);
  if (!stops || stops.length === 0) {
    return res.status(404).json({ error: 'No stops found for the given coordinates' });
  }

  for (const stop of stops) {
    const arrivals = await getStopArrivals({ query: { stopcode: stop.StopCode } }, res, next);
    if (arrivals && arrivals.length > 0) {
      stop.arrivals = arrivals;
    } else {
      stop.arrivals = [];
    }
  }
  return res.json(stops);
}
