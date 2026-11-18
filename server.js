const express = require('express');

const app = express();

const PORT = process.env.PORT || 3000;

// Home Page
app.get('/', (req, res) => {
    res.send('Welcome to DriveEase Car Rental System!');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});