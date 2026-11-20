const express = require('express');
const session = require('express-session');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Replace the connection string below with your own MongoDB Atlas URI
const mongourl = process.env.MONGODB_URI || '';

const mongoClient = new MongoClient(mongourl);
let db;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'comp3810-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.notice = req.session.notice || null;
    delete req.session.notice;
    next();
});


function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function numberOfRentalDays(startDate, endDate) {
    return Math.round(
        (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86400000
    );
}

function isValidObjectId(id) {
    return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

const carIdPattern = /^[A-Z][A-Z0-9-]{2,19}$/;

function carIdentifierFilter(value) {
    if (typeof value !== 'string') return null;
    const carId = value.trim().toUpperCase();
    return carIdPattern.test(carId) ? { carId } : null;
}

function isDuplicateCarId(error) {
    return error && error.code === 11000 && error.keyPattern && error.keyPattern.carId;
}

// Protect routes that require login
function requireLogin(req, res, next) {
    if (!req.session.user) {
        req.session.notice = 'Please log in to continue.';
        return res.redirect('/login');
    }
    next();
}

function readCarInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        input = {};
    }
    const text = (value) => typeof value === 'string' ? value.trim() : '';
    const car = {
        carId: text(input.carId).toUpperCase(),
        name: text(input.name),
        brand: text(input.brand),
        category: text(input.category),
        seats: Number(input.seats),
        transmission: text(input.transmission),
        fuel: text(input.fuel),
        pricePerDay: Number(input.pricePerDay),
        image: text(input.image) || '/images/car.jpg',
        description: text(input.description),
        available: input.available === true || input.available === 'true'
    };
    const validAvailability = input.available === true || input.available === false ||
        input.available === 'true' || input.available === 'false';

    if (!carIdPattern.test(car.carId)) {
        return { car, error: 'Car ID must be 3 to 20 letters, numbers, or hyphens, starting with a letter.' };
    }
    if (!car.name || !car.brand || !car.category || !Number.isInteger(car.seats) ||
        car.seats < 1 || !car.transmission || !car.fuel ||
        !Number.isFinite(car.pricePerDay) || car.pricePerDay <= 0 || !validAvailability) {
        return { car, error: 'Enter valid car details and a positive daily price.' };
    }
    return { car, error: null };
}

function carSearch(query) {
    const search = typeof query.search === 'string' ? query.search.trim().slice(0, 80) : '';
    const category = typeof query.category === 'string' ? query.category.trim().slice(0, 40) : '';
    const available = query.available === 'true' || query.available === 'false' ? query.available : '';
    const filter = {};

    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { carId: { $regex: escaped, $options: 'i' } },
            { name: { $regex: escaped, $options: 'i' } },
            { brand: { $regex: escaped, $options: 'i' } }
        ];
    }
    if (category) {
        filter.category = { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
    if (available) {
        filter.available = available === 'true';
    }
    return { filter, search, category, available };
}

function renderError(res, view, status, message, data) {
    return res.status(status).render(view, {
        error: message,
        ...(data || {})
    });
}

app.get('/', async (req, res) => {
    const cars = await db.collection('cars')
        .find({ available: { $ne: false } })
        .sort({ name: 1 })
        .limit(6)
        .toArray();
    res.render('index', { cars });
});

app.get('/cars', async (req, res) => {
    const cars = await db.collection('cars')
        .find({ available: { $ne: false } })
        .sort({ name: 1 })
        .toArray();
    res.render('cars', { cars });
});

app.get('/cars/:id', async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.sendStatus(404);
    }
    const car = await db.collection('cars').findOne({
        _id: new ObjectId(req.params.id),
        available: { $ne: false }
    });
    if (!car) {
        return res.sendStatus(404);
    }
    res.render('car-detail', { car });
});

app.get('/manage-cars', requireLogin, async (req, res) => {
    const filters = carSearch(req.query);
    const cars = await db.collection('cars').find(filters.filter).sort({ name: 1 }).toArray();
    res.render('manage-cars', { cars, filters });
});

app.get('/manage-cars/new', requireLogin, (req, res) => {
    res.render('car-form', {
        title: 'Add a car',
        action: '/manage-cars',
        car: { available: true }
    });
});

