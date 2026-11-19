const express = require('express');

const app = express();
app.set('view engine', 'ejs');

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Home Page
app.get('/', (req, res) => {
    res.render('index');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});