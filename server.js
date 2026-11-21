require("dotenv").config();

// =====================================
// Import Libraries
// =====================================

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const crypto = require("crypto");


// =====================================
// Express Setup
// =====================================

const app = express();

const PORT = process.env.PORT || 3000;

// Traditional Chinese descriptions for the 20 demo vehicles.
// A descriptionZh field in MongoDB takes precedence if one is added later.
const CAR_DESCRIPTIONS_ZH = {
    "Toyota Corolla": "可靠省油的房車，適合日常市區駕駛。",
    "Honda Civic": "外形時尚的緊湊型房車，駕駛舒適。",
    "Mazda Mazda3": "富運動感的緊湊型房車，車廂設計精緻。",
    "Honda Jazz": "靈活實用的小型揭背車，方便泊車及收納。",
    "Toyota Camry": "寬敞舒適的混能房車，適合日常及長途駕駛。",
    "Toyota Prius": "節能實用的混能車，適合日常出行。",
    "Nissan Note": "操控簡單的小型揭背車，適合市區駕駛。",
    "Suzuki Swift": "小巧靈活的揭背車，適合繁忙的市區道路。",
    "Kia K3": "外形現代的緊湊型房車，設備實用齊全。",
    "Hyundai Elantra": "設計時尚、乘坐舒適的五座房車。",
    "Toyota Alphard": "高級七座家庭車，空間寬敞舒適。",
    "Toyota Vellfire": "舒適的七座豪華家庭車，適合家庭及多人出行。",
    "Honda Stepwgn": "實用家庭車，座位及載物空間靈活。",
    "Nissan Serena": "適合家庭旅遊的七座車，方便日常出行。",
    "Kia Carnival": "寬敞的多人乘坐車款，適合家庭及團體。",
    "Tesla Model 3": "簡約科技感十足的純電房車。",
    "Tesla Model Y": "車廂及行李空間實用的純電 SUV。",
    "BYD ATTO 3": "舒適實用的純電 SUV，適合日常代步。",
    "Ferrari Purosangue": "高性能豪華 SUV，帶來獨特駕駛體驗。",
    "Mercedes-Benz S-Class": "旗艦級豪華房車，提供卓越的乘坐舒適度。"
};

function localizeCar(car) {
    return {
        ...car,
        descriptionZh: car.descriptionZh ||
            CAR_DESCRIPTIONS_ZH[`${car.brand} ${car.model}`] ||
            "舒適實用的租賃車款，適合不同出行需要。"
    };
}

// Booking dates are calendar dates in Hong Kong (YYYY-MM-DD).
// Store them in that format so date-range comparisons remain unambiguous.
function hongKongToday() {
    const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const parts = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarDateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = Date.parse(value + "T00:00:00.000Z");
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function bookingDays(start, end) {
    const from = calendarDateValue(start);
    const to = calendarDateValue(end);
    if (from === null || to === null || start < hongKongToday()) return null;
    const days = (to - from) / 86400000;
    return Number.isInteger(days) && days >= 1 && days <= 365 ? days : null;
}

async function requireLogin(req, res, next) {
    if (!req.session.userId || !ObjectId.isValid(req.session.userId)) {
        return res.redirect("/login");
    }
    try {
        // A deleted account must not keep creating bookings through an old session.
        const user = await req.app.locals.db.collection("users").findOne(
            { _id: new ObjectId(req.session.userId) }, { projection: { _id: 1 } }
        );
        if (!user) {
            req.session.userId = null;
            req.session.userName = null;
            return res.redirect("/login");
        }
        next();
    } catch (error) {
        console.error("User session check error:", error);
        return res.status(500).send("Unable to verify login");
    }
}
// =====================================
// Admin Authentication Middleware
// =====================================

async function requireAdmin(req, res, next) {

    // 1. Check login status
    if (!req.session.userId || !ObjectId.isValid(req.session.userId)) {
        return res.redirect("/login");
    }

    try {

        // 2. Find current user in MongoDB
        const db = req.app.locals.db;

        const user = await db.collection("users").findOne(
            { _id: new ObjectId(req.session.userId) },
            { projection: { role: 1 } }
        );

        // 3. Check admin permission
        if (!user || user.role !== "admin") {
            return res.status(403).send(
                "Access Denied: Admin Only"
            );
        }

        // 4. Allow access
        next();

    } catch (error) {

        console.error("Admin Authentication Error:", error);

        return res.status(500).send(
            "Internal Server Error"
        );

    }
}

function bookingCsrfToken(req) {
    if (!req.session.bookingCsrfToken) {
        req.session.bookingCsrfToken = crypto.randomBytes(32).toString("hex");
    }
    return req.session.bookingCsrfToken;
}

function bookingCsrfValid(req) {
    const provided = req.body && req.body._csrf;
    const expected = req.session.bookingCsrfToken;
    if (typeof provided !== "string" || typeof expected !== "string" ||
        !/^[0-9a-f]{64}$/.test(provided) || !/^[0-9a-f]{64}$/.test(expected)) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

class BookingError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}


// =====================================
// EJS Setup
// =====================================

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));


// =====================================
// Middleware
// =====================================

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Form data
app.use(express.urlencoded({ extended: true }));

// JSON data
app.use(express.json());


// =====================================
// Session Configuration
// =====================================

// Check Session Secret
if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

// GitHub Codespaces uses an HTTPS reverse proxy
app.set("trust proxy", 1);


// Configure Session
app.use(session({

    name: "driveease.sid",

    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
        httpOnly: true,

        secure: "auto",

        sameSite: "lax",

        maxAge: 1000 * 60 * 60 * 24
    }

}));


// =====================================
// Make Login Status Available to EJS
// =====================================

app.use((req, res, next) => {

    // Get logged-in username
    res.locals.currentUser = req.session.userName || null;

    next();

});


// =====================================
// Routes
// =====================================

// =====================================
// RESTful API - GET All Cars
// =====================================

