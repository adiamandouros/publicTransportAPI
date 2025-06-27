globalThis.fetch = undefined;
import express from 'express';
import {router} from './routes.mjs';

const app = express ();
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