app.post('/manage-cars', requireLogin, async (req, res) => {
    const { car, error } = readCarInput(req.body);
    if (error) {
        return renderError(res, 'car-form', 400, error, {
            title: 'Add a car',
            action: '/manage-cars',
            car
        });
    }
    try {
        await db.collection('cars').insertOne(car);
    } catch (insertError) {
        if (isDuplicateCarId(insertError)) {
            return renderError(res, 'car-form', 409, 'That car ID is already in use.', {
                title: 'Add a car',
                action: '/manage-cars',
                car
            });
        }
        throw insertError;
    }
    req.session.notice = 'Car added.';
    res.redirect('/manage-cars');
});

app.get('/manage-cars/:id/edit', requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.sendStatus(404);
    }
    const car = await db.collection('cars').findOne({ _id: new ObjectId(req.params.id) });
    if (!car) {
        return res.sendStatus(404);
    }
    res.render('car-form', {
        title: 'Edit car',
        action: `/manage-cars/${car._id}`,
        car
    });
});

app.post('/manage-cars/:id', requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.sendStatus(404);
    }
    const { car, error } = readCarInput(req.body);
    if (error) {
        return renderError(res, 'car-form', 400, error, {
            title: 'Edit car',
            action: `/manage-cars/${req.params.id}`,
            car
        });
    }
    let result;
    try {
        result = await db.collection('cars').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: car }
        );
    } catch (updateError) {
        if (isDuplicateCarId(updateError)) {
            return renderError(res, 'car-form', 409, 'That car ID is already in use.', {
                title: 'Edit car',
                action: `/manage-cars/${req.params.id}`,
                car
            });
        }
        throw updateError;
    }
    if (!result.matchedCount) {
        return res.sendStatus(404);
    }
    req.session.notice = 'Car updated.';
    res.redirect('/manage-cars');
});

app.post('/manage-cars/:id/delete', requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.sendStatus(404);
    }
    const result = await db.collection('cars').deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) {
        return res.sendStatus(404);
    }
    req.session.notice = 'Car deleted.';
    res.redirect('/manage-cars');
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { form: {} });
});

app.post('/register', async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || name.length > 100 || !email || !password || password.length < 6) {
        return renderError(res, 'register', 400,
            'Enter a name, a valid email address, and a password of at least 6 characters.',
            { form: { name, email } });
    }

    try {
        const result = await db.collection('users').insertOne({
            name,
            email,
            password,        
            createdAt: new Date()
        });

        // write user into session directly
        req.session.user = {
            id: result.insertedId.toString(),
            name,
            email
        };

        req.session.notice = 'Your account has been created.';
        res.redirect('/cars');
    } catch (error) {
        if (error.code === 11000) {
            return renderError(res, 'register', 409, 'An account with this email already exists.',
                { form: { name, email } });
        }
        throw error;
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login');
});

app.post('/login', async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const user = await db.collection('users').findOne({ email });

    // compare password in plain text
    if (!user || user.password !== password) {
        return renderError(res, 'login', 401, 'Email or password is incorrect.');
    }

    req.session.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email
    };

    req.session.notice = 'You are now logged in.';
    res.redirect('/cars');
});

app.post('/logout', requireLogin, (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.post('/cars/:id/bookings', requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.sendStatus(404);
    }

    const startDate = typeof req.body.startDate === 'string' ? req.body.startDate : '';
    const endDate = typeof req.body.endDate === 'string' ? req.body.endDate : '';
    const today = new Date().toISOString().slice(0, 10);
    const carId = new ObjectId(req.params.id);
    const car = await db.collection('cars').findOne({ _id: carId, available: { $ne: false } });

    if (!car) {
        return res.sendStatus(404);
    }
    if (!validDate(startDate) || !validDate(endDate) || startDate < today ||
        endDate <= startDate || numberOfRentalDays(startDate, endDate) > 30) {
        return renderError(res, 'car-detail', 400,
            'Choose valid dates. Rentals must be between 1 and 30 days.',
            { car, form: { startDate, endDate } });
    }

    const conflictingBooking = await db.collection('bookings').findOne({
        carId,
        startDate: { $lt: endDate },
        endDate: { $gt: startDate }
    });
    if (conflictingBooking) {
        return renderError(res, 'car-detail', 409,
            'This car is already booked for some of those dates.',
            { car, form: { startDate, endDate } });
    }

    const days = numberOfRentalDays(startDate, endDate);
    await db.collection('bookings').insertOne({
        userId: new ObjectId(req.session.user.id),
        carId,
        carName: car.name,
        startDate,
        endDate,
        days,
        totalPrice: days * car.pricePerDay,
        createdAt: new Date()
    });

    req.session.notice = 'Your booking is confirmed.';
    res.redirect('/my-booking');
});