app.get("/api/cars", async (req, res) => {

    try {

        const db = req.app.locals.db;

        const cars = await db.collection("cars")
            .find({})
            .toArray();

        return res.status(200).json(cars);

    } catch (error) {

        console.error("GET Cars API Error:", error);

        return res.status(500).json({
            error: "Failed to retrieve cars"
        });

    }

});
// =====================================
// RESTful API - POST Create Car
// =====================================

app.post("/api/cars", async (req, res) => {

    try {

        const { brand, model, category, pricePerDay } = req.body;

        // Validate input
        if (
            typeof brand !== "string" ||
            !brand.trim() ||
            typeof model !== "string" ||
            !model.trim() ||
            !["private", "family", "electric", "luxury"].includes(category) ||
            !Number.isSafeInteger(pricePerDay) ||
            pricePerDay <= 0
        ) {
            return res.status(400).json({
                error: "Invalid car information"
            });
        }

        // Create car document
        const newCar = {
            brand: brand.trim(),
            model: model.trim(),
            year: 2024,
            category: category,
            pricePerDay: pricePerDay,
            seats: 5,
            transmission: "Automatic",
            fuelType: "Petrol",
            location: "Kowloon",
            image: "/images/car05.jpg",
            available: false,
            featured: false,
            description: "Temporary test car for REST API demonstration."
        };

        // Insert into MongoDB
        const db = req.app.locals.db;

        const result = await db.collection("cars").insertOne(newCar);

        return res.status(201).json({
            message: "Car created successfully",
            carId: result.insertedId,
            car: newCar
        });

    } catch (error) {

        console.error("POST Cars API Error:", error);

        return res.status(500).json({
            error: "Failed to create car"
        });

    }

});

// =====================================
// RESTful API - PUT Update Car
// =====================================

app.put("/api/cars/:id", async (req, res) => {

    try {

        const { id } = req.params;
        const { pricePerDay } = req.body;

        // Validate MongoDB ID
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                error: "Invalid car ID"
            });
        }

        // Validate new price
        if (!Number.isSafeInteger(pricePerDay) || pricePerDay <= 0) {
            return res.status(400).json({
                error: "Invalid price"
            });
        }

        const db = req.app.locals.db;

        // Update car price
        const result = await db.collection("cars").updateOne(
            { _id: new ObjectId(id) },
            { $set: { pricePerDay: pricePerDay } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: "Car not found"
            });
        }

        return res.status(200).json({
            message: "Car updated successfully",
            carId: id,
            pricePerDay: pricePerDay
        });

    } catch (error) {

        console.error("PUT Cars API Error:", error);

        return res.status(500).json({
            error: "Failed to update car"
        });

    }

});

// =====================================
// RESTful API - DELETE Car
// =====================================

app.delete("/api/cars/:id", async (req, res) => {

    try {

        const { id } = req.params;

        // Validate MongoDB ID
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                error: "Invalid car ID"
            });
        }

        const db = req.app.locals.db;

        // Only delete our inactive demonstration car
        const result = await db.collection("cars").deleteOne({
            _id: new ObjectId(id),
            brand: "TestBrand",
            model: "CRUD Demo Car",
            available: false
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                error: "Test car not found or deletion not permitted"
            });
        }

        return res.status(200).json({
            message: "Car deleted successfully",
            carId: id,
            deletedCount: result.deletedCount
        });

    } catch (error) {

        console.error("DELETE Cars API Error:", error);

        return res.status(500).json({
            error: "Failed to delete car"
        });

    }

});

// =====================================
// Admin entry point - go straight to vehicle management
// =====================================

app.get("/admin", requireAdmin, (req, res) => {

    return res.redirect("/admin/cars");

});
// =====================================
// Admin - Car Management
// =====================================

app.get("/admin/cars", requireAdmin, async (req, res) => {

    try {

        const db = req.app.locals.db;

        // Retrieve all cars from MongoDB
        const allCars = await db.collection("cars")
            .find({})
            .sort({ brand: 1, model: 1 })
            .toArray();

        // Search keyword
        const q = typeof req.query.q === "string"
            ? req.query.q.trim().slice(0, 80)
            : "";

        // Category filter
        const validCategories = [
            "private",
            "family",
            "electric",
            "luxury"
        ];

        const category = validCategories.includes(req.query.category)
            ? req.query.category
            : "";

        // Filter cars
        const cars = allCars.filter(car => {

            const matchesCategory =
                !category || car.category === category;

            const carName =
                `${car.brand} ${car.model}`.toLowerCase();

            const matchesSearch =
                !q || carName.includes(q.toLowerCase());

            return matchesCategory && matchesSearch;

        });

        // Render Admin UI
        return res.render("admin-cars", {
            cars,
            totalCars: allCars.length,
            q,
            category,
            csrfToken: bookingCsrfToken(req),
            notice: {
                deleted: "車輛已成功刪除。",
                hasBookings: "這輛車已有預訂紀錄，為保留歷史資料，不能直接刪除。你可以在 Edit 將它下架。",
                notFound: "找不到此車輛，可能已被刪除。"
            }[req.query.notice] || null
        });

    } catch (error) {

        console.error("Admin Cars Error:", error);

        return res.status(500).send(
            "Unable to load Admin Car Management"
        );

    }

});
// =====================================
// Admin - New Car Form
// =====================================

app.get("/admin/cars/new", requireAdmin, (req, res) => {

    return res.render("admin-car-new", {
        form: {},
        error: null,
        csrfToken: bookingCsrfToken(req)
    });

});
// =====================================
// Admin - Create New Car
// =====================================

