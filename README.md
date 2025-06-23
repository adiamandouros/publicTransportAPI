# Public Transport API for ATH (OASA)

##What
This is an API to translate and forward requests to the OASA public API, which serves information about bus stops, routes and bus arrivals.

#How
The API provides different endpoints:
1. **/localStops**
   a GET request with two params, `x` and `y`. Returns an array of JSON objects, representing the 20 closest bus stops around the point with `x` and `y` coordinates.
2. **/stopArrivals**
   a GET request with one param, `route`. Returns an array of a single JSON object, containing the name in GR and ENG of a bus route with route code `route`
4. **/routeName**
   a GET request with one param, `stopcode`. Returns an array of JSON objects, containing information about all the pending arrivals for the Bus stop with `stopcode`
6. **/stopRoutes**
   a GET request with two params, `x` and `y`. Returns an array of JSON objects, containing a combination of information about all the pending arrivals for the 20 closest Bus stops around the point with `x` and `y` coordinates.
