import express from 'express';
import { getLocalStops, getStopArrivals, getRouteName, getStopRoutes, getLocalInfo, getLocalInfoParallel } from './apiTranslator.mjs';

export const router = express.Router();

router.get("", (request, response)=>{
    response.status(200).json({
        status: "OK",
        message: "Welcome to the OASA API Translator",
        dir: __dirname,
        file: __filename
    });
});

router.get("/", (request, response)=>{
    response.status(200).json({
        status: "OK",
        message: "Server is running smoothly"
    });
});

// The request should contain the x and y coordinates as query parameters
// Example: http://localhost:3000/localStops?x=37.976910&y=23.648170
// The response will contain the closest stops in JSON format
router.get("/localStops", getLocalStops, (request, response)=>{
    console.log("Closest stops:", request.closestStops);
    response.status(200).send(request.closestStops);
});

// The request should contain the stopcode as a query parameter
// Example: http://localhost:3000/stopArrivals?stopcode=280054
// The response will contain the arrivals for the specified stop in JSON format
// Note: The stopcode should be a valid stop code from the OASA API
router.get("/stopArrivals", getStopArrivals, (request, response)=>{
    console.log("Closest stops:", request.stopArrivals);
    response.status(200).send(request.stopArrivals);
});

// The request should contain the stopcode as a query parameter
// Example: http://localhost:3000/routeName?route=4918
// The response will contain the arrivals for the specified stop in JSON format
// Note: The stopcode should be a valid stop code from the OASA API
router.get("/routeName", getRouteName, (request, response)=>{
    console.log("Closest stops:", request.routeName);
    response.status(200).send(request.routeName);
});

// The request should contain the stopcode as a query parameter
// Example: http://localhost:3000/stopRoutes?stopcode=280046
// The response will contain the arrivals for the specified stop in JSON format
// Note: The stopcode should be a valid stop code from the OASA API
router.get("/stopRoutes", getStopRoutes, (request, response)=>{
    console.log("Routes for stop:", request.stopRoutes);
    response.status(200).send(request.stopRoutes);
});

// The request should contain the stopcode as a query parameter
// Example: http://localhost:3000/localInfo?x=37.976910&y=23.648170
// Example: http://localhost:3000/localInfo?x=37.9546752&y=23.7087623
// Example: http://localhost:3000/localInfo?x=38.0815816&y=23.6858562
// The response will contain the arrivals for the specified stop in JSON format
// Note: The stopcode should be a valid stop code from the OASA API
router.get("/localInfo", getLocalInfoParallel, (request, response)=>{
    console.log("Local info:", request.stops);
    response.status(200).send(request.stops);
});