app.post("/admin/cars/new", requireAdmin, async (req, res) => {

    // Check CSRF token
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Invalid form token");
    }

    const form = req.body || {};

    const getValue = key =>
        typeof form[key] === "string"
            ? form[key].trim()
            : "";

    const brand = getValue("brand");
    const model = getValue("model");
    const category = getValue("category");
    const year = Number(getValue("year"));
    const seats = Number(getValue("seats"));
    const pricePerDay = Number(getValue("pricePerDay"));

    const transmission = getValue("transmission");
    const fuelType = getValue("fuelType");
    const location = getValue("location");
    const image = getValue("image");
    const description = getValue("description");

    // Display validation error
    const showError = message => {
        return res.status(400).render("admin-car-new", {
            form,
            error: message,
            csrfToken: bookingCsrfToken(req)
        });
    };

    // Validate basic information
    if (
        !brand || brand.length > 60 ||
        !model || model.length > 60 ||
        !["private", "family", "electric", "luxury"].includes(category) ||
        !Number.isSafeInteger(year) || year < 2000 || year > 2035 ||
        !Number.isSafeInteger(seats) || seats < 1 || seats > 9 ||
        !Number.isSafeInteger(pricePerDay) ||
        pricePerDay < 1 || pricePerDay > 100000
    ) {
        return showError("請檢查品牌、車型、年份、座位及每日租金。");
    }

    if (
        !["Automatic", "Manual"].includes(transmission) ||
        !["Petrol", "Hybrid", "Electric", "Diesel"].includes(fuelType) ||
        !["Kowloon", "Hong Kong Island", "New Territories"].includes(location) ||
        description.length > 300
    ) {
        return showError("車輛資料不正確，請重新檢查。");
    }

    if (
        image &&
        !/^\/images\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(image)
    ) {
        return showError("圖片路徑必須位於 /images/ 資料夾。");
    }

    try {

        const db = req.app.locals.db;

        const newCar = {
            brand,
            model,
            year,
            category,
            pricePerDay,
            seats,
            transmission,
            fuelType,
            location,
            image: image || "/images/car01.jpg",
            available: form.available === "true",
            featured: form.featured === "true",
            description,
            createdAt: new Date()
        };

        await db.collection("cars").insertOne(newCar);

        return res.redirect("/admin/cars");

    } catch (error) {

        console.error("Admin Create Car Error:", error);

        return res.status(500).send(
            "Unable to create car"
        );

    }

});

// =====================================
// Admin - Edit Car (HTML form)
// =====================================

app.get("/admin/cars/:id/edit", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Car not found");
    }

    try {
        const car = await req.app.locals.db.collection("cars").findOne({
            _id: new ObjectId(req.params.id)
        });
        if (!car) return res.status(404).send("Car not found");

        return res.render("admin-car-edit", {
            carId: req.params.id,
            form: car,
            error: null,
            csrfToken: bookingCsrfToken(req)
        });
    } catch (error) {
        console.error("Admin Edit Car Page Error:", error);
        return res.status(500).send("Unable to load car editor");
    }
});

app.post("/admin/cars/:id/edit", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Car not found");
    }
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Invalid form token");
    }

    const form = req.body || {};
    const value = key => typeof form[key] === "string" ? form[key].trim() : "";
    const brand = value("brand");
    const model = value("model");
    const category = value("category");
    const year = Number(value("year"));
    const seats = Number(value("seats"));
    const pricePerDay = Number(value("pricePerDay"));
    const transmission = value("transmission");
    const fuelType = value("fuelType");
    const location = value("location");
    const image = value("image");
    const description = value("description");

    const showError = message => res.status(400).render("admin-car-edit", {
        carId: req.params.id,
        form,
        error: message,
        csrfToken: bookingCsrfToken(req)
    });

    if (
        !brand || brand.length > 60 || !model || model.length > 60 ||
        !["private", "family", "electric", "luxury"].includes(category) ||
        !Number.isSafeInteger(year) || year < 2000 || year > 2035 ||
        !Number.isSafeInteger(seats) || seats < 1 || seats > 9 ||
        !Number.isSafeInteger(pricePerDay) || pricePerDay < 1 || pricePerDay > 100000
    ) return showError("請檢查品牌、車型、年份、座位及每日租金。");

    if (
        !["Automatic", "Manual"].includes(transmission) ||
        !["Petrol", "Hybrid", "Electric", "Diesel"].includes(fuelType) ||
        !["Kowloon", "Hong Kong Island", "New Territories"].includes(location) ||
        description.length > 300
    ) return showError("車輛資料不正確，請重新檢查。");

    if (image && !/^\/images\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(image)) {
        return showError("圖片路徑必須位於 /images/ 資料夾。");
    }

    try {
        const changes = {
            brand,
            model,
            category,
            year,
            seats,
            pricePerDay,
            transmission,
            fuelType,
            location,
            image: image || "/images/car01.jpg",
            description,
            available: form.available === "true",
            featured: form.featured === "true",
            updatedAt: new Date()
        };
        const result = await req.app.locals.db.collection("cars").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: changes }
        );
        if (!result.matchedCount) return res.status(404).send("Car not found");
        return res.redirect("/admin/cars");
    } catch (error) {
        console.error("Admin Update Car Error:", error);
        return res.status(500).send("Unable to update car");
    }
});

// =====================================
// Admin - Delete Car (only when no booking history exists)
// =====================================

app.post("/admin/cars/:id/delete", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Car not found");
    }
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Invalid form token");
    }

    try {
        const db = req.app.locals.db;
        const client = req.app.locals.mongoClient;
        const carId = new ObjectId(req.params.id);

        // Booking and deletion both write the same car document. A racing
        // booking therefore causes a transaction write conflict, not an orphan.
        const outcome = await client.withSession(async session =>
            session.withTransaction(async () => {
                const car = await db.collection("cars").findOne(
                    { _id: carId }, { session, projection: { _id: 1 } }
                );
                if (!car) return "notFound";

                const booking = await db.collection("bookings").findOne(
                    { carId }, { session, projection: { _id: 1 } }
                );
                if (booking) return "hasBookings";

                const result = await db.collection("cars").deleteOne(
                    { _id: carId }, { session }
                );
                return result.deletedCount === 1 ? "deleted" : "notFound";
            }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } })
        );
        return res.redirect(`/admin/cars?notice=${outcome}`);
    } catch (error) {
        console.error("Admin Delete Car Error:", error);
        return res.status(500).send("Unable to delete car");
    }
});

// =====================================
// Admin - Booking Management
// =====================================

