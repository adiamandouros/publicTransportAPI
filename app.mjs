globalThis.fetch = undefined;
import express from 'express';
import {router} from './routes.mjs'; // Assuming you have a routes.js file for additional routes

const app = express ();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use("/", router)

//οτιδήποτε άλλο θα ανακατευθύνεται στο "/"
// app.use((req, res) => {
//     res.redirect('/')
// });

app.use((err, req, res, next) => {
    console.log(err.stack)
    res.status(500).json({
        status: "NOT OK",
        message: err.message
    });
});

app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});

/*
To ensure your Node.js app does not exceed 1GB of memory, start it with the `--max-old-space-size=1024` flag:

    node --max-old-space-size=1024 app.mjs

This limits the V8 heap to 1GB. You can also add a note in your code:
*/

// NOTE: To limit memory usage to 1GB, start the app with:
// node --max-old-space-size=1024 app.mjs