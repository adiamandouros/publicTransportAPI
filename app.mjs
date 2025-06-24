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