app.get("/admin/bookings", requireAdmin, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const status = ["confirmed", "cancelled"].includes(req.query.status)
        ? req.query.status : "";
    const pageValue = typeof req.query.page === "string" && /^[1-9]\d{0,3}$/.test(req.query.page)
        ? Number(req.query.page) : 1;
    const perPage = 20;

    try {
        // Join only the member's public display fields; never load password hashes.
        const pipeline = [
            {
                $lookup: {
                    from: "users",
                    let: { uid: "$userId" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                        { $project: { name: 1, email: 1 } }
                    ],
                    as: "members"
                }
            },
            { $unwind: { path: "$members", preserveNullAndEmptyArrays: true } },
            { $addFields: { bookingIdText: { $toString: "$_id" } } }
        ];

        const conditions = [];
        if (status) conditions.push({ status });
        if (q) {
            const safeSearch = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const matching = { $regex: safeSearch, $options: "i" };
            conditions.push({ $or: [
                { bookingIdText: matching },
                { carBrand: matching },
                { carModel: matching },
                { "members.name": matching },
                { "members.email": matching }
            ] });
        }
        if (conditions.length) pipeline.push({ $match: { $and: conditions } });

        pipeline.push({
            $facet: {
                rows: [
                    { $sort: { createdAt: -1, _id: -1 } },
                    { $skip: (pageValue - 1) * perPage },
                    { $limit: perPage }
                ],
                count: [{ $count: "total" }]
            }
        });

        const [result] = await req.app.locals.db.collection("bookings")
            .aggregate(pipeline).toArray();
        const totalBookings = result.count[0] ? result.count[0].total : 0;
        const totalPages = Math.max(1, Math.ceil(totalBookings / perPage));
        const queryFor = targetPage => "/admin/bookings?" + new URLSearchParams({
            q, status, page: String(targetPage)
        }).toString();

        return res.render("admin-bookings", {
            bookings: result.rows,
            totalBookings,
            q,
            status,
            currentPage: pageValue,
            totalPages,
            prevUrl: pageValue > 1 ? queryFor(pageValue - 1) : null,
            nextUrl: pageValue < totalPages ? queryFor(pageValue + 1) : null,
            csrfToken: bookingCsrfToken(req),
            today: hongKongToday(),
            notice: {
                cancelled: "預訂已取消，MongoDB 狀態已更新。",
                unchanged: "無法取消：此預訂可能已取消，或取車日期已經到達。"
            }[req.query.notice] || null
        });
    } catch (error) {
        console.error("Admin Bookings Error:", error);
        return res.status(500).send("Unable to load Admin Booking Management");
    }
});

app.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Booking not found");
    }
    try {
        const db = req.app.locals.db;
        const booking = await db.collection("bookings").findOne({
            _id: new ObjectId(req.params.id)
        });
        if (!booking) return res.status(404).send("Booking not found");

        const member = ObjectId.isValid(booking.userId)
            ? await db.collection("users").findOne(
                { _id: new ObjectId(booking.userId) },
                { projection: { name: 1, email: 1 } }
            ) : null;

        return res.render("admin-booking-detail", {
            booking,
            member,
            csrfToken: bookingCsrfToken(req),
            today: hongKongToday(),
            notice: {
                cancelled: "預訂已成功取消。",
                unchanged: "此預訂不能取消：狀態可能已改變或取車日期已經到達。"
            }[req.query.notice] || null
        });
    } catch (error) {
        console.error("Admin Booking Detail Error:", error);
        return res.status(500).send("Unable to load booking details");
    }
});

app.post("/admin/bookings/:id/cancel", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Booking not found");
    }
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Invalid form token");
    }

    try {
        // Match the same future-only cancellation rule used for customers.
        // One atomic update ensures an already-cancelled booking stays unchanged.
        const result = await req.app.locals.db.collection("bookings").updateOne({
            _id: new ObjectId(req.params.id),
            status: "confirmed",
            pickupDate: { $gt: hongKongToday() }
        }, {
            $set: {
                status: "cancelled",
                cancelledAt: new Date(),
                cancelledBy: "admin"
            }
        });
        return res.redirect(`/admin/bookings/${req.params.id}?notice=${
            result.modifiedCount === 1 ? "cancelled" : "unchanged"
        }`);
    } catch (error) {
        console.error("Admin Cancel Booking Error:", error);
        return res.status(500).send("Unable to cancel booking");
    }
});

// =====================================
// Admin - User Management
// =====================================

function adminMemberFields(form) {
    const text = key => typeof form[key] === "string" ? form[key].trim() : "";
    const name = text("name");
    const email = text("email").toLowerCase();
    if (!name || name.length > 80 || !email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "請輸入有效的會員名稱及 Email。" };
    }
    return { name, email };
}

function adminPasswordValid(password) {
    return typeof password === "string" && password.length >= 8 &&
        Buffer.byteLength(password, "utf8") <= 72;
}

