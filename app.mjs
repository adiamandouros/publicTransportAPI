globalThis.fetch = undefined;
import express from 'express';
import cors from 'cors';
import {router} from './routes.mjs';

const app = express ();

const allowedOrigins = [
  'https://homehub.sonovabitc.win',
  'https://localhost:5173',
  'http://localhost:3000'
];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
  credentials: true
}));
app.options('*', cors());

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