app.get('/my-booking', requireLogin, async (req, res) => {
    const bookings = await db.collection('bookings')
        .find({ userId: new ObjectId(req.session.user.id) })
        .sort({ createdAt: -1 })
        .toArray();

    const carIds = [...new Set(bookings.map((b) => b.carId.toString()))]
        .map((id) => new ObjectId(id));
    const cars = carIds.length
        ? await db.collection('cars').find({ _id: { $in: carIds } }).toArray()
        : [];
    const carNames = new Map(cars.map((car) => [car._id.toString(), car.name]));

    res.render('my-booking', {
        bookings: bookings.map((booking) => ({
            ...booking,
            carName: carNames.get(booking.carId.toString()) || booking.carName
        }))
    });
});

app.get('/api/cars', async (req, res) => {
    const { filter } = carSearch(req.query);
    const cars = await db.collection('cars').find(filter).sort({ name: 1 }).toArray();
    res.json(cars);
});

app.get('/api/cars/:carId', async (req, res) => {
    const filter = carIdentifierFilter(req.params.carId);
    if (!filter) {
        return res.status(400).json({ error: 'Invalid car ID.' });
    }
    const car = await db.collection('cars').findOne(filter);
    if (!car) {
        return res.status(404).json({ error: 'Car not found.' });
    }
    res.json(car);
});

app.post('/api/cars', async (req, res) => {
    const { car, error } = readCarInput(req.body);
    if (error) {
        return res.status(400).json({ error });
    }
    try {
        const result = await db.collection('cars').insertOne(car);
        return res.status(201).json({ ...car, _id: result.insertedId });
    } catch (insertError) {
        if (isDuplicateCarId(insertError)) {
            return res.status(409).json({ error: 'Car ID already exists.' });
        }
        throw insertError;
    }
});

app.put('/api/cars/:carId', async (req, res) => {
    const filter = carIdentifierFilter(req.params.carId);
    if (!filter) {
        return res.status(400).json({ error: 'Invalid car ID.' });
    }
    const { car, error } = readCarInput(req.body);
    if (error) {
        return res.status(400).json({ error });
    }
    let result;
    try {
        result = await db.collection('cars').updateOne(filter, { $set: car });
    } catch (updateError) {
        if (isDuplicateCarId(updateError)) {
            return res.status(409).json({ error: 'Car ID already exists.' });
        }
        throw updateError;
    }
    if (!result.matchedCount) {
        return res.status(404).json({ error: 'Car not found.' });
    }
    res.json(car);
});

app.delete('/api/cars/:carId', async (req, res) => {
    const filter = carIdentifierFilter(req.params.carId);
    if (!filter) {
        return res.status(400).json({ error: 'Invalid car ID.' });
    }
    const result = await db.collection('cars').deleteOne(filter);
    if (!result.deletedCount) {
        return res.status(404).json({ error: 'Car not found.' });
    }
    res.status(204).send();
});

app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) {
        return next(error);
    }
    res.status(500).send('Something went wrong. Please try again later.');
});

async function start() {
    await mongoClient.connect();
    db = mongoClient.db(process.env.MONGODB_DB || 'driveease');

    // create basic indexes
    await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('cars').createIndex({ carId: 1 }, { unique: true }),
        db.collection('bookings').createIndex({ userId: 1, createdAt: -1 }),
        db.collection('bookings').createIndex({ carId: 1, startDate: 1, endDate: 1 })
    ]);

    app.listen(PORT, () => {
        console.log(`DriveEase is running at http://localhost:${PORT}`);
    });
}

start().catch(async (error) => {
    console.error('Unable to start server:', error.message);
    await mongoClient.close();
    process.exitCode = 1;
});