app.get("/admin/users", requireAdmin, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const page = typeof req.query.page === "string" && /^[1-9]\d{0,3}$/.test(req.query.page)
        ? Number(req.query.page) : 1;
    const limit = 20;

    try {
        const pipeline = [
            // Member management is for regular users only. Admin accounts stay intact.
            { $match: { role: { $ne: "admin" } } },
            { $addFields: { userIdText: { $toString: "$_id" } } }
        ];

        const conditions = [];
        if (q) {
            const term = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const findText = { $regex: term, $options: "i" };
            conditions.push({ $or: [
                { name: findText }, { email: findText }, { userIdText: findText }
            ] });
        }
        if (conditions.length) pipeline.push({ $match: { $and: conditions } });

        pipeline.push({ $facet: {
            rows: [
                { $sort: { createdAt: -1, _id: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
                { $lookup: {
                    from: "bookings", let: { uid: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$userId", "$$uid"] } } },
                        { $count: "count" }
                    ],
                    as: "bookingCounts"
                } },
                { $addFields: { bookingCount: {
                    $ifNull: [{ $arrayElemAt: ["$bookingCounts.count", 0] }, 0]
                } } },
                { $project: { passwordHash: 0, bookingCounts: 0 } }
            ],
            count: [{ $count: "total" }]
        } });

        const [result] = await req.app.locals.db.collection("users")
            .aggregate(pipeline).toArray();
        const totalUsers = result.count[0] ? result.count[0].total : 0;
        const totalPages = Math.max(1, Math.ceil(totalUsers / limit));
        const urlFor = target => "/admin/users?" + new URLSearchParams({
            q, page: String(target)
        }).toString();

        return res.render("admin-users", {
            users: result.rows,
            totalUsers,
            q,
            page,
            totalPages,
            prevUrl: page > 1 ? urlFor(page - 1) : null,
            nextUrl: page < totalPages ? urlFor(page + 1) : null,
            notice: {
                deleted: "會員已成功刪除。",
                notFound: "找不到此會員。"
            }[req.query.notice] || null
        });
    } catch (error) {
        console.error("Admin Users Error:", error);
        return res.status(500).send("Unable to load members");
    }
});

app.get("/admin/users/new", requireAdmin, (req, res) => {
    return res.render("admin-user-form", {
        mode: "new", userId: null, form: {}, error: null,
        csrfToken: bookingCsrfToken(req)
    });
});

app.post("/admin/users/new", requireAdmin, async (req, res) => {
    if (!bookingCsrfValid(req)) return res.status(403).send("Invalid form token");
    const form = req.body || {};
    const fields = adminMemberFields(form);
    const showError = message => res.status(400).render("admin-user-form", {
        mode: "new", userId: null, form, error: message,
        csrfToken: bookingCsrfToken(req)
    });

    if (fields.error) return showError(fields.error);
    if (!adminPasswordValid(form.password)) {
        return showError("密碼最少 8 個字元，最多 72 bytes。");
    }
    if (form.password !== form.confirmPassword) {
        return showError("兩次密碼不一致。");
    }

    try {
        const passwordHash = await bcrypt.hash(form.password, 12);
        const result = await req.app.locals.db.collection("users").insertOne({
            name: fields.name,
            email: fields.email,
            passwordHash,
            role: "user", // New accounts always start as regular members.
            createdAt: new Date()
        });
        return res.redirect(`/admin/users/${result.insertedId}?notice=created`);
    } catch (error) {
        if (error.code === 11000) return showError("這個 Email 已被註冊。");
        console.error("Admin Create User Error:", error);
        return res.status(500).send("Unable to create member");
    }
});

app.get("/admin/users/:id/edit", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Member not found");
    }
    try {
        const member = await req.app.locals.db.collection("users").findOne(
            { _id: new ObjectId(req.params.id), role: { $ne: "admin" } },
            { projection: { name: 1, email: 1 } }
        );
        if (!member) return res.status(404).send("Member not found");
        return res.render("admin-user-form", {
            mode: "edit", userId: req.params.id, form: member, error: null,
            csrfToken: bookingCsrfToken(req)
        });
    } catch (error) {
        console.error("Admin Edit User Page Error:", error);
        return res.status(500).send("Unable to load member editor");
    }
});

app.post("/admin/users/:id/edit", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Member not found");
    }
    if (!bookingCsrfValid(req)) return res.status(403).send("Invalid form token");

    const form = req.body || {};
    const fields = adminMemberFields(form);
    const showError = message => res.status(400).render("admin-user-form", {
        mode: "edit", userId: req.params.id, form, error: message,
        csrfToken: bookingCsrfToken(req)
    });
    if (fields.error) return showError(fields.error);
    const newPassword = typeof form.newPassword === "string" ? form.newPassword : "";
    if (newPassword && !adminPasswordValid(newPassword)) {
        return showError("新密碼最少 8 個字元，最多 72 bytes。");
    }

    try {
        const db = req.app.locals.db;
        const existing = await db.collection("users").findOne({
            _id: new ObjectId(req.params.id), role: { $ne: "admin" }
        }, { projection: { _id: 1 } });
        if (!existing) return res.status(404).send("Member not found");

        const updates = {
            name: fields.name,
            email: fields.email,
            updatedAt: new Date()
        };
        if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12);

        await db.collection("users").updateOne(
            { _id: new ObjectId(req.params.id), role: { $ne: "admin" } },
            { $set: updates }
        );
        if (req.params.id === String(req.session.userId)) {
            req.session.userName = fields.name;
        }
        return res.redirect(`/admin/users/${req.params.id}?notice=updated`);
    } catch (error) {
        if (error.code === 11000) return showError("這個 Email 已被其他會員使用。");
        console.error("Admin Edit User Error:", error);
        return res.status(500).send("Unable to update member");
    }
});

app.get("/admin/users/:id", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Member not found");
    }
    try {
        const db = req.app.locals.db;
        const member = await db.collection("users").findOne(
            { _id: new ObjectId(req.params.id), role: { $ne: "admin" } },
            { projection: { passwordHash: 0 } }
        );
        if (!member) return res.status(404).send("Member not found");

        const bookings = await db.collection("bookings").find({
            userId: member._id
        }).sort({ createdAt: -1 }).limit(20).toArray();
        const bookingCount = await db.collection("bookings").countDocuments({
            userId: member._id
        });

        return res.render("admin-user-detail", {
            member, bookings, bookingCount,
            isSelf: String(member._id) === String(req.session.userId),
            csrfToken: bookingCsrfToken(req),
            notice: {
                created: "會員已新增。",
                updated: "會員資料已更新。",
                hasBookings: "此會員已有預訂紀錄，為保留歷史資料，不能直接刪除。",
                protected: "管理員帳戶不能直接刪除，請先由另一位管理員調整角色。",
                self: "不能刪除目前登入的管理員帳戶。",
                notFound: "找不到此會員。"
            }[req.query.notice] || null
        });
    } catch (error) {
        console.error("Admin User Details Error:", error);
        return res.status(500).send("Unable to load member details");
    }
});

