globalThis.fetch = undefined;
import express from 'express';
import cors from 'cors';
import {router} from './routes.mjs';

const app = express ();
app.use(cors({
  origin: 'https://homehub.sonovabitc.win', // ← your dev frontend origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use("/api/publicTransport", router)

// οτιδήποτε άλλο θα ανακατευθύνεται στο "/"
app.use((req, res) => {
    res.redirect('/')
});

app.use((err, req, res, next) => {
    console.log(err.stack)
    res.status(500).json({
        status: "NOT OK",
        message: err.message
    });
    next();
});

app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});