app.post("/admin/users/:id/delete", requireAdmin, async (req, res) => {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(404).send("Member not found");
    }
    if (!bookingCsrfValid(req)) return res.status(403).send("Invalid form token");
    if (req.params.id === String(req.session.userId)) {
        return res.redirect(`/admin/users/${req.params.id}?notice=self`);
    }

    try {
        const db = req.app.locals.db;
        const userId = new ObjectId(req.params.id);
        const member = await db.collection("users").findOne(
            { _id: userId }, { projection: { role: 1 } }
        );
        if (!member) return res.redirect("/admin/users?notice=notFound");
        if (member.role === "admin") {
            return res.redirect(`/admin/users/${req.params.id}?notice=protected`);
        }
        const hasBooking = await db.collection("bookings").findOne(
            { userId }, { projection: { _id: 1 } }
        );
        if (hasBooking) return res.redirect(`/admin/users/${req.params.id}?notice=hasBookings`);

        const result = await db.collection("users").deleteOne({
            _id: userId, role: { $ne: "admin" }
        });
        return res.redirect(result.deletedCount === 1 ?
            "/admin/users?notice=deleted" : "/admin/users?notice=notFound");
    } catch (error) {
        console.error("Admin Delete User Error:", error);
        return res.status(500).send("Unable to delete member");
    }
});

// =====================================
// Home Page
// =====================================

app.get("/", async (req, res) => {
    try {
        const db = req.app.locals.db;
        const cars = await db.collection("cars")
            .find({ available: true })
            .sort({ pricePerDay: 1 })
            .toArray();

        // Show a balanced selection on the homepage; /cars shows the full fleet.
        const byCategory = category => cars.filter(car => car.category === category);
        const featuredCars = [
            ...byCategory("private").slice(0, 3),
            ...byCategory("family").slice(0, 2),
            ...byCategory("electric").slice(0, 1),
            ...byCategory("luxury").slice(0, 2)
        ];
        const luxuryCars = byCategory("luxury").filter(car => car.featured === true);

        return res.render("index", { featuredCars, luxuryCars });
    } catch (error) {
        console.error("Home car loading error:", error);
        return res.status(500).send("Unable to load the homepage right now.");
    }
});


// =====================================
// Car Listing (GET /cars)
// =====================================

app.get("/cars", async (req, res) => {
    try {
        const allowedCategories = ["private", "family", "electric", "luxury"];
        const allowedLocations = ["Hong Kong Island", "Kowloon", "New Territories"];

        const category = typeof req.query.category === "string" &&
            allowedCategories.includes(req.query.category) ? req.query.category : "all";
        const location = typeof req.query.location === "string" &&
            allowedLocations.includes(req.query.location) ? req.query.location : "";
        const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 80) : "";
        const brand = typeof req.query.brand === "string" ? req.query.brand.trim().slice(0, 80) : "";
        const model = typeof req.query.model === "string" ? req.query.model.trim().slice(0, 80) : "";
        const transmission = typeof req.query.transmission === "string" &&
            ["Automatic", "Manual"].includes(req.query.transmission) ? req.query.transmission : "";
        const minSeats = Number(req.query.minSeats);
        const maxPrice = Number(req.query.maxPrice);
        const pickupDate = typeof req.query.pickupDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.pickupDate) ? req.query.pickupDate : "";
        const returnDate = typeof req.query.returnDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.returnDate) ? req.query.returnDate : "";

        const query = { available: true };
        if (category !== "all") query.category = category;
        if (location) query.location = location;
        if (brand) query.brand = brand;
        if (model) query.model = model;
        if (transmission) query.transmission = transmission;
        if (Number.isFinite(minSeats) && minSeats >= 1 && minSeats <= 12) {
            query.seats = { $gte: minSeats };
        }
        if (Number.isFinite(maxPrice) && maxPrice > 0 && maxPrice <= 100000) {
            query.pricePerDay = { $lte: maxPrice };
        }
        if (keyword) {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            query.$or = [
                { brand: { $regex: escaped, $options: "i" } },
                { model: { $regex: escaped, $options: "i" } }
            ];
        }

        const db = req.app.locals.db;
        const cars = await db.collection("cars")
            .find(query)
            .sort({ pricePerDay: 1, brand: 1 })
            .toArray();

        const options = await db.collection("cars")
            .find({ available: true }, { projection: { brand: 1, model: 1 } })
            .toArray();
        const brands = [...new Set(options.map(car => car.brand).filter(Boolean))].sort();
        const models = [...new Set(options.map(car => car.model).filter(Boolean))].sort();

        return res.render("cars", {
            cars: cars.map(localizeCar),
            brands,
            models,
            filters: {
                category,
                location,
                keyword,
                brand,
                model,
                transmission,
                minSeats: Number.isFinite(minSeats) && minSeats > 0 ? minSeats : 0,
                maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : 0,
                pickupDate,
                returnDate
            }
        });
    } catch (error) {
        console.error("Car listing error:", error);
        return res.status(500).send("Unable to load cars right now.");
    }
});


// =====================================
// Car Details (GET /cars/:id)
// =====================================

app.get("/cars/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(404).send("Car not found.");
    }

    try {
        const db = req.app.locals.db;
        const car = await db.collection("cars").findOne({
            _id: new ObjectId(req.params.id),
            available: true
        });
        if (!car) return res.status(404).send("Car not found.");

        const pickupDate = typeof req.query.pickupDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.pickupDate) ? req.query.pickupDate : "";
        const returnDate = typeof req.query.returnDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.returnDate) ? req.query.returnDate : "";

        const bookingErrors = ["dates", "overlap", "unavailable", "server"];
        const bookingError = bookingErrors.includes(req.query.bookingError) ? req.query.bookingError : "";
        return res.render("car-detail", {
            car: localizeCar(car), pickupDate, returnDate, bookingError,
            csrfToken: bookingCsrfToken(req)
        });
    } catch (error) {
        console.error("Car detail error:", error);
        return res.status(500).send("Unable to load this car right now.");
    }
});


// =====================================
// Create Booking (POST /booking)
// =====================================

app.post("/booking", requireLogin, async (req, res) => {
    const { carId, pickupDate, returnDate } = req.body;
    if (typeof carId !== "string" || !ObjectId.isValid(carId)) {
        return res.status(400).send("Invalid car.");
    }
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Form expired. Please refresh the car page and try again.");
    }

    const redirectWithError = code => {
        const query = new URLSearchParams({
            bookingError: code,
            pickupDate: typeof pickupDate === "string" && pickupDate.length <= 10 ? pickupDate : "",
            returnDate: typeof returnDate === "string" && returnDate.length <= 10 ? returnDate : ""
        });
        return res.redirect(`/cars/${carId}?${query.toString()}`);
    };

    const days = bookingDays(pickupDate, returnDate);
    if (days === null) return redirectWithError("dates");

    const db = req.app.locals.db;
    const client = req.app.locals.mongoClient;
    const carObjectId = new ObjectId(carId);
    const userObjectId = new ObjectId(req.session.userId);
    let bookingId;

    try {
        await client.withSession(async session => {
            await session.withTransaction(async () => {
                const car = await db.collection("cars").findOne({
                    _id: carObjectId, available: true
                }, { session });
                if (!car) throw new BookingError("unavailable");

                const pricePerDay = Number(car.pricePerDay);
                if (!Number.isSafeInteger(pricePerDay) || pricePerDay <= 0 ||
                    !Number.isSafeInteger(days * pricePerDay)) {
                    throw new BookingError("unavailable");
                }

                // [pickupDate, returnDate) makes returning and picking up on
                // the same day possible without overlapping reservations.
                const overlap = await db.collection("bookings").findOne({
                    carId: carObjectId,
                    status: "confirmed",
                    pickupDate: { $lt: returnDate },
                    returnDate: { $gt: pickupDate }
                }, { session });
                if (overlap) throw new BookingError("overlap");

                // Every booking for this car writes the same car document.
                // Concurrent transactions therefore cannot both commit from
                // a stale overlap check; the driver retries write conflicts.
                const guard = await db.collection("cars").updateOne({
                    _id: carObjectId, available: true
                }, { $inc: { bookingVersion: 1 } }, { session });
                if (!guard.matchedCount) throw new BookingError("unavailable");

                const result = await db.collection("bookings").insertOne({
                    userId: userObjectId,
                    carId: carObjectId,
                    carBrand: car.brand,
                    carModel: car.model,
                    carImage: car.image || "/images/car01.jpg",
                    pickupDate,
                    returnDate,
                    totalDays: days,
                    pricePerDay,
                    totalPrice: days * pricePerDay,
                    status: "confirmed",
                    createdAt: new Date()
                }, { session });
                bookingId = result.insertedId;
            }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
        });

        return res.redirect(`/booking/confirmation/${bookingId.toString()}`);
    } catch (error) {
        if (error instanceof BookingError) return redirectWithError(error.code);
        console.error("Booking creation error:", error);
        return redirectWithError("server");
    }
});


// =====================================
// My Bookings (GET /my-booking)
// =====================================

app.get("/my-booking", requireLogin, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const bookings = await db.collection("bookings").find({
            userId: new ObjectId(req.session.userId)
        }).sort({ createdAt: -1 }).toArray();

        return res.render("my-booking", {
            bookings, today: hongKongToday(), csrfToken: bookingCsrfToken(req),
            cancelled: req.query.cancelled === "1",
            cancelFailed: req.query.cancelled === "0"
        });
    } catch (error) {
        console.error("My bookings error:", error);
        return res.status(500).send("Unable to load your bookings.");
    }
});


// =====================================
// Booking Confirmation (GET)
// =====================================

app.get("/booking/confirmation/:id", requireLogin, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).send("Booking not found.");
    try {
        const booking = await req.app.locals.db.collection("bookings").findOne({
            _id: new ObjectId(req.params.id),
            userId: new ObjectId(req.session.userId)
        });
        if (!booking) return res.status(404).send("Booking not found.");
        return res.render("booking-confirmation", { booking });
    } catch (error) {
        console.error("Booking confirmation error:", error);
        return res.status(500).send("Unable to load booking confirmation.");
    }
});


// =====================================
// Cancel Booking (POST)
// =====================================

app.post("/booking/:id/cancel", requireLogin, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).send("Booking not found.");
    if (!bookingCsrfValid(req)) {
        return res.status(403).send("Form expired. Please refresh your bookings and try again.");
    }
    try {
        // Cancel only your own confirmed future booking.
        const result = await req.app.locals.db.collection("bookings").updateOne({
            _id: new ObjectId(req.params.id),
            userId: new ObjectId(req.session.userId),
            status: "confirmed",
            pickupDate: { $gt: hongKongToday() }
        }, { $set: { status: "cancelled", cancelledAt: new Date() } });

        return res.redirect(result.modifiedCount === 1 ?
            "/my-booking?cancelled=1" : "/my-booking?cancelled=0");
    } catch (error) {
        console.error("Cancel booking error:", error);
        return res.status(500).send("Unable to cancel booking.");
    }
});


// =====================================
// Register Page (GET)
// =====================================

app.get("/register", (req, res) => {

    res.render("register", {
        error: null,
        success: null
    });

});


// =====================================
// Register User (POST)
// =====================================

app.post("/register", async (req, res) => {

    const {
        name,
        email,
        password,
        confirmPassword
    } = req.body;


    // ---------------------------------
    // 1. Validate Input
    // ---------------------------------

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof confirmPassword !== "string" ||
        !name.trim() ||
        !email.trim()
    ) {

        return res.status(400).render("register", {
            error: "Please complete all fields.",
            success: null
        });

    }


    // ---------------------------------
    // 2. Validate Email
    // ---------------------------------

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
        !emailRegex.test(email.trim()) ||
        email.length > 254 ||
        name.trim().length > 80
    ) {

        return res.status(400).render("register", {
            error: "Please enter a valid name and email address.",
            success: null
        });

    }


    // ---------------------------------
    // 3. Validate Password
    // ---------------------------------

    if (
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {

        return res.status(400).render("register", {
            error: "Password must be at least 8 characters and at most 72 bytes.",
            success: null
        });

    }


    // ---------------------------------
    // 4. Confirm Password
    // ---------------------------------

    if (password !== confirmPassword) {

        return res.status(400).render("register", {
            error: "Passwords do not match.",
            success: null
        });

    }


    try {

        // ---------------------------------
        // 5. Access MongoDB
        // ---------------------------------

        const db = req.app.locals.db;


        // ---------------------------------
        // 6. Normalize Email
        // ---------------------------------

        const normalizedEmail = email.trim().toLowerCase();


        // ---------------------------------
        // 7. Hash Password
        // ---------------------------------

        const passwordHash = await bcrypt.hash(password, 12);


        // ---------------------------------
        // 8. Save User to MongoDB
        // ---------------------------------

        await db.collection("users").insertOne({

            name: name.trim(),

            email: normalizedEmail,

            passwordHash: passwordHash,

            createdAt: new Date()

        });


        // ---------------------------------
        // 9. Registration Successful
        // ---------------------------------

        console.log("New user registered successfully");


        return res.render("register", {

            error: null,

            success: "Registration successful!"

        });


    } catch (error) {


        // ---------------------------------
        // Duplicate Email
        // ---------------------------------

        if (error.code === 11000) {

            return res.status(409).render("register", {

                error: "This email is already registered.",

                success: null

            });

        }


        // ---------------------------------
        // Other Errors
        // ---------------------------------

        console.error("Registration error:", error.message);


        return res.status(500).render("register", {

            error: "Registration failed. Please try again.",

            success: null

        });

    }

});


// =====================================
// Login Page (GET)
// =====================================

app.get("/login", (req, res) => {

    // Already logged in
    if (req.session.userId) {
        return res.redirect("/");
    }


    // Display Login UI
    res.render("login", {
        error: null
    });

});


// =====================================
// Login User (POST)
// =====================================

app.post("/login", async (req, res) => {

    console.log("Login request received");


    const { email, password } = req.body;


    // ---------------------------------
    // 1. Validate Input
    // ---------------------------------

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {

        return res.status(400).render("login", {

            error: "Please enter your email and password."

        });

    }


    try {

        // ---------------------------------
        // 2. Access MongoDB
        // ---------------------------------

        const db = req.app.locals.db;


        // ---------------------------------
        // 3. Normalize Email
        // ---------------------------------

        const normalizedEmail = email.trim().toLowerCase();


        // ---------------------------------
        // 4. Find User
        // ---------------------------------

        const user = await db.collection("users").findOne({

            email: normalizedEmail

        });


        // ---------------------------------
        // 5. Check User
        // ---------------------------------

        if (
            !user ||
            typeof user.passwordHash !== "string"
        ) {

            return res.status(401).render("login", {

                error: "Invalid email or password."

            });

        }


        // ---------------------------------
        // 6. Verify Password
        // ---------------------------------

        const passwordMatch = await bcrypt.compare(

            password,

            user.passwordHash

        );


        if (!passwordMatch) {

            return res.status(401).render("login", {

                error: "Invalid email or password."

            });

        }


        // ---------------------------------
        // 7. Regenerate Session
        // ---------------------------------

        await new Promise((resolve, reject) => {

            req.session.regenerate((error) => {

                if (error) {
                    reject(error);
                } else {
                    resolve();
                }

            });

        });


        // ---------------------------------
        // 8. Store User in Session
        // ---------------------------------

        req.session.userId = String(user._id);

        req.session.userName = user.name;


        // ---------------------------------
        // 9. Save Session
        // ---------------------------------

        await new Promise((resolve, reject) => {

            req.session.save((error) => {

                if (error) {
                    reject(error);
                } else {
                    resolve();
                }

            });

        });

// ---------------------------------
// 10. Login Successful
// ---------------------------------

        console.log("User logged in successfully");


        // Redirect user based on role
        if (user.role === "admin") {
            return res.redirect("/admin");
        }

        return res.redirect("/");


    } catch (error) {


        // ---------------------------------
        // Login Error
        // ---------------------------------

        console.error("Login error:", error.message);


        return res.status(500).render("login", {

            error: "Login failed. Please try again."

        });

    }

});


// =====================================
// Logout User (POST)
// =====================================

app.post("/logout", (req, res) => {

    // Destroy Session
    req.session.destroy((error) => {

        if (error) {

            console.error("Logout error:", error.message);

            return res.status(500).send(
                "Logout failed. Please try again."
            );

        }


        // Clear Session Cookie
        res.clearCookie("driveease.sid", {
            path: "/"
        });


        console.log("User logged out successfully");


        // Redirect to Homepage
        return res.redirect("/");

    });

});


// =====================================
// MongoDB Connection
// =====================================

async function startServer() {

    let client;

    try {

        // ---------------------------------
        // 1. Check Environment Variables
        // ---------------------------------

        if (
            !process.env.MONGODB_URI ||
            !process.env.DB_NAME
        ) {

            throw new Error(
                "Missing MONGODB_URI or DB_NAME in .env"
            );

        }


        // ---------------------------------
        // 2. Create MongoDB Client
        // ---------------------------------

        client = new MongoClient(process.env.MONGODB_URI, {

            serverSelectionTimeoutMS: 10000

        });


        // ---------------------------------
        // 3. Connect to MongoDB
        // ---------------------------------

        await client.connect();


        // ---------------------------------
        // 4. Select Database
        // ---------------------------------

        const db = client.db(process.env.DB_NAME);


        // ---------------------------------
        // 5. Test Database Connection
        // ---------------------------------

        await db.command({ ping: 1 });


        // ---------------------------------
        // 6. Make Database Available
        // ---------------------------------

        app.locals.db = db;
        app.locals.mongoClient = client;


        // ---------------------------------
        // 7. Create Unique Email Index
        // ---------------------------------

        await db.collection("users").createIndex(

            { email: 1 },

            { unique: true }

        );

        await db.collection("bookings").createIndex({
            carId: 1, status: 1, pickupDate: 1, returnDate: 1
        });
        await db.collection("bookings").createIndex({
            userId: 1, createdAt: -1
        });


        console.log("MongoDB connected successfully");


        // ---------------------------------
        // 8. Start Express Server
        // ---------------------------------

        app.listen(PORT, () => {

            console.log(`Server running on port ${PORT}`);

        });


    } catch (error) {


        console.error(
            "Application startup failed:",
            error.message
        );


        if (client) {

            await client.close();

        }


        process.exitCode = 1;

    }

}


// =====================================
// Start Application
// =====================================

startServer();
